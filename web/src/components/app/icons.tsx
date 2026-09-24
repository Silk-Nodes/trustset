"use client";
import { type Variants, motion } from "motion/react";

/* the rail's icons, each with a small hover gesture.
 *
 * the choreography follows AnimateIcons (animateicons.in, MIT, lucide paths
 * under ISC), rewritten for this rail: there each icon animates when the icon
 * itself is hovered, here the whole row is the target, so the icons take the
 * variants "rest" and "hover" from the link around them. shorter and quieter
 * than the originals too: a rail item is hovered many times a day, and a
 * gesture that runs a full second there reads as lag. nothing moves under
 * reduced motion; the link simply does not pass the variant down. */
const S = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
const O = { transformBox: "view-box" as const, originX: "12px", originY: "12px" };
const out = [0.23, 1, 0.32, 1] as const;

/* agents: the antenna rises and the eyes blink, the robot looking up */
const antenna: Variants = { rest: { y: 0 }, hover: { y: [0, -1.5, 0], transition: { duration: 0.45, ease: out } } };
const eyes: Variants = { rest: { scaleY: 1 }, hover: { scaleY: [1, 0.1, 1], transition: { duration: 0.3, delay: 0.1 } } };
export function IconAgents() {
  return (
    <svg {...S}>
      <rect x="4" y="7" width="16" height="12" rx="3" />
      <motion.path d="M9 12h.01M15 12h.01" variants={eyes} style={{ transformBox: "view-box", originX: "12px", originY: "12px" }} />
      <motion.path d="M12 3v4" variants={antenna} />
    </svg>
  );
}

/* guarding: the shield draws itself and the check lands after it */
const shield: Variants = { rest: { pathLength: 1, scale: 1 }, hover: { pathLength: [0.2, 1], scale: [1, 0.96, 1], transition: { duration: 0.5, ease: out } } };
const check: Variants = { rest: { pathLength: 1, opacity: 1 }, hover: { pathLength: [0, 1], opacity: [0, 1], transition: { duration: 0.3, delay: 0.25, ease: out } } };
export function IconShield() {
  return (
    <svg {...S}>
      <motion.path d="M12 3l7 3v6c0 4-3 7.5-7 9-4-1.5-7-5-7-9V6l7-3z" variants={shield} style={O} />
      <motion.path d="M9 12l2 2 4-4" variants={check} />
    </svg>
  );
}

/* refunds: the arc winds back, the way the money does */
const wind: Variants = { rest: { rotate: 0 }, hover: { rotate: [0, -300, -360], transition: { duration: 0.6, ease: out, times: [0, 0.8, 1] } } };
export function IconRefund() {
  return (
    <motion.svg {...S} variants={wind} style={O}>
      <path d="M4 12a8 8 0 1 0 3-6.2" /><path d="M4 4v4h4" />
    </motion.svg>
  );
}

/* explorer and search: the lens looks around */
const lens: Variants = { rest: { x: 0, y: 0, rotate: 0 }, hover: { x: [0, 1.5, -1.5, 0], y: [0, -1, 1, 0], rotate: [0, 8, -6, 0], transition: { duration: 0.5, ease: "easeInOut" } } };
export function IconSearch() {
  return (
    <svg {...S}>
      <motion.g variants={lens} style={O}><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></motion.g>
    </svg>
  );
}

/* the rail's pin: the divider slides to where the rail will be */
const divider: Variants = { rest: { x: 0 }, hover: { x: [0, 2, 0], transition: { duration: 0.35, ease: out } } };
export function IconPin({ on }: { on: boolean }) {
  return (
    <svg {...S}>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <motion.path d="M10 4v16" strokeDasharray={on ? undefined : "2 2.5"} variants={divider} />
    </svg>
  );
}

/* try it: the play mark steps forward, like pressing go */
const go: Variants = { rest: { x: 0 }, hover: { x: [0, 2.5, 0], transition: { duration: 0.4, ease: out } } };
export function IconTry() {
  return (
    <svg {...S}>
      <circle cx="12" cy="12" r="9" />
      <motion.path d="M10 8.5l5 3.5-5 3.5z" variants={go} />
    </svg>
  );
}

/* docs: the lines of the open page write themselves in */
const line = (i: number): Variants => ({ rest: { pathLength: 1, opacity: 1 }, hover: { pathLength: [0, 1], opacity: [0, 1], transition: { duration: 0.25, delay: 0.08 * i, ease: out } } });
export function IconDocs() {
  return (
    <svg {...S}>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z" />
      <path d="M13 4h5.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H13z" />
      <motion.path d="M6.5 8h2" variants={line(0)} />
      <motion.path d="M6.5 11h2" variants={line(1)} />
      <motion.path d="M15.5 8h2" variants={line(2)} />
      <motion.path d="M15.5 11h2" variants={line(3)} />
    </svg>
  );
}

/* faq: the question mark tilts, the way a head does when asking */
const tilt: Variants = { rest: { rotate: 0 }, hover: { rotate: [0, -14, 8, 0], transition: { duration: 0.5, ease: "easeInOut" } } };
export function IconFaq() {
  return (
    <svg {...S}>
      <circle cx="12" cy="12" r="9" />
      <motion.g variants={tilt} style={O}>
        <path d="M9.6 9.4a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.3-2.4 3.7" />
        <path d="M12 17h.01" />
      </motion.g>
    </svg>
  );
}
