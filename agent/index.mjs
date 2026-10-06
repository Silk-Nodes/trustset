/* the live agent.
 *
 * a real process, with its own key, doing real work on Monad testnet, that asks
 * the switch before every action. it is the honest half of enforcement: an
 * agent that obeys its own switch, with no venue adoption and nobody holding
 * anybody's funds. it does not defend against an agent that has been taken over
 * and rewritten, and the page says so.
 *
 * checking is a view call and costs nothing, so it happens often. acting costs
 * gas, so it happens on an interval. a stopped agent therefore costs nothing at
 * all, which is the thing being demonstrated.
 */
import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";
import { client, NotTrusted } from "../sdk/index.mjs";
import { dynamicConfigured, dynamicSigner } from "./dynamic.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.TRUSTSET_ROOT || join(HERE, "..");
const STATE = process.env.AGENT_STATE || join(ROOT, ".agent-state.json");
/* how often to look at the switch, and how often to act when it says yes. */
/* a setting that is not a positive number is named and fatal: NaN stopped
   every act and beat without a word, and 0 spun the loop against the rpc */
function seconds(name, dflt) {
  const raw = process.env[name];
  const n = raw === undefined || raw === "" ? dflt : Number(raw);
  if (!Number.isFinite(n) || n <= 0) { console.error(`${name} must be a positive number of seconds, got "${raw}"`); process.exit(2); }
  return n * 1000;
}
const CHECK_MS = seconds("CHECK_SECONDS", 60);
const ACT_MS = seconds("ACT_SECONDS", 900);
/* one dropped send must not hang the loop that keeps the heartbeat */
const WAIT_MS = 120_000;
/* monad charges the whole gas limit, not the gas used, so a limit set generously
   is money burnt on every action. these are only the fallback for when an
   estimate cannot be had; the real limit is estimated per call and given a
   fifth of headroom. a hardcoded limit was wrong the first time this ran
   against a fresh venue: the first write to a counter still at zero is a cold
   storage write, and 70000 measured on a warm one bought an out-of-gas. */
const TRADE_GAS = 120000n;
const BEAT_GAS = 90000n;

/* the fallback is for a transport failure. an estimate that reverted is the
   chain saying no, and sending anyway only paid for the revert */
async function limitFor(fn, args, fallback) {
  try { return ((await fn.estimateGas(...args)) * 12n) / 10n; }
  catch (e) { if (e?.code === "CALL_EXCEPTION") throw e; return fallback; }
}

