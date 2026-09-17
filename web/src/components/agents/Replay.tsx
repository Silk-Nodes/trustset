"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import StatusDot from "@/components/agents/StatusDot";
import StopButton from "@/components/agents/StopButton";
import Stamp from "@/components/agents/Stamp";
import { useMotionPrefs, DUR } from "@/lib/motion";

/* the agents page, replayed on a loop.
 *
 * three sample agents, one of them trading, the owner presses stop, the next
 * block refuses it. it is the landing page's opening and it is also what the
 * agents page shows a reader with no wallet, instead of a blank column: with
 * `sample` set it says so, plainly, in a badge, because these rows are not
 * chain state and the page must never let them pass for it. */
const ROWS = [
  { name: "Market maker #7", key: "0x90f7…b906" },
  { name: "Treasury sweeper #3", key: "0x15d3…6a65" },
  { name: "Research bot #12", key: "0x9965…a4dc" },
];

export default function Replay({ sample = false }: { sample?: boolean }) {
  const m = useMotionPrefs();
  const [phase, setPhase] = useState<0 | 1 | 2 | 3>(0); // 0 trading, 1 stopping, 2 stopped, 3 confirmed
  const [trades, setTrades] = useState(0);
  const [refused, setRefused] = useState(0);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const run = () => {
      setPhase(0); setTrades(0); setRefused(0);
      const ticks = setInterval(() => setTrades(x => x + 1), 700);
      t = setTimeout(() => { clearInterval(ticks); setPhase(1);
        t = setTimeout(() => { setPhase(2);
          const r = setInterval(() => setRefused(x => x + 1), 700);
          t = setTimeout(() => { setPhase(3);
            t = setTimeout(() => { clearInterval(r); run(); }, 3600);
          }, 900);
        }, 700);
      }, 3200);
    };
    run();
    return () => clearTimeout(t);
  }, []);

  return (
    /* fills whatever column it is put in, so a row that holds it and a card
       side by side gets one height for both. the footer line is pushed to
       the bottom and carries the sample badge, off the column headers. */
    <div className="drawn-box overflow-clip flex flex-col h-full" aria-label="the agents page, replayed">
      <div className="hidden sm:grid grid-cols-[18px_180px_1fr_110px_auto] gap-4 px-5 py-2.5" style={{ borderBottom: "1px solid var(--hairline)" }}>
        <span /><span className="eyebrow">agent</span><span className="eyebrow">last</span><span className="eyebrow text-right">since</span><span className="eyebrow">control</span>
      </div>
      {ROWS.map((r, i) => {
        const hero = i === 0;
        const status = hero ? (phase >= 2 ? "revoked" : "active") : "active";
        const last = hero
          ? (phase >= 2 ? (refused ? `Trade refused on chain · ${refused}` : "Revoked by owner") : `Traded on venue · ${trades}`)
          : i === 1 ? "Swept 1,240 USDC to treasury" : "Idle";
        return (
          <div key={r.name} className="grid grid-cols-[18px_1fr_auto] sm:grid-cols-[18px_180px_1fr_110px_auto] items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3.5"
            style={{ borderBottom: "1px solid var(--hairline)", background: hero && phase >= 1 ? "color-mix(in srgb, var(--orange) 6%, transparent)" : "transparent", transition: "background .3s" }}>
            <StatusDot status={status} />
            <div className="min-w-0"><div className="text-sm font-semibold truncate">{r.name}</div><div className="mono text-[11px] text-ink/70">{r.key}</div></div>
            <div className="hidden sm:block text-sm text-ink/70 truncate tabular">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span key={last} initial={m.reduced ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={m.t(DUR.fast)} className="inline-block">{last}</motion.span>
              </AnimatePresence>
            </div>
            <div className="hidden sm:block mono text-xs text-ink/70 tabular text-right">{hero ? (phase >= 2 ? "just now" : "2h ago") : i === 1 ? "14m ago" : "3d ago"}</div>
            <div>{hero ? <StopButton size="sm" state={phase === 1 ? "busy" : phase >= 2 ? "done" : "ready"} /> : <StopButton size="sm" state="ready" />}</div>
          </div>
        );
      })}
      <div className="px-4 sm:px-5 py-3 min-h-[52px] mt-auto flex items-center gap-3">
        <AnimatePresence>{phase === 3 && <Stamp key="s" block={165} />}</AnimatePresence>
        {phase < 3 && <span className="text-xs text-ink/70">{phase === 0 ? "An agent trading on its own" : phase === 1 ? "The owner presses stop" : "The next block already refuses it"}</span>}
        {sample && <span className="ml-auto eyebrow rounded-full px-2 py-1" style={{ background: "color-mix(in srgb, var(--orange) 16%, transparent)", color: "var(--orange-text)" }}>sample</span>}
      </div>
    </div>
  );
}
