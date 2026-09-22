"use client";
import { motion } from "motion/react";
import { useMotionPrefs } from "@/lib/motion";
import type { SwitchState } from "@/lib/layers";

/* the switch, as a switch.
 *
 * on, off, tripped, or ended, read from across the room. on is the knob to
 * the right; off and tripped are the knob to the left, tripped with a hatched
 * track because a guardian threw it and only the cold key can throw it back;
 * ended is a switch with no knob, because there is no position to move it to.
 * the word beside it says the same thing, so nobody has to read a colour. */
const WORD: Record<SwitchState, string> = { on: "ON", off: "OFF", tripped: "TRIPPED", ended: "ENDED" };

export default function Switch({ state, live, busy, disabled, onToggle, label }: {
  state: SwitchState;
  /* on can still mean not trusted, when an end date passed or a beat was
     missed. the knob stays right, the colour steps down, the caption says. */
  live: boolean; busy?: boolean; disabled?: boolean; onToggle: () => void; label?: string;
}) {
  const m = useMotionPrefs();
  const on = state === "on";
  const ended = state === "ended";
  const tone = ended ? "var(--text-light)" : state === "tripped" ? "var(--orange)" : on ? (live ? "var(--sage)" : "var(--terra)") : "var(--text-light)";
  const track = ended ? "transparent" : on ? `color-mix(in srgb, ${tone} 22%, transparent)` : "color-mix(in srgb, var(--text-dark) 8%, transparent)";
  return (
    <button type="button" onClick={onToggle} disabled={disabled || ended || busy} aria-pressed={on} aria-label={label ?? `switch ${WORD[state].toLowerCase()}`}
      className="inline-flex items-center gap-3 outline-none focus-visible:ring-2 rounded-full disabled:cursor-default">
      <span className="relative inline-block w-[52px] h-[30px] rounded-full shrink-0" style={{
        background: track, border: `1.5px solid ${ended ? "var(--hairline)" : tone}`,
        backgroundImage: state === "tripped" ? "repeating-linear-gradient(135deg, transparent 0 4px, color-mix(in srgb, var(--orange) 28%, transparent) 4px 6px)" : undefined,
        opacity: busy ? 0.6 : 1, transition: "opacity .2s",
      }}>
        {!ended && (
          <motion.span className="absolute top-[3px] w-[21px] h-[21px] rounded-full" style={{ background: tone }}
            initial={false} animate={{ left: on ? 25 : 3 }} transition={m.spring()} />
        )}
      </span>
      <span className="mono text-[11px] tracking-[0.12em] tabular" style={{ color: ended ? "var(--text-medium)" : tone === "var(--sage)" ? "var(--sage-text)" : tone === "var(--orange)" ? "var(--orange-text)" : "var(--text-dark)" }}>
        {busy ? "…" : WORD[state]}
      </span>
    </button>
  );
}
