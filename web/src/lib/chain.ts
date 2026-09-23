"use client";
import { ethers } from "ethers";
import { executedBlock } from "@/lib/readtag";
import { limited } from "@/lib/limiter";

/* the console's chain access. one place that knows which chain we are on.
 *
 * on Monad testnet there is no key in the browser at all: every write goes
 * through the reader's own wallet. the local anvil demo still carries anvil's
 * published default keys so the console can run with no wallet installed,
 * which is why `owner` is nullable rather than assumed. */
export const KS_ABI = [
  "function agentCount() view returns (uint256)",
  "function getAgent(uint256) view returns (tuple(address agentKey,address revocationKey,address pendingRevocationKey,uint64 revocationKeyChangeAt,uint8 guardianThreshold,uint8 status,uint64 statusSince,uint256 successorId,bytes32 reasonHash,uint64 expiresAt,uint64 heartbeatWindow,uint64 lastBeat,address[] guardians))",
  "function historyLength(uint256) view returns (uint256)",
  "function historyAt(uint256,uint256) view returns (tuple(uint64 at,uint8 status))",
  "function setStatus(uint256,uint8,bytes32)",
  "function register(address agentKey, address revocationKey, address[] guardians, uint8 threshold, bytes agentSig) returns (uint256)",
  "function registrationDigest(address agentKey, address revocationKey) view returns (bytes32)",
  "function agentIdByKey(address) view returns (uint256)",
  "function guardianPause(uint256)",
  "function rotate(uint256 agentId, uint256 successorId, bytes32 reasonHash)",
  "function proposeRevocationKey(uint256 agentId, address newKey)",
  "function applyRevocationKey(uint256 agentId)",
  "function revocationKeyChangeDelay() view returns (uint64)",
  "function guardianEscalate(uint256)",
  "function guardianVoteCount(uint256) view returns (uint256)",
  "function guardianVoteRound(uint256) view returns (uint256)",
  "function guardianVote(uint256,address) view returns (uint256)",
  "function guardianEscalationDelay() view returns (uint64)",
  "function registerWithLimits(address agentKey, address revocationKey, address[] guardians, uint8 threshold, bytes agentSig, uint64 expiresAt, uint64 heartbeatWindow) returns (uint256)",
  "function setLimits(uint256 agentId, uint64 expiresAt, uint64 heartbeatWindow)",
  "function beat(uint256 agentId)",
  "function liveness(uint256) view returns (bool trusted, bool expired, bool lapsed, uint64 expiresAt, uint64 nextBeatBy)",
  "function setStopKey(uint256 agentId, uint256 x, uint256 y, bytes32 rpIdHash)",
  "function stopKeyOf(uint256) view returns (uint256 x, uint256 y, bytes32 rpIdHash, uint64 nonce, bool set)",
  "function stopChallenge(uint256) view returns (bytes32)",
  "function pauseWithPasskey(uint256 agentId, (bytes authenticatorData, bytes clientDataJSON, uint256 r, uint256 s) assertion)",
  "event AgentRegistered(uint256 indexed agentId, address indexed agentKey, address indexed revocationKey, address[] guardians, uint8 threshold)",
  "error NotRevocationKey()", "error NotGuardian()", "error AgentKeyInUse()", "error Terminal()",
  "error BadTransition()", "error BadThreshold()", "error NotPending()", "error TooEarly()", "error BadSuccessor()",
  "error BadKeys()", "error BadAgentSignature()", "error NotAgentKey()", "error NoHeartbeat()",
  "error Lapsed()", "error BadExpiry()", "error NoStopKey()", "error BadAssertion()",
];

/* every read the console shows as fact is made at `finalized`.
 *
 * on Monad, `latest` is a speculative tip and execution runs up to three
 * blocks behind it. read there and a view call can answer 0x for state that
 * is simply not executed yet (ethers reports it as "missing revert data"),
 * and a list can be drawn from a tip that is later replaced. the console
 * showed an agent as number 10 that the chain settled as number 8. finality
 * on Monad is two blocks, so reading finalised costs well under a second of
 * freshness and removes the whole class of problem. */
