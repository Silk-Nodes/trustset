"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import StatusDot from "@/components/agents/StatusDot";
import StopButton from "@/components/agents/StopButton";
import Stamp from "@/components/agents/Stamp";
import { useMotionPrefs, DUR } from "@/lib/motion";

/* the agents page, replayed on a loop, until the reader takes over.
 *
 * three sample agents, one of them trading, the owner presses stop, the next
 * block refuses it. it is the landing page's opening and it is also what the
 * agents page shows a reader with no wallet, instead of a blank column: with
 * `sample` set it says so, plainly, in a badge, because these rows are not
 * chain state and the page must never let them pass for it.
 *
 * the stop buttons are real. they used to be drawn and not wired, so a reader
 * who pressed one learned that the button does nothing, which is the opposite
 * of the page's claim. now any of the three stops its row: the loop yields,
 * the row goes busy, then stopped, then counts refusals, and the stamp lands.
 * a reset in the footer hands the loop back. */
const ROWS = [
  { name: "Market maker #7", key: "0x90f7…b906", unit: "trade", idle: (n: number) => (n ? `${n} ${n === 1 ? "trade" : "trades"} on venue` : "Trading"), since: "2h ago" },
  { name: "Treasury sweeper #3", key: "0x15d3…6a65", unit: "sweep", idle: () => "Swept 1,240 USDC to treasury", since: "14m ago" },
  { name: "Research bot #12", key: "0x9965…a4dc", unit: "call", idle: () => "Idle", since: "3d ago" },
];
type Phase = 0 | 1 | 2 | 3; // trading, stopping, stopped, confirmed
type Row = { phase: Phase; n: number };
const FRESH: Row[] = ROWS.map(() => ({ phase: 0, n: 0 }));

