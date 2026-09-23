import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { demoFor, agentWallet, guardianFor, cfg, provider, payer } from "@/lib/demo.server";

export const dynamic = "force-dynamic";

const KS = [
  "function getAgent(uint256) view returns (tuple(address agentKey,address revocationKey,address pendingRevocationKey,uint64 revocationKeyChangeAt,uint8 guardianThreshold,uint8 status,uint64 statusSince,uint256 successorId,bytes32 reasonHash,uint64 expiresAt,uint64 heartbeatWindow,uint64 lastBeat,address[] guardians))",
  "function setStatus(uint256,uint8,bytes32)",
  "function setLimits(uint256,uint64,uint64)",
  "function guardianPause(uint256)",
  "function liveness(uint256) view returns (bool trusted, bool expired, bool lapsed, uint64 expiresAt, uint64 nextBeatBy)",
];
const VENUE = ["function trade(uint256)", "function trades() view returns (uint256)"];

/* a refused trade is the point of the demo, so it is sent with a gas limit
   rather than estimated. estimation would fail in the browser and there would
   be nothing to link to; sent, it lands as a real failed transaction that the
   explorer shows next to the successful ones. */
const REFUSABLE = 120000n;

/* one read of the chain, shared between everybody looking at the same agent.
 *
 * a single page read costs seven calls, and every visitor who has not
 * connected a wallet is looking at the same shared agent, so they were all
 * asking the chain the same seven questions at the same time. the public
 * testnet rpc answers fifteen requests a second and rejects the rest with a
 * 429, which ethers renders as "missing revert data": a sentence that names
 * neither the limit nor the cause, and reads on the page as the demo being
 * broken. measured before this: one read in eight failed on its own, and six
 * simultaneous reads failed every time.
 *
 * so a read is kept for a few seconds, and anybody arriving while one is
 * already in flight waits on that one instead of starting another. the page
 * polls every twelve seconds, so nothing served here is staler than a poll
 * would be anyway, and a POST drops the entry because the thing it just
 * changed is the thing the next read asks about. */
const TTL = 5000;
type Snap = { at: number; v: Record<string, unknown> };
const key = (owner: string | null) => (owner ?? "shared").toLowerCase();
const snaps = new Map<string, Snap>();
const inflight = new Map<string, Promise<Record<string, unknown>>>();
/* when each key last changed under us, so a read that was already in the air
   when it changed cannot land afterwards and become the kept answer. */
const dirty = new Map<string, number>();

function invalidate(owner: string | null) {
  const k = key(owner);
  snaps.delete(k);
  dirty.set(k, Date.now());
}

function snapshot(owner: string | null): Promise<Record<string, unknown>> {
  const k = key(owner);
  const hit = snaps.get(k);
  if (hit && Date.now() - hit.at < TTL) return Promise.resolve(hit.v);
  const running = inflight.get(k);
  if (running) return running;
  const started = Date.now();
  const job = (async () => {
    const d = await demoFor(owner);
    const v = { ...d, ...(await state(d.agentId)) } as Record<string, unknown>;
    /* this caller still gets what it read. it just does not get to speak for
       the next five seconds if the chain moved while it was reading. */
    if ((dirty.get(k) ?? 0) < started) snaps.set(k, { at: Date.now(), v });
    return v;
  })().finally(() => inflight.delete(k));
  inflight.set(k, job);
  return job;
}