export const READ: { blockTag: string | number } = { blockTag: "finalized" };
/* pin READ to an executed block before a pass of reads. see lib/readtag. */
export async function pinRead(c: Conn) { READ.blockTag = await executedBlock(c.p, c.cfg.chainIdHex); }

/* after a transaction: do not read until the block we read at has passed the
   block the receipt is in. reads are pinned a few blocks behind finalised,
   so a refresh straight after wait() answered from before the transaction
   and the page showed nothing had changed. waits up to fifteen seconds. */
export async function settled(c: Conn, blockNumber?: number) {
  if (!blockNumber) return;
  for (let i = 0; i < 30; i++) {
    const at = await executedBlock(c.p, c.cfg.chainIdHex, true);
    if (at >= blockNumber) { READ.blockTag = at; return; }
    await new Promise(r => setTimeout(r, 500));
  }
}
/* confirmations to wait for a write before acting on its receipt. two blocks
   is Monad's finality, so the id in the receipt is the id. */
export const CONFIRMS = 2;

/* one transient failure must not throw away a whole list. */
export async function retry<T>(fn: () => Promise<T>, times = 4, delayMs = 600): Promise<T> {
  let last: unknown;
  for (let i = 0; i < times; i++) {
    /* through the limiter, so a burst of parallel reads is paced under the
       RPC's fifteen-a-second cap instead of tripping it */
    try { return await limited(fn); } catch (e) { last = e; await new Promise(r => setTimeout(r, delayMs * (i + 1))); }
  }
  throw last;
}
export const VENUE_ABI = ["function trade(uint256)", "error AgentNotTrusted(uint256)"];
export const TOUCH_ABI = [
  "function registerPasskey(uint256 x, uint256 y, bytes32 rpIdHash)",
  "function passkeyOf(address) view returns (tuple(uint256 x,uint256 y,bytes32 rpIdHash))",
  "function attestHuman(address account, bytes32 actionHash, tuple(bytes authenticatorData,bytes clientDataJSON,uint256 r,uint256 s) a)",
  "function originOf(address account, bytes32 actionHash) view returns (uint8)",
  "function challengeFor(address,bytes32) view returns (bytes32)",
  "function humanCount(address) view returns (uint256)",
];
/* what the owner called the agent. stored, read as a view, never consulted by
   anything that decides trust. */
export const LABELS_ABI = [
  "function label(uint256 agentId, string name, string purpose)",
  "function labelOf(uint256) view returns (tuple(string name,string purpose,address by,uint64 at))",
  "function labelsOf(uint256[]) view returns (tuple(string name,string purpose,address by,uint64 at)[])",
];
export const STATUS = ["none", "active", "paused", "revoked", "rotated"] as const;
export type Status = (typeof STATUS)[number];

export type Cfg = {
  source: "monad-testnet" | "anvil";
  chain: string; rpc: string; chainIdHex: string; explorer: string;
  killSwitch: string; humanTouch: string; venue: string; labels?: string; notes?: string; refunds?: string;
  /* the Dynamic environment, for signing in with an email. absent: no email sign-in */
  dynamicEnvironmentId?: string; mockUsd?: string;
  ownerKey?: string; agentPrivKey?: string;
};

export type OnChainLabel = { name: string; purpose: string; by: string; at: number };
export type Agent = {
  id: bigint; key: string; coldKey: string; guardians: string[]; threshold: number;
  status: Status; since: number; successor: bigint; history: { at: number; status: Status }[];
  /* set when the cold key has written a label to the chain. absent otherwise. */
  label?: OnChainLabel;
  /* a cold key change that has been proposed and not yet applied */
  pendingColdKey?: string; coldKeyChangeAt?: number;
  /* the two limits that end trust with nobody sending anything. 0 means the
     limit is off. expired and lapsed are derived here rather than read, so a
     list of ten agents is still one round trip per agent. */
  expiresAt: number; heartbeatWindow: number; lastBeat: number;
};

/* an agent is trusted when it is active, inside its dates and not gone quiet.
   this mirrors isTrusted in the contract; the page must not answer differently
   from the chain it is describing. */
