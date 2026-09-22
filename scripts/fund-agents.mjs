#!/usr/bin/env node
/* gas for the agent keys the populate script registers.
 *
 * this is not in the forge script, and the reason is a monad behaviour worth
 * writing down: a plain value transfer succeeds with a gas limit of exactly
 * 21000 and FAILS with 27300. forge always adds a buffer to its estimate, so
 * every funding transfer it broadcast came back with a failed receipt and took
 * the rest of the run with it. contract calls are unaffected, which is why the
 * registrations in that script land fine.
 *
 * so the transfers happen here, at the intrinsic cost and nothing more.
 *
 * the keys are derived from their own names, exactly as Populate.s.sol derives
 * them, so nothing secret is stored and this stays reproducible. testnet only. */
import { readFileSync } from "fs";
import { ethers } from "../web/node_modules/ethers/lib.esm/index.js";

const RPC = process.env.MONAD_RPC || "https://testnet-rpc.monad.xyz";
const FUND = ethers.parseEther("0.02");
/* every agent that sends its own trades or beats, plus the guardian that has
   to pay for its own vote. the unnamed one never acts, so it never needs gas. */
const NAMES = [
  "ts:usd-market-maker", "ts:eth-basis", "ts:payments-relay", "ts:index-rebalancer",
  "ts:bridge-watcher", "ts:treasury-ops", "ts:collateral-bot", "ts:nft-sweeper",
  "ts:legacy-mm", "ts:guardian-1",
];

const pkOf = (name) => ethers.keccak256(ethers.toUtf8Bytes(name));
const wait = (ms) => new Promise(r => setTimeout(r, ms));

const deployerKey = () => {
  const raw = JSON.parse(readFileSync(new URL("../.deployer.json", import.meta.url), "utf8"));
  const pk = raw?.data?.[0]?.private_key;
  if (!pk) throw new Error("no private key in .deployer.json");
  return pk;
};

const main = async () => {
  const p = new ethers.JsonRpcProvider(RPC, undefined, { staticNetwork: true });
  const w = new ethers.Wallet(deployerKey(), p);
  console.log("funding from", w.address);

  for (const name of NAMES) {
    const to = new ethers.Wallet(pkOf(name)).address;
    const have = await p.getBalance(to);
    await wait(400);
    if (have >= FUND / 2n) {
      console.log(`  ${name.padEnd(22)} ${to}  has ${ethers.formatEther(have)}, skipped`);
      continue;
    }
    /* 21000 exactly. see the note at the top of this file. */
    const tx = await w.sendTransaction({ to, value: FUND, gasLimit: 21000 });
    const rc = await tx.wait();
    console.log(`  ${name.padEnd(22)} ${to}  ${rc.status === 1 ? "funded" : "FAILED"}  ${tx.hash}`);
    await wait(400);
  }

  console.log("left on the deployer:", ethers.formatEther(await p.getBalance(w.address)), "MON");
};

main().catch(e => { console.error(e.message ?? e); process.exit(1); });
