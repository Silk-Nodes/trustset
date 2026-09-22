import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { cfg, provider } from "@/lib/rpc.server";

export const dynamic = "force-dynamic";

/* was this agent trusted when it signed that?
 *
 * the eight layers already answer it for a person reading the console. this
 * answers it for a machine, in one request, so anything an agent produced can
 * carry a certificate of origin that outlives the platform it was made on:
 * the signature proves which agent made it, and this route proves what the
 * chain said about that agent at that moment.
 *
 * the honest part is the moment. an agent's status is kept on chain as a list
 * of transitions, so "was it revoked then" is answered exactly, today, from
 * ordinary state and with no archive node. its time limits are not kept that
 * way: expiresAt and the heartbeat window are single slots that the owner can
 * change, so a limit read now is a limit as it stands now. when the rpc will
 * serve state at the block the answer comes from there instead and says so.
 * every response names which of the two answered, and neither one guesses. */
const ABI = [
  "function getAgent(uint256) view returns (tuple(address agentKey,address revocationKey,address pendingRevocationKey,uint64 revocationKeyChangeAt,uint8 guardianThreshold,uint8 status,uint64 statusSince,uint256 successorId,bytes32 reasonHash,uint64 expiresAt,uint64 heartbeatWindow,uint64 lastBeat,address[] guardians))",
  "function agentIdByKey(address) view returns (uint256)",
  "function agentCount() view returns (uint256)",
  "function historyLength(uint256) view returns (uint256)",
  "function historyAt(uint256,uint256) view returns (tuple(uint64 at,uint8 status))",
  "function liveness(uint256) view returns (bool trusted, bool expired, bool lapsed, uint64 expiresAt, uint64 nextBeatBy)",
];
const STATUS = ["none", "active", "paused", "revoked", "rotated"] as const;
const bad = (m: string, code = 400) => NextResponse.json({ error: m }, { status: code });
/* a moment must be a past one. asking about the future would otherwise fall
   through to the newest status and answer as if it were settled. sixty
   seconds of slack, because the caller's clock is not ours. */
const futureCheck = (at: number | null) => at !== null && at > Math.floor(Date.now() / 1000) + 60 ? "at is in the future" : null;

type Answer = {
  agent: number; key: string; coldKey: string;
  at: number; asked: "now" | "a past moment";
  status: string; trusted: boolean;
  /* which of the two sources answered, and what it cannot see */
  source: "state at that block" | "the on-chain status history" | "current state";
  caveat?: string;
  now: { status: string; trusted: boolean; expired: boolean; lapsed: boolean; expiresAt: number };
  signature?: { signer: string; isAgentKey: boolean };
  chain: { name: string; killSwitch: string; block: number };
};

async function answer(agentId: bigint, at: number | null, signer: string | null): Promise<Answer | NextResponse> {
  const c = await cfg();
  const p = provider(c);
  const ks = new ethers.Contract(c.killSwitch, ABI, p);

  const count = BigInt(await ks.agentCount());
  if (agentId <= 0n || agentId > count) return bad(`no agent ${agentId}`, 404);

  const [a, live, block] = await Promise.all([
    ks.getAgent(agentId) as Promise<{ agentKey: string; revocationKey: string; status: bigint; expiresAt: bigint; heartbeatWindow: bigint; lastBeat: bigint }>,
    ks.liveness(agentId) as Promise<[boolean, boolean, boolean, bigint, bigint]>,
    p.getBlockNumber(),
  ]);
  const key = a.agentKey, coldKey = a.revocationKey;
  const nowState = { status: STATUS[Number(a.status)] ?? "unknown", trusted: live[0], expired: live[1], lapsed: live[2], expiresAt: Number(live[3]) };
  const chain = { name: c.chain, killSwitch: c.killSwitch, block };
  const sig = signer ? { signer, isAgentKey: signer.toLowerCase() === key.toLowerCase() } : undefined;

  /* no moment asked for: the question is about right now, and liveness is it */
  if (at === null) {
    return { agent: Number(agentId), key, coldKey, at: Math.floor(Date.now() / 1000), asked: "now", status: nowState.status, trusted: nowState.trusted, source: "current state", now: nowState, signature: sig, chain };
  }

  /* a moment in the past. try the chain's own state at that time first: if the
     rpc keeps the state it answers everything, limits included. */
  const blockAt = await blockFor(p, at, block).catch(() => null);
  if (blockAt !== null) {
    try {
      const then = await (ks.liveness(agentId, { blockTag: blockAt }) as Promise<[boolean, boolean, boolean, bigint, bigint]>);
      const s = await (ks.getAgent(agentId, { blockTag: blockAt }) as Promise<{ status: bigint }>);
      return { agent: Number(agentId), key, coldKey, at, asked: "a past moment", status: STATUS[Number(s.status)] ?? "unknown", trusted: then[0], source: "state at that block", now: nowState, signature: sig, chain: { ...chain, block: blockAt } };
    } catch { /* not an archive node. the history below is the answer instead. */ }
  }

  /* the fallback, and the one that always works: the contract keeps every
     status transition, so the status at any past second is exact. the limits
     are read as they stand now, which is stated rather than hidden. */
  const n = Number(await ks.historyLength(agentId));
  let status = "none", since = 0;
  for (let i = 0; i < n; i++) {
    const h = await ks.historyAt(agentId, i) as { at: bigint; status: bigint };
    const t = Number(h.at);
    if (t > at) break;
    status = STATUS[Number(h.status)] ?? "unknown"; since = t;
  }
  if (!since) return { agent: Number(agentId), key, coldKey, at, asked: "a past moment", status: "none", trusted: false, source: "the on-chain status history", caveat: `agent ${agentId} was not registered yet at that moment`, now: nowState, signature: sig, chain };

  const expiresAt = Number(a.expiresAt), window = Number(a.heartbeatWindow);
  const expiredThen = expiresAt !== 0 && at >= expiresAt;
  /* a heartbeat cannot be checked backwards at all: only the last beat is
     kept, so a silence that has since been broken leaves no trace. say so
     rather than answering from a number that does not describe that moment. */
  const trusted = status === "active" && !expiredThen;
  const caveat = window !== 0
    ? "status is exact for that moment; the end date was read as it stands now, and the heartbeat cannot be checked backwards because only the most recent beat is kept on chain"
    : "status is exact for that moment; the end date was read as it stands now and may have been changed since";
  return { agent: Number(agentId), key, coldKey, at, asked: "a past moment", status, trusted, source: "the on-chain status history", caveat, now: nowState, signature: sig, chain };
}

