import type { ethers } from "ethers";

/* the block to read at.
 *
 * on Monad, consensus runs ahead of execution: a node can have finalised a
 * block it has not executed yet, and an eth_call against that block answers
 * with no data at all. `finalized` as a tag is therefore not the safe read
 * it sounds like. this resolves the finalised height once and steps back a
 * few blocks, well inside what every node has executed, and every read in
 * the same pass uses that one number, so a list is never torn across blocks. */
const BEHIND = 4;
let cache: { at: number; block: number; key: string } | null = null;

export async function executedBlock(p: ethers.JsonRpcProvider, key = "default", fresh = false): Promise<number> {
  const now = Date.now();
  if (!fresh && cache && cache.key === key && now - cache.at < 2000) return cache.block;
  const [b, latest] = await Promise.all([p.getBlock("finalized").catch(() => null), p.getBlockNumber()]);
  /* a chain with no finality of its own, anvil for one, answers 0 for the
     finalised block forever. stepping back from that reads before anything was
     deployed and every call comes back empty. such a chain does not reorg
     either, so its head is the safe read. */
  const finalised = b?.number ?? 0;
  const block = finalised === 0 && latest > 0 ? latest : Math.max(1, finalised - BEHIND);
  cache = { at: now, block, key };
  return block;
}
