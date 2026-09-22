"use client";
import type { PulseEvent } from "@/lib/layers";

/* the last day of an agent's life as ticks on a line.
 *
 * the product's claim is that an agent is running on a switch, and until now
 * nothing on the console showed it running. this does: every trade, beat and
 * status change from the index is a tick placed by time. a trading agent is a
 * busy line, a heartbeat agent is a steady one, and a dead agent is flat,
 * which you can see before you have read a word.
 *
 * positions are percentages, so the svg stretches to any width without a
 * measure. tick widths are fixed pixels so nothing smears. tone carries the
 * kind, and the legend under it names each tone, because colour alone is not
 * a statement. */
const HOURS = 24;

export type Tone = "live" | "quiet" | "switch" | "plain";
export function toneOf(kind: string): Tone {
  if (kind === "TradeAccepted") return "live";
  if (kind === "Beat") return "quiet";
  if (kind === "StatusChanged" || kind === "GuardianVoted") return "switch";
  return "plain";
}
const COLOR: Record<Tone, string> = { live: "var(--sage)", quiet: "var(--text-light)", switch: "var(--orange)", plain: "var(--text-medium)" };
const HEIGHT: Record<Tone, number> = { live: 1, quiet: 0.55, switch: 1, plain: 0.75 };

export default function Pulse({ events, now, height = 28 }: { events: PulseEvent[]; now: number; height?: number }) {
  const from = now - HOURS * 3600;
  const inWindow = events.filter(e => e.at >= from && e.at <= now);
  const base = height - 1;
  return (
    <svg width="100%" height={height} role="img" aria-label={inWindow.length ? `${inWindow.length} events in the last ${HOURS} hours` : `no events in the last ${HOURS} hours`} style={{ display: "block", overflow: "visible" }}>
      {/* six-hour marks, faint, so the eye has a scale */}
      {[0.25, 0.5, 0.75].map(p => <line key={p} x1={`${p * 100}%`} x2={`${p * 100}%`} y1={base - 4} y2={base} stroke="var(--hairline)" strokeWidth={1} />)}
      <line x1="0" x2="100%" y1={base} y2={base} stroke="var(--hairline)" strokeWidth={1} />
      {inWindow.map((e, i) => {
        const t = toneOf(e.kind);
        const x = `${((e.at - from) / (HOURS * 3600)) * 100}%`;
        return <line key={i} x1={x} x2={x} y1={base - Math.round(base * HEIGHT[t])} y2={base} stroke={COLOR[t]} strokeWidth={t === "switch" ? 2.5 : 1.5} strokeLinecap="round" />;
      })}
      {/* now, at the right edge */}
      <line x1="100%" x2="100%" y1={0} y2={base} stroke="var(--text-light)" strokeWidth={1} strokeDasharray="2 3" />
    </svg>
  );
}
