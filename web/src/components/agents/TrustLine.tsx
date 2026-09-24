"use client";
import type { Agent } from "@/lib/chain";
import { type Segment, type TrustState, WINDOW, trustline } from "@/lib/trustline";
import { type Tone, toneOf } from "./Pulse";

/* twenty four hours of trust as one strip.
 *
 * a fleet read as a table asks you to open every agent to learn what happened
 * to it today. read as strips, it is a chart: the agent paused at two, the one
 * that went quiet an hour ago, the one stopped this morning, all visible from
 * the list. solid is trusted, orange is a pause, hatched is silence or an end
 * date running out (trust ended with nobody sending anything), grey is
 * stopped, and nothing is before the agent existed. */
const FILL: Record<TrustState, string> = {
  trusted: "var(--sage)", paused: "var(--orange)", quiet: "var(--terra)", expired: "var(--terra)",
  stopped: "color-mix(in srgb, var(--text-dark) 22%, transparent)", absent: "transparent",
};
const WORD: Record<TrustState, string> = { trusted: "trusted", paused: "paused", quiet: "gone quiet", expired: "expired", stopped: "stopped", absent: "no record" };
const TICK_COLOR: Record<Tone, string> = { live: "var(--sage)", quiet: "var(--text-light)", switch: "var(--orange)", plain: "var(--text-medium)" };
const clock = (t: number) => new Date(t * 1000).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

export default function TrustLine({ agent, now, events = [], height = 10, labels = false, ticks = false }: { agent: Agent; now: number; events?: { kind: string; at: number; data?: Record<string, unknown> }[]; height?: number; labels?: boolean;
  /* the agent's activity drawn on top of its trust, so one strip says both
     what it did and whether it was trusted while it did it */
  ticks?: boolean }) {
  const segs: Segment[] = trustline(agent, now, events);
  const start = now - WINDOW;
  const x = (t: number) => ((t - start) / WINDOW) * 100;
  const id = `hatch-${agent.id}`;
  const TICK = ticks ? 12 : 0;
  const marks = ticks ? events.filter(e => e.at >= start && e.at <= now) : [];
  const said = segs.filter(s => s.state !== "absent").map(s => `${WORD[s.state]} ${clock(s.from)} to ${clock(s.to)}`).join(", ");
  return (
    <div className="min-w-0">
      <svg width="100%" height={height + TICK} role="img" aria-label={`last 24 hours: ${said || "no record"}${ticks ? `, ${marks.length} events` : ""}`} style={{ display: "block", overflow: "visible" }} preserveAspectRatio="none">
        <defs>
          <pattern id={id} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="4" height="4" fill="color-mix(in srgb, var(--terra) 25%, transparent)" />
            <rect width="2" height="4" fill="var(--terra)" />
          </pattern>
        </defs>
        {marks.map((e, i) => {
          const tone = toneOf(e.kind);
          const h = tone === "live" || tone === "switch" ? TICK - 3 : tone === "quiet" ? (TICK - 3) * 0.55 : (TICK - 3) * 0.75;
          return <line key={"t" + i} x1={`${x(e.at)}%`} x2={`${x(e.at)}%`} y1={TICK - 2 - h} y2={TICK - 2} stroke={TICK_COLOR[tone]} strokeWidth={tone === "switch" ? 2 : 1.25} strokeLinecap="round" />;
        })}
        <rect x="0" y={TICK} width="100%" height={height} rx={2} fill="color-mix(in srgb, var(--text-dark) 6%, transparent)" />
        {segs.map((s, i) => {
          if (s.state === "absent") return null;
          /* a short stretch still gets a visible sliver, and the sliver is
             pulled left so it never runs past now: a one minute pause at the
             right edge used to be clipped to a fraction of a pixel */
          const w = Math.max(0.4, x(s.to) - x(s.from));
          const left = Math.min(x(s.from), 100 - w);
          return (
            <rect key={i} x={`${left}%`} y={TICK} width={`${w}%`} height={height}
              fill={s.state === "quiet" || s.state === "expired" ? `url(#${id})` : FILL[s.state]}>
              <title>{`${WORD[s.state]}, ${clock(s.from)} to ${s.to >= now - 30 ? "now" : clock(s.to)}`}</title>
            </rect>
          );
        })}
      </svg>
      {labels && (
        <div className="flex justify-between mono text-[10px] mt-1" style={{ color: "var(--text-light)" }}>
          <span>24h ago</span><span>12h</span><span>now</span>
        </div>
      )}
    </div>
  );
}
