"use client";
import { useMemo } from "react";
import type { Row, StateKey } from "@/lib/fleet";
import { STATE_WORD } from "@/lib/fleet";
import type { PulseEvent } from "@/lib/layers";
import { type TrustState, WINDOW, trustline } from "@/lib/trustline";

/* the mains. the whole fleet before any one agent.
 *
 * a title that says "Agents" tells a reader nothing they did not click to get
 * here. this strip says what the fleet is doing: how many agents sit in each
 * state, and the last day of all of them stacked into one chart, so a pause at
 * two in the morning across three agents shows as one orange notch instead of
 * three cards to open. the counts are the filters: pressing one dims every
 * breaker that is not in it, and the panel keeps its shape. */
const STATES: StateKey[] = ["trusted", "expired", "quiet", "paused", "stopped"];
const SLOTS = 96;
/* bottom to top: trust at the floor, then what ended it */
const STACK: { k: "trusted" | "lapsed" | "paused" | "stopped"; of: TrustState[] }[] = [
  { k: "trusted", of: ["trusted"] }, { k: "lapsed", of: ["quiet", "expired"] }, { k: "paused", of: ["paused"] }, { k: "stopped", of: ["stopped"] },
];
const FILL = { trusted: "var(--sage)", lapsed: "color-mix(in srgb, var(--terra) 75%, transparent)", paused: "var(--orange)", stopped: "color-mix(in srgb, var(--text-dark) 22%, transparent)" } as const;
const TONE: Record<StateKey, string> = { trusted: "var(--sage)", expired: "var(--terra)", quiet: "var(--terra)", paused: "var(--orange)", stopped: "var(--text-light)" };
/* a phone has about sixty pixels per readout */
const SHORT: Record<StateKey, string> = { trusted: "trusted", expired: "expired", quiet: "quiet", paused: "paused", stopped: "stopped" };
const clock = (t: number) => new Date(t * 1000).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

export default function Mains({ rows, now, pulses, on, onState, onClear, filtered, narrow }: {
  rows: Row[]; now: number; pulses: Record<string, { events: PulseEvent[] } | undefined>;
  on: StateKey[]; onState: (s: StateKey) => void; onClear: () => void; filtered: boolean; narrow?: boolean;
}) {
  /* redrawn once a minute, not on every second the page ticks */
  const minute = Math.floor(now / 60) * 60;
  const byState = useMemo(() => Object.fromEntries(STATES.map(s => [s, rows.filter(r => r.state === s).length])) as Record<StateKey, number>, [rows]);
  const slots = useMemo(() => {
    const start = minute - WINDOW, step = WINDOW / SLOTS;
    const lines = rows.map(r => trustline(r.a, minute, pulses[r.id]?.events ?? []));
    return Array.from({ length: SLOTS }, (_, i) => {
      const t = start + (i + 0.5) * step;
      const n = { trusted: 0, lapsed: 0, paused: 0, stopped: 0 };
      for (const segs of lines) {
        const s = segs.find(g => g.from <= t && t < g.to)?.state;
        if (s === "trusted") n.trusted++; else if (s === "quiet" || s === "expired") n.lapsed++; else if (s === "paused") n.paused++; else if (s === "stopped") n.stopped++;
      }
      return { t, n };
    });
  }, [rows, pulses, minute]);
  const total = Math.max(1, rows.length);
  const H = 40;

  return (
    <section aria-label="Fleet" className={`module rounded-[16px] p-3 sm:p-4 grid gap-4 ${narrow ? "" : "lg:grid-cols-[auto_minmax(0,1fr)]"} items-stretch`}>
      <div className="grid grid-cols-5 gap-1.5 sm:gap-2" role="group" aria-label="Filter by state">
        {STATES.map(s => {
          const pressed = on.includes(s), n = byState[s];
          return (
            <button key={s} type="button" onClick={() => onState(s)} aria-pressed={pressed}
              className="relative min-w-0 sm:min-w-[84px] rounded-[10px] px-2 sm:px-3 py-2 text-left outline-none focus-visible:ring-2 transition-[background-color,transform] duration-150 active:scale-[0.97]"
              style={{ background: pressed ? `color-mix(in srgb, ${TONE[s]} 14%, transparent)` : "color-mix(in srgb, var(--text-dark) 3.5%, transparent)", boxShadow: pressed ? `inset 0 0 0 1.5px ${TONE[s]}` : undefined }}>
              <span className="flex items-center gap-1.5 min-w-0">
                <span aria-hidden className="hidden sm:block w-1.5 h-1.5 rounded-full shrink-0" style={{ background: TONE[s], opacity: n ? 1 : 0.4 }} />
                <span className="eyebrow whitespace-nowrap !text-[9px] !tracking-[0.06em] sm:!text-[10px] sm:!tracking-[0.14em]">
                  <span className="sm:hidden">{SHORT[s]}</span><span className="hidden sm:inline">{STATE_WORD[s]}</span>
                </span>
              </span>
              <span className="flex items-center gap-1.5 mt-1.5">
                <span aria-hidden className="sm:hidden w-1.5 h-1.5 rounded-full shrink-0" style={{ background: TONE[s], opacity: n ? 1 : 0.4 }} />
                <span className="block mono tabular text-[20px] sm:text-[26px] leading-none tracking-[-0.02em]" style={{ color: n ? "var(--text-dark)" : "var(--text-light)" }}>{n}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="min-w-0 flex flex-col justify-between gap-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="eyebrow truncate">fleet, last 24 hours</span>
          <span className="flex-1" />
          {filtered && <button type="button" onClick={onClear} className="mono text-[11px] h-6 px-2 rounded-md outline-none focus-visible:ring-2 hover:underline shrink-0" style={{ color: "var(--text-medium)" }}>clear filter</button>}
        </div>
        <svg width="100%" height={H} viewBox={`0 0 ${SLOTS} ${H}`} preserveAspectRatio="none" role="img" style={{ display: "block" }}
          aria-label={`fleet over the last 24 hours: ${slots[SLOTS - 1].n.trusted} of ${rows.length} trusted now`}>
          {slots.map(({ t, n }, i) => {
            let y = H;
            return (
              <g key={i}>
                <rect x={i} y={0} width={1} height={H} fill="color-mix(in srgb, var(--text-dark) 4%, transparent)" />
                {STACK.map(({ k }) => {
                  const h = (n[k] / total) * H; if (!h) return null; y -= h;
                  return <rect key={k} x={i + 0.1} y={y} width={0.8} height={h} fill={FILL[k]} />;
                })}
                <title>{`${clock(t)}: ${n.trusted} trusted${n.lapsed ? `, ${n.lapsed} lapsed` : ""}${n.paused ? `, ${n.paused} paused` : ""}${n.stopped ? `, ${n.stopped} stopped` : ""}`}</title>
              </g>
            );
          })}
        </svg>
        <div className="flex justify-between mono text-[10px]" style={{ color: "var(--text-medium)" }}><span>24h ago</span><span>12h</span><span>now</span></div>
      </div>
    </section>
  );
}
