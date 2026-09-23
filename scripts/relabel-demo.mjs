#!/usr/bin/env node
/* honest names for the agents silk nodes registered to demonstrate the switch.
 *
 * their first names read like businesses ("usd-market-maker", "treasury-ops"),
 * and a stranger on the explorer had no way to tell a demonstration from a
 * customer. nothing about them was fake, but the names implied adoption. the
 * contract is immutable and the agents cannot be removed, so they say what they
 * are instead: a demo, whose, and which state it is there to show.
 *
 * only agents whose cold key is the deployer can be relabelled from here. the
 * live agent keeps its name, and agents registered from other wallets are left
 * for their owners. testnet only. */
import { readFileSync } from "fs";
import { ethers } from "../web/node_modules/ethers/lib.esm/index.js";

const RPC = process.env.MONAD_RPC || "https://testnet-rpc.monad.xyz";
const WHO = "Silk Nodes testnet demo.";
const LABELS = {
  1: ["demo: treasury sweeper", "An active agent with no limits and no guardians."],
  2: ["demo: research bot", "An active agent that signs nothing of value."],
  3: ["demo: dca runner", "An active agent trading on the demo venue."],
  4: ["demo: guarded bot", "Active, with guardians who can vote to pause it."],
  5: ["demo: seven day key", "Registered with an end date, so its trust ends on its own."],
  6: ["demo: heartbeat bot", "Must report every hour. It went quiet, so its trust lapsed on its own."],
  14: ["demo: market maker", "Missed its heartbeat, so its trust lapsed with nobody sending anything."],
  15: ["demo: basis trader", "An active agent with no limits set."],
  16: ["demo: payments relay", "Active with an end date, a heartbeat and three guardians."],
  17: ["demo: rebalancer", "Its end date passed, so it stopped being trusted on its own."],
  18: ["demo: bridge watcher", "Missed its heartbeat window and went quiet."],
  19: ["demo: treasury ops", "Paused by its cold key. Reversible."],
  20: ["demo: collateral bot", "Paused by a guardian vote. Its cold key can undo that."],
  21: ["demo: nft sweeper", "Stopped for good by its cold key. Terminal."],
  22: ["demo: old market maker", "Retired in favour of agent 14, so its trust moved rather than died."],
};

const wait = (ms) => new Promise(r => setTimeout(r, ms));
const root = new URL("../", import.meta.url);
const dep = JSON.parse(readFileSync(new URL("deployments/monad-testnet.json", root), "utf8"));
const pk = JSON.parse(readFileSync(new URL(".deployer.json", root), "utf8"))?.data?.[0]?.private_key;
if (!pk) throw new Error("no private key in .deployer.json");

const p = new ethers.JsonRpcProvider(RPC, undefined, { staticNetwork: true });
const w = new ethers.Wallet(pk, p);
const labels = new ethers.Contract(dep.labels, [
  "function label(uint256 agentId, string name, string purpose)",
  "function labelOf(uint256 agentId) view returns (tuple(string name, string purpose, address by, uint64 at))",
], w);

console.log("labelling from", w.address);
for (const [id, [name, what]] of Object.entries(LABELS)) {
  const purpose = `${WHO} ${what}`;
  const now = await labels.labelOf(id).catch(() => null);
  await wait(400);
  if (now && now.name === name && now.purpose === purpose) { console.log(`  ${id.padStart(2)} already "${name}"`); continue; }
  /* monad charges the whole gas limit up front, so size it from an estimate
     rather than a round number */
  const est = await labels.label.estimateGas(id, name, purpose);
  await wait(400);
  const tx = await labels.label(id, name, purpose, { gasLimit: est * 12n / 10n });
  const rc = await tx.wait();
  console.log(`  ${id.padStart(2)} ${rc.status === 1 ? "labelled" : "FAILED"} "${name}"  ${tx.hash}`);
  await wait(400);
}
