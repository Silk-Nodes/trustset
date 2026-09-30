/* trustset indexer.
 *
 * walks the kill switch and the labels contract from their deployment to the
 * finalised head, a hundred blocks at a time because that is monad's cap on
 * eth_getLogs, and writes every log into postgres. then it stays at the head.
 *
 * two rules it does not break:
 *
 * it reads at finalised minus a few, the same block the web app reads at, so
 * nothing it writes can be undone by a reorg and there is no unwinding code.
 *
 * every row is keyed on (tx_hash, log_index), so re-running a window is free.
 * the cursor can therefore be moved backwards at any time to repair a gap, and
 * a crash mid-window costs nothing.
 */
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";
import pg from "pg";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.TRUSTSET_ROOT || join(HERE, "..");
const RPC = process.env.MONAD_RPC || "https://testnet-rpc.monad.xyz";
/* the cap is a hundred blocks per call, inclusive at both ends. */
const WINDOW = 100;
/* how far behind finalised to read. same four blocks the app uses: on monad
   consensus runs ahead of execution and a finalised block may not be executed. */
const BEHIND = 4;
/* the public rpc allows fifteen requests a second per address. ten leaves room
   for the web app on the same machine. */
const PER_SECOND = 8;
const ONCE = process.argv.includes("--once");

const KS = [
  "event AgentRegistered(uint256 indexed agentId, address indexed agentKey, address indexed revocationKey, address[] guardians, uint8 threshold)",
  "event StatusChanged(uint256 indexed agentId, uint8 status, bytes32 reasonHash, address by)",
  "event Rotated(uint256 indexed agentId, uint256 indexed successorId)",
  "event RevocationKeyChangeProposed(uint256 indexed agentId, address newKey, uint64 applyAt)",
  "event RevocationKeyChanged(uint256 indexed agentId, address newKey)",
  "event GuardianVoted(uint256 indexed agentId, address indexed guardian, uint256 votes, uint256 threshold)",
  "event LimitsSet(uint256 indexed agentId, uint64 expiresAt, uint64 heartbeatWindow)",
  "event Beat(uint256 indexed agentId, uint64 at)",
];
const LABELS = ["event Labelled(uint256 indexed agentId, address indexed by, string name, string purpose)"];
/* the demo venue. an agent's status changes are the switch's business, but what
   an agent actually did is the venue's, and without it the feed shows a live
   agent that never does anything. refusals are still absent and still cannot be
   indexed: a refused trade reverts and emits no log. */
const VENUE = ["event TradeAccepted(uint256 indexed agentId, uint256 n)"];
/* ERC-8004's identity registry. we do not read its agents; we read the one key
   an agent's owner can set to say "my switch is over there". the key is indexed
   as a string, so it arrives hashed and we match on the hash. anyone who
   publishes it is linked, with no permission from us and no code of ours. */
const ERC8004 = ["event MetadataSet(uint256 indexed agentId, string indexed indexedMetadataKey, string metadataKey, bytes metadataValue)"];
const ERC8004_REGISTRY = process.env.ERC8004_REGISTRY || "0x8004A818BFB912233c491871b3d84c89A494BD9e";
const TRUSTSET_KEY = ethers.id("trustset");
const STATUS = ["none", "active", "paused", "revoked", "rotated"];
/* monad's staking precompile. an agent staking MON is not a trustset event,
   but it is an agent acting, and an agent's history should show what it did.
   only logs whose delegator is a registered agent address are read, matched in the
   filter itself, so the rest of the chain's staking costs nothing. */
