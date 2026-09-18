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
 * so it is a window, in the same chrome as the product's window above, six
 * tiles of one size inside it, with something real at its head: the block the chain is on right now, read from
 * the same endpoint the header strip uses, refreshed while you watch. nothing
 * in it pretends to run a check. the rows are the six claims and the artifact
 * where each one can be verified, and the live line is there so the window is
 * demonstrably connected to the thing it is talking about rather than being a
 * picture of one. if the chain cannot be reached it says so, in words, instead
 * of showing a plausible number. */
const EASE = [0.23, 1, 0.32, 1] as const;

type Check = { claim: string; line: string; where: string; kind: "contract" | "on chain" | "page" | "tests"; href?: string };
const CHECKS: Check[] = [
  /* every artifact opens today. the source and test files would be the
     better door for three of these, and they take it the day the repository
     is public; a filename with no link behind it is jargon, not evidence. */
  { claim: "We never hold a key that can spend", line: "Your agent key and your cold key never leave you.", where: "Read the docs", kind: "page", href: "/how" },
  { claim: "A contract, not our server", line: "One view call against Monad, with nothing of ours in the path.", where: "0x54D8…D3b8", kind: "on chain", href: "https://testnet.monadexplorer.com/address/0x54D8211233Cc65b62C594cBAb900930dd37ED3b8" },
  { claim: "Refused inside the venue's own call", line: "The check and the action are the same transaction.", where: "Try it on testnet", kind: "page", href: "/demo" },
  { claim: "The passkey never leaves your phone", line: "Only the public half goes on chain, bound to this site.", where: "Nominate one", kind: "page", href: "/passkey" },
  { claim: "Guardians pause. They cannot take it", line: "A handover takes a threshold plus a delay you can refuse.", where: "Watch a guardian vote", kind: "page", href: "/demo" },
  { claim: "Stopped for good stays stopped", line: "128,000 fuzzed calls a run try to undo it and cannot.", where: "Read every agent's history", kind: "on chain", href: "/explorer" },
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
      {/* heading on top like every other section on the page. the one cut of
          this that sat beside its window could never be as tall as it, and a
          column that ends halfway down the thing next to it is not side by
          side, it is a gap with a heading in it. */}
      <div className="max-w-4xl">
        <h2 className="text-[34px] sm:text-[46px] lg:text-[54px] font-semibold tracking-[-0.03em] leading-[1.04]">
          Do not take our word for it.
        </h2>
        <p className="text-[17px] sm:text-[19px] text-ink/70 mt-4 max-w-[52ch]">
          Every product promises it is safe. A switch that lives in a contract can be read instead. Six claims, and where to check each one.
        </p>
      </div>

      {/* the window, full width, in the same chrome as the product's window in
          the rail. the live line runs across the top and the six claims sit in
          it as tiles of one size, three across, then two, then one. dividers
          are drawn on every tile's right and bottom and the outer edge is
          clipped, which holds at any column count without knowing which tile
          is last in its row. */}
      <motion.div className="mt-8 sm:mt-10 min-w-0 rounded-[28px] p-2" style={{ background: "color-mix(in srgb, var(--text-dark) 5%, transparent)", border: "1px solid var(--hairline)" }}
        initial={m.reduced ? { opacity: 0 } : { opacity: 0, y: 14 }}
        animate={arrived ? { opacity: 1, y: 0 } : undefined}
        transition={m.reduced ? { duration: 0.2 } : { duration: 0.55, ease: EASE }}>
        <div className="flex items-center gap-1.5 px-3 py-2">
          {[0, 1, 2].map(d => <span key={d} className="w-2 h-2 rounded-full" style={{ background: "var(--hairline)" }} />)}
          <span className="ml-3 mono text-[11px]" style={{ color: "var(--text-medium)" }}>trustset · what you can check</span>
        </div>
        <div className="drawn-box overflow-clip">
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

          <div className="overflow-hidden">
            <ol className="grid sm:grid-cols-2 lg:grid-cols-3 -mr-px -mb-px" style={{ gridAutoRows: "1fr" }}>
              {CHECKS.map((c, i) => {
                const link = c.href ? (c.href.startsWith("/")
                  ? <Link href={c.href} className="mono text-[12px] whitespace-nowrap" style={{ color: "var(--orange-text)" }}>{c.where} →</Link>
                  : <a href={c.href} target="_blank" rel="noreferrer" className="mono text-[12px] whitespace-nowrap" style={{ color: "var(--orange-text)" }}>{c.where} ↗</a>)
                  : <span className="mono text-[12px] whitespace-nowrap" style={{ color: "var(--text-dark)" }}>{c.where}</span>;
                return (
                  <motion.li key={c.claim}
                    className="flex flex-col min-w-0 px-5 py-5 sm:px-6 sm:py-6 transition-colors hover:bg-[color-mix(in_srgb,var(--text-dark)_4%,transparent)]"
                    style={{ borderRight: "1px solid var(--hairline)", borderBottom: "1px solid var(--hairline)" }}
                    initial={m.reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
                    animate={arrived ? { opacity: 1, y: 0 } : undefined}
                    transition={m.reduced ? { duration: 0.2 } : { duration: 0.45, ease: EASE, delay: 0.12 + 0.06 * i }}>
                    <div className="flex items-center gap-2">
                      <span className="mono text-[11px] tabular" style={{ color: "var(--text-medium)" }}>{String(i + 1).padStart(2, "0")}</span>
                      <span className="mono text-[10px] uppercase tracking-[0.12em] rounded-full px-2 py-0.5" style={{ color: "var(--text-medium)", border: "1px solid var(--hairline)" }}>{c.kind}</span>
                    </div>
                    <h3 className="text-[16px] sm:text-[17px] font-semibold tracking-[-0.015em] leading-[1.3] mt-3 text-balance">{c.claim}</h3>
                    <p className="text-[13px] mt-1.5" style={{ color: "var(--text-medium)" }}>{c.line}</p>
                    <div className="mt-auto pt-4">{link}</div>
                  </motion.li>
                );
              })}
            </ol>
          </div>
        </div>
      </motion.div>

    </section>
  );
}