export const expired = (a: Agent, now = Date.now() / 1000) => a.expiresAt !== 0 && now >= a.expiresAt;
export const lapsed = (a: Agent, now = Date.now() / 1000) => a.heartbeatWindow !== 0 && now > a.lastBeat + a.heartbeatWindow;
export const trusted = (a: Agent, now = Date.now() / 1000) => a.status === "active" && !expired(a, now) && !lapsed(a, now);

/* the word to print, which is not always the agent's status.
 *
 * the contract still calls an agent Active when its end date has passed or its
 * heartbeat has gone quiet, because status and the limits are separate things
 * in storage. a reader told "active" about an agent that no app will serve has
 * been told something false, and a panel saying it beside a row saying
 * "Expired" is the page arguing with itself. so nothing prints a.status: it
 * prints this. */
export function statusWord(a: Agent, now = Date.now() / 1000): string {
  if (a.status === "active" && expired(a, now)) return "expired";
  if (a.status === "active" && lapsed(a, now)) return "gone quiet";
  return a.status;
}

/* who signs owner transactions: a connected wallet, or the demo key on the
   local chain. the page never sees a private key from a wallet. */
/* email: a Dynamic embedded wallet, signed in with a code sent to an address */
export type Signer = { address: string; signer: ethers.Signer; kind: "demo" | "wallet" | "email"; email?: string | null };
export type Conn = { cfg: Cfg; p: ethers.JsonRpcProvider; owner: ethers.Wallet | null; ks: ethers.Contract; venue: ethers.Contract; touch: ethers.Contract | null; labels: ethers.Contract | null };

declare global { interface Window { ethereum?: ethers.Eip1193Provider & { on?: (e: string, f: (...a: unknown[]) => void) => void } } }
export const hasWallet = () => typeof window !== "undefined" && !!window.ethereum;

const MONAD_TESTNET = {
  chainId: "0x279f",
  chainName: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: ["https://testnet-rpc.monad.xyz"],
  blockExplorerUrls: ["https://testnet.monadexplorer.com"],
};

/* connect an injected wallet and put it on the console's chain. a wallet that
   has never seen Monad testnet cannot switch to it, so an unknown-chain error
   is answered by offering to add it rather than by telling the reader to go
   and configure their wallet by hand. */
/* what a wallet actually returns when something goes wrong. 4001 is the user
   closing the prompt, which is not an error worth shouting about, and 4902 is
   "I have never heard of that chain", which is the one case where adding it is
   the right answer rather than telling the reader to go and configure their
   wallet by hand. */
/* dig the numeric code out, wherever the stack buried it.
 *
 * ethers does not pass a provider error through. it wraps it, sets its own
 * `code` to the string "UNKNOWN_ERROR" and hangs the original off `.error`,
 * and the injected provider may nest one more level under `.data`. an earlier
 * version of this read `e.code ?? e.error?.code`, which always stopped at the
 * string, because ?? only falls through on null. so -32002 arrived at the
 * reader as "could not coalesce error ... version=6.17.0". */
const code = (e: unknown): number | undefined => {
  /* ethers' own string codes, which it sets in place of the provider's number:
     ACTION_REJECTED is 4001, and it hides the original under `info.error`. */
  const named: Record<string, number> = { ACTION_REJECTED: 4001 };
  const seen = new Set<unknown>();
  const walk = (v: unknown, depth: number): number | undefined => {
    if (!v || typeof v !== "object" || depth > 4 || seen.has(v)) return undefined;
    seen.add(v);
    const o = v as Record<string, unknown>;
    if (typeof o.code === "number") return o.code;
    if (typeof o.code === "string" && named[o.code] !== undefined) return named[o.code];
    for (const k of ["info", "error", "data", "cause"]) {
      const hit = walk(o[k], depth + 1);
      if (hit !== undefined) return hit;
    }
    return undefined;
  };
  return walk(e, 0);
};

/* one connect at a time.
 *
 * a wallet answers a second eth_requestAccounts with -32002 while the first
 * prompt is still open, and nothing about pressing the button twice, or a
 * remount firing it again, should produce an error. concurrent callers now
 * wait on the one request that is already in flight. */