const STAKING = "0x0000000000000000000000000000000000001000";
const STAKING_EVENTS = [
  "event Delegate(uint64 indexed validatorId, address indexed delegator, uint256 amount, uint64 activationEpoch)",
  "event Undelegate(uint64 indexed validatorId, address indexed delegator, uint8 withdrawId, uint256 amount, uint64 activationEpoch)",
  "event Withdraw(uint64 indexed validatorId, address indexed delegator, uint8 withdrawId, uint256 amount, uint64 withdrawEpoch)",
  "event ClaimRewards(uint64 indexed validatorId, address indexed delegator, uint256 amount, uint64 epoch)",
];
const STAKE_KIND = { Delegate: "Staked", Undelegate: "Unstaked", Withdraw: "Withdrew", ClaimRewards: "ClaimedRewards" };
/* a one-off: read only the staking logs from this block to the cursor, for
   stakes made before the indexer knew to look, then exit */
const STAKING_FROM = (() => { const i = process.argv.indexOf("--staking-from"); return i >= 0 ? Number(process.argv[i + 1]) : 0; })();

const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString(), ...a);

/* anyone can emit these logs with values we did not choose, so every number
   and string from a log is made safe for postgres before it gets near a query.
   one hostile row used to fail the window, roll it back, keep the cursor where
   it was, and crash the process on the same row after every restart. */
/* a uint for a bigint column, capped at 2^53-1. that is still "never" for a
   time in seconds (285 million years), it stays an exact js number, and the
   explorer's last_beat + heartbeat_window cannot overflow a bigint the way a
   cap at the bigint maximum would. */
const CAP = BigInt(Number.MAX_SAFE_INTEGER);
const big = x => { const v = BigInt(x); return Number(v > CAP ? CAP : v); };
/* an id we can join on: a positive safe integer, or null and the row is dropped */
const idOf = x => { const v = BigInt(x); return v > 0n && v <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : null; };
/* text that postgres will store: bad utf-8 becomes U+FFFD, NUL is removed */
const txt = b => ethers.toUtf8String(b, ethers.Utf8ErrorFuncs.replace).replace(/\u0000/g, "");

/* a plain token bucket. the rpc's own error body says fifteen per second, and
   it answers a burst with a revert that ethers reports as missing data, which
   is a confusing way to learn you are going too fast. */
let spent = [];
async function limited(fn) {
  for (;;) {
    const now = Date.now();
    spent = spent.filter(t => now - t < 1000);
    if (spent.length < PER_SECOND) { spent.push(now); break; }
    await sleep(1000 - (now - spent[0]) + 5);
  }
  return fn();
}
async function retry(fn, times = 5) {
  let last;
  for (let i = 0; i < times; i++) {
    try { return await limited(fn); } catch (e) { last = e; await sleep(400 * (i + 1)); }
  }
  throw last;
}

async function main() {
  const d = JSON.parse(await readFile(join(ROOT, "deployments", "monad-testnet.json"), "utf8"));
  const p = new ethers.JsonRpcProvider(RPC, undefined, { staticNetwork: true, batchMaxCount: 1 });
  const ks = new ethers.Interface(KS);
  const labels = new ethers.Interface(LABELS);
  const venue = new ethers.Interface(VENUE);
  const erc8004 = new ethers.Interface(ERC8004);
  const staking = new ethers.Interface(STAKING_EVENTS);
  const db = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
  await db.query(await readFile(join(HERE, "schema.sql"), "utf8"));

  const from = Number(process.env.START_BLOCK || d.startBlock || 0) || (await firstBlock(db, d));
  let cur = await cursor(db, from);

  if (STAKING_FROM) {
    for (let b = STAKING_FROM; b < cur; b += WINDOW) {
      const to = Math.min(b + WINDOW - 1, cur - 1);
      const rows = await stakes(p, staking, await agentKeys(db), b, to);
      if (rows.length) { await write(db, rows); log(`staking backfill ${b}-${to}: ${rows.length} events`); }
    }
    log(`staking backfill done up to block ${cur - 1}`);
    await db.end(); return;
  }
  log(`indexing ${d.killSwitch} from block ${cur}`);

  for (;;) {
    const head = (await retry(() => p.getBlock("finalized")))?.number ?? 0;
    const target = Math.max(0, head - BEHIND);
    while (cur <= target) {
      const to = Math.min(cur + WINDOW - 1, target);
      const rows = [...await pull(p, d, ks, labels, venue, erc8004, cur, to), ...await stakes(p, staking, await agentKeys(db), cur, to)];
      if (rows.length) await write(db, rows);
      await db.query("INSERT INTO cursor (name, block) VALUES ('main', $1) ON CONFLICT (name) DO UPDATE SET block = $1", [to + 1]);
      if (rows.length) log(`blocks ${cur}-${to}: ${rows.length} events`);
      cur = to + 1;
    }
    if (ONCE) break;
    /* the chain makes about fifteen thousand blocks an hour, so the head moves
       a window every twenty-odd seconds. polling faster only spends calls. */
    await sleep(10_000);
  }
  await db.end();
}

