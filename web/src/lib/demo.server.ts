import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { ethers } from "ethers";
import { GET as chain, type ChainCfg } from "@/app/api/chain/route";

/* the live venue, server side.
 *
 * the demo has to make real transactions from two different keys, because that
 * is the whole point: a trade is sent by the agent's own key, and a stop is
 * sent by the cold key. a browser holds neither. so the agent key lives here,
 * on the server, funded by the deployer, and the cold key is whoever is
 * watching: the visitor's wallet when they have one, the deployer when they
 * do not.
 *
 * testnet only, and the keys never leave this file. an agent key here can do
 * exactly one thing, call trade() on a demo venue that counts calls. it holds
 * enough gas for a few hundred of them and nothing else. */

/* where the deployment file and the demo's own state live. on a server the
   working directory is wherever systemd started us, and the state directory is
   often not the checkout, so both are settable. */
const ROOT = () => process.env.TRUSTSET_ROOT || join(process.cwd(), "..");
const STORE = () => process.env.DEMO_STORE || join(ROOT(), ".demo-agents.json");
const FUND = ethers.parseEther("0.05");
const KEEP = ethers.parseEther("0.01");
/* what one visitor costs the payer: funding an agent key, plus gas for the
   registration and a stop or two. checked before anything is sent so an empty
   payer says so in a sentence instead of through an RPC error. */
const NEEDED = ethers.parseEther("0.12");

export type Demo = {
  agentId: string; agentKey: string; coldKey: string; guardian: string; owned: boolean;
  /* set when the store hands back an agent the chain does not agree is this
     visitor's. the page shows it instead of offering controls that revert. */
  mismatch?: { storedFor: string; actualColdKey: string };
};
type Row = { id: string; priv: string; cold: string; guardian?: string };

export async function cfg(): Promise<ChainCfg> {
  const r = await chain();
  if (!r.ok) throw new Error("no chain");
  return r.json();
}

export function provider(c: ChainCfg) {
  /* the public testnet rpc answers fifteen requests a second and rejects the
     rest with a 429. ethers reports that as "missing revert data", which names
     neither the limit nor the cause, so the retry belongs here: a few attempts
     with backoff turns a burst of readers into a slower answer rather than a
     failed one. the cache in the demo route is what keeps the burst small; this
     is what survives the one that gets through anyway. */
  const req = new ethers.FetchRequest(c.rpc);
  req.setThrottleParams({ slotInterval: 250, maxAttempts: 5 });
  return new ethers.JsonRpcProvider(req, undefined, { staticNetwork: true, batchMaxCount: 4 });
}

/* who pays for the demo, and who is the cold key for visitors who have not
   connected a wallet.
 *
 * on a server this is DEMO_PAYER_KEY and it should be its own key holding a few
 * testnet MON, not the key that owns the deployment. the demo funds a fresh
 * agent key per visitor and registers it, so whatever key it is given is spent
 * from by anyone who loads the page. giving it the deployer's key would put the
 * contracts' owner one bug away from a stranger's reach and drain the balance
 * the next deploy needs.
 *
 * the file is the local fallback, and the anvil demo carries one of anvil's
 * published defaults in its own config. */
export async function payer(c: ChainCfg, p: ethers.Provider): Promise<ethers.Wallet> {
  if (process.env.DEMO_PAYER_KEY) return new ethers.Wallet(process.env.DEMO_PAYER_KEY, p);
  if (c.ownerKey) return new ethers.Wallet(c.ownerKey, p);
  const f = JSON.parse(await readFile(join(ROOT(), ".deployer.json"), "utf8"));
  return new ethers.Wallet(f.data[0].private_key, p);
}

async function rows(): Promise<Record<string, Row>> {
  try { return JSON.parse(await readFile(STORE(), "utf8")); } catch { return {}; }
}

/* one agent per cold key, kept so a visitor who comes back finds their own
   agent rather than registering another one every reload. */
