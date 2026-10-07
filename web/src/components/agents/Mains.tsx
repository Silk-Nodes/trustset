"use client";
import { useMemo } from "react";
import type { Row, StateKey } from "@/lib/fleet";
import { STATE_WORD } from "@/lib/fleet";
import type { PulseEvent } from "@/lib/layers";
import { type TrustState, WINDOW, trustline } from "@/lib/trustline";
import Tip from "@/components/Tip";

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

/* what each state means for the agent, in the words of what apps do with it.
   the card says the short one; the tip says the rule behind it. */
const MEANS: Record<StateKey, { line: string; tip: string }> = {
  trusted: { line: "apps serve it", tip: "Active, inside its limits and reporting in. Every app that checks lets it act." },
  expired: { line: "past its end date", tip: "Its owner gave it an end date and that date has passed. Apps refuse it until the owner sets new limits." },
  quiet: { line: "missed its heartbeat", tip: "It must report in on a schedule and it missed one. Apps refuse it until its owner opens a new window." },
  paused: { line: "refused until resumed", tip: "Its owner, a guardian vote or a passkey paused it. Apps refuse it. A pause can be undone." },
  stopped: { line: "off for good", tip: "Stopped for good. Nobody can bring it back, not even its owner." },
};

/* the five states, as the first thing the page says. each is a count, a word
   and what it means, and pressing one filters the agents below to it. */
export default function Mains({ rows, on, onState, onClear, filtered, narrow }: {
  rows: Row[]; on: StateKey[]; onState: (s: StateKey) => void; onClear: () => void; filtered: boolean; narrow?: boolean;
}) {
  const byState = useMemo(() => Object.fromEntries(STATES.map(s => [s, rows.filter(r => r.state === s).length])) as Record<StateKey, number>, [rows]);
  return (
    <section aria-label="Agents by state">
      <div className="grid grid-cols-5 gap-1.5 sm:gap-2.5" role="group" aria-label="Filter by state">
        {STATES.map(s => {
          const pressed = on.includes(s), n = byState[s];
          return (
            <Tip key={s} text={MEANS[s].tip} tap={false} focusable={false} block>
            <button type="button" onClick={() => onState(s)} aria-pressed={pressed} aria-description={MEANS[s].tip}
              className="module relative w-full min-w-0 rounded-[12px] px-2 py-2.5 sm:px-4 sm:py-3.5 text-left outline-none focus-visible:ring-2 transition-[box-shadow,transform] duration-150 active:scale-[0.98]"
              style={{ boxShadow: pressed ? `var(--module-shadow), inset 0 0 0 1.5px ${TONE[s]}` : undefined, background: pressed ? `color-mix(in srgb, ${TONE[s]} 10%, var(--module))` : undefined }}>
              <span className="flex items-center gap-1.5 min-w-0">
                <span aria-hidden className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full shrink-0" style={{ background: TONE[s], opacity: n ? 1 : 0.4 }} />
                <span className="eyebrow whitespace-nowrap !text-[9px] !tracking-[0.06em] sm:!text-[10.5px] sm:!tracking-[0.14em]">
                  <span className="sm:hidden">{SHORT[s]}</span><span className="hidden sm:inline">{STATE_WORD[s]}</span>
                </span>
              </span>
              <span className="block mono tabular text-[22px] sm:text-[34px] leading-none tracking-[-0.02em] mt-2 sm:mt-2.5" style={{ color: n ? "var(--text-dark)" : "var(--text-faint)" }}>{n}</span>
              {/* two lines on a tablet, where five cards share 700px; one on a desktop */}
              <span className={`hidden md:block text-[12px] leading-[1.35] mt-2 line-clamp-2 min-h-[2.7em] ${narrow ? "" : "lg:min-h-0 lg:line-clamp-1"}`} style={{ color: "var(--text-medium)" }}>{MEANS[s].line}</span>
            </button>
            </Tip>
          );
        })}
      </div>
      {filtered && (
        <div className="flex justify-end mt-1.5">
          <button type="button" onClick={onClear} className="mono text-[11px] h-6 px-2 rounded-md outline-none focus-visible:ring-2 hover:underline" style={{ color: "var(--text-medium)" }}>clear filter</button>
        </div>
      )}
    </section>
  );
}

/* the fleet's last day, every agent stacked into one chart, so a pause at two
   in the morning across three agents is one orange notch. it is history, so
   it sits under the agents, not over them. */
export function FleetHistory({ rows, now, pulses }: { rows: Row[]; now: number; pulses: Record<string, { events: PulseEvent[] } | undefined> }) {
  /* redrawn once a minute, not on every second the page ticks */
  const minute = Math.floor(now / 60) * 60;
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
  const H = 28;

  return (
    <section aria-label="Last 24 hours" className="min-w-0 flex flex-col gap-1.5">
      <div className="flex items-baseline gap-2 min-w-0">
        <span className="eyebrow" style={{ color: "var(--text-dark)" }}>last 24 hours</span>
        <span className="text-[11.5px] truncate" style={{ color: "var(--text-medium)" }} data-tip="Green is trusted, orange a pause, brown a missed heartbeat or end date, grey stopped.">every agent, stacked</span>
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
    </section>
  );
}