/* where to start when nothing has ever been indexed: the block the switch was
   deployed in, found by walking back from the first agent's registration. */
async function firstBlock(db, d) {
  const r = await db.query("SELECT min(registered_block) AS b FROM agents");
  return Number(r.rows[0]?.b || 0) || Number(process.env.DEPLOY_BLOCK || 0);
}

async function cursor(db, fallback) {
  const r = await db.query("SELECT block FROM cursor WHERE name = 'main'");
  return r.rows.length ? Number(r.rows[0].block) : fallback;
}

async function pull(p, d, ks, labels, venue, erc8004, from, to) {
  const [a, b, c, e] = await Promise.all([
    retry(() => p.getLogs({ address: d.killSwitch, fromBlock: from, toBlock: to })),
    d.labels ? retry(() => p.getLogs({ address: d.labels, fromBlock: from, toBlock: to })) : Promise.resolve([]),
    d.venue ? retry(() => p.getLogs({ address: d.venue, fromBlock: from, toBlock: to })) : Promise.resolve([]),
    retry(() => p.getLogs({ address: ERC8004_REGISTRY, topics: [ethers.id("MetadataSet(uint256,string,string,bytes)"), null, TRUSTSET_KEY], fromBlock: from, toBlock: to })),
  ]);
  if (!a.length && !b.length && !c.length && !e.length) return [];
  /* one timestamp read per block that actually had a log, not per block. */
  const stamps = new Map();
  for (const l of [...a, ...b, ...c, ...e]) stamps.set(l.blockNumber, null);
  for (const n of stamps.keys()) stamps.set(n, (await retry(() => p.getBlock(n)))?.timestamp ?? 0);

  const out = [];
  for (const l of a) out.push(decode(ks, l, stamps.get(l.blockNumber)));
  for (const l of b) out.push(decode(labels, l, stamps.get(l.blockNumber)));
  for (const l of c) out.push(decode(venue, l, stamps.get(l.blockNumber)));
  for (const l of e) out.push(link8004(erc8004, l, stamps.get(l.blockNumber), d.killSwitch));
  return out.filter(Boolean);
}

/* every registered agent address, lower case, to its id */
async function agentKeys(db) {
  const r = await db.query("SELECT id, agent_key FROM agents");
  return new Map(r.rows.map(x => [String(x.agent_key).toLowerCase(), Number(x.id)]));
}

/* the staking precompile's logs for agent addresses only, one row each, filed
   under the agent whose key it was */
async function stakes(p, iface, keys, from, to) {
  if (!keys.size) return [];
  const topics = [STAKING_EVENTS.map(e => iface.getEvent(e.split("(")[0].replace("event ", "")).topicHash), null,
    [...keys.keys()].map(k => ethers.zeroPadValue(k, 32))];
  const logs = await retry(() => p.getLogs({ address: STAKING, topics, fromBlock: from, toBlock: to }));
  const out = [];
  for (const l of logs) {
    let ev; try { ev = iface.parseLog({ topics: [...l.topics], data: l.data }); } catch { continue; }
    if (!ev) continue;
    const who = String(ev.args[1]).toLowerCase();
    const agentId = keys.get(who); if (agentId == null) continue;
    const ts = (await retry(() => p.getBlock(l.blockNumber)))?.timestamp ?? 0;
    const amount = ev.name === "Undelegate" || ev.name === "Withdraw" ? ev.args[3] : ev.args[2];
    out.push({ block: l.blockNumber, tx: l.transactionHash, index: l.index, at: new Date(ts * 1000).toISOString(),
      kind: STAKE_KIND[ev.name], agentId, actor: ev.args[1],
      data: { validatorId: Number(ev.args[0]), amount: amount.toString() } });
  }
  return out;
}

