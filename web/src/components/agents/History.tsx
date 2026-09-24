"use client";
import { monOf } from "@/app/(app)/explorer/words";
import { useMemo, useState } from "react";
import { type Agent, short } from "@/lib/chain";
import type { PulseEvent } from "@/lib/layers";

/* what happened, bounded.
 *
 * the log used to be a card that grew with every event, so an agent with a
 * long life pushed everything under it off the page. this one takes the room
 * it is given and scrolls inside it: day headers pin to the top of the box as
 * they pass, a filter takes the heartbeats out of the way, and the tail loads
 * fifty more at a time rather than everything at once. two thousand events
 * and two are the same height. */
type Kind = "all" | "status" | "trades" | "beats";
const PAGE = 50;
const VERB: Record<string, string> = {
  TradeAccepted: "trade accepted", Beat: "heartbeat", GuardianVoted: "guardian voted to pause", LimitsSet: "limits set", Labelled: "named",
  Linked8004: "claimed by ERC-8004", AgentRegistered: "registered", RevocationKeyChangeProposed: "owner change proposed",
  RevocationKeyChanged: "owner changed", Rotated: "rotated to a successor",
};
const quiet = { color: "var(--text-medium)" } as const;

export default function History({ agent, events, indexed, now, explorer, total, more, loading }: {
  agent: Agent; events: PulseEvent[]; indexed: boolean | null; now: number; explorer?: string;
  /* how many the index holds for this agent, and how to fetch the next page */
  total?: number; more?: () => void; loading?: boolean;
}) {
  const [kind, setKind] = useState<Kind>("all");
  const [shown, setShown] = useState(PAGE);
  /* the index has every kind; the chain alone has status changes. when the
     index is away, the chain's record still draws. */
  const all = useMemo<PulseEvent[]>(() => indexed === false || (events.length === 0 && agent.history.length > 0 && indexed !== true)
    ? agent.history.slice().reverse().map(h => ({ kind: "StatusChanged", at: h.at, data: { status: h.status } }))
    : events, [events, agent.history, indexed]);
  const list = useMemo(() => all.filter(e => kind === "all" ? true : kind === "status" ? (e.kind === "StatusChanged" || e.kind === "GuardianVoted" || e.kind === "LimitsSet" || e.kind === "Rotated") : kind === "trades" ? e.kind === "TradeAccepted" : e.kind === "Beat"), [all, kind]);
  const days = useMemo(() => {
    const out: { label: string; rows: PulseEvent[] }[] = [];
    const today = Math.floor(now / 86400), fmt = (d: number) => d === today ? "today" : d === today - 1 ? "yesterday" : new Date(d * 86400000).toISOString().slice(0, 10);
    for (const e of list.slice(0, shown)) { const d = Math.floor(e.at / 86400); const l = fmt(d); if (out[out.length - 1]?.label !== l) out.push({ label: l, rows: [] }); out[out.length - 1].rows.push(e); }
    return out;
  }, [list, shown, now]);
  const t = (ts: number) => new Date(ts * 1000).toISOString().slice(11, 16);
  const line = (e: PulseEvent) => {
    if (e.kind === "StatusChanged") { const s = String(e.data?.status ?? ""); return s === "paused" ? "paused" : s === "active" ? "brought back" : s === "revoked" ? "stopped for good" : s === "rotated" ? "rotated" : "status changed"; }
    if (e.kind === "Staked" || e.kind === "Unstaked" || e.kind === "Withdrew" || e.kind === "ClaimedRewards") {
      const verb = e.kind === "Staked" ? "staked" : e.kind === "Unstaked" ? "unstaked" : e.kind === "Withdrew" ? "withdrew" : "claimed";
      return `${verb} ${monOf(e.data?.amount)} · validator ${e.data?.validatorId}`;
    }
    return VERB[e.kind] ?? e.kind;
  };
  const tab = (k: Kind, w: string) => <button key={k} type="button" onClick={() => { setKind(k); setShown(PAGE); }} aria-pressed={kind === k} className="rounded-full px-2.5 h-6 text-[11.5px] font-medium outline-none focus-visible:ring-2" style={{ background: kind === k ? "color-mix(in srgb, var(--text-dark) 8%, transparent)" : "transparent", color: kind === k ? "var(--text-dark)" : "var(--text-medium)" }}>{w}</button>;
  return (
    <section className="flex-1 min-h-0 flex flex-col min-w-0" aria-label="History">
      <div className="flex items-center gap-1 shrink-0 pb-2" style={{ borderBottom: "1px solid var(--hairline)" }}>
        <span className="eyebrow mr-2">history</span>
        {tab("all", "all")}{tab("status", "status")}{tab("trades", "trades")}{tab("beats", "heartbeats")}
        <span className="ml-auto mono text-[11px] tabular" style={quiet}>{kind === "all" && total !== undefined ? total : list.length}{indexed === false ? " · index away" : ""}</span>
      </div>
      <div className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto relative">
        {list.length === 0 && <p className="text-[12.5px] py-6 text-center" style={quiet}>{indexed === null ? "reading…" : "nothing yet"}</p>}
        {days.map(d => (
          <div key={d.label}>
            <div className="sticky top-16 lg:top-0 z-[1] eyebrow py-1.5" style={{ background: "var(--surface)", borderBottom: "1px solid var(--hairline)" }}>{d.label}</div>
            <ol>
              {d.rows.map((e, i) => {
                const tx = typeof (e.data as { tx?: string })?.tx === "string" ? (e.data as { tx: string }).tx : null;
                return (
                  <li key={i} className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-baseline gap-3 h-8 text-[12.5px]" style={{ borderBottom: "1px solid var(--hairline)" }}>
                    <span className="mono text-[11px] tabular" style={quiet}>{t(e.at)}</span>
                    <span className="truncate">{line(e)}{e.actor && e.actor.toLowerCase() !== agent.coldKey.toLowerCase() && e.actor.toLowerCase() !== agent.key.toLowerCase() ? <span className="mono text-[11px] ml-2" style={quiet}>{short(e.actor)}</span> : null}</span>
                    {explorer && tx ? <a href={`${explorer}/tx/${tx}`} target="_blank" rel="noreferrer" className="mono text-[11px] hover:underline" style={quiet}>↗</a> : <span />}
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
        {shown < list.length
          ? <button type="button" onClick={() => setShown(s => s + PAGE)} className="w-full h-9 text-[12px] outline-none focus-visible:ring-2" style={quiet}>show {Math.min(PAGE, list.length - shown)} more</button>
          : more && total !== undefined && all.length < total && kind === "all"
            ? <button type="button" onClick={more} disabled={loading} className="w-full h-9 text-[12px] outline-none focus-visible:ring-2 disabled:opacity-50" style={quiet}>{loading ? "reading…" : `load ${Math.min(100, total - all.length)} more of ${total - all.length}`}</button>
            : null}
      </div>
    </section>
  );
}