let connecting: Promise<Signer> | null = null;

export function connectWallet(cfg: Cfg): Promise<Signer> {
  if (!connecting) connecting = doConnectWallet(cfg).finally(() => { connecting = null; });
  return connecting;
}

async function doConnectWallet(cfg: Cfg): Promise<Signer> {
  if (!window.ethereum) throw new Error("No wallet found in this browser");
  const bp = new ethers.BrowserProvider(window.ethereum);

  /* ask what we already have before asking for anything. eth_accounts opens
     no prompt and answers immediately when this origin is already approved,
     which is the common case on a revisit and cannot collide with a prompt
     left open from a previous attempt. */
  let accounts: string[] = [];
  try { accounts = (await bp.send("eth_accounts", [])) as string[]; } catch { /* some wallets refuse this before approval */ }

  if (!accounts?.length) {
    try { await bp.send("eth_requestAccounts", []); }
    catch (e) {
      if (code(e) === 4001) throw new Error("Connection cancelled");
      /* a prompt is already open, or sitting behind the browser window. */
      if (code(e) === -32002) throw new Error("Open your wallet, it is already asking you to connect");
      throw e;
    }
  }

  const want = BigInt(cfg.chainIdHex);
  if ((await bp.getNetwork()).chainId !== want) {
    try { await bp.send("wallet_switchEthereumChain", [{ chainId: cfg.chainIdHex }]); }
    catch (e) {
      if (code(e) === 4001) throw new Error("Stayed on the wrong network, so there is nothing to read");
      if (code(e) === -32002) throw new Error("Open your wallet, it is already asking you to switch network");
      /* 4902 is "I have never heard of that chain", the one case where adding
         it is the right answer. anything else is not fixed by adding it. */
      if (cfg.chainIdHex !== MONAD_TESTNET.chainId) throw new Error("Switch your wallet to " + cfg.chain);
      try { await bp.send("wallet_addEthereumChain", [MONAD_TESTNET]); }
      catch (e2) {
        if (code(e2) === 4001) throw new Error("Monad testnet was not added, so there is nothing to read");
        if (code(e2) === -32002) throw new Error("Open your wallet, it is already asking you to add Monad testnet");
        throw new Error("Could not add Monad testnet to your wallet");
      }
    }
    /* a wallet reports the switch as done before its provider has caught up,
       and a signer taken in that window signs against the old chain. wait for
       the provider to actually agree. */
    for (let i = 0; i < 20; i++) {
      const fresh = new ethers.BrowserProvider(window.ethereum);
      if ((await fresh.getNetwork()).chainId === want) break;
      await new Promise(r => setTimeout(r, 150));
    }
  }

  const live = new ethers.BrowserProvider(window.ethereum);
  const signer = await live.getSigner();
  return { address: await signer.getAddress(), signer, kind: "wallet" };
}

/* the reader changing account or network in the extension, which happens
   outside react and otherwise leaves the console showing a stale address. */
export function onWalletChange(f: () => void): () => void {
  const e = window.ethereum;
  if (!e?.on) return () => {};
  e.on("accountsChanged", f); e.on("chainChanged", f);
  const off = e as unknown as { removeListener?: (ev: string, f: () => void) => void };
  return () => { off.removeListener?.("accountsChanged", f); off.removeListener?.("chainChanged", f); };
}

let connP: Promise<Conn> | null = null;
export function connect(): Promise<Conn> {
  if (!connP) connP = (async () => {
    const r = await fetch("/api/chain", { cache: "no-store" }); if (!r.ok) throw new Error("no chain configured");
    const cfg: Cfg = await r.json();
    /* small batches. ethers folds parallel calls into one JSON-RPC array, and
       a registry read in parallel made that array twenty-plus calls, which
       the public RPC answered with nothing. four per request is well inside
       what it accepts and still far faster than one at a time. */
    const p = new ethers.JsonRpcProvider(cfg.rpc, undefined, { staticNetwork: true, batchMaxCount: 4 });
    return {
      cfg, p,
      owner: cfg.ownerKey ? new ethers.Wallet(cfg.ownerKey, p) : null,
      ks: new ethers.Contract(cfg.killSwitch, KS_ABI, p),
      venue: new ethers.Contract(cfg.venue, VENUE_ABI, p),
      touch: cfg.humanTouch ? new ethers.Contract(cfg.humanTouch, TOUCH_ABI, p) : null,
      labels: cfg.labels ? new ethers.Contract(cfg.labels, LABELS_ABI, p) : null,
    };
  })().catch(e => { connP = null; throw e; });
  return connP;
}