/* an 8004 owner saying where their switch is. the value is
   abi.encode(chainId, killSwitch, agentId); a pointer at another chain or
   another switch is somebody else's business and is dropped. */
function link8004(iface, l, ts, ours) {
  let ev;
  try { ev = iface.parseLog({ topics: [...l.topics], data: l.data }); } catch { return null; }
  if (!ev) return null;
  try {
    const [chainId, killSwitch, agentId] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256", "address", "uint256"], ev.args[3]);
    /* only a pointer at this chain and this switch. the registry is public,
       so anything else is a claim somebody made about an agent that is not
       theirs to make here. */
    if (chainId !== 10143n || killSwitch.toLowerCase() !== String(ours).toLowerCase()) return null;
    const id = idOf(agentId), token = idOf(ev.args[0]);
    if (id == null || token == null) return null;
    return {
      block: l.blockNumber, tx: l.transactionHash, index: l.index, at: new Date(ts * 1000).toISOString(),
      kind: "Linked8004", agentId: id, actor: null,
      data: { erc8004Id: token, chainId: 10143, killSwitch },
    };
  } catch { return null; }
}

function decode(iface, l, ts) {
  let ev;
  try { ev = iface.parseLog({ topics: [...l.topics], data: l.data }); } catch { return null; }
  if (!ev) return null;
  const at = new Date(ts * 1000).toISOString();
  const base = { block: l.blockNumber, tx: l.transactionHash, index: l.index, at, kind: ev.name };
  /* positional, not by name. ethers' Result is an array first, so an argument
     called "at" resolves to Array.prototype.at and Number(that) is NaN, which
     postgres then refuses as a bigint. the index is the only unambiguous key. */
  const n = ev.args;
  try {
  /* every event here carries the agent id first */
  const id = idOf(n[0]);
  if (id == null) return null;
  switch (ev.name) {
    case "AgentRegistered":
      return { ...base, agentId: id, actor: n[2],
        data: { agentKey: n[1], coldKey: n[2], guardians: [...n[3]], threshold: Number(n[4]) } };
    case "StatusChanged":
      return { ...base, agentId: id, actor: n[3], data: { status: STATUS[Number(n[1])] || "none", reasonHash: n[2] } };
    case "Rotated":
      return { ...base, agentId: id, actor: null, data: { successorId: big(n[1]) } };
    case "RevocationKeyChangeProposed":
      return { ...base, agentId: id, actor: null, data: { newKey: n[1], applyAt: big(n[2]) } };
    case "RevocationKeyChanged":
      return { ...base, agentId: id, actor: n[1], data: { newKey: n[1] } };
    case "GuardianVoted":
      return { ...base, agentId: id, actor: n[1], data: { votes: Number(n[2]), threshold: Number(n[3]) } };
    case "LimitsSet":
      return { ...base, agentId: id, actor: null, data: { expiresAt: big(n[1]), heartbeatWindow: big(n[2]) } };
    case "Beat":
      return { ...base, agentId: id, actor: null, data: { beatAt: big(n[1]) } };
    case "Labelled":
      return { ...base, agentId: id, actor: n[1], data: labelText(l) };
    case "TradeAccepted":
      return { ...base, agentId: id, actor: null, data: { n: big(n[1]) } };
    case "MetadataSet":
      return null; // handled by link8004, which knows how to read the value
    default: return null;
  }
  } catch (e) {
    /* a log we cannot read is skipped and named, never allowed to stop the index */
    log("skipped unreadable log", ev.name, "tx", l.transactionHash, "index", l.index, e?.message || e);
    return null;
  }
}

