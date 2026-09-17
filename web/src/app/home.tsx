"use client";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import Replay from "@/components/agents/Replay";
import { useMotionPrefs } from "@/lib/motion";
import { OneLine } from "@/components/landing/Sections";
import Footer from "@/components/Footer";
import { Why, HowItWorks, Features } from "@/components/landing/Story";
import { Reveal } from "@/components/Reveal";

/* the landing page argues the read side.
 *
 * the hook is still the owner pressing stop, because a button and a chain
 * refusing the next transaction is what lands in thirty seconds. but the
 * claim underneath it is the integrator's: one view call, no service, nothing
 * to sync. the check comes first now and the console replay is the proof. */

export default function Home() {
  const m = useMotionPrefs();

  return (
    <div className="relative">
    <main className="w-full max-w-6xl mx-auto px-3 sm:px-4 pt-10 sm:pt-16 pb-16 min-w-0 relative" style={{ zIndex: 1 }}>
      <div>
      <div className="max-w-4xl mb-10 sm:mb-14">
        <motion.h1 initial={m.reduced ? { opacity: 0 } : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={m.reduced ? { duration: 0.2 } : { duration: 0.7, ease: [0.23, 1, 0.32, 1] }}
          className="text-[44px] sm:text-[72px] lg:text-[88px] font-semibold tracking-[-0.035em] leading-[0.98]">
          Your AI agent,<br /><span style={{ color: "var(--dim)" }}>on your switch.</span>
        </motion.h1>
        <motion.p initial={m.reduced ? { opacity: 0 } : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={m.reduced ? { duration: 0.2 } : { duration: 0.7, ease: [0.23, 1, 0.32, 1], delay: 0.1 }}
          className="text-xl sm:text-2xl text-ink/70 mt-6 max-w-[40ch]">Like freezing a card from your phone. The card is your agent. Every shop that checks refuses it next block.</motion.p>
        <motion.div initial={m.reduced ? { opacity: 0 } : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={m.reduced ? { duration: 0.2 } : { duration: 0.7, ease: [0.23, 1, 0.32, 1], delay: 0.18 }} className="flex gap-2 mt-8">
          {/* the walkthrough explains the product better than this page does, so
              it takes the accented button. somebody who already has agents knows
              where the console is. */}
          <Link href="/demo" className="drawn-btn btn-orange" style={{ padding: "13px 24px", fontSize: "0.95rem" }}>Try it on testnet</Link>
          <Link href="/agents" className="drawn-btn btn-gold" style={{ padding: "13px 20px", fontSize: "0.95rem" }}>See your agents</Link>
        </motion.div>
      </div>

      <Reveal delay={0.25}><Replay /></Reveal>
      {/* the order is the story. you saw it work. here is why it has to exist.
          here is what it is, in three lines. here are the three answers to the
          three problems, as slides. here is the chain saying so. here is the one
          thing an app has to do. and the claim again, to leave on. */}
      <Why />
      <HowItWorks />
      <Features />
      <OneLine />
      </div>
    </main>
    <Footer close />
    </div>
  );
}
