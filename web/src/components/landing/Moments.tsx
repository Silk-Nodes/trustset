"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { useMotionPrefs } from "@/lib/motion";
import { useArrived } from "@/hooks/useArrived";

/* the claims, and where each one can be checked.
 *
 * every product promises it is safe and the reader either believes it or does
 * not. a switch that lives in a contract can be read, which is the one
 * advantage this page has over a normal one, and the section should look like
 * that advantage rather than like a grid of reassurances.
 *
 * so it is a window, in the same chrome as the product's window above, with
 * something real at its head: the block the chain is on right now, read from
 * the same endpoint the header strip uses, refreshed while you watch. nothing
 * in it pretends to run a check. the rows are the six claims and the artifact
 * where each one can be verified, and the live line is there so the window is
 * demonstrably connected to the thing it is talking about rather than being a
 * picture of one. if the chain cannot be reached it says so, in words, instead
 * of showing a plausible number. */
const EASE = [0.23, 1, 0.32, 1] as const;

type Check = { claim: string; line: string; where: string; href?: string };
const CHECKS: Check[] = [
  { claim: "We never hold a key that can spend", line: "Your agent key and your cold key never leave you.", where: "KillSwitch.sol" },
  { claim: "A contract, not our server", line: "One view call against Monad, with nothing of ours in the path.", where: "0x54D8…D3b8", href: "https://testnet.monadexplorer.com/address/0x54D8211233Cc65b62C594cBAb900930dd37ED3b8" },
  { claim: "Refused inside the venue's own call", line: "The check and the action are the same transaction.", where: "Try it on testnet", href: "/demo" },
  { claim: "The passkey never leaves your phone", line: "Only the public half goes on chain, bound to this site.", where: "Nominate one", href: "/passkey" },
  { claim: "Guardians pause. They cannot take it", line: "A handover takes a threshold plus a delay you can refuse.", where: "Recovery.t.sol" },
  { claim: "Stopped for good stays stopped", line: "128,000 fuzzed calls a run try to undo it and cannot.", where: "Invariants.t.sol" },
];

type Live = { block: number; chain?: string; asOf: string };

