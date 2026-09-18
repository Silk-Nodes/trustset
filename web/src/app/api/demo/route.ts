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

export async function GET(req: Request) {
  try {
    const owner = new URL(req.url).searchParams.get("owner");
    const d = await demoFor(owner);
    return NextResponse.json({ ...d, ...(await state(d.agentId)) }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: reason(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { owner, action } = (await req.json()) as { owner?: string; action: string };
    const d = await demoFor(owner ?? null);
    const found = await agentWallet(d.coldKey);
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
    trusted: live.trusted, expired: live.expired, expiresAt: Number(live.expiresAt),
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

function reason(e: unknown) {
  const o = e as { data?: unknown; info?: { error?: { data?: unknown } }; shortMessage?: string; message?: string };
  const data = typeof o?.data === "string" ? o.data : typeof o?.info?.error?.data === "string" ? o.info.error.data : "";
  const named = SELECTORS[data.slice(0, 10)];
  if (named) return named;
  const m = o?.shortMessage || (e instanceof Error ? e.message : String(e));
  /* whatever it is, it is one line on a card, not a transaction dump */
  return m.length > 160 ? m.slice(0, 160) + "…" : m;
}
