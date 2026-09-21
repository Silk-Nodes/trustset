"use client";
import { motion } from "motion/react";
import type { Status } from "@/lib/chain";
/* one dot, four meanings. active breathes, revoked is orange and still.
   an agent whose end date passed or whose heartbeat lapsed is still Active in
   the contract but is not trusted, so it must not breathe like one that is.

   `live` has no default on purpose. it used to default to true, and every
   caller that forgot it drew a breathing green dot for an agent nothing would
   serve. making it required turns that omission into a build error instead of
   a page that lies quietly. */
export default function StatusDot({ status, size = 10, live }: { status: Status; size?: number; live: boolean }) {
  const on = status === "active" && live;
  const color = on ? "var(--sage)" : status === "active" || status === "paused" ? "var(--terra)" : status === "revoked" ? "var(--orange)" : "var(--text-light)";
  return (
    <span className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      {on && <motion.span className="absolute inset-0 rounded-full" style={{ background: color }} animate={{ scale: [1, 2.1], opacity: [0.45, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }} />}
      <span className="rounded-full" style={{ width: size, height: size, background: color }} />
    </span>
  );
}