export async function GET(req: Request) {
  try {
    const owner = new URL(req.url).searchParams.get("owner");
    return NextResponse.json(await snapshot(owner), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: reason(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  let who: string | null = null;
  try {
    const { owner, action } = (await req.json()) as { owner?: string; action: string };
    who = owner ?? null;
    const d = await demoFor(owner ?? null);
    /* the store is keyed by the address that asked for the agent, while
       d.coldKey is who the chain says owns it. those are the same until they
       are not, and under a mismatch looking up by the chain's answer found
       nothing, so every action returned "no demo agent" including trade and
       the guardian vote, neither of which needs the cold key at all. */
    const found = await agentWallet(d.mismatch?.storedFor ?? d.coldKey);
    if (!found) throw new Error("no demo agent");
    const { w, id, c } = found;

    if (action === "trade") {
      const venue = new ethers.Contract(c.venue, VENUE, w);
      const tx = await venue.trade(id, { gasLimit: REFUSABLE });
      /* waitForTransaction, not tx.wait: wait() throws on a reverted receipt
         and the hash of the refusal is the thing worth showing. */
      const rc = await w.provider!.waitForTransaction(tx.hash);
      return NextResponse.json({ ok: rc?.status === 1, hash: tx.hash, block: rc?.blockNumber ?? null, ...(await state(id.toString())) });
    }

    /* an end date ninety seconds out, so a reader can watch trust run out on its
       own with nobody sending anything. the only place this is measured in
       seconds rather than days. */
    if (action === "limits" || action === "clearLimits") {
      if (d.owned) return NextResponse.json({ error: "your wallet is the cold key" }, { status: 403 });
      const p = provider(c);
      const boss = await payer(c, p);
      const ks = new ethers.Contract(c.killSwitch, KS, boss);
      const until = action === "limits" ? Math.floor(Date.now() / 1000) + 90 : 0;
      const tx = await ks.setLimits(id, until, 0);
      const rc = await tx.wait();
      return NextResponse.json({ ok: true, hash: tx.hash, block: rc?.blockNumber ?? null, ...(await state(id.toString())) });
    }

    /* a guardian votes. the threshold is one, so the pause lands at once, and it
       is a guardian pause: the owner undoes it, and if the owner does nothing
       the guardian may escalate once the delay has passed. */
    if (action === "guardianVote") {
      const p = provider(c);
      const g = guardianFor(d.coldKey).connect(p);
      const ks = new ethers.Contract(c.killSwitch, KS, g);
      const tx = await ks.guardianPause(id);
      const rc = await p.waitForTransaction(tx.hash);
      return NextResponse.json({ ok: rc?.status === 1, hash: tx.hash, block: rc?.blockNumber ?? null, ...(await state(id.toString())) });
    }

    /* put the shared practice agent back to a clean start.
     *
     * it keeps whatever the last visitor left: switched off, or with an end
     * date that ran out. the next visitor's very first screen used to be an
     * orange "clear the end date first", before they had done anything. so a
     * visitor who finds it broken has it reset for them.
     *
     * only when the break is stale. the agent is shared, and somebody three
     * minutes into the walkthrough with it paused on purpose must not have it
     * resumed under them. a pause older than three minutes, an end date that
     * ran out more than three minutes ago, a heartbeat missed as long ago: that
     * is a state somebody left behind, not one somebody is looking at. anything
     * fresher is answered with busy, and the page says another visitor is
     * using it. never for an agent the visitor owns. */
    if (action === "reset") {
      if (d.owned) return NextResponse.json({ error: "your wallet is the cold key" }, { status: 403 });
      const p = provider(c);
      const boss = await payer(c, p);
      const ks = new ethers.Contract(c.killSwitch, KS, boss);
      const a = await ks.getAgent(id);
      const now = Math.floor(Date.now() / 1000);
      const STALE = 180;
      const status = Number(a.status), since = Number(a.statusSince);
      const ends = Number(a.expiresAt), win = Number(a.heartbeatWindow), beat = Number(a.lastBeat);
      if (status === 3 || status === 4) return NextResponse.json({ error: "the shared agent was stopped for good" }, { status: 409 });
      const pausedStale = status === 2 && now - since > STALE;
      const endedStale = ends > 0 && now - ends > STALE;
      const lapsedStale = win > 0 && now - (beat + win) > STALE;
      const freshBreak = (status === 2 && !pausedStale) || (ends > 0 && ends <= now && !endedStale) || (win > 0 && beat + win < now && !lapsedStale);
      if (freshBreak) return NextResponse.json({ reset: false, busy: true, ...(await state(id.toString())) });
      const hashes: string[] = [];
      if (endedStale || lapsedStale || (ends > 0 && ends <= now) || (win > 0 && beat + win < now)) {
        const tx = await ks.setLimits(id, 0, 0); await tx.wait(); hashes.push(tx.hash);
      }
      if (pausedStale) {
        const tx = await ks.setStatus(id, 1, ethers.id("demo reset for the next visitor")); await tx.wait(); hashes.push(tx.hash);
      }
      return NextResponse.json({ reset: hashes.length > 0, hashes, ...(await state(id.toString())) });
    }

    if (action === "pause" || action === "resume") {
      /* only when the deployer is the cold key. if the visitor's wallet holds
         it, the stop is theirs to sign and the server must not be able to. */
      if (d.owned) return NextResponse.json({ error: "your wallet is the cold key" }, { status: 403 });
      const p = provider(c);
      const boss = await payer(c, p);
      const ks = new ethers.Contract(c.killSwitch, KS, boss);
      const to = action === "pause" ? 2 : 1;
      const tx = await ks.setStatus(id, to, ethers.id(action === "pause" ? "demo pause" : "demo resume"));
      const rc = await tx.wait();
      return NextResponse.json({ ok: true, hash: tx.hash, block: rc?.blockNumber ?? null, ...(await state(id.toString())) });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: reason(e) }, { status: 500 });
  } finally {
    /* whatever just happened, a kept read is now behind the chain. */
    invalidate(who);
  }
}

async function state(agentId: string) {
  const c = await cfg();
  const p = provider(c);
  const ks = new ethers.Contract(c.killSwitch, KS, p);
  const venue = new ethers.Contract(c.venue, VENUE, p);
  const [a, n, live, block] = await Promise.all([ks.getAgent(agentId), venue.trades(), ks.liveness(agentId), p.getBlockNumber()]);
  /* trusted, not just the status word: an expired agent is still Active in the
     contract and no app will serve it. */
  return {
    status: Number(a.status), trades: Number(n), explorer: c.explorer, venue: c.venue,
    /* lapsed travels with expired. without it the page could see that an agent
       was not trusted and not say why, so a heartbeat that had gone quiet fell
       through every branch and left step one with nothing to offer. */
    trusted: live.trusted, expired: live.expired, lapsed: live.lapsed, expiresAt: Number(live.expiresAt),
    guardians: [...a.guardians],
    /* the block this was read at, so the page can say when it last looked rather
       than implying it is watching continuously. not called block: the POST
       responses already carry the block a transaction landed in, and a spread
       of this after it would silently replace that number with this one. */
    readAt: block,
  };
}

/* the contract's own words, or ours, but never a hex blob.
 *
 * an unnamed revert used to arrive on the page as the whole ethers message:
 * estimateGas, the calldata, the transaction object, several hundred
 * characters of hex that overflowed its card and told the reader nothing. the
 * venue and the switch both revert with custom errors, so they are decoded by
 * selector here and the raw message is only ever the last resort, shortened. */
const SELECTORS: Record<string, string> = {
  "0x8944fae3": "The venue refused that trade. The switch says this agent may not act.",
  "0x99b97774": "This server does not hold that agent's cold key.",
  "0x55f0afcd": "That agent is not in a state where this can happen.",
  "0x523437db": "That agent has been stopped for good.",
  "0xef6d0f02": "That address is not a guardian of this agent.",
  "0xf4ad9a1f": "An end date has to be in the future.",
  "0x18132533": "That key is not this agent's key.",
  "0x3e9e04ab": "This agent already missed its heartbeat.",
  "0x0f299a58": "This agent has no heartbeat to keep.",
};

/* the rpc turning us away, said as what it is.
 *
 * the public testnet rpc answers a fixed number of requests a second and
 * rejects the rest. ethers does not carry that through: a rejected read
 * arrives as "missing revert data" or "could not coalesce error", which name
 * a decoding problem that did not happen and read, on the card, as the demo
 * being broken. a reader who waits a moment gets a working page, so the line
 * says that instead. */
function throttled(e: unknown) {
  const o = e as { code?: unknown; error?: { code?: unknown }; info?: { error?: { code?: unknown; message?: unknown } }; shortMessage?: string; message?: string };
  const codes = [o?.code, o?.error?.code, o?.info?.error?.code];
  if (codes.includes(-32011) || codes.includes(429)) return true;
  const text = `${o?.shortMessage ?? ""} ${o?.message ?? ""} ${String(o?.info?.error?.message ?? "")}`.toLowerCase();
  return /missing revert data|could not coalesce|too many requests|rate ?limit|requests limited/.test(text);
}

function reason(e: unknown) {
  const o = e as { data?: unknown; info?: { error?: { data?: unknown } }; shortMessage?: string; message?: string };
  const data = typeof o?.data === "string" ? o.data : typeof o?.info?.error?.data === "string" ? o.info.error.data : "";
  const named = SELECTORS[data.slice(0, 10)];
  if (named) return named;
  if (throttled(e)) return "The Monad testnet RPC is turning requests away right now. Nothing here is broken. Give it a few seconds and press again.";
  const m = o?.shortMessage || (e instanceof Error ? e.message : String(e));
  /* whatever it is, it is one line on a card, not a transaction dump */
  return m.length > 160 ? m.slice(0, 160) + "…" : m;
}
