"use client";
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { useMotionPrefs } from "@/lib/motion";
import type { SwitchState } from "@/lib/layers";

/* the switch, as a breaker, with a lockout.
 *
 * the product's own sentence is "a breaker, not a fuse", so the control is one:
 * a throw in a housing, handle up for on and down for off. switchgear already
 * has the other half of this product too. when a circuit must never come back
 * on, an electrician does not flip it harder, they put a padlock on it: a
 * lockout. so the same breaker does both. a tap throws it, which is a pause
 * and can be undone. holding it for two seconds fills a ring round the housing
 * and locks it out, which is stopping the agent for good. letting go early
 * cancels, and nothing is sent. there used to be a second control beside it,
 * "hold to stop", which read as the same thing twice.
 *
 * states, readable across a room: on is sage with the handle up; paused is
 * orange with the handle down, because a paused agent wants attention, not
 * the grey of a disabled control; tripped (a guardian threw it) is the same
 * with a hatch; locked out is grey with the padlock on it. */
const WORD: Record<SwitchState, string> = { on: "ON", off: "OFF", tripped: "TRIPPED", ended: "ENDED" };
const SIZE = { sm: { w: 22, h: 38, k: 14, lock: 10 }, md: { w: 28, h: 48, k: 18, lock: 12 }, lg: { w: 40, h: 68, k: 26, lock: 16 } } as const;
export const LOCKOUT_MS = 2000;
/* shorter than this is a tap; longer, and released before the lockout, is a
   change of mind, which does nothing */
const TAP_MS = 350;

