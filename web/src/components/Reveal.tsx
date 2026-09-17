"use client";
import { motion } from "motion/react";
import { useMotionPrefs } from "@/lib/motion";
import { useArrived } from "@/hooks/useArrived";

/* scroll reveal, once, from a visible-enough start: 14px and a strong ease-out,
   so it reads as "arrived" rather than "flew in". useArrived carries the rule
   that nothing stays invisible after a jump. */
const EASE = [0.23, 1, 0.32, 1] as const;

export function Reveal({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const m = useMotionPrefs();
  const { ref, arrived } = useArrived();
  return (
    <motion.div ref={ref as React.RefObject<HTMLDivElement>} className={className}
      initial={m.reduced ? { opacity: 0 } : { opacity: 0, y: 14 }}
      animate={arrived ? { opacity: 1, y: 0 } : undefined}
      transition={m.reduced ? { duration: 0.2 } : { duration: 0.55, ease: EASE, delay }}>
      {children}
    </motion.div>
  );
}
