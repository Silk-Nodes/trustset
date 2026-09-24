/* agent silk: an agent that stakes MON with a validator, and asks the switch
 * before every move.
 *
 * the staking precompile, a plain transfer and a dex never ask trustset
 * anything. an agent's key can delegate, claim and send whether the switch
 * says trusted or stopped. so this agent asks itself: isTrusted before every
 * transaction, and a pause on the switch means the next action is refused
 * here, before anything is signed. that is the soft half of enforcement. it
 * holds while this code is the code that runs; a key taken to other software
 * is not bound by it. the hard half is a vault contract that asks the switch
 * on chain, and it comes after this.
 *
 * nothing here takes a key on the command line or writes one down. the key is
 * read from SILK_AGENT_KEY in the environment, meant to come from an env file
 * on the machine that runs it:  node --env-file=silk.env silk.mjs status
 *
 *   status                     what the switch, the wallet and the stake say
 *   validators [authAddress]   list validator ids, or find the one with that auth address
 *   stake <MON>                delegate that much to VALIDATOR_ID
 *   claim | compound           take the rewards out, or restake them
 *   send <address> <MON>       a plain transfer
 *   run                        the loop: check the switch every minute, compound on an interval,
 *                              and keep the heartbeat when the agent has one
 *
 * add --dry-run to any of them to simulate the transaction and send nothing.
 * status and validators need no key: --as <address> reads another agent. */
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";
import { client } from "../sdk/index.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.TRUSTSET_ROOT || join(HERE, "..");
/* the staking precompile. a protocol address, the same on every monad node. */
const STAKING = "0x0000000000000000000000000000000000001000";
const STAKING_ABI = [
  "function delegate(uint64 validatorId) payable returns (bool)",
  "function claimRewards(uint64 validatorId) returns (bool)",
  "function compound(uint64 validatorId) returns (bool)",
  "function getDelegator(uint64 validatorId, address delegator) returns (uint256 stake, uint256 accRewardPerToken, uint256 unclaimedRewards, uint256 deltaStake, uint256 nextDeltaStake, uint64 deltaEpoch, uint64 nextDeltaEpoch)",
  "function getValidator(uint64 validatorId) returns (address authAddress, uint64 flags, uint256 stake, uint256 accRewardPerToken, uint256 commission, uint256 unclaimedRewards, uint256 consensusStake, uint256 consensusCommission, uint256 snapshotStake, uint256 snapshotCommission, bytes secpPubkey, bytes blsPubkey)",
  "function getConsensusValidatorSet(uint32 startIndex) returns (bool isDone, uint32 nextIndex, uint64[] valIds)",
];
/* monad charges the whole gas limit up front, so the limit is estimated per
   call with a fifth of headroom, and these are only the fallback */
const FALLBACK_GAS = 300000n;
/* a plain transfer must say exactly 21000 on monad */
const TRANSFER_GAS = 21000n;
const CHECK_MS = Number(process.env.CHECK_SECONDS || 60) * 1000;
const ACT_MS = Number(process.env.ACT_SECONDS || 6 * 3600) * 1000;
/* below this the rewards are not worth the gas of compounding them */
const MIN_COMPOUND = ethers.parseEther(process.env.MIN_COMPOUND_MON || "0.01");

