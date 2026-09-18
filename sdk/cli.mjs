#!/usr/bin/env node
/* the sixty second version.
 *
 * the readme can claim that checking an agent is one call against a live chain,
 * but a claim is worth less than something a stranger can run before deciding
 * whether to read further. this reads monad testnet and nothing else: no keys,
 * no accounts, no config, no writes.
 */
import { client, MONAD_TESTNET } from "./index.mjs";

const args = process.argv.slice(2);
if (args.includes("-h") || args.includes("--help")) {
  console.log(`
trustset: ask the switch whether an agent may act.

  npx @trustset/check <agentId> [...]     check one agent or several
  npx @trustset/check --address <addr>    check whichever agent owns that key
  npx @trustset/check --erc8004 <id>     check the agent behind an erc-8004 identity

  --rpc <url>        a different monad rpc
  --switch <addr>    a different deployment

reads ${MONAD_TESTNET.rpc} by default. no keys, no writes.
`.trim());
  process.exit(0);
}

const opt = (name, fallback) => {
  const i = args.indexOf(name);
  if (i === -1) return fallback;
  const v = args[i + 1];
  args.splice(i, 2);
  return v ?? fallback;
};
const rpc = opt("--rpc", MONAD_TESTNET.rpc);
const killSwitch = opt("--switch", MONAD_TESTNET.killSwitch);
const address = opt("--address", null);
const erc8004 = opt("--erc8004", null);

const c = client({ rpc, killSwitch });

/* the words the switch uses, and what they mean for the caller. why() already
   returns one of these; this is only the sentence a person reads after it. */
const MEANING = {
  trusted: "may act",
  paused: "paused by its owner, and may come back",
  stopped: "stopped for good, and never comes back",
  expired: "its end date has passed",
  silent: "it missed its heartbeat",
  rotated: "replaced by a successor agent",
};

const when = (t) => (t ? new Date(t * 1000).toISOString().replace("T", " ").slice(0, 16) + " utc" : "none");

async function report(id) {
  const [ok, why, lim] = await Promise.all([c.isTrusted(id), c.why(id), c.limits(id)]);
  console.log(`\nagent ${id}  ${ok ? "TRUSTED" : "REFUSED"}`);
  console.log(`  why        ${why}, ${MEANING[why] ?? "unknown to this version of the sdk"}`);
  console.log(`  ends       ${when(lim.expiresAt)}`);
  console.log(`  next beat  ${when(lim.nextBeatBy)}`);
}

try {
  let ids = args.filter((a) => /^\d+$/.test(a));
  if (erc8004) {
    /* two view calls against two public contracts, and no server of ours in
       between. the pointer is the token owner's claim, so it is checked
       against this chain and this switch before it is believed. */
    const link = await c.from8004(erc8004);
    if (!link.ok) {
      console.log(`\nerc-8004 agent ${erc8004}: ${link.reason}`);
      process.exit(1);
    }
    console.log(`\nerc-8004 agent ${link.tokenId} points at trustset agent ${link.agentId} on chain ${link.chainId}.`);
    ids = [String(link.agentId)];
  }
  if (address) {
    const id = await c.idForKey(address);
    if (id === 0n) {
      console.log(`\n${address} is not registered on this switch.`);
      process.exit(1);
    }
    console.log(`\n${address} is agent ${id}.`);
    ids = [id.toString()];
  }
  if (!ids.length) ids = ["7"];

  console.log(`switch ${c.address} on ${rpc}`);
  for (const id of ids) await report(id);
  console.log(`\nthat is isTrusted(), the whole integration. https://trustset.silknodes.io`);
} catch (e) {
  console.error(`\ncould not read the switch: ${e.shortMessage ?? e.message}`);
  process.exit(1);
}
