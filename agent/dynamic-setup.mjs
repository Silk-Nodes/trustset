#!/usr/bin/env node
/* one-time setup for the live agent's Dynamic server wallet. runs on the box.
 *
 *   node agent/dynamic-setup.mjs create
 *     makes a two-of-two MPC wallet in the Dynamic environment, backs our share
 *     up to Dynamic under DYNAMIC_WALLET_PASSWORD, and prints the address to put
 *     in .env as DYNAMIC_AGENT_ADDRESS. no key is printed or written anywhere.
 *
 *   node agent/dynamic-setup.mjs register
 *     registers that address as a new agent on the switch. the wallet signs its
 *     own consent through Dynamic, so nobody can register it under their key but
 *     us. the cold key is the server's demo key (DEMO_PAYER_KEY), the same one
 *     that owns agent 7, so the /demo button can switch this one off too. it
 *     copies agent 7's settings, names the agent, and sends it gas.
 *
 * it reads nothing from disk but the deployment file: load the env first, e.g.
 *   set -a; . /home/zoltan/trustset-state/agent.env; set +a
 * testnet only. */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";
import { dynamicClient, dynamicSigner, walletMeta } from "./dynamic.mjs";

const ROOT = process.env.TRUSTSET_ROOT || join(dirname(fileURLToPath(import.meta.url)), "..");
const RPC = process.env.MONAD_RPC || "https://testnet-rpc.monad.xyz";
const need = (...vs) => { const miss = vs.filter(v => !process.env[v]); if (miss.length) { console.error(`missing in .env: ${miss.join(", ")}`); process.exit(1); } };
const wait = ms => new Promise(r => setTimeout(r, ms));

const KS = [
  "function registrationDigest(address,address) view returns (bytes32)",
  "function register(address,address,address[],uint8,bytes) returns (uint256)",
  "function registerWithLimits(address,address,address[],uint8,bytes,uint64,uint64) returns (uint256)",
  "function agentIdByKey(address) view returns (uint256)",
  /* field for field as KillSwitch.Agent declares it. a tuple in the wrong order
     decodes without complaint and hands back the wrong numbers. */
  "function getAgent(uint256) view returns (tuple(address agentKey,address revocationKey,address pendingRevocationKey,uint64 revocationKeyChangeAt,uint8 guardianThreshold,uint8 status,uint64 statusSince,uint256 successorId,bytes32 reasonHash,uint64 expiresAt,uint64 heartbeatWindow,uint64 lastBeat,address[] guardians))",
];

async function create() {
  need("DYNAMIC_ENVIRONMENT_ID", "DYNAMIC_API_TOKEN", "DYNAMIC_WALLET_PASSWORD");
  const c = await dynamicClient();
  const w = await c.createWalletAccount({ thresholdSignatureScheme: "TWO_OF_TWO", password: process.env.DYNAMIC_WALLET_PASSWORD, backUpToDynamic: true });
  const backed = w.externalKeySharesWithBackupStatus?.every(s => s.backedUpToClientKeyShareService);
  console.log(`created ${w.walletMetadata.accountAddress}`);
  console.log(backed ? "our key share is backed up to Dynamic, encrypted under the password" : "WARNING: the key share did not report a backup. do not register this wallet.");
  console.log(`\nadd to .env:\nDYNAMIC_AGENT_ADDRESS=${w.walletMetadata.accountAddress}`);
}

async function register() {
  need("DYNAMIC_ENVIRONMENT_ID", "DYNAMIC_API_TOKEN", "DYNAMIC_AGENT_ADDRESS", "DYNAMIC_WALLET_PASSWORD", "DEMO_PAYER_KEY");
  const d = JSON.parse(readFileSync(join(ROOT, "deployments", "monad-testnet.json"), "utf8"));
  const p = new ethers.JsonRpcProvider(RPC, undefined, { staticNetwork: true });
  const cold = new ethers.Wallet(process.env.DEMO_PAYER_KEY, p);
  const ks = new ethers.Contract(d.killSwitch, KS, cold);
  const agent = await dynamicSigner(p, RPC);
  const key = await agent.getAddress();
  await walletMeta(await dynamicClient(), key);

  let id = await ks.agentIdByKey(key);
  if (id === 0n) {
    /* the agent's own consent, signed by Dynamic, checked here before it costs gas */
    const digest = await ks.registrationDigest(key, cold.address);
    const innerHash = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "uint256", "string", "address", "address"], [d.killSwitch, (await p.getNetwork()).chainId, "trustset:register", key, cold.address]));
    if (ethers.hashMessage(ethers.getBytes(innerHash)) !== digest) throw new Error("consent digest does not match the contract's; refusing to sign");
    const sig = await agent.signMessage(ethers.getBytes(innerHash));
    if (ethers.recoverAddress(digest, sig).toLowerCase() !== key.toLowerCase()) throw new Error("Dynamic's signature does not recover to the agent key");
    console.log("consent signed by Dynamic and checked");

    /* the same shape as agent 7: a guardian, and a two hour heartbeat */
    const seven = await ks.getAgent(process.env.LIVE_AGENT_ID || 7);
    const tx = await ks.registerWithLimits(key, cold.address, [...seven.guardians], seven.guardianThreshold, sig, 0, seven.heartbeatWindow || 7200);
    await tx.wait();
    await wait(1500);
    id = await ks.agentIdByKey(key);
    console.log(`registered as agent ${id} · ${tx.hash}`);
  } else console.log(`already agent ${id}`);

  if (d.labels) {
    const labels = new ethers.Contract(d.labels, ["function label(uint256,string,string)"], cold);
    await (await labels.label(id, "Live agent · Dynamic wallet", "Runs on our server and signs through a Dynamic MPC server wallet. Asks the switch before every trade.")).wait();
    console.log("named on chain");
  }

  /* gas for its own trades and beats. 21000 exactly: monad refuses a plain
     transfer sent with more (see scripts/fund-agents.mjs). */
  if ((await p.getBalance(key)) < ethers.parseEther("0.05")) {
    await (await cold.sendTransaction({ to: key, value: ethers.parseEther("0.2"), gasLimit: 21000 })).wait();
    console.log("funded 0.2 MON");
  }
  console.log(`\nset in .env and restart the agent and the web service:\nLIVE_AGENT_ID=${id}`);
}

const cmd = process.argv[2];
if (cmd === "create") await create();
else if (cmd === "register") await register();
else { console.error("usage: node agent/dynamic-setup.mjs create | register"); process.exit(1); }
