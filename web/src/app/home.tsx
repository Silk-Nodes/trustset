"use client";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import Replay from "@/components/agents/Replay";
import { useMotionPrefs } from "@/lib/motion";
import { OneLine } from "@/components/landing/Sections";
import Footer from "@/components/Footer";
import { Why, HowItWorks } from "@/components/landing/Story";
import { Day } from "@/components/landing/Day";
import { Checks } from "@/components/landing/Moments";
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
          The trust stack<br /><span style={{ color: "var(--dim)" }}>for AI agents.</span>
        </motion.h1>
        <motion.p initial={m.reduced ? { opacity: 0 } : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={m.reduced ? { duration: 0.2 } : { duration: 0.7, ease: [0.23, 1, 0.32, 1], delay: 0.1 }}
          className="text-xl sm:text-2xl text-ink/70 mt-6 max-w-[40ch]">Your agent, on your switch. Like freezing a card from your phone: the card is your agent, and every shop on Monad that checks refuses it next block.</motion.p>
        <motion.div initial={m.reduced ? { opacity: 0 } : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={m.reduced ? { duration: 0.2 } : { duration: 0.7, ease: [0.23, 1, 0.32, 1], delay: 0.18 }} className="flex gap-2 mt-8">
          {/* the walkthrough explains the product better than this page does, so
              it takes the accented button. somebody who already has agents knows
              where the console is. */}
          <Link href="/demo" className="drawn-btn btn-orange" style={{ padding: "13px 24px", fontSize: "0.95rem" }}>Try it on testnet</Link>
          <Link href="/agents" className="drawn-btn btn-gold" style={{ padding: "13px 20px", fontSize: "0.95rem" }}>See your agents</Link>
        </motion.div>
        {/* the facts under the buttons, where every infrastructure page puts its
            proof. the others put logos or a volume figure there. we have neither
            honestly, so this is what is true: layers, the shape of each one, the
            suite, and where it runs. plain mono, no chips, no dots. */}
        <motion.p initial={m.reduced ? { opacity: 0 } : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={m.reduced ? { duration: 0.2 } : { duration: 0.7, ease: [0.23, 1, 0.32, 1], delay: 0.26 }}
          className="mono text-[12px] sm:text-[13px] tabular mt-7 sm:mt-8 flex flex-wrap items-center gap-x-3 gap-y-1.5" style={{ color: "var(--text-medium)" }}>
          {/* each dot rides with the word before it, so a wrapped line never opens on a dot */}
          <span className="whitespace-nowrap">Eight layers<span aria-hidden> ·</span></span><span className="whitespace-nowrap">Immutable, no admin<span aria-hidden> ·</span></span><span className="whitespace-nowrap">128,000 fuzzed calls<span aria-hidden> ·</span></span><span className="whitespace-nowrap">Monad testnet</span>
        </motion.p>
      </div>

      <Reveal delay={0.25}><Replay /></Reveal>
      {/* the order is the story. you saw it work. here is why it has to exist.
          here is what it is, in three lines. here are the three answers to the
          three problems, as slides. here is the chain saying so. here is the one
          thing an app has to do. and the claim again, to leave on. */}
      <Why />
      <HowItWorks />
      <Day />
      {/* the slides say when it would be you, which is the question somebody
          actually decides on. checks say why any of it should be believed, and
          come after, because a reader not yet convinced will not read proof. */}
      <Checks />
      <OneLine />
      </div>
    </main>
    <Footer close />
    </div>
  );
}
