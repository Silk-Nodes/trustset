"use client";
import { useEffect, useState } from "react";

/* the refunds page, replayed on a loop, for a reader with no wallet.
 *
 * three sample payments. one is delivered on a receipt, one waits and is
 * sent home when its window closes, one is still held with a countdown. the
 * countdown and the state changes are the only motion; nothing is invented
 * beyond the rows themselves, and the badge says they are a sample. */
type S = "held" | "delivered" | "refunded";
const START: { id: number; amount: string; s: S; left: number }[] = [
  { id: 14, amount: "0.004", s: "held", left: 30 },
  { id: 13, amount: "0.004", s: "refunded", left: 0 },
  { id: 12, amount: "0.012", s: "delivered", left: 0 },
];
export default function RefundReplay({ sample = false }: { sample?: boolean }) {
  const [rows, setRows] = useState(START);
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick(x => x + 1), 1000); return () => clearInterval(t); }, []);
  useEffect(() => {
    setRows(r => r.map(row => row.s !== "held" ? row : row.left > 1 ? { ...row, left: row.left - 1 } : { ...row, s: "refunded", left: 0 }));
    /* a fresh payment starts the loop again a few seconds after the last one closed */
    if (tick > 0 && tick % 38 === 0) setRows(r => [{ id: r[0].id + 1, amount: "0.004", s: "held", left: 30 }, ...r.slice(0, 2)]);
  }, [tick]);
  return (
    <div className="drawn-box overflow-clip flex flex-col h-full" aria-label="the refunds page, replayed">
      <div className="hidden sm:grid grid-cols-[80px_1fr_150px_auto] gap-4 px-5 py-2.5" style={{ borderBottom: "1px solid var(--hairline)" }}>
        <span className="eyebrow">payment</span><span className="eyebrow">state</span><span className="eyebrow text-right">window</span><span className="eyebrow">control</span>
      </div>
      {rows.map(r => {
        const hot = r.s === "refunded";
        return (
          <div key={r.id} className="grid grid-cols-[1fr_auto] sm:grid-cols-[80px_1fr_150px_auto] items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3.5 text-sm" style={{ borderBottom: "1px solid var(--hairline)", background: hot ? "color-mix(in srgb, var(--orange) 6%, transparent)" : undefined, transition: "background .3s" }}>
            <span className="mono text-xs tabular">#{r.id}</span>
            <span className="min-w-0">
              <span className="font-semibold" style={{ color: hot ? "var(--orange-text)" : r.s === "delivered" ? "var(--sage-text)" : "var(--text-dark)" }}>{r.s === "held" ? "Held" : r.s === "delivered" ? "Delivered" : "Refunded"}</span>
              <span className="text-ink/70"> · {r.amount} mUSD {r.s === "held" ? "in escrow" : r.s === "delivered" ? "to the service" : "back to you"}</span>
            </span>
            <span className="hidden sm:block mono text-xs tabular text-right" style={{ color: "var(--text-medium)" }}>{r.s !== "held" ? "closed" : `${r.left}s left`}</span>
            <span className="flex gap-1.5">
              {r.s === "held" && <span className="drawn-btn btn-gold" style={{ padding: "6px 12px", fontSize: "0.75rem" }}>Release</span>}
              {r.s === "held" && <span className="drawn-btn btn-orange" style={{ padding: "6px 12px", fontSize: "0.75rem", opacity: 0.45 }}>Refund</span>}
            </span>
          </div>
        );
      })}
      <div className="px-4 sm:px-5 py-3 min-h-[52px] mt-auto flex items-center gap-3">
        <span className="text-xs text-ink/70">A payment is exactly one of held, delivered, refunded. Never two.</span>
        {sample && <span className="ml-auto eyebrow rounded-full px-2 py-1" style={{ background: "color-mix(in srgb, var(--orange) 16%, transparent)", color: "var(--orange-text)" }}>sample</span>}
      </div>
    </div>
  );
}
