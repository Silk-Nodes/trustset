/* a small server-side memo, and a retry, for routes that read the chain.
 *
 * three parts of the landing page poll /api/live every five seconds, and each
 * request fanned out into a dozen finalised reads. the public RPC answered
 * that with refusals, which the routes swallowed into zeros. one result is
 * now shared for a few seconds across every caller, and a refused read is
 * retried before it is allowed to become a zero. */
const store = new Map<string, { at: number; value: unknown; inflight?: Promise<unknown> }>();

export async function memo<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && now - hit.at < ttlMs) return hit.value as T;
  if (hit?.inflight) return hit.inflight as Promise<T>;
  const inflight = fn().then(v => { store.set(key, { at: Date.now(), value: v }); return v; })
    .catch(e => { if (hit) { store.set(key, { at: hit.at, value: hit.value }); return hit.value as T; } store.delete(key); throw e; });
  store.set(key, { at: hit?.at ?? 0, value: hit?.value, inflight });
  return inflight;
}

import { limited } from "@/lib/limiter";
export async function retry<T>(fn: () => Promise<T>, times = 4, delayMs = 500): Promise<T> {
  let last: unknown;
  for (let i = 0; i < times; i++) {
    try { return await limited(fn); } catch (e) { last = e; await new Promise(r => setTimeout(r, delayMs * (i + 1))); }
  }
  throw last;
}