export async function demoFor(owner: string | null): Promise<Demo> {
  const c = await cfg();
  const p = provider(c);
  const boss = await payer(c, p);
  const cold = owner && ethers.isAddress(owner) ? ethers.getAddress(owner) : boss.address;
  const all = await rows();
  const have = all[cold.toLowerCase()];
  /* the demo agent carries one guardian so the walkthrough can show a guardian
     vote actually landing rather than describing one. it is a key this server
     holds and funds, and it can do exactly what any guardian can: vote to pause,
     never spend, never stop instantly. */
  const guard = guardianFor(cold);
  if (!have && (await p.getBalance(boss.address)) < NEEDED) {
    throw new Error(`The demo wallet is out of testnet MON. Send some to ${boss.address} and it starts working again.`);
  }
  if (have) {
    const w = new ethers.Wallet(have.priv, p);
    /* who the CHAIN says owns this agent, not who asked for it.
     *
     * this used to answer coldKey: cold and owned: !!owner, both straight from
     * the request, so the api said "this is yours" purely because you asked as
     * that address and had never checked. while the store agrees that is
     * invisible; the moment it does not, after a redeploy or a hand edited
     * record, the page offers you a switch and every press reverts with
     * NotRevocationKey. reporting an assumption as a fact is how this reads as
     * broken rather than as not yours. */
    const ks = new ethers.Contract(c.killSwitch, [
      "function getAgent(uint256) view returns (tuple(address agentKey,address revocationKey,address pendingRevocationKey,uint64 revocationKeyChangeAt,uint8 guardianThreshold,uint8 status,uint64 statusSince,uint256 successorId,bytes32 reasonHash,uint64 expiresAt,uint64 heartbeatWindow,uint64 lastBeat,address[] guardians))",
    ], p);
    /* positionally: a Result is an array first, so revocationKey by name is
       safe but guardians is not, and mixing the two styles is how the wrong
       field gets read later. */
    const a = await ks.getAgent(have.id);
    const actualCold = ethers.getAddress(a[1] as string);
    const chainGuardians = [...(a[12] as string[])].map((g) => ethers.getAddress(g));
    const reallyOwned = !!owner && actualCold.toLowerCase() === cold.toLowerCase();
    const guardianOnChain = chainGuardians.includes(ethers.getAddress(guard.address));

    if ((await p.getBalance(guard.address)) < KEEP) await (await boss.sendTransaction({ to: guard.address, value: FUND })).wait();
    /* top the agent up if it has spent its gas down; a demo that stops working
       after fifty trades is worse than no demo. */
    if ((await p.getBalance(w.address)) < KEEP) await (await boss.sendTransaction({ to: w.address, value: FUND })).wait();

    return {
      agentId: have.id, agentKey: w.address, coldKey: actualCold,
      guardian: guardianOnChain ? guard.address : (chainGuardians[0] ?? guard.address),
      owned: reallyOwned,
      ...(owner && !reallyOwned ? { mismatch: { storedFor: cold, actualColdKey: actualCold } } : {}),
    };
  }
  const w = ethers.Wallet.createRandom().connect(p);
  await (await boss.sendTransaction({ to: w.address, value: FUND })).wait();
  await (await boss.sendTransaction({ to: guard.address, value: FUND })).wait();
  const ks = new ethers.Contract(c.killSwitch, [
    "function register(address,address,address[],uint8,bytes) returns (uint256)",
    "function agentIdByKey(address) view returns (uint256)",
  ], boss);
  const inner = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "uint256", "string", "address", "address"],
    [c.killSwitch, BigInt(c.chainIdHex), "trustset:register", w.address, cold]));
  const sig = await w.signMessage(ethers.getBytes(inner));
  await (await ks.register(w.address, cold, [guard.address], 1, sig)).wait();
  const id = (await ks.agentIdByKey(w.address)) as bigint;
  all[cold.toLowerCase()] = { id: id.toString(), priv: w.privateKey, cold, guardian: guard.address };
  await writeFile(STORE(), JSON.stringify(all, null, 2));
  return { agentId: id.toString(), agentKey: w.address, coldKey: cold, guardian: guard.address, owned: !!owner };
}

/* the guardian for a visitor's demo agent. derived, not stored: the same cold
   key always gets the same guardian, and losing the store loses nothing that
   cannot be worked out again. */
export function guardianFor(cold: string): ethers.Wallet {
  const seed = ethers.keccak256(ethers.toUtf8Bytes(`trustset:demo:guardian:${cold.toLowerCase()}`));
  return new ethers.Wallet(seed);
}

export async function agentWallet(cold: string): Promise<{ w: ethers.Wallet; id: bigint; c: ChainCfg } | null> {
  const c = await cfg();
  const all = await rows();
  const row = all[cold.toLowerCase()];
  if (!row) return null;
  return { w: new ethers.Wallet(row.priv, provider(c)), id: BigInt(row.id), c };
}
