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

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.TRUSTSET_ROOT || join(HERE, "..");
const STATE = process.env.AGENT_STATE || join(ROOT, ".agent-state.json");
/* how often to look at the switch, and how often to act when it says yes. */
const CHECK_MS = Number(process.env.CHECK_SECONDS || 60) * 1000;
const ACT_MS = Number(process.env.ACT_SECONDS || 900) * 1000;
/* monad charges the whole gas limit, not the gas used, so these are tight. */
const TRADE_GAS = 70000n;
const BEAT_GAS = 60000n;

const log = (...a) => console.log(new Date().toISOString(), ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const VENUE = ["function trade(uint256)"];

async function main() {
  const d = JSON.parse(await readFile(join(ROOT, "deployments", "monad-testnet.json"), "utf8"));
  const key = process.env.AGENT_KEY || (await readFile(join(ROOT, ".agent.key"), "utf8")).trim();
  const trustset = client({ rpc: process.env.MONAD_RPC, killSwitch: d.killSwitch });
  const wallet = new ethers.Wallet(key, trustset.provider);
  const venue = new ethers.Contract(d.venue, VENUE, wallet);

  const id = await trustset.idForKey(wallet.address);
  if (id === 0n) throw new Error(`${wallet.address} is not registered on ${d.killSwitch}`);
  log(`agent ${id} · key ${wallet.address} · acting every ${ACT_MS / 1000}s while trusted`);

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
      await note(STATE, { agentId: String(id), key: wallet.address, why, at: new Date().toISOString(), balance: ethers.formatEther(await trustset.provider.getBalance(wallet.address)) });
    } catch (e) {
      log("cycle failed:", e instanceof NotTrusted ? e.message : (e?.shortMessage || e?.message || e));
    }
    await sleep(CHECK_MS);
  }
}

/* one unit of work, and a heartbeat when one is due. the heartbeat is skipped
   unless the agent actually has a window, and never sent once it has lapsed:
   only the cold key can start a new one. */
async function act(trustset, wallet, venue, id) {
  const l = await trustset.limits(id);
  const tx = await venue.trade(id, { gasLimit: TRADE_GAS });
  log(`traded · ${tx.hash}`);
  await tx.wait(1);

  if (l.nextBeatBy > 0 && !l.lapsed) {
    const due = l.nextBeatBy - Math.floor(Date.now() / 1000);
    if (due < 3600) {
      const b = await trustset.beat(id, wallet, { gasLimit: BEAT_GAS });
      log(`beat · ${b.hash}`);
      await b.wait(1);
    }
  }
}

async function note(path, state) {
  try { await writeFile(path, JSON.stringify(state, null, 2)); } catch { /* the log is the record */ }
}

main().catch(e => { log("fatal", e?.message || e); process.exit(1); });
