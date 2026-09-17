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
const STATUS = ["none", "active", "paused", "revoked", "rotated"];

const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString(), ...a);

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
  const db = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
  await db.query(await readFile(join(HERE, "schema.sql"), "utf8"));

  const from = Number(process.env.START_BLOCK || d.startBlock || 0) || (await firstBlock(db, d));
  let cur = await cursor(db, from);
  log(`indexing ${d.killSwitch} from block ${cur}`);

  for (;;) {
    const head = (await retry(() => p.getBlock("finalized")))?.number ?? 0;
    const target = Math.max(0, head - BEHIND);
    while (cur <= target) {
      const to = Math.min(cur + WINDOW - 1, target);
      const rows = await pull(p, d, ks, labels, cur, to);
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

async function pull(p, d, ks, labels, from, to) {
  const [a, b] = await Promise.all([
    retry(() => p.getLogs({ address: d.killSwitch, fromBlock: from, toBlock: to })),
    d.labels ? retry(() => p.getLogs({ address: d.labels, fromBlock: from, toBlock: to })) : Promise.resolve([]),
  ]);
  if (!a.length && !b.length) return [];
  /* one timestamp read per block that actually had a log, not per block. */
  const stamps = new Map();
  for (const l of [...a, ...b]) stamps.set(l.blockNumber, null);
  for (const n of stamps.keys()) stamps.set(n, (await retry(() => p.getBlock(n)))?.timestamp ?? 0);

  const out = [];
  for (const l of a) out.push(decode(ks, l, stamps.get(l.blockNumber)));
  for (const l of b) out.push(decode(labels, l, stamps.get(l.blockNumber)));
  return out.filter(Boolean);
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
  switch (ev.name) {
    case "AgentRegistered":
      return { ...base, agentId: Number(n[0]), actor: n[2],
        data: { agentKey: n[1], coldKey: n[2], guardians: [...n[3]], threshold: Number(n[4]) } };
    case "StatusChanged":
      return { ...base, agentId: Number(n[0]), actor: n[3], data: { status: STATUS[Number(n[1])] || "none", reasonHash: n[2] } };
    case "Rotated":
      return { ...base, agentId: Number(n[0]), actor: null, data: { successorId: Number(n[1]) } };
    case "RevocationKeyChangeProposed":
      return { ...base, agentId: Number(n[0]), actor: null, data: { newKey: n[1], applyAt: Number(n[2]) } };
    case "RevocationKeyChanged":
      return { ...base, agentId: Number(n[0]), actor: n[1], data: { newKey: n[1] } };
    case "GuardianVoted":
      return { ...base, agentId: Number(n[0]), actor: n[1], data: { votes: Number(n[2]), threshold: Number(n[3]) } };
    case "LimitsSet":
      return { ...base, agentId: Number(n[0]), actor: null, data: { expiresAt: Number(n[1]), heartbeatWindow: Number(n[2]) } };
    case "Beat":
      return { ...base, agentId: Number(n[0]), actor: null, data: { beatAt: Number(n[1]) } };
    case "Labelled":
      return { ...base, agentId: Number(n[0]), actor: n[1], data: { name: n[2], purpose: n[3] } };
    default: return null;
  }
}

/* one transaction per window: the feed rows, then the fold into current state.
   if it fails halfway the cursor is not moved and the window runs again. */
async function write(db, rows) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    for (const r of rows) {
      try {
      await c.query(
        `INSERT INTO events (block, tx_hash, log_index, at, kind, agent_id, actor, data)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (tx_hash, log_index) DO NOTHING`,
        [r.block, r.tx, r.index, r.at, r.kind, r.agentId ?? null, r.actor ?? null, JSON.stringify(r.data)]);
      await fold(c, r);
      } catch (e) {
        /* one bad row should name itself rather than take the window down. */
        log("row failed", r.kind, "block", r.block, JSON.stringify(r.data), e?.message || e);
        throw e;
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
  }
}

main().catch(e => { log("fatal", e?.message || e); process.exit(1); });