/* a label's two strings, read as raw bytes so invalid utf-8 cannot throw later
   when the value is first touched. (string, string) and (bytes, bytes) share
   one abi layout. */
function labelText(l) {
  const [name, purpose] = ethers.AbiCoder.defaultAbiCoder().decode(["bytes", "bytes"], l.data);
  return { name: txt(name), purpose: txt(purpose) };
}

/* one transaction per window: the feed rows, then the fold into current state.
   if it fails halfway the cursor is not moved and the window runs again. */
async function write(db, rows) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    for (const r of rows) {
      await c.query("SAVEPOINT row");
      try {
      await c.query(
        `INSERT INTO events (block, tx_hash, log_index, at, kind, agent_id, actor, data)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (tx_hash, log_index) DO NOTHING`,
        [r.block, r.tx, r.index, r.at, r.kind, r.agentId ?? null, r.actor ?? null, JSON.stringify(r.data)]);
      await fold(c, r);
      await c.query("RELEASE SAVEPOINT row");
      } catch (e) {
        /* one bad row names itself and is skipped, so it cannot hold the
           cursor and freeze the index. a data error (class 22) is the row's
           fault; anything else, a lost connection say, still fails the window
           so it runs again. */
        log("row failed", r.kind, "block", r.block, "tx", r.tx, JSON.stringify(r.data), e?.message || e);
        if (!String(e?.code || "").startsWith("22")) throw e;
        await c.query("ROLLBACK TO SAVEPOINT row");
      }
    }
    await c.query("COMMIT");
  } catch (e) { await c.query("ROLLBACK"); throw e; }
  finally { c.release(); }
}

async function fold(c, r) {
  const id = r.agentId;
  if (id == null) return;
  /* awaited, every one. returning the promise unawaited let a failure escape
     the caller's try and take the process down without naming the row, and let
     an update race the commit that was supposed to contain it. */
  switch (r.kind) {
    case "AgentRegistered":
      await c.query(
        `INSERT INTO agents (id, agent_key, cold_key, guardians, threshold, status, status_block, status_at,
                             registered_block, registered_at, registered_tx)
         VALUES ($1,$2,$3,$4,$5,'active',$6,$7,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
        [id, r.data.agentKey, r.data.coldKey, r.data.guardians, r.data.threshold, r.block, r.at, r.tx]);
      return;
    case "StatusChanged":
      /* the registration emits one of these too, in the same transaction; the
         insert above already set it, and taking the later row is still right. */
      await c.query(
        `UPDATE agents SET status = $2, status_block = $3, status_at = $4
         WHERE id = $1 AND $3 >= status_block`, [id, r.data.status, r.block, r.at]);
      return;
    case "Rotated":
      await c.query("UPDATE agents SET successor_id = $2 WHERE id = $1", [id, r.data.successorId]);
      return;
    case "RevocationKeyChanged":
      await c.query("UPDATE agents SET cold_key = $2 WHERE id = $1", [id, r.data.newKey]);
      return;
    case "LimitsSet":
      await c.query("UPDATE agents SET expires_at = $2, heartbeat_window = $3, last_beat = $4 WHERE id = $1",
        [id, r.data.expiresAt, r.data.heartbeatWindow, Math.floor(new Date(r.at).getTime() / 1000)]);
      return;
    case "Beat":
      await c.query("UPDATE agents SET last_beat = $2 WHERE id = $1", [id, r.data.beatAt]);
      return;
    case "Labelled":
      await c.query("UPDATE agents SET name = $2, purpose = $3, labelled_at = $4 WHERE id = $1",
        [id, r.data.name, r.data.purpose, r.at]);
      return;
    case "Linked8004":
      /* link8004 already dropped pointers at another chain or switch */
      await c.query("UPDATE agents SET erc8004_id = $2 WHERE id = $1", [id, r.data.erc8004Id]);
      return;
  }
}

main().catch(e => { log("fatal", e?.message || e); process.exit(1); });