export function Checks() {
  const m = useMotionPrefs();
  const { ref, arrived } = useArrived("-100px 0px");
  const [live, setLive] = useState<Live | null>(null);
  const [down, setDown] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  /* the same read the header makes, on the same cadence, and a failure is
     shown rather than papered over: a dead dependency must never look like a
     healthy number. */
  useEffect(() => {
    let alive = true;
    const pull = async () => {
      try {
        const r = await fetch("/api/live", { cache: "no-store" });
        const j = await r.json();
        if (alive && typeof j.block === "number") { setLive(j); setDown(false); }
        else if (alive) setDown(true);
      } catch { if (alive) setDown(true); }
    };
    pull(); const t = setInterval(pull, 6000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const ago = live ? Math.max(0, Math.round((now - new Date(live.asOf).getTime()) / 1000)) : null;

  return (
    <section ref={ref as React.RefObject<HTMLElement>} className="mt-24 sm:mt-36">
      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] gap-8 lg:gap-14 items-start">
        <div className="max-w-xl lg:sticky lg:top-24">
          <h2 className="text-[34px] sm:text-[46px] lg:text-[54px] font-semibold tracking-[-0.03em] leading-[1.04]">
            Do not take our word for it.
          </h2>
          <p className="text-[17px] sm:text-[19px] text-ink/70 mt-4 max-w-[40ch]">
            Every product promises it is safe. A switch that lives in a contract can be read instead. Six claims, and where to check each one.
          </p>
          <p className="text-[13px] mt-6 max-w-[44ch]" style={{ color: "var(--text-medium)" }}>
            <span className="font-semibold" style={{ color: "var(--text-dark)" }}>The limit, in AUDIT.md rather than hidden.</span>{" "}
            A switch only binds an agent that checks it, or a venue that checks it for them. It does not save you from an agent that has been taken over and rewritten.
          </p>
        </div>

        {/* the window. same chrome as the product's window in the rail, so it
            reads as a surface of the product and not a marketing block. */}
        <motion.div className="min-w-0 rounded-[28px] p-2" style={{ background: "color-mix(in srgb, var(--text-dark) 5%, transparent)", border: "1px solid var(--hairline)" }}
          initial={m.reduced ? { opacity: 0 } : { opacity: 0, y: 14 }}
          animate={arrived ? { opacity: 1, y: 0 } : undefined}
          transition={m.reduced ? { duration: 0.2 } : { duration: 0.55, ease: EASE }}>
          <div className="flex items-center gap-1.5 px-3 py-2">
            {[0, 1, 2].map(d => <span key={d} className="w-2 h-2 rounded-full" style={{ background: "var(--hairline)" }} />)}
            <span className="ml-3 mono text-[11px]" style={{ color: "var(--text-medium)" }}>trustset · what you can check</span>
          </div>
          <div className="drawn-box overflow-clip">
            {/* the live line. real, refreshed every six seconds, and honest when it cannot be. */}
            <div className="px-4 sm:px-5 py-3 flex items-center gap-3 text-sm" style={{ borderBottom: "1px solid var(--hairline)" }}>
              <span className="relative inline-flex w-2.5 h-2.5 shrink-0">
                {live && !down && !m.reduced && (
                  <motion.span aria-hidden className="absolute inset-0 rounded-full" style={{ background: "var(--sage)" }}
                    animate={{ scale: [1, 2.4], opacity: [0.45, 0] }} transition={{ duration: 1.9, repeat: Infinity, ease: "easeOut" }} />
                )}
                <span className="relative w-2.5 h-2.5 rounded-full" style={{ background: down ? "var(--orange)" : live ? "var(--sage)" : "var(--hairline)", transition: "background .3s" }} />
              </span>
              <span className="mono text-xs">{down ? "could not reach the chain" : live ? "Monad testnet" : "reading the chain…"}</span>
              {live && !down && (
                <span className="ml-auto mono text-[11px] tabular" style={{ color: "var(--text-medium)" }}>
                  block {live.block}{ago !== null ? ` · ${ago}s ago` : ""}
                </span>
              )}
            </div>

            <ol>
              {CHECKS.map((c, i) => {
                const link = c.href ? (c.href.startsWith("/")
                  ? <Link href={c.href} className="mono text-[12px] whitespace-nowrap" style={{ color: "var(--orange-text)" }}>{c.where} →</Link>
                  : <a href={c.href} target="_blank" rel="noreferrer" className="mono text-[12px] whitespace-nowrap" style={{ color: "var(--orange-text)" }}>{c.where} ↗</a>)
                  : <span className="mono text-[12px] whitespace-nowrap" style={{ color: "var(--text-medium)" }}>{c.where}</span>;
                return (
                  <motion.li key={c.claim}
                    className="grid grid-cols-[28px_minmax(0,1fr)] sm:grid-cols-[28px_minmax(0,1fr)_auto] gap-x-3 gap-y-1 items-baseline px-4 sm:px-5 py-3.5 transition-colors hover:bg-[color-mix(in_srgb,var(--text-dark)_4%,transparent)]"
                    style={{ borderBottom: i < CHECKS.length - 1 ? "1px solid var(--hairline)" : undefined }}
                    initial={m.reduced ? { opacity: 0 } : { opacity: 0, x: -8 }}
                    animate={arrived ? { opacity: 1, x: 0 } : undefined}
                    transition={m.reduced ? { duration: 0.2 } : { duration: 0.45, ease: EASE, delay: 0.12 + 0.07 * i }}>
                    <span className="mono text-[11px] tabular" style={{ color: "var(--text-medium)" }}>{String(i + 1).padStart(2, "0")}</span>
                    <div className="min-w-0">
                      <div className="text-[14.5px] font-semibold tracking-[-0.01em] leading-[1.3]">{c.claim}</div>
                      <div className="text-[12.5px] mt-0.5" style={{ color: "var(--text-medium)" }}>{c.line}</div>
                    </div>
                    <div className="col-start-2 sm:col-start-auto">{link}</div>
                  </motion.li>
                );
              })}
            </ol>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
