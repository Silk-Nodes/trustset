"use client";
import { type Variants, motion } from "motion/react";

/* one icon per claim on the "do not take our word for it" tiles, each acting
 * out its claim when the tile is hovered: the key turns and comes back, the
 * contract's lines write in, the refusal is drawn, the fingerprint is scanned,
 * the guardians step up, the lock drops shut. same stroke and scale as the
 * rail's icons (after AnimateIcons, MIT), driven by the tile rather than the
 * icon, because the tile is what the pointer is on. */
const S = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
const out = [0.23, 1, 0.32, 1] as const;
const at = (x: number, y: number) => ({ transformBox: "view-box" as const, originX: `${x}px`, originY: `${y}px` });
const draw = (delay = 0): Variants => ({ rest: { pathLength: 1, opacity: 1 }, hover: { pathLength: [0, 1], opacity: [0, 1], transition: { duration: 0.4, delay, ease: out } } });

/* 01 we never hold a key that can spend: the key turns in the lock and back */
const turn: Variants = { rest: { rotate: 0 }, hover: { rotate: [0, -35, 0], transition: { duration: 0.6, ease: out } } };
function Key() {
  return (
    <svg {...S}>
      <motion.g variants={turn} style={at(8, 16)}>
        <circle cx="8" cy="16" r="4" /><path d="M11 13l9-9M16.5 7.5l2.5 2.5M18.5 5.5l2 2" />
      </motion.g>
    </svg>
  );
}

/* 02 a contract, not our server: the page's clauses write themselves in */
function Contract() {
  return (
    <svg {...S}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" />
      <motion.path d="M8.5 12h7" variants={draw(0)} />
      <motion.path d="M8.5 15h7" variants={draw(0.08)} />
      <motion.path d="M8.5 18h4" variants={draw(0.16)} />
    </svg>
  );
}

/* 03 refused inside the venue's own call: the bar is drawn across */
function Refused() {
  const ring: Variants = { rest: { scale: 1 }, hover: { scale: [1, 0.92, 1], transition: { duration: 0.35, ease: out } } };
  return (
    <svg {...S}>
      <motion.circle cx="12" cy="12" r="8.5" variants={ring} style={at(12, 12)} />
      <motion.path d="M6 6l12 12" variants={draw(0.12)} />
    </svg>
  );
}

/* 04 the passkey never leaves your phone: a line scans down the print */
const scan: Variants = { rest: { y: 0, opacity: 0 }, hover: { y: [-9, 9], opacity: [0, 1, 1, 0], transition: { duration: 0.7, ease: "easeInOut" } } };
function Print() {
  return (
    <svg {...S}>
      {/* lucide's fingerprint (ISC) */}
      <path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" /><path d="M14 13.12c0 2.38 0 6.38-1 8.88" />
      <path d="M17.29 21.02c.12-.6.43-2.3.5-3.02" /><path d="M2 12a10 10 0 0 1 18-6" /><path d="M2 16h.01" />
      <path d="M21.8 16c.2-2 .131-5.354 0-6" /><path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2" />
      <path d="M8.65 22c.21-.66.45-1.32.57-2" /><path d="M9 6.8a6 6 0 0 1 9 5.2v2" />
      <motion.path d="M4 12h16" variants={scan} style={{ color: "var(--orange)" }} />
    </svg>
  );
}

/* 05 guardians pause, they cannot take it: the two step up, one after the other */
const step = (delay: number): Variants => ({ rest: { y: 0 }, hover: { y: [0, -2, 0], transition: { duration: 0.4, delay, ease: out } } });
function Guardians() {
  return (
    <svg {...S}>
      <motion.g variants={step(0)}><circle cx="9" cy="8" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /></motion.g>
      <motion.g variants={step(0.1)}><circle cx="16.5" cy="9" r="2.5" /><path d="M15.5 14.2A4.5 4.5 0 0 1 21 18.5" /></motion.g>
    </svg>
  );
}

/* 06 stopped for good stays stopped: the shackle lifts and drops shut */
const shackle: Variants = { rest: { y: 0 }, hover: { y: [0, -2.5, 0], transition: { duration: 0.45, times: [0, 0.4, 1], ease: out } } };
const body: Variants = { rest: { scale: 1 }, hover: { scale: [1, 1, 0.94, 1], transition: { duration: 0.45, times: [0, 0.6, 0.8, 1] } } };
function Lock() {
  return (
    <svg {...S}>
      <motion.path d="M8 11V7.5a4 4 0 0 1 8 0V11" variants={shackle} />
      <motion.rect x="5" y="11" width="14" height="10" rx="2" variants={body} style={at(12, 16)} />
      <circle cx="12" cy="16" r="1" />
    </svg>
  );
}

export const CLAIM_ICONS = [Key, Contract, Refused, Print, Guardians, Lock];

/* the icon for tile i, playing while the tile is hot. still under reduced
   motion: the tile passes hot as false. */
export function ClaimIcon({ i, hot }: { i: number; hot: boolean }) {
  const Icon = CLAIM_ICONS[i] ?? Key;
  return (
    <motion.span className="inline-flex" initial="rest" animate={hot ? "hover" : "rest"}
      style={{ color: hot ? "var(--text-dark)" : "var(--text-medium)", transition: "color .2s" }}>
      <Icon />
    </motion.span>
  );
}
