"use client";
import Tip from "@/components/Tip";
import { useEffect, useState } from "react";

/* the refunds page, replayed on a loop, for a reader with no wallet.
 *
 * ten sample payments, the newest still held with its window counting down.
 * one row of history said what the rail does; ten says what it does over a
 * day, which is the only way the mix of delivered and refunded reads as a
 * rail and not as a demo. the countdown and the state changes are the only
 * motion; nothing is invented beyond the rows themselves, and the badge says
 * they are a sample. */
type S = "held" | "delivered" | "refunded";
const KEEP = 10;
const START: { id: number; amount: string; s: S; left: number }[] = [
  { id: 148, amount: "0.004", s: "held", left: 30 },
  { id: 147, amount: "0.250", s: "delivered", left: 0 },
  { id: 146, amount: "0.004", s: "refunded", left: 0 },
  { id: 145, amount: "1.500", s: "delivered", left: 0 },
  { id: 144, amount: "0.012", s: "delivered", left: 0 },
  { id: 143, amount: "0.004", s: "refunded", left: 0 },
  { id: 142, amount: "0.080", s: "delivered", left: 0 },
  { id: 141, amount: "0.004", s: "delivered", left: 0 },
  { id: 140, amount: "0.500", s: "refunded", left: 0 },
  { id: 139, amount: "0.012", s: "delivered", left: 0 },
];
export const STATE_TIP = { held: "In escrow until you release it, or until its window closes and anyone may refund it.", delivered: "Released to the service on your receipt.", refunded: "Its window closed unsettled, so it came back to you." } as const;

export default function RefundReplay({ sample = false }: { sample?: boolean }) {
  const [rows, setRows] = useState(START);
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick(x => x + 1), 1000); return () => clearInterval(t); }, []);
  useEffect(() => {
    setRows(r => r.map(row => row.s !== "held" ? row : row.left > 1 ? { ...row, left: row.left - 1 } : { ...row, s: "refunded", left: 0 }));
    /* a fresh payment starts the loop again a few seconds after the last one closed */
    if (tick > 0 && tick % 38 === 0) setRows(r => [{ id: r[0].id + 1, amount: "0.004", s: "held", left: 30 }, ...r.slice(0, KEEP - 1)]);
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
              <Tip text={STATE_TIP[r.s]}><span className="font-semibold" style={{ color: hot ? "var(--orange-text)" : r.s === "delivered" ? "var(--sage-text)" : "var(--text-dark)" }}>{r.s === "held" ? "Held" : r.s === "delivered" ? "Delivered" : "Refunded"}</span></Tip>
              <span className="mono text-[12.5px] tabular" style={{ color: "var(--text-medium)" }}> · {r.amount} mUSD</span>
            </span>
            <span className="hidden sm:block mono text-xs tabular text-right" style={{ color: "var(--text-medium)" }}>{r.s === "held" ? `${r.left}s left` : ""}</span>
            <span className="flex gap-1.5">
              {r.s === "held" && <span className="drawn-btn btn-gold" style={{ padding: "6px 12px", fontSize: "0.75rem" }}>Release</span>}
              {/* a drawing of the control while the window is still open, so it
                  has to read as unavailable AND stay readable. faded to 0.45 it
                  measured 1.54:1, which is a label nobody can check against the
                  seconds ticking down beside it. quiet colours, full opacity. */}
              {r.s === "held" && <span className="drawn-btn" style={{ padding: "6px 12px", fontSize: "0.75rem", background: "transparent", border: "1px dashed var(--hairline)", color: "var(--text-medium)" }}>Refund</span>}
            </span>
          </div>
        );
      })}
      {sample && (
        <div className="px-4 sm:px-5 py-3 min-h-[52px] mt-auto flex items-center gap-3">
          <span className="ml-auto eyebrow rounded-full px-2 py-1" /* the tint it sits on lifts the ground, so --orange-text lands at 4.37:1
                on it: a pass everywhere else and a miss here. 10% of the tint
                keeps the badge reading as orange and clears the minimum. */
            style={{ background: "color-mix(in srgb, var(--orange) 10%, transparent)", color: "var(--orange-text)" }}>sample</span>
        </div>
      )}
    </div>
  );
}