const log = (...a) => console.log(new Date().toISOString(), ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const VENUE = ["function trade(uint256)"];

async function main() {
  const d = JSON.parse(await readFile(join(ROOT, "deployments", "monad-testnet.json"), "utf8"));
  /* an empty MONAD_RPC means unset, so the agent and its signer use one rpc */
  const trustset = client({ rpc: process.env.MONAD_RPC || undefined, killSwitch: d.killSwitch });
  /* a Dynamic server wallet when one is configured, otherwise the key file.
     the log says which, so a box that fell back is never mistaken for one
     that did not. */
  const viaDynamic = dynamicConfigured();
  const wallet = viaDynamic
    ? await dynamicSigner(trustset.provider, process.env.MONAD_RPC || "https://testnet-rpc.monad.xyz")
    : new ethers.Wallet(process.env.AGENT_KEY || (await readFile(join(ROOT, ".agent.key"), "utf8")).trim(), trustset.provider);
  const signerWord = viaDynamic ? "Dynamic server wallet (2-of-2 MPC)" : "key file";
  const venue = new ethers.Contract(d.venue, VENUE, wallet);

  const address = await wallet.getAddress();
  const id = await trustset.idForKey(address);
  if (id === 0n) throw new Error(`${address} is not registered on ${d.killSwitch}`);
  log(`agent ${id} · address ${address} · signs with ${signerWord} · acting every ${ACT_MS / 1000}s while trusted`);

  let lastAct = 0, lastWhy = "";
  for (;;) {
    try {
      /* the whole integration, once a minute, for free. */
      const trusted = await trustset.isTrusted(id);
      const why = trusted ? "trusted" : await trustset.why(id);
      if (why !== lastWhy) { log(why === "trusted" ? "trusted, working" : `not acting: ${why}`); lastWhy = why; }

      if (trusted && Date.now() - lastAct >= ACT_MS) {
        lastAct = Date.now();
        await act(trustset, wallet, venue, id);
      }
      await note(STATE, { agentId: String(id), key: address, signer: viaDynamic ? "dynamic" : "file", why, at: new Date().toISOString(), balance: ethers.formatEther(await trustset.provider.getBalance(address)) });
    } catch (e) {
      log("cycle failed:", e instanceof NotTrusted ? e.message : (e?.shortMessage || e?.message || e));
    }
    await sleep(CHECK_MS);
  }
}

/* one unit of work, and a heartbeat when one is due. the heartbeat is skipped
   unless the agent actually has a window, and never sent once it has lapsed:
   only the owner can start a new one. */
async function act(trustset, wallet, venue, id) {
  const l = await trustset.limits(id);
  const due = l.nextBeatBy > 0 && !l.lapsed ? l.nextBeatBy - Math.floor(Date.now() / 1000) : null;
  /* beat with room to spare: while less than one and a half action
     intervals remain. "less than an hour" with an hourly action could fall
     a few seconds either side of the boundary and skip the beat that
     mattered, and a lapse needs the owner to undo. */
  const beatDue = due !== null && due < (ACT_MS / 1000) * 1.5;

  /* what sending costs before it is sent. the rpc wants the whole limit at the
     max fee in the account up front, and when it is not there it answers
     "Missing or invalid parameters", which is how this agent ran dry on
     6 oct 2026 without one line saying so. so it is checked here and said
     plainly, and when there is not enough for both, the beat goes first: a
     skipped trade costs nothing, a missed beat is a lapse only the owner can
     undo. */
  const [balance, fees] = await Promise.all([wallet.provider.getBalance(await wallet.getAddress()), wallet.provider.getFeeData()]);
  const perGas = fees.maxFeePerGas ?? fees.gasPrice ?? 0n;
  const tradeLimit = await limitFor(venue.trade, [id], TRADE_GAS).catch(e => { log("trade failed:", e?.shortMessage || e?.message?.split("\n")[0] || e); return null; });
  const beatCost = beatDue ? BEAT_GAS * perGas : 0n;
  const tradeCost = tradeLimit ? tradeLimit * perGas : 0n;
  const mon = (w) => Number(ethers.formatEther(w)).toFixed(4);

  /* the trade and the heartbeat are separate jobs. a trade that failed used to
     throw before the heartbeat was reached, so one bad trade also cost the
     beat, and a missed beat is a lapse only the owner can undo. */
  if (tradeLimit && balance < tradeCost + beatCost) {
    log(`OUT OF GAS MONEY: skipping the trade, it needs ${mon(tradeCost)} MON${beatDue ? ` on top of ${mon(beatCost)} for the beat` : ""}, the agent has ${mon(balance)} MON. fund ${await wallet.getAddress()}`);
  } else if (tradeLimit) {
    try {
      const tx = await venue.trade(id, { gasLimit: tradeLimit });
      /* logged from the receipt, not from the send. a hash is not a trade: this
         said "traded" for one that reverted, which is the kind of log that sends
         you looking in the wrong place. */
      const rc = await wallet.provider.waitForTransaction(tx.hash, 1, WAIT_MS).catch(() => null);
      log(!rc ? `trade sent, no receipt within ${WAIT_MS / 1000}s · ${tx.hash}` : rc.status === 1 ? `traded · ${tx.hash}` : `trade REVERTED · ${tx.hash}`);
    } catch (e) { log("trade failed:", e?.shortMessage || e?.message?.split("\n")[0] || e); }
  }

  if (beatDue) {
    const left = await wallet.provider.getBalance(await wallet.getAddress());
    if (left < beatCost) {
      log(`OUT OF GAS MONEY: cannot beat, it needs ${mon(beatCost)} MON and the agent has ${mon(left)}. the window closes in ${Math.round(due / 60)}min, then only the owner can reopen it. fund ${await wallet.getAddress()}`);
      return;
    }
    const b = await trustset.beat(id, wallet, { gasLimit: BEAT_GAS });
    const br = await wallet.provider.waitForTransaction(b.hash, 1, WAIT_MS).catch(() => null);
    log(!br ? `beat sent, no receipt yet · ${b.hash}` : br.status === 1 ? `beat · ${b.hash}` : `beat REVERTED · ${b.hash}`);
  }
}

async function note(path, state) {
  try { await writeFile(path, JSON.stringify(state, null, 2)); } catch { /* the log is the record */ }
}

main().catch(e => { log("fatal", e?.message || e); process.exit(1); });
