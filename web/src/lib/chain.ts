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
  "function guardianPaused(uint256) view returns (bool)",
  "function recoveryOf(uint256 agentId) view returns (address newKey, uint64 readyAt, uint8 votes, uint8 threshold)",
  "function cancelRecovery(uint256 agentId)",
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
/* returns this pass's own copy. every read in a pass uses the copy, so a
   second pass running at the same time (a poll and a write's refresh) can move
   READ without tearing the first pass across two blocks. */
export async function pinRead(c: Conn): Promise<{ blockTag: string | number }> {
  READ.blockTag = await executedBlock(c.p, c.cfg.chainIdHex);
  return { blockTag: READ.blockTag };
}

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
  /* set when the owner has written a label to the chain. absent otherwise. */
  label?: OnChainLabel;
  /* an owner change that has been proposed and not yet applied */
  pendingColdKey?: string; coldKeyChangeAt?: number;
  /* the two limits that end trust with nobody sending anything. 0 means the
     limit is off. expired and lapsed are derived here rather than read, so a
     list of ten agents is still one round trip per agent. */
  expiresAt: number; heartbeatWindow: number; lastBeat: number;
  /* guardians proposing a new owner. readyAt is 0 until enough of them agree,
     then the moment it may be executed. only the owner can cancel it, and
     nothing else on the page would tell them it is happening. */
  recovery?: { newKey: string; readyAt: number; votes: number; threshold: number };
  /* read from the chain for a paused agent: whether the guardians paused it.
     the index's history said so too, but only while the index was there */
  guardianPaused?: boolean;
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
/* an amount of MON for a line of text: three decimals, never a float's tail */
export function monText(v: bigint) {
  if (v === 0n) return "0 MON";
  if (v < 10n ** 15n) return "<0.001 MON";
  const whole = v / 10n ** 18n, frac = ((v % 10n ** 18n) / 10n ** 15n).toString().padStart(3, "0").replace(/0+$/, "");
  return `${whole.toLocaleString("en-US")}${frac ? "." + frac : ""} MON`;
}
/* under this an agent cannot pay for much: a stake alone costs about 0.04 */
export const LOW_GAS = 5n * 10n ** 16n;
/* where testnet MON comes from. a public page, not ours. */
export const FAUCET = { "0x279f": "https://faucet.monad.xyz/" } as Record<string, string>;

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
  /* the wait above can run out with the wallet still elsewhere. a signer on
     another chain would sign every stop there, where it does nothing */
  if ((await live.getNetwork()).chainId !== want) throw new Error("Your wallet is still on another network. Switch it to " + cfg.chain + " and connect again");
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
/* the last list this browser saw, also kept across visits so a return paints
   at once and refreshes behind it. scoped to the chain, the switch and the
   owner; bigints are written as strings and read back. */
const KEPT = (c: Conn, owner: string) => `trustset.agents.${c.cfg.chainIdHex}@${c.cfg.killSwitch.toLowerCase()}:${owner.toLowerCase()}`;
const keep = (c: Conn, owner: string, list: Agent[]) => {
  try { localStorage.setItem(KEPT(c, owner), JSON.stringify({ at: Date.now(), list }, (_, v) => typeof v === "bigint" ? { $big: v.toString() } : v)); } catch { /* no storage: nothing kept */ }
};
export function cachedAgents(c: Conn, owner: string): Agent[] | null {
  const mem = lastList.get(c.cfg.chainIdHex + ":" + owner.toLowerCase());
  if (mem) return mem;
  try {
    const raw = localStorage.getItem(KEPT(c, owner)); if (!raw) return null;
    const { at, list } = JSON.parse(raw, (_, v) => v && typeof v === "object" && "$big" in v ? BigInt(v.$big) : v) as { at: number; list: Agent[] };
    /* a day old is too old to show as the owner's fleet */
    return Date.now() - at < 86_400_000 ? list : null;
  } catch { return null; }
}

/* the registry, read whole every five minutes and in between only where it
 * can matter to this wallet.
 *
 * every poll used to read every agent ever registered, so anybody who
 * registered a few thousand agents slowed every signed-in console. between full
 * reads a poll now reads the agents this wallet owns, guards or is about to
 * own, plus any id registered since the last poll. an agent can only become
 * somebody's through a handover that takes a day, and guardians never change,
 * so five minutes cannot miss one. */
const FULL_MS = 300_000;
let registry: { key: string; count: number; at: number; byId: Map<number, ethers.Result> } | null = null;
/* the server's snapshot of the whole registry, one request for what was
   twenty nine reads from this browser. null when it cannot be had, and the
   console reads the chain itself as before */
