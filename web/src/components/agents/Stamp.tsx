"use client";
import { motion } from "motion/react";
import { useMotionPrefs, DUR } from "@/lib/motion";
/* the record of the stop: appears once, stays. */
export default function Stamp({ block, href }: { block?: number; href?: string | null }) {
  const m = useMotionPrefs();
  return (
    <motion.div initial={m.reduced ? false : { opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={m.t(DUR.base)}
      className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs border" style={{ borderColor: "var(--orange)", color: "var(--text-dark)", background: "color-mix(in srgb, var(--orange) 8%, transparent)" }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--orange)" }} />
      <span className="tabular whitespace-nowrap">Revoked{block ? ` at block ${block}` : ""} · final two blocks later</span>
      {href && <a href={href} target="_blank" rel="noreferrer" className="underline" style={{ color: "var(--orange-text)" }}>tx</a>}
    </motion.div>
  );
}
