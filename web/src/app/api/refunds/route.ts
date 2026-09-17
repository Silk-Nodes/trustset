import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { GET as chain } from "../chain/route";
import type { ChainCfg } from "../chain/route";
import { memo, retry } from "@/lib/memo";
import { executedBlock } from "@/lib/readtag";

export const dynamic = "force-dynamic";

const RAIL = [
  "function count() view returns (uint256)",
  "function get(uint256) view returns (tuple(address payer,address service,address token,uint256 amount,uint64 deadline,bytes32 requestHash,uint8 state))",
];
const STATE = ["none", "open", "settled", "refunded"] as const;

export type RefundRow = { id: number; payer: string; service: string; amount: string; deadline: number; state: (typeof STATE)[number] };

/* the last few payments through the rail, newest first, read finalised. what
   the landing slide plays is this list, so what it shows is what happened. */
export async function GET() {
  try {
    const body = await memo("refunds", 6000, load);
    return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ rows: [], settled: 0, refunded: 0, total: 0 }, { headers: { "cache-control": "no-store" } });
  }
}

async function load() {
  {
    const r = await chain(); if (!r.ok) throw new Error("no chain");
    const cfg: ChainCfg = await r.json();
    if (!cfg.refunds) return { rows: [] as RefundRow[], settled: 0, refunded: 0, total: 0 };
    const p = new ethers.JsonRpcProvider(cfg.rpc, undefined, { staticNetwork: true, batchMaxCount: 4 });
    const at = { blockTag: await executedBlock(p, "server") };
    const rail = new ethers.Contract(cfg.refunds, RAIL, p);
    const n = Number(await retry(() => rail.count(at)));
    const ids = Array.from({ length: Math.min(n, 12) }, (_, i) => n - i);
    const got = await Promise.all(ids.map(id => retry(() => rail.get(id, at))));
    const rows: RefundRow[] = got.map((g, k) => ({ id: ids[k], payer: g.payer, service: g.service, amount: ethers.formatUnits(g.amount, 6), deadline: Number(g.deadline), state: STATE[Number(g.state)] }));
    /* totals over everything, not just the page. small numbers, all real. */
    const all = n <= 12 ? got : await Promise.all(Array.from({ length: n }, (_, i) => retry(() => rail.get(i + 1, at))));
    const settled = all.filter(g => Number(g.state) === 2).length, refunded = all.filter(g => Number(g.state) === 3).length;
    return { rows, settled, refunded, total: n };
  }
}