type RegRow = { id: number; agentKey: string; revocationKey: string; pendingRevocationKey: string; revocationKeyChangeAt: string; guardianThreshold: number; status: number; statusSince: string; successorId: string; expiresAt: string; heartbeatWindow: string; lastBeat: string; guardians: string[] };
async function fromServer(c: Conn): Promise<{ block: number; count: number; byId: Map<number, ethers.Result> } | null> {
  try {
    const r = await fetch("/api/registry", { cache: "no-store", signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const j = await r.json() as { key: string; killSwitch: string; block: number; count: number; agents: RegRow[] };
    if (j.key !== c.cfg.chainIdHex || j.killSwitch.toLowerCase() !== c.cfg.killSwitch.toLowerCase()) return null;
    /* shaped like getAgent's result, by name, which is how every reader uses it */
    const byId = new Map(j.agents.map(x => [x.id, { ...x, successorId: BigInt(x.successorId) } as unknown as ethers.Result]));
    return { block: j.block, count: j.count, byId };
  } catch { return null; }
}

async function scan(c: Conn, R: { blockTag: string | number }, me: string): Promise<{ ids: number[]; all: ethers.Result[] }> {
  const key = c.cfg.chainIdHex, m = me.toLowerCase();
  let full = !registry || registry.key !== key || Date.now() - registry.at > FULL_MS;
  if (full) {
    const snap = await fromServer(c);
    if (snap) { registry = { key, count: snap.count, at: Date.now(), byId: snap.byId }; full = false; }
  }
  const n = Number(await retry(() => c.ks.agentCount(R)));
  if (!full && registry && n < registry.count) full = true;
  if (full) registry = { key, count: 0, at: Date.now(), byId: new Map() };
  const reg = registry!;
  const want = full ? [] : [...reg.byId].filter(([, a]) =>
    String(a.revocationKey).toLowerCase() === m || String(a.pendingRevocationKey).toLowerCase() === m || [...a.guardians].some((g: string) => g.toLowerCase() === m)).map(([i]) => i);
  for (let i = reg.count + 1; i <= n; i++) want.push(i);
  /* in parallel: walking one agent at a time was why a page change showed an
     empty list for several seconds */
  const got = await Promise.all(want.map(i => retry(() => c.ks.getAgent(i, R))));
  want.forEach((i, k) => reg.byId.set(i, got[k]));
  reg.count = n;
  const ids = Array.from({ length: n }, (_, i) => n - i);
  return { ids, all: ids.map(i => reg.byId.get(i)!) };
}

export async function loadAgents(c: Conn, owner: string): Promise<Agent[]> {
  const R = await pinRead(c);
  const { ids, all } = await scan(c, R, owner);
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
      const ls = await retry(() => c.labels!.labelsOf(out.map(a => a.id), R));
      out.forEach((a, k) => { const l = ls[k]; if (l && l[0]) a.label = { name: l[0], purpose: l[1], by: l[2], at: Number(l[3]) }; });
    } catch { /* an older deployment without the contract: agents simply carry no label */ }
  }
  /* who paused a paused agent, from the chain. one read each, paused only */
  const paused = out.filter(a => a.status === "paused" && a.guardians.length);
  if (paused.length) {
    const gp = await Promise.all(paused.map(a => retry(() => c.ks.guardianPaused(a.id, R)).catch(() => undefined)));
    paused.forEach((a, k) => { if (gp[k] !== undefined) a.guardianPaused = Boolean(gp[k]); });
  }
  /* a recovery in progress, for every live agent that has guardians. one read
     each, and only for those, so an agent without guardians costs nothing */
  const guarded = out.filter(a => a.guardians.length && a.status !== "revoked" && a.status !== "rotated");
  if (guarded.length) {
    const rs = await Promise.all(guarded.map(a => retry(() => c.ks.recoveryOf(a.id, R)).catch(() => null)));
    guarded.forEach((a, k) => {
      const x = rs[k];
      if (x && x[0] !== ethers.ZeroAddress) a.recovery = { newKey: x[0], readyAt: Number(x[1]), votes: Number(x[2]), threshold: Number(x[3]) };
    });
  }
  lastList.set(c.cfg.chainIdHex + ":" + owner.toLowerCase(), out);
  keep(c, owner, out);
  return out;
}

/* is this key already somebody's agent? zero means no. read finalised, so a
   registration still settling does not answer "free" for a key that is not. */
export async function agentIdForKey(c: Conn, key: string): Promise<bigint> {
  const R = await pinRead(c);
  /* a fresh contract from the current ABI, not c.ks. a hot reload can leave a
     Conn built from an older ABI alive in component state, and that object
     answered "agentIdByKey is not a function" once. */
  const ks = new ethers.Contract(c.cfg.killSwitch, KS_ABI, c.p);
  return BigInt(await retry(() => ks.agentIdByKey(key, R)));
}

