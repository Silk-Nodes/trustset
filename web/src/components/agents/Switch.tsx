"use client";
import { motion } from "motion/react";
import { useMotionPrefs } from "@/lib/motion";
import type { SwitchState } from "@/lib/layers";

/* the switch, as a breaker.
 *
 * the product's own sentence is "a breaker, not a fuse", so the control is one:
 * a throw in a housing, handle up for on and down for off, read from across
 * the room. a tripped breaker (a guardian threw it, and only the cold key
 * throws it back) has a hatched housing. an ended one has no handle, because
 * there is no position left to move it to. the throw is a spring with a little
 * overshoot, because a breaker snaps; with reduced motion it just moves. the
 * word beside or under it says the same thing, so nobody has to read a colour
 * or a position. */
const WORD: Record<SwitchState, string> = { on: "ON", off: "OFF", tripped: "TRIPPED", ended: "ENDED" };
const SIZE = { sm: { w: 22, h: 38, k: 14 }, md: { w: 28, h: 48, k: 18 }, lg: { w: 40, h: 68, k: 26 } } as const;

export default function Switch({ state, live, busy, disabled, onToggle, label, size = "md", caption = "side" }: {
  state: SwitchState;
  /* on can still mean not trusted, when an end date passed or a beat was
     missed. the handle stays up, the colour steps down, the caption says. */
  live: boolean; busy?: boolean; disabled?: boolean; onToggle: () => void; label?: string;
  size?: keyof typeof SIZE; caption?: "side" | "below" | "none";
}) {
  const m = useMotionPrefs();
  const on = state === "on";
  const ended = state === "ended";
  const tone = ended ? "var(--text-light)" : state === "tripped" ? "var(--orange)" : on ? (live ? "var(--sage)" : "var(--terra)") : "var(--text-light)";
  const z = SIZE[size];
  /* the handle is placed inside the border, so it is measured against the
     inner box. measured against the outer one it sat 1.5px off the track. a 2px border
     keeps every position on a whole pixel at every size. */
  const B = 2;
  const iw = z.w - B * 2, ih = z.h - B * 2;
  const pad = (iw - z.k) / 2;
  const travel = ih - z.k - pad * 2;
  const word = (
    <span className="mono text-[10.5px] tracking-[0.12em] tabular whitespace-nowrap" style={{ color: ended ? "var(--text-medium)" : tone === "var(--sage)" ? "var(--sage-text)" : tone === "var(--orange)" ? "var(--orange-text)" : "var(--text-dark)" }}>
      {busy ? "…" : WORD[state]}
    </span>
  );
  return (
    <button type="button" onClick={e => { e.stopPropagation(); onToggle(); }} disabled={disabled || ended || busy} aria-pressed={on} aria-label={label ?? `switch ${WORD[state].toLowerCase()}`}
      className={`inline-flex ${caption === "below" ? "flex-col" : ""} items-center gap-2 outline-none focus-visible:ring-2 rounded-lg disabled:cursor-default group/breaker`}>
      <span className="relative inline-block shrink-0 rounded-[8px] transition-transform group-active/breaker:scale-[0.97]" style={{
        width: z.w, height: z.h,
        background: ended ? "transparent" : `color-mix(in srgb, ${tone} ${on ? 16 : 8}%, var(--surface))`,
        border: ended ? `${B}px dashed var(--hairline)` : `${B}px solid ${tone}`,
        backgroundImage: state === "tripped" ? "repeating-linear-gradient(135deg, transparent 0 4px, color-mix(in srgb, var(--orange) 26%, transparent) 4px 6px)" : undefined,
        boxShadow: ended ? undefined : "inset 0 1px 2px rgba(0,0,0,0.18)",
        opacity: busy ? 0.6 : 1,
      }}>
        {!ended && <span aria-hidden className="absolute w-[2px] rounded-full" style={{ left: iw / 2 - 1, top: pad + 2, bottom: pad + 2, background: "color-mix(in srgb, var(--text-dark) 12%, transparent)" }} />}
        {!ended && (
          <motion.span aria-hidden className="absolute rounded-[5px]" style={{ left: pad, width: z.k, height: z.k, background: tone, boxShadow: "0 1px 0 rgba(255,255,255,0.18) inset, 0 2px 4px rgba(0,0,0,0.25)" }}
            initial={false} animate={{ top: on ? pad : pad + travel }}
            transition={m.reduced ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 26, mass: 0.7 }} />
        )}
      </span>
      {caption !== "none" && word}
    </button>
  );
}
