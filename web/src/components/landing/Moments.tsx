"use client";
import Link from "next/link";
import { motion } from "motion/react";
import { useMotionPrefs } from "@/lib/motion";
import { useArrived } from "@/hooks/useArrived";

/* when you will need this, and what the switch never asks you to trust.
 *
 * the reference for the first of these is the "how X can help you" grid that
 * every horizontal tool ships: a card per errand the reader already has. it
 * works there because the product does dozens of unrelated jobs. trustset does
 * one, so twelve use-case cards would be the same four features wearing hats.
 *
 * what carries over is the shape of the question. not "what are the features"
 * but "when would this be me". trustset is insurance, and nobody buys insurance
 * from a feature list; they buy it from the moment they are dreading.
 *
 * the first cut of this section put those moments in an accordion and the
 * claims in a two by three grid of white cards, which is the most default pair
 * of components on the web: an faq and a feature grid. good content in a
 * settings page. both are built out of type and hairlines now, with no card
 * chrome at all, and they are deliberately unlike each other: the moments are
 * editorial, wide measure, large type, because each one is a scene. the claims
 * are a ledger, dense and monospaced on the right, because each one is
 * evidence and should look like a spec sheet rather than marketing.
 *
 * every moment maps to a call that exists and a page that proves it, so the
 * eyebrow is the function name rather than an invented category. */
const EASE = [0.23, 1, 0.32, 1] as const;

/* the claims, and where each one can be checked.
 *
 * the first cut of this gave every claim a paragraph, six of them, under a
 * section that was itself a repeat of the slides above. it read as a wall. one
 * line each now, side by side, with the artifact underneath, because a claim
 * you can check does not need a paragraph of reassurance: it needs the link. */
type Check = { claim: string; line: string; where: string; href?: string };

const CHECKS: Check[] = [
  { claim: "We never hold a key that can spend", line: "Your agent key and your cold key never leave you.", where: "KillSwitch.sol" },
  { claim: "A contract, not our server", line: "One view call against Monad, with nothing of ours in the path.", where: "0x54D8…D3b8", href: "https://testnet.monadexplorer.com/address/0x54D8211233Cc65b62C594cBAb900930dd37ED3b8" },
  { claim: "Refused inside the venue's own call", line: "The check and the action are the same transaction.", where: "Try it on testnet", href: "/demo" },
  { claim: "The passkey never leaves your phone", line: "Only the public half goes on chain, bound to this site.", where: "Nominate one", href: "/passkey" },
  { claim: "Guardians pause. They cannot take it", line: "A handover takes a threshold plus a delay you can refuse.", where: "Recovery.t.sol" },
  { claim: "Stopped for good stays stopped", line: "128,000 fuzzed calls a run try to undo it and cannot.", where: "Invariants.t.sol" },
];

export function Checks() {
  const m = useMotionPrefs();
  const { ref, arrived } = useArrived("-100px 0px");

  return (
    <section ref={ref as React.RefObject<HTMLElement>} className="mt-24 sm:mt-36">
      <div className="max-w-4xl">
        <h2 className="text-[34px] sm:text-[46px] lg:text-[54px] font-semibold tracking-[-0.03em] leading-[1.04]">
          Do not take our word for it.
        </h2>
        <p className="text-[17px] sm:text-[19px] text-ink/70 mt-4 max-w-[52ch]">
          A switch that lives in a contract can be read. Each claim, and where to check it.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-0 mt-8 sm:mt-10">
        {CHECKS.map((c, i) => {
          const link = c.href ? (c.href.startsWith("/")
            ? <Link href={c.href} className="mono text-[12px]" style={{ color: "var(--orange-text)" }}>{c.where} →</Link>
            : <a href={c.href} target="_blank" rel="noreferrer" className="mono text-[12px]" style={{ color: "var(--orange-text)" }}>{c.where} ↗</a>)
            : <span className="mono text-[12px]" style={{ color: "var(--text-medium)" }}>{c.where}</span>;
          return (
            <motion.div key={c.claim} className="py-5 sm:py-6 min-w-0" style={{ borderTop: "1px solid var(--hairline)" }}
              initial={m.reduced ? { opacity: 0 } : { opacity: 0, y: 10 }}
              animate={arrived ? { opacity: 1, y: 0 } : undefined}
              transition={m.reduced ? { duration: 0.2 } : { duration: 0.5, ease: EASE, delay: 0.05 * i }}>
              <div className="mono text-[11px] tabular" style={{ color: "var(--text-medium)" }}>{String(i + 1).padStart(2, "0")}</div>
              <h3 className="text-[17px] font-semibold tracking-[-0.015em] leading-[1.25] mt-2">{c.claim}</h3>
              <p className="text-[14px] mt-1.5" style={{ color: "var(--text-medium)" }}>{c.line}</p>
              <div className="mt-3">{link}</div>
            </motion.div>
          );
        })}
      </div>

      <p className="text-[13px] mt-8 max-w-[74ch]" style={{ color: "var(--text-medium)", borderTop: "1px solid var(--hairline)", paddingTop: "1.25rem" }}>
        <span className="font-semibold" style={{ color: "var(--text-dark)" }}>The limit, in AUDIT.md rather than hidden.</span>{" "}
        A switch only binds an agent that checks it, or a venue that checks it for them. It does not save you from an agent that has been taken over and rewritten.
      </p>
    </section>
  );
}
