import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { GET as chain } from "../chain/route";
import type { ChainCfg } from "../chain/route";
import { memo, retry } from "@/lib/memo";
import { executedBlock } from "@/lib/readtag";

export const dynamic = "force-dynamic";

/* the registry, read once for everybody.
 *
 * every console read every agent straight from the public rpc, which turns
 * away about half of a burst like that (measured: 14 of 29 refused), so each
 * visitor sat through the retries. the server reads it at a pace the rpc
 * accepts and hands the same snapshot to every browser for a few seconds.
 * it is the public registry, the same thing anybody can read from the chain:
 * not a search by owner. the browser picks out its own agents, and every
 * write is still checked by the contract.
 *
 * a stopped or rotated agent never changes again, so it is read once. */
const KS = [
  "function agentCount() view returns (uint256)",
  "function getAgent(uint256) view returns (tuple(address agentKey,address revocationKey,address pendingRevocationKey,uint64 revocationKeyChangeAt,uint8 guardianThreshold,uint8 status,uint64 statusSince,uint256 successorId,bytes32 reasonHash,uint64 expiresAt,uint64 heartbeatWindow,uint64 lastBeat,address[] guardians))",
];
export type RegAgent = {
  id: number; agentKey: string; revocationKey: string; pendingRevocationKey: string; revocationKeyChangeAt: string;
  guardianThreshold: number; status: number; statusSince: string; successorId: string; expiresAt: string;
  heartbeatWindow: string; lastBeat: string; guardians: string[];
};
const ended = new Map<number, RegAgent>();

/* the last snapshot is served while a fresh one is read behind it, so no
   visitor waits on a cold read once one has been made. older than a minute and
   it is not served: the caller waits for the new read instead */
let last: { at: number; v: Awaited<ReturnType<typeof load>> } | null = null;
const FRESH_MS = 4000, STALE_MS = 60_000;
async function snapshot() {
  const v = await memo("registry", FRESH_MS, load);
  last = { at: Date.now(), v };
  return v;
}
export async function GET() {
  try {
    const age = last ? Date.now() - last.at : Infinity;
    if (last && age < STALE_MS) {
      if (age > FRESH_MS) snapshot().catch(() => {});
      return NextResponse.json(last.v, { headers: { "cache-control": "no-store" } });
    }
    return NextResponse.json(await snapshot(), { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "registry unavailable" }, { status: 503 });
  }
}

async function load() {
  const r = await chain(); if (!r.ok) throw new Error("no chain");
  const cfg: ChainCfg = await r.json();
  const p = new ethers.JsonRpcProvider(cfg.rpc, undefined, { staticNetwork: true, batchMaxCount: 4 });
  const block = await executedBlock(p, "server");
  const at = { blockTag: block };
  const ks = new ethers.Contract(cfg.killSwitch, KS, p);
  const n = Number(await retry(() => ks.agentCount(at)));
  const want = Array.from({ length: n }, (_, i) => i + 1).filter(i => !ended.has(i));
  const out = new Map<number, RegAgent>(ended);
  for (let i = 0; i < want.length; i += 8) {
    const part = want.slice(i, i + 8);
    const got = await Promise.all(part.map(id => retry(() => ks.getAgent(id, at))));
    got.forEach((a, k) => {
      const row: RegAgent = {
        id: part[k], agentKey: a[0], revocationKey: a[1], pendingRevocationKey: a[2], revocationKeyChangeAt: String(a[3]),
        guardianThreshold: Number(a[4]), status: Number(a[5]), statusSince: String(a[6]), successorId: String(a[7]),
        expiresAt: String(a[9]), heartbeatWindow: String(a[10]), lastBeat: String(a[11]), guardians: [...a[12]],
      };
      out.set(part[k], row);
      if (row.status === 3 || row.status === 4) ended.set(part[k], row);
    });
  }
  return { key: cfg.chainIdHex, killSwitch: cfg.killSwitch, block, count: n, agents: [...out.values()].sort((a, b) => b.id - a.id) };
}
