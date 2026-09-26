"use client";
import { useEffect, useRef } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useSpring } from "motion/react";

/* the trustset face: top bar, two orange eyes, bottom bar, on a tile that
 * follows the theme. drawn inline so the ink flips with the theme.
 *
 * it is a face, so it behaves like one. the eyes look towards the pointer, a
 * couple of units at most, on a soft spring, and drift back to the middle when
 * the pointer rests. now and then it blinks. every mark on the page shares one
 * pointer listener and one blink clock, so the header and the rail blink
 * together rather than out of step. with reduced motion it holds still.
 *
 * a mark can also wear the state of an agent: half closed eyes for a pause,
 * a flat line for a stop. the logo acts out the thing the product does. */
export type Mood = "awake" | "paused" | "stopped";

/* how far the eyes may travel inside the face, in the 48 unit drawing */
const REACH_X = 2.6, REACH_Y = 1.6;
/* the pointer has to be this far away (in css px) for the eyes to reach fully */
const FAR = 420;
/* back to the middle after the pointer has rested this long */
const REST_MS = 2200;

/* one pointer and one blink for every mark */
type Listener = (x: number, y: number) => void;
const lookers = new Set<Listener>();
const blinkers = new Set<() => void>();
let wired = false;
function wire() {
  if (wired || typeof window === "undefined") return;
  wired = true;
  let frame = 0, px = 0, py = 0;
  window.addEventListener("pointermove", e => {
    if (e.pointerType !== "mouse") return;
    px = e.clientX; py = e.clientY;
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; lookers.forEach(f => f(px, py)); });
  }, { passive: true });
  const next = () => setTimeout(() => { blinkers.forEach(f => f()); next(); }, 4000 + Math.random() * 4000);
  next();
}

export default function Mark({ size = 22, mood = "awake", alive = true }: { size?: number; mood?: Mood;
  /* false for a mark that should sit still, such as one drawn into a card */
  alive?: boolean }) {
  const still = !!useReducedMotion() || !alive;
  const box = useRef<SVGSVGElement>(null);
  const tx = useMotionValue(0), ty = useMotionValue(0);
  const x = useSpring(tx, { stiffness: 170, damping: 22, mass: 0.6 });
  const y = useSpring(ty, { stiffness: 170, damping: 22, mass: 0.6 });
  const lid = useMotionValue(1);
  const moodRef = useRef(mood);
  moodRef.current = mood;
  /* the height the eyes rest at for this mood */
  /* a stopped face is a line, kept thick enough to read at the header size */
  const open = mood === "stopped" ? 0.3 : mood === "paused" ? 0.5 : 1;

  useEffect(() => { if (!still) animate(lid, open, { duration: 0.22, ease: [0.23, 1, 0.32, 1] }); else lid.set(open); }, [open, still, lid]);

  useEffect(() => {
    if (still) { tx.set(0); ty.set(0); return; }
    wire();
    let rest: ReturnType<typeof setTimeout> | null = null;
    const look: Listener = (px, py) => {
      const r = box.current?.getBoundingClientRect(); if (!r) return;
      /* a stopped face does not look around */
      if (moodRef.current === "stopped") { tx.set(0); ty.set(0); return; }
      const dx = px - (r.left + r.width / 2), dy = py - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / FAR);
      tx.set((dx / d) * REACH_X * k); ty.set((dy / d) * REACH_Y * k);
      if (rest) clearTimeout(rest);
      rest = setTimeout(() => { tx.set(0); ty.set(0); }, REST_MS);
    };
    /* a blink closes the lids to a line and opens them to where the mood
       holds them; a stopped face has nothing to blink */
    const blink = () => {
      if (moodRef.current === "stopped") return;
      const back = moodRef.current === "paused" ? 0.5 : 1;
      animate(lid, [back, 0.1, back], { duration: 0.16, times: [0, 0.45, 1], ease: "easeInOut" });
    };
    lookers.add(look); blinkers.add(blink);
    return () => { lookers.delete(look); blinkers.delete(blink); if (rest) clearTimeout(rest); };
  }, [still, tx, ty, lid]);

  return (
    <svg ref={box} width={size} height={size} viewBox="0 0 48 48" aria-label="trustset" className="shrink-0" style={{ overflow: "visible" }}>
      <rect width="48" height="48" rx="10" fill="var(--text-dark)" />
      <rect x="12" y="13" width="24" height="5" fill="var(--bg-base)" />
      {/* the eyes: they move together, and the lids scale from each eye's middle */}
      <motion.g style={{ x, y }}>
        <motion.rect x="12" y="22" width="9" height="6" fill="var(--orange)" style={{ scaleY: lid, transformBox: "fill-box", originY: "50%" }} />
        <motion.rect x="27" y="22" width="9" height="6" fill="var(--orange)" style={{ scaleY: lid, transformBox: "fill-box", originY: "50%" }} />
      </motion.g>
      <rect x="12" y="32" width="24" height="5" fill="var(--bg-base)" />
    </svg>
  );
}