export default function Switch({ state, live, busy, lockBusy, disabled, onToggle, onLockout, onHolding, label, size = "md", caption = "side" }: {
  state: SwitchState;
  /* on can still mean not trusted, when an end date passed or a beat was
     missed. the handle stays up, the colour steps down, the caption says. */
  live: boolean; busy?: boolean; lockBusy?: boolean; disabled?: boolean; onToggle: () => void;
  /* stopping for good. without it the breaker only throws. */
  onLockout?: () => void;
  /* told when a hold starts and ends, so the words beside it can say "keep holding" */
  onHolding?: (holding: boolean) => void;
  label?: string;
  size?: keyof typeof SIZE; caption?: "side" | "below" | "none";
}) {
  const m = useMotionPrefs();
  const on = state === "on";
  const ended = state === "ended";
  const warn = state === "off" || state === "tripped";
  const tone = ended ? "var(--text-light)" : warn ? "var(--orange)" : on ? (live ? "var(--sage)" : "var(--terra)") : "var(--text-light)";
  const z = SIZE[size];
  /* the handle is placed inside the border, so it is measured against the
     inner box. measured against the outer one it sat 1.5px off the track. a
     2px border keeps every position on a whole pixel at every size. */
  const B = 2;
  const iw = z.w - B * 2, ih = z.h - B * 2;
  const pad = (iw - z.k) / 2;
  const travel = ih - z.k - pad * 2;

  /* the hold. one clock from press to lockout; the ring fills on the same one */
  const [holding, setHolding] = useState(false);
  const began = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  const canLock = !!onLockout && !ended && !disabled && !lockBusy;
  const canToggle = !ended && !disabled && !busy;
  const hold = (v: boolean) => { setHolding(v); onHolding?.(v); };
  const start = () => {
    if (!canToggle && !canLock) return;
    began.current = Date.now(); fired.current = false;
    if (canLock) {
      hold(true);
      timer.current = setTimeout(() => { timer.current = null; fired.current = true; hold(false); onLockout!(); }, LOCKOUT_MS);
    }
  };
  const finish = (commit: boolean) => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (holding) hold(false);
    if (fired.current || !began.current) { began.current = 0; return; }
    const quick = Date.now() - began.current < TAP_MS;
    began.current = 0;
    if (commit && quick && canToggle) onToggle();
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  /* the padlock drops in when a lockout lands while the page is open; an
     agent that was already stopped just shows it */
  const wasEnded = useRef(ended);
  const dropIn = ended && !wasEnded.current && !m.reduced;

  const word = (
    <span className="mono text-[10.5px] tracking-[0.12em] tabular whitespace-nowrap" style={{ color: ended ? "var(--text-medium)" : tone === "var(--sage)" ? "var(--sage-text)" : warn ? "var(--orange-text)" : "var(--text-dark)" }}>
      {busy || lockBusy ? "…" : WORD[state]}
    </span>
  );
  const r = size === "lg" ? 10 : 8;

  return (
    <button type="button" disabled={ended || (!canToggle && !canLock)} aria-pressed={on}
      aria-label={label ?? `switch ${WORD[state].toLowerCase()}`}
      aria-description={canLock ? `hold for ${LOCKOUT_MS / 1000} seconds to stop it for good` : undefined}
      onClick={e => { e.stopPropagation(); if (!onLockout && canToggle) onToggle(); }}
      onPointerDown={e => { if (!onLockout || e.button !== 0) return; e.stopPropagation(); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); start(); }}
      onPointerUp={e => { if (!onLockout) return; e.stopPropagation(); finish(true); }}
      onPointerCancel={() => finish(false)}
      onContextMenu={e => { if (onLockout) e.preventDefault(); }}
      onKeyDown={e => {
        if (!onLockout) return;
        if (e.key === " " && !e.repeat) { e.preventDefault(); start(); }
        else if (e.key === "Enter") { e.preventDefault(); if (canToggle) onToggle(); }
      }}
      onKeyUp={e => { if (onLockout && e.key === " ") { e.preventDefault(); finish(true); } }}
      className={`inline-flex ${caption === "below" ? "flex-col" : ""} items-center gap-2 outline-none focus-visible:ring-2 rounded-lg disabled:cursor-default group/breaker select-none`}
      style={{ touchAction: onLockout ? "none" : undefined, WebkitTouchCallout: "none" }}>
      <span className="relative inline-block shrink-0 transition-transform group-active/breaker:scale-[0.97]" style={{ width: z.w, height: z.h }}>
        <span className="absolute inset-0" style={{
          borderRadius: r,
          background: ended ? "color-mix(in srgb, var(--text-dark) 6%, var(--surface))" : `color-mix(in srgb, ${tone} ${on ? 16 : 12}%, var(--surface))`,
          border: `${B}px solid ${ended ? "var(--hairline)" : tone}`,
          backgroundImage: state === "tripped" ? "repeating-linear-gradient(135deg, transparent 0 4px, color-mix(in srgb, var(--orange) 26%, transparent) 4px 6px)" : undefined,
          boxShadow: "inset 0 1px 2px rgba(0,0,0,0.18)",
          opacity: busy ? 0.6 : 1,
        }}>
          <span aria-hidden className="absolute w-[2px] rounded-full" style={{ left: iw / 2 - 1, top: pad + 2, bottom: pad + 2, background: "color-mix(in srgb, var(--text-dark) 12%, transparent)" }} />
          <motion.span aria-hidden className="absolute rounded-[5px]" style={{ left: pad, width: z.k, height: z.k, background: ended ? "color-mix(in srgb, var(--text-dark) 22%, var(--surface))" : tone, boxShadow: "0 1px 0 rgba(255,255,255,0.18) inset, 0 2px 4px rgba(0,0,0,0.25)" }}
            initial={false} animate={{ top: on ? pad : pad + travel }}
            transition={m.reduced ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 26, mass: 0.7 }} />
        </span>

        {/* the lockout ring: it fills on the hold's own clock, and runs back
            fast when the hand lets go */}
        {onLockout && !ended && (
          <svg aria-hidden className="absolute pointer-events-none" style={{ left: -4, top: -4, width: z.w + 8, height: z.h + 8, overflow: "visible" }}>
            <rect x="1.5" y="1.5" width={z.w + 5} height={z.h + 5} rx={r + 3.5} fill="none" stroke="var(--orange)" strokeWidth="2.5" pathLength={1}
              strokeDasharray="1" style={{ strokeDashoffset: holding ? 0 : 1, opacity: holding ? 1 : 0,
                transition: holding ? `stroke-dashoffset ${LOCKOUT_MS}ms linear, opacity 120ms ease` : "stroke-dashoffset 200ms cubic-bezier(0.23, 1, 0.32, 1), opacity 200ms ease" }} />
          </svg>
        )}

        {/* the padlock, on the handle, once it is locked out */}
        {ended && (
          <motion.span aria-hidden className="absolute left-1/2 inline-flex items-center justify-center rounded-full"
            style={{ width: z.lock + 8, height: z.lock + 8, marginLeft: -(z.lock + 8) / 2, top: B + pad + travel + z.k / 2 - (z.lock + 8) / 2, background: "var(--surface)", boxShadow: "0 0 0 1px var(--hairline), 0 2px 6px rgba(0,0,0,0.25)", color: "var(--text-dark)" }}
            initial={dropIn ? { y: -z.h / 2, opacity: 0 } : false} animate={{ y: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 420, damping: 22 }}>
            <svg width={z.lock} height={z.lock} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7.5a4 4 0 0 1 8 0V11" />
            </svg>
          </motion.span>
        )}
      </span>
      {caption !== "none" && word}
    </button>
  );
}
