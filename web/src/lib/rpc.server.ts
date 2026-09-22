import { ethers } from "ethers";
import { GET as chain, type ChainCfg } from "@/app/api/chain/route";

/* the chain's config and a provider for it, server side, and nothing else.
 *
 * these used to live in demo.server, which also reads and writes the demo's
 * store with readFile on a path built at runtime. turbopack traces a dynamic
 * filesystem access by pulling the WHOLE project into the route's bundle, so
 * every route that wanted a provider shipped the source tree and the public
 * folder with it. a read-only route needs neither the store nor that weight,
 * so the two harmless functions live here and the file-backed parts stay
 * where they are. */
export type { ChainCfg };

export async function cfg(): Promise<ChainCfg> {
  const r = await chain();
  if (!r.ok) throw new Error("no chain");
  return r.json();
}

export function provider(c: ChainCfg) {
  /* the public testnet rpc answers fifteen requests a second and rejects the
     rest with a 429. ethers reports that as "missing revert data", which names
     neither the limit nor the cause, so the retry belongs here: a few attempts
     with backoff turns a burst of readers into a slower answer rather than a
     failed one. the caches in front of this are what keep the burst small;
     this is what survives the one that gets through anyway. */
  const req = new ethers.FetchRequest(c.rpc);
  req.setThrottleParams({ slotInterval: 250, maxAttempts: 5 });
  return new ethers.JsonRpcProvider(req, undefined, { staticNetwork: true, batchMaxCount: 4 });
}
