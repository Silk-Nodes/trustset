import { readFile, writeFile, rename } from "fs/promises";
import { join } from "path";
import { createHmac } from "crypto";
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
/* new practice agents per day, across everybody. each one costs the payer
   about NEEDED, so this is the most a day of signups can spend. */
const NEW_PER_DAY = 40;

/* thrown when a wallet has no practice agent yet and did not sign for one */
export class NeedsStart extends Error { constructor() { super("needs start"); } }

export type Demo = {
  agentId: string; agentKey: string; coldKey: string; guardian: string; owned: boolean;
  /* set when the store hands back an agent the chain does not agree is this
     visitor's. the page shows it instead of offering controls that revert. */
  mismatch?: { storedFor: string; actualColdKey: string };
};
type Row = { id: string; priv: string; cold: string; guardian?: string };

/* both now live in rpc.server, so a read-only route can have a provider
   without dragging this file's filesystem access into its bundle. imported as
   well as re-exported, because this file calls them itself. */
import { cfg, provider } from "@/lib/rpc.server";
export { cfg, provider };

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
/* every send from one server key goes through one lane.
 *
 * the demo, the gas drip, the live agent and the panic relay all used to
 * build their own wallet and send at once, so two sends in the same moment
 * read the same pending nonce and one of them failed. a visitor pressing the
 * demo could make a stranger's panic button fail. now a send waits for the
 * one before it to be broadcast. kept on globalThis because next can load this
 * module more than once, and one lane per copy would be no lane at all. */
const G = globalThis as unknown as { __trustsetLanes?: Map<string, Promise<unknown>> };
const lanes = (G.__trustsetLanes ??= new Map());
class Laned extends ethers.Wallet {
  override async sendTransaction(tx: ethers.TransactionRequest): Promise<ethers.TransactionResponse> {
    const k = this.address.toLowerCase();
    const run = (lanes.get(k) ?? Promise.resolve()).then(() => super.sendTransaction(tx));
    lanes.set(k, run.catch(() => {}));
    return run;
  }
}

/* only a local chain may fall back to the deployment's own key. on a public
   chain the payer is spent from by anybody who loads the page, and handing it
   the deployer's key would put the contracts' owner in reach of a stranger. */
const LOCAL = "0x7a69";
let warnedPayer = false;
export async function payer(c: ChainCfg, p: ethers.Provider): Promise<ethers.Wallet> {
  if (process.env.DEMO_PAYER_KEY) return new Laned(process.env.DEMO_PAYER_KEY, p);
  if (c.chainIdHex !== LOCAL) {
    if (!warnedPayer) { console.error("DEMO_PAYER_KEY is not set, so the demo, the gas drip and the relays cannot send"); warnedPayer = true; }
    throw new Error("The demo wallet is not configured on this server.");
  }
  if (c.ownerKey) return new Laned(c.ownerKey, p);
  const f = JSON.parse(await readFile(join(ROOT(), ".deployer.json"), "utf8"));
  return new Laned(f.data[0].private_key, p);
}

/* the panic relay's own key. the relay is the one route a person in trouble
   depends on, so it should not share a balance or a nonce with a demo that
   anybody can press. without PANIC_RELAY_KEY it says so and uses the payer. */
let warnedRelay = false;
export async function relayer(c: ChainCfg, p: ethers.Provider): Promise<ethers.Wallet> {
  if (process.env.PANIC_RELAY_KEY) return new Laned(process.env.PANIC_RELAY_KEY, p);
  if (!warnedRelay) { console.error("PANIC_RELAY_KEY is not set, so the panic relay shares the demo payer's key and balance"); warnedRelay = true; }
  return payer(c, p);
}

/* the store written whole, then renamed into place, so a crash or a second
   writer can never leave half a file that reads back as no agents at all */
async function save(path: string, v: unknown) {
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(v, null, 2));
  await rename(tmp, path);
}

/* registrations run one at a time in this process, re-reading the store
   inside, so two at once cannot each write the file without the other's row */
let registering: Promise<unknown> = Promise.resolve();

async function rows(): Promise<Record<string, Row>> {
  let raw: string;
  try { raw = await readFile(STORE(), "utf8"); }
  catch (e) { if ((e as { code?: string }).code === "ENOENT") return {}; throw e; }
  /* a store that exists but does not parse is a fault to report, never an
     empty store: treating it as empty registered a new agent for everybody
     and wrote over every key the file held */
  return JSON.parse(raw);
}

