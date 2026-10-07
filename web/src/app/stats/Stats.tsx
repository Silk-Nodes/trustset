"use client";
import { useCallback, useEffect, useState } from "react";

/* the operator's view of our own counter. the numbers come from /api/stats,
   which needs the operator token; the token is kept in this browser under the
   same key the live agent's operator controls already use. nothing here is
   linked from the site. */
type Summary = {
  asOf: string;
  total: { views: number; visitors: number };
  last24: { views: number; visitors: number };
  days: { day: string; views: number; visitors: number; actions: number }[];
  pages: [string, number][]; sources: [string, number][]; devices: [string, number][]; actions: [string, number][];
};
const KEY = "trustset.operator";
const ACTION: Record<string, string> = { "sample-pause": "paused a sample breaker", "sample-stop": "stopped a sample agent", "live-pause": "paused the live agent", "demo-switch": "switched the demo agent off" };

export default function Stats() {
  const [token, setToken] = useState("");
  const [data, setData] = useState<Summary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async (t: string) => {
    setErr(null);
    try {
      const r = await fetch("/api/stats", { headers: { "x-trustset-operator": t }, cache: "no-store" });
      if (r.status === 401) { setErr("That token was not accepted."); setData(null); return; }
      if (!r.ok) { setErr(`The counter answered ${r.status}.`); return; }
      setData(await r.json());
      try { localStorage.setItem(KEY, t); } catch { /* private window */ }
    } catch (e) { setErr(String(e)); }
  }, []);
  useEffect(() => {
    let t = ""; try { t = localStorage.getItem(KEY) || ""; } catch { /* no storage */ }
    if (t) { setToken(t); load(t); }
  }, [load]);

  if (!data) return (
    <main className="w-full max-w-md mx-auto px-4 pt-16 pb-24">
      <h1 className="text-[22px] font-semibold">Visits</h1>
      <p className="text-[13.5px] mt-1.5" style={{ color: "var(--text-medium)" }}>The operator token unlocks the counter.</p>
      <form className="mt-5 flex gap-2" onSubmit={e => { e.preventDefault(); load(token.trim()); }}>
        <input type="password" value={token} onChange={e => setToken(e.target.value)} placeholder="operator token" autoComplete="off"
          className="flex-1 h-10 rounded-full px-4 text-[14px] outline-none focus-visible:ring-2" style={{ background: "var(--surface)", border: "1px solid var(--hairline)", color: "var(--text-dark)" }} />
        <button type="submit" className="drawn-btn btn-orange" style={{ padding: "8px 18px", fontSize: "0.86rem" }}>Open</button>
      </form>
      {err && <p className="text-[13px] mt-3" style={{ color: "var(--orange-text)" }}>{err}</p>}
    </main>
  );

  const max = Math.max(1, ...data.days.map(d => d.visitors));
  const tile = (label: string, n: number, sub: string) => (
    <div className="module rounded-[12px] px-4 py-3.5">
      <div className="eyebrow">{label}</div>
      <div className="mono tabular text-[30px] leading-none mt-2.5" style={{ color: "var(--text-dark)" }}>{n.toLocaleString("en-US")}</div>
      <div className="text-[12px] mt-2" style={{ color: "var(--text-medium)" }}>{sub}</div>
    </div>
  );
  const list = (title: string, rows: [string, number][], word?: (k: string) => string) => (
    <section className="module rounded-[12px] p-4 min-w-0">
      <div className="eyebrow mb-3">{title}</div>
      {rows.length === 0 && <div className="text-[13px]" style={{ color: "var(--text-medium)" }}>nothing yet</div>}
      {rows.map(([k, n]) => (
        <div key={k} className="flex items-baseline gap-3 py-1.5 text-[13.5px]" style={{ borderTop: "1px solid var(--hairline)" }}>
          <span className="truncate min-w-0 flex-1" style={{ color: "var(--text-dark)" }}>{word ? word(k) : k}</span>
          <span className="mono tabular shrink-0" style={{ color: "var(--text-medium)" }}>{n.toLocaleString("en-US")}</span>
        </div>
      ))}
    </section>
  );
  return (
    <main className="w-full max-w-5xl mx-auto px-4 sm:px-5 pt-8 pb-24 min-w-0">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="text-[22px] font-semibold">Visits</h1>
        <span className="mono text-[11.5px]" style={{ color: "var(--text-medium)" }}>as of {data.asOf.slice(0, 16).replace("T", " ")} UTC · our own counter, no cookies</span>
        <button type="button" onClick={() => load(token)} className="ml-auto mono text-[12px] underline" style={{ color: "var(--text-medium)" }}>refresh</button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mt-5">
        {tile("visitors, 24h", data.last24.visitors, "unique people in the last day")}
        {tile("page views, 24h", data.last24.views, "every page opened")}
        {tile("visitors, 14 days", data.total.visitors, "each person counted once a day")}
        {tile("tried it, 14 days", data.actions.reduce((a, [, n]) => a + n, 0), "breakers pressed, agents paused")}
      </div>
      <section className="module rounded-[12px] p-4 mt-2.5">
        <div className="eyebrow mb-3">visitors per day</div>
        <div className="flex items-end gap-1.5 h-[120px]">
          {data.days.map(d => (
            <div key={d.day} className="flex-1 min-w-0 flex flex-col items-center justify-end h-full gap-1" title={`${d.day}: ${d.visitors} visitors, ${d.views} views, ${d.actions} actions`}>
              <span className="mono tabular text-[10px]" style={{ color: "var(--text-medium)" }}>{d.visitors || ""}</span>
              <div className="w-full rounded-t-[4px]" style={{ height: `${(d.visitors / max) * 88}px`, minHeight: d.visitors ? 3 : 1, background: d.visitors ? "var(--sage)" : "var(--hairline)" }} />
            </div>
          ))}
        </div>
        <div className="flex justify-between mono text-[10px] mt-1.5" style={{ color: "var(--text-medium)" }}><span>{data.days[0]?.day.slice(5)}</span><span>today</span></div>
      </section>
      <div className="grid md:grid-cols-2 gap-2.5 mt-2.5">
        {list("where they came from", data.sources)}
        {list("pages", data.pages)}
        {list("what they did", data.actions, k => ACTION[k] ?? k)}
        {list("devices", data.devices)}
      </div>
    </main>
  );
}