/* register, and return the id from the receipt's own event. the earlier
   version rescanned the list to find the new agent by key, which meant a
   flaky read after a successful write looked like a failed write, and the
   reader pressed Register again into AgentKeyInUse. */
/* what the agent's own key signs to consent to being registered under an owner.
   this is the inner hash; the contract's registrationDigest is the EIP-191
   prefix over it, which is exactly what signMessage(bytes) produces. bound
   to the switch's address and the chain. */
export function consentMessage(c: Conn, agentKey: string, coldKey: string): Uint8Array {
  const inner = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "uint256", "string", "address", "address"],
    [c.cfg.killSwitch, BigInt(c.cfg.chainIdHex), "trustset:register", agentKey, coldKey]));
  return ethers.getBytes(inner);
}

/* does this signature come from that agent's key, for that owner? checked
   here before the wallet is opened, so a bad paste fails on the page and
   not in a reverted transaction. */
export function consentValid(c: Conn, agentKey: string, coldKey: string, sig: string): boolean {
  /* 65 bytes only: ethers also accepts the 64 byte compact form, which the
     contract's ecrecover refuses, so it passed here and reverted on chain */
  try { return ethers.getBytes(sig).length === 65 && ethers.verifyMessage(consentMessage(c, agentKey, coldKey), sig).toLowerCase() === agentKey.toLowerCase(); } catch { return false; }
}

/* a transaction's receipt, even when the wallet sped it up. a sped up send is
   the same transaction at a higher price, and ethers reports it as replaced, so
   a registration that succeeded read as a failure and invited a second one. a
   cancelled or genuinely replaced send still fails. */
export async function landed(tx: ethers.ContractTransactionResponse | ethers.TransactionResponse): Promise<ethers.TransactionReceipt> {
  try { return (await tx.wait(CONFIRMS))!; }
  catch (e) {
    const x = e as { code?: string; reason?: string; receipt?: ethers.TransactionReceipt | null; cancelled?: boolean };
    if (x.code === "TRANSACTION_REPLACED" && x.reason === "repriced" && x.receipt && x.receipt.status === 1) return x.receipt;
    throw e;
  }
}

export async function registerOnChain(c: Conn, signer: ethers.Signer, agentKey: string, coldKey: string, overrides: Record<string, unknown> = {}, guardians: string[] = [], threshold = 0, agentSig = "0x"): Promise<{ id: bigint; hash: string }> {
  /* fresh contract and interface from the current ABI. see agentIdForKey. */
  const ks = new ethers.Contract(c.cfg.killSwitch, KS_ABI, c.p);
  const tx = await (ks.connect(signer) as ethers.Contract).register(agentKey, coldKey, guardians, threshold, agentSig, overrides);
  const rc = await landed(tx);
  for (const l of rc.logs) {
    try { const ev = ks.interface.parseLog(l); if (ev?.name === "AgentRegistered") return { id: BigInt(ev.args[0]), hash: rc.hash }; } catch { /* another contract's log */ }
  }
  /* the transaction is mined by this point, so this function does not fail.
     if the event could not be read, the chain still knows the id by key. */
  const id = await agentIdForKey(c, agentKey);
  if (id !== 0n) return { id, hash: rc.hash };
  throw new Error("Registered, but the chain has not yet reported the new id. Reload in a moment; the agent is there.");
}

/* write the owner's words to the chain. one transaction, signed by the owner. */
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
      if (err?.name === "BadAgentSignature") return "That is not the agent's consent for this owner";
      if (err?.name === "BadKeys") return "The agent address and the owner must be two different, real addresses";
      if (err?.name === "NotRevocationKey") return "Your wallet is not this agent's owner";
      if (err?.name === "Terminal") return "That agent is stopped for good and cannot change";
      if (err) return `The contract refused: ${err.name}`;
    } catch { /* not one of ours */ }
  }
  if (o?.code === "ACTION_REJECTED" || o?.code === 4001) return "Cancelled in your wallet";
  /* our own balance check, already in plain words */
  if (o?.code === "INSUFFICIENT_FUNDS" && o?.message) return o.message;
  /* the email wallet's sign-in ran out while the page was open: Dynamic keeps
     the wallet but has no session to sign with, and viem wraps that in a dump
     of the whole transaction */
  if (o?.code === "SESSION_EXPIRED" || /session id is required/i.test(`${o?.shortMessage ?? ""} ${o?.message ?? ""}`)) return "Your email sign-in has expired. Sign out, sign in with your email again, then press again";
  /* rpc -32602, as the email wallet words it. the gas check above catches the
     usual cause, so this is whatever is left */
  if (o?.code === -32602 || /missing or invalid parameters/i.test(`${o?.shortMessage ?? ""} ${o?.message ?? ""}`)) return "Your wallet refused that transaction. Check it holds testnet MON for gas, wait a few seconds, and press again";
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
/* the queue waits for the send before it, but not forever. a wallet prompt
   left open, or a transaction that never mined, used to hold every later
   send, a stop included, with nothing on screen saying why. after a minute and
   a half the next one goes ahead; the one before is not cancelled. */
