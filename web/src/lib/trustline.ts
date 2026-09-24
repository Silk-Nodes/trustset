import type { Agent } from "@/lib/chain";

/* an agent's last day of trust, as segments.
 *
 * the chain keeps every status change with its time (Agent.history), and the
 * two limits that end trust with nobody sending anything are dates we already
 * hold: the end date, and the last beat plus its window. so the day can be
 * rebuilt exactly, not estimated: walk the status changes, then lay the limits
 * over any stretch the contract still called active.
 *
 * the order matches everywhere else in the product: the status decides first
 * (stopped, paused), then an end date that passed, then a missed heartbeat. */
export type TrustState = "trusted" | "paused" | "quiet" | "expired" | "stopped" | "absent";
export type Segment = { from: number; to: number; state: TrustState };
export const WINDOW = 24 * 3600;

export function trustline(a: Agent, now: number, events: { kind: string; at: number; data?: Record<string, unknown> }[] = [], span = WINDOW): Segment[] {
  const start = now - span;
  /* status changes from everything we hold: the chain's history when it has
     been read, the index's events otherwise, and the one change always known,
     the current status since a.since. a stretch before the earliest known
     change is left undrawn: we do not know what it was, and a guessed green
     would be the one place this strip lied. */
  const changes: { at: number; status: string }[] = [...(a.history ?? []).map(h => ({ at: h.at, status: h.status as string }))];
  for (const e of events) {
    if (e.kind === "StatusChanged" && typeof e.data?.status === "string") changes.push({ at: e.at, status: e.data.status as string });
    else if (e.kind === "Rotated") changes.push({ at: e.at, status: "rotated" });
    else if (e.kind === "AgentRegistered") changes.push({ at: e.at, status: "active" });
  }
  if (a.since) changes.push({ at: a.since, status: a.status });
  changes.sort((x, y) => x.at - y.at);
  const born = events.find(e => e.kind === "AgentRegistered")?.at ?? -Infinity;
  const statusAt = (t: number) => {
    let s: string | null = null;
    for (const c of changes) { if (c.at <= t) s = c.status; else break; }
    return s;
  };
  /* the moments anything could change inside the window */
  const cuts = new Set<number>([start, now]);
  if (Number.isFinite(born)) cuts.add(born);
  for (const c of changes) cuts.add(c.at);
  if (a.expiresAt) cuts.add(a.expiresAt);
  if (a.heartbeatWindow) cuts.add(a.lastBeat + a.heartbeatWindow);
  const points = [...cuts].filter(t => t >= start && t <= now).sort((x, y) => x - y);

  const out: Segment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i], to = points[i + 1];
    if (to <= from) continue;
    const mid = (from + to) / 2;
    let state: TrustState;
    const s = statusAt(mid);
    if (mid < born || s === null) state = "absent";
    else {
      if (s === "revoked" || s === "rotated") state = "stopped";
      else if (s === "paused") state = "paused";
      else if (a.expiresAt && mid >= a.expiresAt) state = "expired";
      /* a heartbeat is judged against the beat we know of. an older lapse that
         a later beat or a new window cured is not reconstructable from the
         last beat alone, so only the current lapse is drawn. */
      else if (a.heartbeatWindow && mid > a.lastBeat + a.heartbeatWindow) state = "quiet";
      else state = "trusted";
    }
    const last = out[out.length - 1];
    if (last && last.state === state) last.to = to; else out.push({ from, to, state });
  }
  return out;
}
