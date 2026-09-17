import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { EMPTY, type Live } from "@/lib/live";
import { GET as chain } from "../chain/route";
import type { ChainCfg } from "../chain/route";
import { memo, retry } from "@/lib/memo";
import { executedBlock } from "@/lib/readtag";

export const dynamic = "force-dynamic";

const KS = [
  "function agentCount() view returns (uint256)",
  "function getAgent(uint256) view returns (tuple(address agentKey,address revocationKey,address pendingRevocationKey,uint64 revocationKeyChangeAt,uint8 guardianThreshold,uint8 status,uint64 statusSince,uint256 successorId,bytes32 reasonHash,uint64 expiresAt,uint64 heartbeatWindow,uint64 lastBeat,address[] guardians))",
];

/* the figures the landing page opens on, read from whichever chain the app is
   pointed at. no operator registry here: it is in the repo and out of the
   product, so the page must not count it. */
export async function GET() {
  try {
    const live = await memo("live", 4000, load);
    return NextResponse.json(live, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ ...EMPTY, asOf: new Date().toISOString() }, { headers: { "cache-control": "no-store" } });
  }
}

async function load(): Promise<Live> {
  {
    const r = await chain();
    if (!r.ok) throw new Error("no chain");
    const cfg: ChainCfg = await r.json();
    const p = new ethers.JsonRpcProvider(cfg.rpc, undefined, { staticNetwork: true, batchMaxCount: 4 });
    const at = { blockTag: await executedBlock(p, "server") };
    const block = await retry(() => p.getBlockNumber());
    const ks = new ethers.Contract(cfg.killSwitch, KS, p);
    /* finalised, like every read the console makes. see READ in lib/chain. */
    const agents = Number(await retry(() => ks.agentCount(at)));
    /* one round trip per agent is fine at this size and honest at any size:
       the count is small because every agent here was really registered. */
    const states = await Promise.all(Array.from({ length: agents }, (_, i) => retry(() => ks.getAgent(i + 1, at))));
    const revoked = states.filter(a => Number(a.status) === 3).length;
    let refunds = 0;
    if (cfg.refunds) {
      try {
        const rail = new ethers.Contract(cfg.refunds, ["function count() view returns (uint256)", "function get(uint256) view returns (tuple(address payer,address service,address token,uint256 amount,uint64 deadline,bytes32 requestHash,uint8 state))"], p);
        const n = Number(await retry(() => rail.count(at)));
        const all = await Promise.all(Array.from({ length: n }, (_, i) => retry(() => rail.get(i + 1, at))));
        refunds = all.filter(g => Number(g.state) === 3).length;
      } catch { /* the figure stays at zero rather than guessing */ }
    }
    return { source: cfg.source, chain: cfg.chain, block, agents, revoked, refunds, asOf: new Date().toISOString() };
  }
}