const LET_GO_MS = 90_000;
export function ownerTx<T>(fn: () => Promise<T>): Promise<T> {
  const before = Promise.race([q, new Promise(res => setTimeout(res, LET_GO_MS))]);
  const r = before.then(fn, fn); q = r.catch(() => {}); return r;
}

export const short = (a: string) => a.slice(0, 6) + "…" + a.slice(-4);
export const ago = (ts: number) => { const s = Math.max(0, Math.floor(Date.now() / 1000 - ts)); return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`; };

/* the agents this wallet guards: not its own, but ones whose owner named it a
   guardian. a guardian can vote to pause, and once a pause has stood for the
   escalation delay, revoke. never spend, never stop instantly. */
/* guardianPaused: the pause is the guardians' own. only then can it be escalated,
   so an owner's or a passkey's pause must not offer a guardian "Revoke". */
export type Guarded = Agent & { votes: number; voted: boolean; escalateAt: number; delay: number; guardianPaused: boolean };

export async function loadGuarded(c: Conn, me: string): Promise<Guarded[]> {
  const R = await pinRead(c);
  const ks = new ethers.Contract(c.cfg.killSwitch, KS_ABI, c.p);
  /* the same registry the owner list just read, so this adds no full scan */
  const { ids, all } = await scan(c, R, me);
  const mine = ids.map((i, k) => ({ i, a: all[k] })).filter(({ a }) => [...a.guardians].some((g: string) => g.toLowerCase() === me.toLowerCase()));
  if (!mine.length) return [];
  const delay = Number(await retry(() => ks.guardianEscalationDelay(R)));
  /* names, the same way the owner's list gets them */
  let labels: Record<number, OnChainLabel> = {};
  if (c.labels) {
    try {
      const ls = await retry(() => c.labels!.labelsOf(mine.map(m => m.i), R));
      mine.forEach((m, k) => { const l = ls[k]; if (l && l[0]) labels[m.i] = { name: l[0], purpose: l[1], by: l[2], at: Number(l[3]) }; });
    } catch { labels = {}; }
  }
  return Promise.all(mine.map(async ({ i, a }) => {
    const [votes, round, my, gp] = await Promise.all([
      retry(() => ks.guardianVoteCount(i, R)), retry(() => ks.guardianVoteRound(i, R)), retry(() => ks.guardianVote(i, me, R)),
      retry(() => ks.guardianPaused(i, R)).catch(() => false),
    ]);
    return {
      id: BigInt(i), key: a.agentKey, coldKey: a.revocationKey, guardians: [...a.guardians], threshold: Number(a.guardianThreshold),
      status: STATUS[Number(a.status)], since: Number(a.statusSince), successor: a.successorId, history: [],
      expiresAt: Number(a.expiresAt), heartbeatWindow: Number(a.heartbeatWindow), lastBeat: Number(a.lastBeat),
      votes: Number(votes), voted: Number(my) === Number(round) + 1, escalateAt: Number(a.statusSince) + delay, delay, guardianPaused: Boolean(gp),
      label: labels[i],
    };
  }));
}

/* the one-day lock on an owner change, read once from the contract. */
export async function coldKeyDelay(c: Conn): Promise<number> {
  const R = await pinRead(c);
  const ks = new ethers.Contract(c.cfg.killSwitch, KS_ABI, c.p);
  return Number(await retry(() => ks.revocationKeyChangeDelay(R)));
}

/* an agent's status history, for the panel. */
export async function loadHistory(c: Conn, id: bigint): Promise<{ at: number; status: Status }[]> {
  const R = await pinRead(c);
  const hl = Number(await retry(() => c.ks.historyLength(id, R)));
  /* by index: ethers' Result extends Array, so `.at` is the array method, not the field */
  const xs = await Promise.all(Array.from({ length: hl }, (_, h) => retry(() => c.ks.historyAt(id, h, R))));
  return xs.map(x => ({ at: Number(x[0]), status: STATUS[Number(x[1])] }));
}