/* the last list this browser saw, per chain and owner, so a page that comes
   back shows it at once and refreshes behind it rather than sitting empty
   for the length of a chain read. */
const lastList = new Map<string, Agent[]>();
export const cachedAgents = (c: Conn, owner: string) => lastList.get(c.cfg.chainIdHex + ":" + owner.toLowerCase()) ?? null;

export async function loadAgents(c: Conn, owner: string): Promise<Agent[]> {
  await pinRead(c);
  const n = Number(await retry(() => c.ks.agentCount(READ)));
  /* every read in parallel. this used to walk the registry one agent at a
     time, then one history entry at a time, each a round trip to the RPC,
     which is why a page change showed an empty list for several seconds. */
  const ids = Array.from({ length: n }, (_, i) => n - i);
  const all = await Promise.all(ids.map(i => retry(() => c.ks.getAgent(i, READ))));
  lastScan = { key: c.cfg.chainIdHex, ids, all };
  const mine = ids.map((i, k) => ({ i, a: all[k] })).filter(({ a }) => a.revocationKey.toLowerCase() === owner.toLowerCase());
  /* no history here. it is two reads per agent and the list does not show
     it; the panel asks for it when an agent is opened. see loadHistory. */
  const out: Agent[] = mine.map(({ i, a }) => ({
    id: BigInt(i), key: a.agentKey, coldKey: a.revocationKey, guardians: [...a.guardians], threshold: Number(a.guardianThreshold), status: STATUS[Number(a.status)], since: Number(a.statusSince), successor: a.successorId, history: [],
    pendingColdKey: a.pendingRevocationKey, coldKeyChangeAt: Number(a.revocationKeyChangeAt),
    expiresAt: Number(a.expiresAt), heartbeatWindow: Number(a.heartbeatWindow), lastBeat: Number(a.lastBeat),
  }));
  /* labels for the whole list in one round trip. by index, not by name: ethers'
     Result is an array first, and a field called `name` would be shadowed. */
  if (c.labels && out.length) {
    try {
      const ls = await retry(() => c.labels!.labelsOf(out.map(a => a.id), READ));
      out.forEach((a, k) => { const l = ls[k]; if (l && l[0]) a.label = { name: l[0], purpose: l[1], by: l[2], at: Number(l[3]) }; });
    } catch { /* an older deployment without the contract: agents simply carry no label */ }
  }
  lastList.set(c.cfg.chainIdHex + ":" + owner.toLowerCase(), out);
  return out;
}

/* is this key already somebody's agent? zero means no. read finalised, so a
   registration still settling does not answer "free" for a key that is not. */
export async function agentIdForKey(c: Conn, key: string): Promise<bigint> {
  await pinRead(c);
  /* a fresh contract from the current ABI, not c.ks. a hot reload can leave a
     Conn built from an older ABI alive in component state, and that object
     answered "agentIdByKey is not a function" once. */
  const ks = new ethers.Contract(c.cfg.killSwitch, KS_ABI, c.p);
  return BigInt(await retry(() => ks.agentIdByKey(key, READ)));
}

/* register, and return the id from the receipt's own event. the earlier
   version rescanned the list to find the new agent by key, which meant a
   flaky read after a successful write looked like a failed write, and the
   reader pressed Register again into AgentKeyInUse. */
/* what the agent key signs to consent to being registered under a cold key.
   this is the inner hash; the contract's registrationDigest is the EIP-191
   prefix over it, which is exactly what signMessage(bytes) produces. bound
   to the switch's address and the chain. */