const DAYS = () => `${STORE()}.days`;
async function countNew(): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);
  let d: Record<string, number> = {};
  try { d = JSON.parse(await readFile(DAYS(), "utf8")); } catch { /* first one today */ }
  if ((d[day] ?? 0) >= NEW_PER_DAY) throw new Error("Today's practice agents are all handed out. The shared one still works, and new ones open tomorrow.");
  await save(DAYS(), { [day]: (d[day] ?? 0) + 1 });
}

/* one agent per cold key, kept so a visitor who comes back finds their own
   agent rather than registering another one every reload. */
/* create is false for everything but a signed start. a read, or an action,
   for a wallet with no agent yet throws NeedsStart instead of spending. */
export async function demoFor(owner: string | null, create = false): Promise<Demo> {
  const c = await cfg();
  const p = provider(c);
  const mine = owner && ethers.isAddress(owner) ? ethers.getAddress(owner) : null;
  const all = await rows();
  /* answered before the payer is touched: a wallet that has not signed costs
     nothing and needs no key to be told so */
  if (mine && !all[mine.toLowerCase()] && !create) throw new NeedsStart();
  const boss = await payer(c, p);
  const cold = mine ?? boss.address;
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
    /* the guardian this server holds for the agent: the secret one, or for an
       agent registered before the secret, the old one. funded only when it
       really is on chain, so a new derivation never pays an address that can
       do nothing. */
    const held = demoGuardian(cold, chainGuardians);
    const guardianOnChain = !!held;

    if (held && (await p.getBalance(held.address)) < KEEP) await (await boss.sendTransaction({ to: held.address, value: FUND })).wait();
    /* top the agent up if it has spent its gas down; a demo that stops working
       after fifty trades is worse than no demo. */
    if ((await p.getBalance(w.address)) < KEEP) await (await boss.sendTransaction({ to: w.address, value: FUND })).wait();

    return {
      agentId: have.id, agentKey: w.address, coldKey: actualCold,
      guardian: guardianOnChain ? held!.address : (chainGuardians[0] ?? guard.address),
      owned: reallyOwned,
      ...(owner && !reallyOwned ? { mismatch: { storedFor: cold, actualColdKey: actualCold } } : {}),
    };
  }
  const job = registering.then(() => register(c, p, boss, cold, guard, owner));
  registering = job.catch(() => {});
  return job;
}

async function register(c: ChainCfg, p: ethers.Provider, boss: ethers.Wallet, cold: string, guard: ethers.Wallet, owner: string | null): Promise<Demo> {
  /* somebody may have registered this owner while we waited our turn */
  const again = (await rows())[cold.toLowerCase()];
  if (again) return demoFor(owner);
  if (owner) await countNew();
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
  const all = await rows();
  all[cold.toLowerCase()] = { id: id.toString(), priv: w.privateKey, cold, guardian: guard.address };
  await save(STORE(), all);
  return { agentId: id.toString(), agentKey: w.address, coldKey: cold, guardian: guard.address, owned: !!owner };
}

/* the guardian for a visitor's demo agent. derived, not stored: the same owner
 * always gets the same guardian, and losing the store loses nothing that
 * cannot be worked out again.
 *
 * derived with a server secret. it used to be a hash of a public string and
 * the owner's address, both readable by anybody, so anybody could compute
 * every demo guardian's private key and vote to pause, or escalate to stop,
 * any visitor's agent. agents registered before the secret keep the old
 * guardian (guardians cannot change on chain), and legacyGuardianFor still
 * finds it for them. */
let warnedSecret = false;
export function guardianFor(cold: string): ethers.Wallet {
  const secret = process.env.DEMO_GUARDIAN_SECRET;
  if (!secret) {
    if (!warnedSecret) { console.error("DEMO_GUARDIAN_SECRET is not set, so new demo guardians use the old public derivation"); warnedSecret = true; }
    return legacyGuardianFor(cold);
  }
  return new ethers.Wallet("0x" + createHmac("sha256", secret).update(`trustset:demo:guardian:${cold.toLowerCase()}`).digest("hex"));
}
/* whichever guardian this server holds that the chain lists for the agent */
export function demoGuardian(cold: string, onChain: string[]): ethers.Wallet | null {
  const set = new Set(onChain.map(g => g.toLowerCase()));
  for (const g of [guardianFor(cold), legacyGuardianFor(cold)]) if (set.has(g.address.toLowerCase())) return g;
  return null;
}
export function legacyGuardianFor(cold: string): ethers.Wallet {
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