const log = (...a) => console.log(new Date().toISOString(), ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const mon = v => `${Number(ethers.formatEther(v)).toLocaleString("en-US", { maximumFractionDigits: 6 })} MON`;

const argv = process.argv.slice(2);
const DRY = argv.includes("--dry-run");
const asIdx = argv.indexOf("--as");
const AS = asIdx >= 0 ? argv[asIdx + 1] : undefined;
const [cmd, ...rest] = argv.filter((a, i) => !a.startsWith("--") && (asIdx < 0 || i !== asIdx + 1));

/* a missing setting is named and fatal, never guessed */
function need(name) {
  const v = process.env[name];
  if (!v) { log(`missing ${name}: set it in the env file this runs with`); process.exit(2); }
  return v;
}

async function setup(withKey) {
  const d = JSON.parse(await readFile(join(ROOT, "deployments", "monad-testnet.json"), "utf8"));
  const trustset = client({ rpc: process.env.MONAD_RPC, killSwitch: d.killSwitch });
  const p = trustset.provider;
  const wallet = withKey ? new ethers.Wallet(need("SILK_AGENT_KEY"), p) : null;
  /* a read needs only the address: from --as, or worked out from the key the
     env file already holds, which is never printed */
  const address = wallet ? await wallet.getAddress() : AS ? ethers.getAddress(AS)
    : process.env.SILK_AGENT_KEY ? new ethers.Wallet(process.env.SILK_AGENT_KEY).address : ethers.getAddress(need("SILK_AGENT_ADDRESS"));
  const id = await trustset.idForKey(address);
  if (id === 0n) { log(`${address} is not registered on the switch at ${d.killSwitch}`); process.exit(3); }
  const staking = new ethers.Contract(STAKING, STAKING_ABI, wallet ?? p);
  return { trustset, p, wallet, address, id, staking };
}

/* the whole integration: the answer, and the word for it when it is no */
async function gate(trustset, id) {
  const ok = await trustset.isTrusted(id);
  return { ok, why: ok ? "trusted" : await trustset.why(id) };
}

async function limitFor(estimate) {
  try { return ((await estimate()) * 12n) / 10n; } catch { return FALLBACK_GAS; }
}

/* ask the switch, then simulate, then send. a refusal from the switch stops
   here with nothing signed; a dry run stops after the simulation. */
async function act(ctx, label, build) {
  const g = await gate(ctx.trustset, ctx.id);
  if (!g.ok) { log(`refused: agent ${ctx.id} is ${g.why} on the switch, so ${label} was not sent`); return false; }
  const { fn, args = [], overrides = {} } = build();
  const gasLimit = overrides.gasLimit ?? await limitFor(() => fn.estimateGas(...args, overrides));
  /* an empty wallet fails the simulation with nothing useful to say, so say it
     here: what it holds against what this costs, the whole gas limit included */
  const fee = (await ctx.p.getFeeData()).gasPrice ?? 0n;
  const cost = (overrides.value ?? 0n) + gasLimit * fee;
  const have = await ctx.p.getBalance(ctx.address);
  if (have < cost) { log(`${label} needs about ${mon(cost)} with gas; the agent's wallet ${ctx.address} holds ${mon(have)}`); return false; }
  try { await fn.staticCall(...args, { ...overrides, gasLimit }); }
  catch (e) { log(`${label} would fail: ${e?.shortMessage || e?.reason || e?.message?.split("\n")[0]}`); return false; }
  if (DRY) { log(`dry run: ${label} simulates fine at gas limit ${gasLimit}. nothing sent`); return true; }
  const tx = await fn(...args, { ...overrides, gasLimit });
  const rc = await ctx.p.waitForTransaction(tx.hash);
  log(rc?.status === 1 ? `${label} · ${tx.hash}` : `${label} REVERTED · ${tx.hash}`);
  return rc?.status === 1;
}

async function status() {
  const { trustset, p, address, id, staking } = await setup(false);
  const g = await gate(trustset, id);
  const l = await trustset.limits(id);
  log(`agent ${id} · address ${address} · ${g.why}`);
  log(`wallet ${mon(await p.getBalance(address))}`);
  if (l.expiresAt) log(`trusted until ${new Date(l.expiresAt * 1000).toISOString()}`);
  if (l.nextBeatBy) log(`next heartbeat due by ${new Date(l.nextBeatBy * 1000).toISOString()}`);
  const vid = process.env.VALIDATOR_ID;
  if (!vid) { log("no VALIDATOR_ID set, so no stake to read"); return; }
  const dl = await staking.getDelegator.staticCall(BigInt(vid), address);
  const v = await staking.getValidator.staticCall(BigInt(vid));
  log(`validator ${vid} · auth ${v.authAddress} · commission ${Number(ethers.formatEther(v.commission)) * 100}% · total stake ${mon(v.stake)}`);
  log(`staked ${mon(dl.stake)} · pending ${mon(dl.deltaStake + dl.nextDeltaStake)} · unclaimed rewards ${mon(dl.unclaimedRewards)}`);
}

/* every id in the consensus set, read four at a time so the public rpc's rate
   limit is not the thing that answers */
async function validators(match) {
  const { staking } = await setup(false).catch(() => ({ staking: new ethers.Contract(STAKING, STAKING_ABI, client({ rpc: process.env.MONAD_RPC }).provider) }));
  const ids = [];
  for (let i = 0, done = false; !done;) { const r = await staking.getConsensusValidatorSet.staticCall(i); ids.push(...r.valIds); done = r.isDone; i = Number(r.nextIndex); }
  log(`${ids.length} validators in the consensus set`);
  for (let i = 0; i < ids.length; i += 4) {
    const rows = await Promise.all(ids.slice(i, i + 4).map(async vid => ({ vid, v: await staking.getValidator.staticCall(vid) })));
    for (const { vid, v } of rows) {
      if (match && v.authAddress.toLowerCase() !== match.toLowerCase()) continue;
      console.log(`${String(vid).padStart(5)}  ${v.authAddress}  stake ${mon(v.stake)}  commission ${Number(ethers.formatEther(v.commission)) * 100}%`);
    }
    await sleep(300);
  }
}

async function main() {
  if (cmd === "status") return status();
  if (cmd === "validators") return validators(rest[0]);
  if (!["stake", "claim", "compound", "send", "run"].includes(cmd ?? "")) {
    console.log("usage: node --env-file=silk.env silk.mjs status | validators [authAddress] | stake <MON> | claim | compound | send <address> <MON> | run  [--dry-run]");
    process.exit(1);
  }
  const ctx = await setup(true);
  const vid = () => BigInt(need("VALIDATOR_ID"));
  log(`agent ${ctx.id} · address ${ctx.address}${DRY ? " · dry run" : ""}`);

  if (cmd === "stake") {
    const amount = ethers.parseEther(rest[0] ?? need("STAKE_MON"));
    return act(ctx, `delegate ${mon(amount)} to validator ${vid()}`, () => ({ fn: ctx.staking.delegate, args: [vid()], overrides: { value: amount } }));
  }
  if (cmd === "claim") return act(ctx, `claim rewards from validator ${vid()}`, () => ({ fn: ctx.staking.claimRewards, args: [vid()] }));
  if (cmd === "compound") return act(ctx, `compound rewards with validator ${vid()}`, () => ({ fn: ctx.staking.compound, args: [vid()] }));
  if (cmd === "send") {
    const [to, amt] = rest;
    if (!to || !ethers.isAddress(to) || !amt) { log("send needs an address and an amount: send 0x… 0.5"); process.exit(1); }
    const amount = ethers.parseEther(amt);
    /* a transfer through the same gate: a signer call, not a contract one */
    const g = await gate(ctx.trustset, ctx.id);
    if (!g.ok) { log(`refused: agent ${ctx.id} is ${g.why} on the switch, so the transfer was not sent`); return; }
    if (DRY) { log(`dry run: send ${mon(amount)} to ${ethers.getAddress(to)} from a wallet holding ${mon(await ctx.p.getBalance(ctx.address))}. nothing sent`); return; }
    const tx = await ctx.wallet.sendTransaction({ to: ethers.getAddress(to), value: amount, gasLimit: TRANSFER_GAS });
    const rc = await ctx.p.waitForTransaction(tx.hash);
    log(rc?.status === 1 ? `sent ${mon(amount)} to ${to} · ${tx.hash}` : `transfer REVERTED · ${tx.hash}`);
    return;
  }

  /* the loop. checking is a view call and free, so it runs every minute;
     compounding costs gas, so it runs on the interval and only when the
     rewards are worth it. a paused agent is logged once and does nothing. */
  let lastAct = 0, lastWhy = "";
  for (;;) {
    try {
      const g = await gate(ctx.trustset, ctx.id);
      if (g.why !== lastWhy) { log(g.ok ? "trusted, staking" : `not acting: ${g.why}`); lastWhy = g.why; }
      if (g.ok && Date.now() - lastAct >= ACT_MS) {
        lastAct = Date.now();
        const dl = await ctx.staking.getDelegator.staticCall(vid(), ctx.address);
        if (dl.unclaimedRewards >= MIN_COMPOUND) await act(ctx, `compound ${mon(dl.unclaimedRewards)}`, () => ({ fn: ctx.staking.compound, args: [vid()] }));
        else log(`rewards ${mon(dl.unclaimedRewards)}, under ${mon(MIN_COMPOUND)}: not worth the gas yet`);
        const l = await ctx.trustset.limits(ctx.id);
        if (l.nextBeatBy > 0 && !l.lapsed && l.nextBeatBy - Date.now() / 1000 < (ACT_MS / 1000) * 1.5) {
          if (DRY) log("dry run: a heartbeat is due. nothing sent");
          else { const b = await ctx.trustset.beat(ctx.id, ctx.wallet, { gasLimit: 90000n }); const br = await ctx.p.waitForTransaction(b.hash); log(br?.status === 1 ? `beat · ${b.hash}` : `beat REVERTED · ${b.hash}`); }
        }
      }
    } catch (e) { log("cycle failed:", e?.shortMessage || e?.message?.split("\n")[0] || e); }
    if (DRY) return;
    await sleep(CHECK_MS);
  }
}

main().catch(e => { log("fatal:", e?.shortMessage || e?.message || e); process.exit(1); });