export function consentMessage(c: Conn, agentKey: string, coldKey: string): Uint8Array {
  const inner = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "uint256", "string", "address", "address"],
    [c.cfg.killSwitch, BigInt(c.cfg.chainIdHex), "trustset:register", agentKey, coldKey]));
  return ethers.getBytes(inner);
}

/* does this signature come from that agent key, for that cold key? checked
   here before the wallet is opened, so a bad paste fails on the page and
   not in a reverted transaction. */
export function consentValid(c: Conn, agentKey: string, coldKey: string, sig: string): boolean {
  try { return ethers.verifyMessage(consentMessage(c, agentKey, coldKey), sig).toLowerCase() === agentKey.toLowerCase(); } catch { return false; }
}

export async function registerOnChain(c: Conn, signer: ethers.Signer, agentKey: string, coldKey: string, overrides: Record<string, unknown> = {}, guardians: string[] = [], threshold = 0, agentSig = "0x"): Promise<{ id: bigint; hash: string }> {
  /* fresh contract and interface from the current ABI. see agentIdForKey. */
  const ks = new ethers.Contract(c.cfg.killSwitch, KS_ABI, c.p);
  const tx = await (ks.connect(signer) as ethers.Contract).register(agentKey, coldKey, guardians, threshold, agentSig, overrides);
  const rc = await tx.wait(CONFIRMS);
  for (const l of rc.logs) {
    try { const ev = ks.interface.parseLog(l); if (ev?.name === "AgentRegistered") return { id: BigInt(ev.args[0]), hash: rc.hash }; } catch { /* another contract's log */ }
  }
  /* the transaction is mined by this point, so this function does not fail.
     if the event could not be read, the chain still knows the id by key. */
  const id = await agentIdForKey(c, agentKey);
  if (id !== 0n) return { id, hash: rc.hash };
  throw new Error("Registered, but the chain has not yet reported the new id. Reload in a moment; the agent is there.");
}

/* write the owner's words to the chain. one transaction, signed by the cold key. */
export async function labelOnChain(c: Conn, signer: ethers.Signer, id: bigint, name: string, purpose: string) {
  if (!c.labels) throw new Error("This chain has no labels contract");
  const tx = await (c.labels.connect(signer) as ethers.Contract).label(id, name, purpose);
  return tx.wait(CONFIRMS);
}

/* a wallet error, in words. custom errors come back as a four-byte selector,
   which is a fine thing to log and a useless thing to show. */
export function explain(e: unknown, c?: Conn): string {
  const o = e as { code?: unknown; data?: unknown; info?: { error?: { data?: unknown } }; shortMessage?: string; message?: string };
  const data = (typeof o?.data === "string" ? o.data : typeof o?.info?.error?.data === "string" ? o.info.error.data : undefined);
  if (data && c) {
    try {
      const err = c.ks.interface.parseError(data);
      if (err?.name === "AgentKeyInUse") return "That key is already registered as an agent";
      if (err?.name === "BadAgentSignature") return "That is not the agent key's consent for this cold key";
      if (err?.name === "BadKeys") return "The agent key and the cold key must be two different, real addresses";
      if (err?.name === "NotRevocationKey") return "Your wallet is not this agent's cold key";
      if (err?.name === "Terminal") return "That agent is stopped for good and cannot change";
      if (err) return `The contract refused: ${err.name}`;
    } catch { /* not one of ours */ }
  }
  if (o?.code === "ACTION_REJECTED" || o?.code === 4001) return "Cancelled in your wallet";
  if (o?.code === "CALL_EXCEPTION" && !data) {
    /* name the read, so a failing one can be found instead of guessed at */
    const tx = (o as { transaction?: { to?: string; data?: string } }).transaction;
    const where = tx?.data ? ` (${tx.data.slice(0, 10)} on ${tx.to?.slice(0, 8)})` : "";
    return "The chain did not answer that read" + where + ". It usually does on the next try";
  }
  return o?.shortMessage || o?.message || String(e);
}