/* the block at a timestamp, by bisection over block times. the public rpc has
   no endpoint for this and an agent's certificate carries a time, not a
   height. returns null when the moment is older than the chain or ahead of it. */
async function blockFor(p: ethers.Provider, at: number, head: number): Promise<number | null> {
  const [first, last] = await Promise.all([p.getBlock(1), p.getBlock(head)]);
  if (!first || !last || at < first.timestamp || at > last.timestamp) return null;
  let lo = 1, hi = head;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    const b = await p.getBlock(mid);
    if (!b) return null;
    if (b.timestamp <= at) lo = mid; else hi = mid - 1;
  }
  return lo;
}

/* GET: the plain question. ?agent=12, or ?key=0x… for the agent's own address,
   with an optional ?at= unix second. */
export async function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  const at = u.get("at") ? Number(u.get("at")) : null;
  if (at !== null && (!Number.isFinite(at) || at <= 0)) return bad("at must be a unix second");
  const ahead = futureCheck(at); if (ahead) return bad(ahead);
  try {
    let id: bigint | null = u.get("agent") && /^\d+$/.test(u.get("agent")!) ? BigInt(u.get("agent")!) : null;
    const key = u.get("key");
    if (id === null && key) {
      if (!ethers.isAddress(key)) return bad("key is not an address");
      const c = await cfg();
      const ks = new ethers.Contract(c.killSwitch, ABI, provider(c));
      id = BigInt(await ks.agentIdByKey(ethers.getAddress(key)));
      if (id === 0n) return bad(`no agent holds ${key}`, 404);
    }
    if (id === null) return bad("pass agent=<id> or key=0x…");
    const r = await answer(id, at, null);
    return r instanceof NextResponse ? r : NextResponse.json(r, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return bad(e instanceof Error ? e.message : String(e), 502);
  }
}

/* POST: the certificate. { message, signature, at? } and, when the agent is
   not named, the signer itself says which agent it is. */
export async function POST(req: Request) {
  let body: { agent?: number | string; message?: string; signature?: string; at?: number };
  try { body = await req.json(); } catch { return bad("body must be json"); }
  const { message, signature } = body;
  if (typeof message !== "string" || typeof signature !== "string") return bad("message and signature are required");
  const at = body.at === undefined ? null : Number(body.at);
  if (at !== null && (!Number.isFinite(at) || at <= 0)) return bad("at must be a unix second");
  const ahead = futureCheck(at); if (ahead) return bad(ahead);

  let signer: string;
  try { signer = ethers.verifyMessage(message, signature); }
  catch { return bad("that signature does not recover to an address"); }

  try {
    const c = await cfg();
    const ks = new ethers.Contract(c.killSwitch, ABI, provider(c));
    let id = body.agent !== undefined && /^\d+$/.test(String(body.agent)) ? BigInt(String(body.agent)) : null;
    if (id === null) {
      id = BigInt(await ks.agentIdByKey(signer));
      if (id === 0n) return NextResponse.json({ error: "that signature is valid but its signer is not a registered agent", signature: { signer, isAgentKey: false } }, { status: 404 });
    }
    const r = await answer(id, at, signer);
    return r instanceof NextResponse ? r : NextResponse.json(r, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return bad(e instanceof Error ? e.message : String(e), 502);
  }
}
