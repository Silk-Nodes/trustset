"use client";
import { motion } from "motion/react";
import { useMotionPrefs } from "@/lib/motion";
/* the one control that matters. orange, one word, becomes a stamp once used. */
export default function StopButton({ state, onClick, size = "md" }: { state: "ready" | "busy" | "done"; onClick?: () => void; size?: "sm" | "md" | "lg" }) {
  const m = useMotionPrefs();
  const pad = size === "lg" ? "14px 28px" : size === "sm" ? "6px 12px" : "9px 18px";
  const fs = size === "lg" ? "1rem" : size === "sm" ? "0.78rem" : "0.875rem";
  if (state === "done") return <span className="mono text-[11px] uppercase tracking-[0.12em]" style={{ color: "var(--orange-text)" }}>Stopped</span>;
  return (
    <motion.button type="button" onClick={onClick} disabled={state === "busy"} whileTap={m.reduced ? undefined : { scale: 0.96 }}
      className="drawn-btn btn-orange" style={{ padding: pad, fontSize: fs }}>
      {state === "busy" ? "Stopping" : "Stop"}
    </motion.button>
  );
}