/* one queue for owner transactions so nothing races on the nonce. */
let q: Promise<unknown> = Promise.resolve();
export function ownerTx<T>(fn: () => Promise<T>): Promise<T> { const r = q.then(fn, fn); q = r.catch(() => {}); return r; }

export const short = (a: string) => a.slice(0, 6) + "…" + a.slice(-4);
export const ago = (ts: number) => { const s = Math.max(0, Math.floor(Date.now() / 1000 - ts)); return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`; };

/* the agents this wallet guards: not its own, but ones whose owner named it a
   guardian. a guardian can vote to pause, and once a pause has stood for the
   escalation delay, revoke. never spend, never stop instantly. */
export type Guarded = Agent & { votes: number; voted: boolean; escalateAt: number; delay: number };
/* the last raw scan of the registry, so the guarded list does not ask the
   chain for every agent a second time right after the owner list did. */
let lastScan: { key: string; ids: number[]; all: ethers.Result[] } | null = null;

export async function loadGuarded(c: Conn, me: string): Promise<Guarded[]> {
  await pinRead(c);
  const ks = new ethers.Contract(c.cfg.killSwitch, KS_ABI, c.p);
  let ids: number[], all: ethers.Result[];
  if (lastScan && lastScan.key === c.cfg.chainIdHex) ({ ids, all } = lastScan);
  else {
    const n = Number(await retry(() => ks.agentCount(READ)));
    ids = Array.from({ length: n }, (_, i) => n - i);
    all = await Promise.all(ids.map(i => retry(() => ks.getAgent(i, READ))));
  }
  const mine = ids.map((i, k) => ({ i, a: all[k] })).filter(({ a }) => [...a.guardians].some((g: string) => g.toLowerCase() === me.toLowerCase()));
  if (!mine.length) return [];
  const delay = Number(await retry(() => ks.guardianEscalationDelay(READ)));
  /* names, the same way the owner's list gets them */
  let labels: Record<number, OnChainLabel> = {};
  if (c.labels) {
    try {
      const ls = await retry(() => c.labels!.labelsOf(mine.map(m => m.i), READ));
      mine.forEach((m, k) => { const l = ls[k]; if (l && l[0]) labels[m.i] = { name: l[0], purpose: l[1], by: l[2], at: Number(l[3]) }; });
    } catch { labels = {}; }
  }
  return Promise.all(mine.map(async ({ i, a }) => {
    const [votes, round, my] = await Promise.all([
      retry(() => ks.guardianVoteCount(i, READ)), retry(() => ks.guardianVoteRound(i, READ)), retry(() => ks.guardianVote(i, me, READ)),
    ]);
    return {
      id: BigInt(i), key: a.agentKey, coldKey: a.revocationKey, guardians: [...a.guardians], threshold: Number(a.guardianThreshold),
      status: STATUS[Number(a.status)], since: Number(a.statusSince), successor: a.successorId, history: [],
      expiresAt: Number(a.expiresAt), heartbeatWindow: Number(a.heartbeatWindow), lastBeat: Number(a.lastBeat),
      votes: Number(votes), voted: Number(my) === Number(round) + 1, escalateAt: Number(a.statusSince) + delay, delay,
      label: labels[i],
    };
  }));
}

/* the one-day lock on a cold key change, read once from the contract. */
export async function coldKeyDelay(c: Conn): Promise<number> {
  await pinRead(c);
  const ks = new ethers.Contract(c.cfg.killSwitch, KS_ABI, c.p);
  return Number(await retry(() => ks.revocationKeyChangeDelay(READ)));
}

/* an agent's status history, for the panel. */
export async function loadHistory(c: Conn, id: bigint): Promise<{ at: number; status: Status }[]> {
  await pinRead(c);
  const hl = Number(await retry(() => c.ks.historyLength(id, READ)));
  /* by index: ethers' Result extends Array, so `.at` is the array method, not the field */
  const xs = await Promise.all(Array.from({ length: hl }, (_, h) => retry(() => c.ks.historyAt(id, h, READ))));
  return xs.map(x => ({ at: Number(x[0]), status: STATUS[Number(x[1])] }));
}