export default function Replay({ sample = false }: { sample?: boolean }) {
  const m = useMotionPrefs();
  const [rows, setRows] = useState<Row[]>(FRESH);
  const [auto, setAuto] = useState(true);
  const [run, setRun] = useState(0);
  /* two bags of timers. the loop's are cleared when it yields; the reader's
     survive that, because the loop yielding is exactly when they start. */
  type Bag = { t: ReturnType<typeof setTimeout>[]; i: ReturnType<typeof setInterval>[] };
  const loopBag = useRef<Bag>({ t: [], i: [] });
  const userBag = useRef<Bag>({ t: [], i: [] });
  const clear = (b: Bag) => { b.t.forEach(clearTimeout); b.i.forEach(clearInterval); b.t = []; b.i = []; };
  const later = (b: Bag, ms: number, f: () => void) => { b.t.push(setTimeout(f, ms)); };
  const every = (b: Bag, ms: number, f: () => void) => { b.i.push(setInterval(f, ms)); };
  const patch = (i: number, p: Partial<Row>) => setRows(rs => rs.map((r, k) => (k === i ? { ...r, ...p } : r)));

  /* the stop sequence for one row. the same shape whether the loop or the
     reader pressed it, so what the reader gets is exactly what they watched. */
  const stopRow = (b: Bag, i: number, then?: () => void) => {
    patch(i, { phase: 1 });
    later(b, 700, () => {
      patch(i, { phase: 2, n: 0 });
      every(b, 700, () => setRows(rs => rs.map((r, k) => (k === i && r.phase >= 2 ? { ...r, n: r.n + 1 } : r))));
      later(b, 900, () => { patch(i, { phase: 3 }); then?.(); });
    });
  };

  useEffect(() => {
    if (!auto) return;
    const b = loopBag.current;
    const loop = () => {
      clear(b);
      setRows(FRESH);
      every(b, 700, () => setRows(rs => rs.map((r, k) => (k === 0 && r.phase === 0 ? { ...r, n: r.n + 1 } : r))));
      later(b, 3200, () => stopRow(b, 0, () => later(b, 3600, loop)));
    };
    loop();
    return () => clear(b);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, run]);

  const press = (i: number) => {
    if (rows[i].phase !== 0) return;
    if (auto) {
      setAuto(false);
      /* the loop's timers go when it yields, so a row it left mid-stop would
         sit on "Stopping" for good. rewind anything still in flight. a row it
         already stopped stays stopped: that one is a finished state, and true. */
      setRows(rs => rs.map((r, k) => (k !== i && r.phase === 1 ? { phase: 0 as Phase, n: 0 } : r)));
    }
    stopRow(userBag.current, i);
  };
  const reset = () => { clear(userBag.current); setRows(FRESH); setAuto(true); setRun(x => x + 1); };

  const stamped = rows.some(r => r.phase === 3);
  const lead = rows[0];
  const note = !auto
    ? (rows.some(r => r.phase === 1) ? "The owner presses stop" : rows.some(r => r.phase >= 2) ? "The next block already refuses it" : "Press stop on any of them")
    : lead.phase === 0 ? "An agent trading on its own" : lead.phase === 1 ? "The owner presses stop" : "The next block already refuses it";

  return (
    /* fills whatever column it is put in, so a row that holds it and a card
       side by side gets one height for both. the footer line is pushed to
       the bottom and carries the sample badge, off the column headers. */
    <div className="drawn-box overflow-clip flex flex-col h-full" aria-label="the agents page, replayed">
      <div className="hidden sm:grid grid-cols-[18px_180px_1fr_110px_auto] gap-4 px-5 py-2.5" style={{ borderBottom: "1px solid var(--hairline)" }}>
        <span /><span className="eyebrow">agent</span><span className="eyebrow">last</span><span className="eyebrow text-right">since</span><span className="eyebrow">control</span>
      </div>
      {ROWS.map((r, i) => {
        const s = rows[i];
        const stopped = s.phase >= 2;
        const last = stopped
          ? (s.n ? `${s.n} ${s.n === 1 ? r.unit : r.unit + "s"} refused on chain` : "Revoked by owner")
          : r.idle(s.n);
        return (
          <div key={r.name} className="grid grid-cols-[18px_1fr_auto] sm:grid-cols-[18px_180px_1fr_110px_auto] items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3.5"
            style={{ borderBottom: "1px solid var(--hairline)", background: s.phase >= 1 ? "color-mix(in srgb, var(--orange) 6%, transparent)" : "transparent", transition: "background .3s" }}>
            <StatusDot status={stopped ? "revoked" : "active"} />
            <div className="min-w-0"><div className="text-sm font-semibold truncate">{r.name}</div><div className="mono text-[11px] text-ink/70">{r.key}</div></div>
            <div className="hidden sm:block text-sm text-ink/70 truncate tabular">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span key={last} initial={m.reduced ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={m.t(DUR.fast)} className="inline-block">{last}</motion.span>
              </AnimatePresence>
            </div>
            <div className="hidden sm:block mono text-xs text-ink/70 tabular text-right">{stopped ? "just now" : r.since}</div>
            <div><StopButton size="sm" state={s.phase === 1 ? "busy" : stopped ? "done" : "ready"} onClick={() => press(i)} /></div>
          </div>
        );
      })}
      <div className="px-4 sm:px-5 py-3 min-h-[52px] mt-auto flex flex-wrap items-center gap-3">
        <AnimatePresence>{stamped && <Stamp key="s" block={165} />}</AnimatePresence>
        {!stamped && <span className="text-xs text-ink/70">{note}</span>}
        <span className="ml-auto flex items-center gap-3">
          {!auto && (
            <button type="button" onClick={reset} className="text-xs underline underline-offset-2 outline-none focus-visible:ring-2 rounded" style={{ color: "var(--text-medium)" }}>Replay</button>
          )}
          {sample && <span className="eyebrow rounded-full px-2 py-1" /* the tint it sits on lifts the ground, so --orange-text lands at 4.37:1
                  on it: a pass everywhere else and a miss here. 10% of the tint
                  keeps the badge reading as orange and clears the minimum. */
              style={{ background: "color-mix(in srgb, var(--orange) 10%, transparent)", color: "var(--orange-text)" }}>sample</span>}
        </span>
      </div>
    </div>
  );
}
