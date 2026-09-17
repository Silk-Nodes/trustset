"use client";
import { useReducedMotion } from "motion/react";

/* Motion tokens, and the one switch that turns all of it off.
 *
 * Nothing in this app honoured prefers-reduced-motion before: springs,
 * AnimatePresence, hover animations and fifteen animated icons all ran
 * regardless of what the reader had asked their OS for. Every transition
 * added here reads `reduced` and collapses to an instant state change
 * rather than a shorter one, because a fast animation is still an
 * animation to someone who gets motion sick from it.
 *
 * Durations live here so they stop being retyped per component. The
 * numbers are deliberately short: this is a data dashboard, and motion
 * that outlasts a glance is motion that delays reading a number. */
export const DUR = { fast: 0.14, base: 0.22, slow: 0.34 } as const;

/* One spring, used everywhere something travels a distance. Matches the
   feel already shipping in AIToggle so the nav pill and the mode toggle
   are visibly the same object. */
export const SPRING = { type: "spring" as const, stiffness: 500, damping: 35 };

export function useMotionPrefs() {
  const reduced = useReducedMotion();
  return {
    reduced: !!reduced,
    /* Spread into a motion component: with reduced motion the transition
       has no duration, so the element snaps to its final state. */
    t: (d: number = DUR.base) => (reduced ? { duration: 0 } : { duration: d, ease: [0.22, 1, 0.36, 1] as const }),
    spring: () => (reduced ? { duration: 0 } : SPRING),
  };
}
