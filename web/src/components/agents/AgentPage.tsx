"use client";
import { useEffect, useState } from "react";
import type { Agent } from "@/lib/chain";
import type { Extra, PulseEvent } from "@/lib/layers";
import Module from "./Module";
import History from "./History";
import Inspector, { type InspectorProps } from "./Inspector";
import { LOW_GAS, monText, short } from "@/lib/chain";
import CopyButton from "@/components/app/CopyButton";
import Link from "next/link";
import { say, type Ev } from "@/app/(app)/explorer/words";
import { span } from "@/lib/layers";

/* one agent. the canvas in the middle, its settings at the right.
 *
 * the agent owns the width and never gets pushed down: the module at the top
 * is fixed, and the history takes whatever is left and scrolls inside it. the
 * inspector is its own column with its own scroll. on a narrow screen it is a
 * drawer behind one button, which is the only place the two ever overlap. */
export type AgentPageProps = {
  agent: Agent; name: string; events: PulseEvent[]; indexed: boolean | null; extra: Extra; now: number; explorer?: string;
  busy: { pause?: boolean; stop?: boolean };
  onToggle: () => void; onStop: () => void;
  onBack: () => void; onPrev?: () => void; onNext?: () => void; position: string;
  history: { events: PulseEvent[]; total?: number; more?: () => void; loading?: boolean };
  inspector: Omit<InspectorProps, "agent" | "now" | "explorer" | "extra" | "name">;
  /* beside the list rather than instead of it: one column that scrolls, the
     switch first, the settings inline, the history last. no drawer, because
     the panel is already the narrow view. */
  panel?: boolean;
  /* the agent's own wallet: what it pays gas with, and where to top it up */
  balance?: bigint; faucet?: string;
  /* the public record of this agent, where its whole history lives. absent
     for the sample, which has no public page */
  recordHref?: string;
};

export default function AgentPage(p: AgentPageProps) {
  const [drawer, setDrawer] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA")) return;
      if (e.key === "[" && p.onPrev) p.onPrev();
      else if (e.key === "]" && p.onNext) p.onNext();
      else if (e.key === "Escape") { if (drawer) setDrawer(false); else p.onBack(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [p, drawer]);
  const nav = (
    <div className="flex items-center gap-2 shrink-0 mb-3">
      <button type="button" onClick={p.onBack} className="rounded-full h-7 px-2.5 inline-flex items-center gap-1.5 text-[12px] font-medium outline-none focus-visible:ring-2" style={{ border: "1px solid var(--hairline)", color: "var(--text-medium)" }}><span aria-hidden>←</span> agents</button>
      <span className="mono text-[11px] tabular" style={{ color: "var(--text-light)" }}>{p.position}</span>
      <span className="flex-1" />
      <button type="button" onClick={p.onPrev} disabled={!p.onPrev} aria-label="previous agent" title="[" className="w-7 h-7 rounded-full inline-flex items-center justify-center text-[12px] outline-none focus-visible:ring-2 disabled:opacity-35" style={{ border: "1px solid var(--hairline)", color: "var(--text-medium)" }}>‹</button>
      <button type="button" onClick={p.onNext} disabled={!p.onNext} aria-label="next agent" title="]" className="w-7 h-7 rounded-full inline-flex items-center justify-center text-[12px] outline-none focus-visible:ring-2 disabled:opacity-35" style={{ border: "1px solid var(--hairline)", color: "var(--text-medium)" }}>›</button>
      <button type="button" onClick={() => setDrawer(true)} className="lg:hidden rounded-full h-7 px-2.5 text-[12px] font-medium outline-none focus-visible:ring-2" style={{ border: "1px solid var(--hairline)", color: "var(--text-dark)" }}>settings</button>
    </div>
  );
  const inspector = <Inspector key={p.agent.id.toString()} {...p.inspector} agent={p.agent} now={p.now} explorer={p.explorer} extra={p.extra} name={p.name} />;
  if (p.panel) return (
    <div className="module rounded-[16px] flex-1 min-h-0 flex flex-col min-w-0 overflow-hidden">
      <div className="shrink-0 flex items-center gap-2 h-11 px-3" style={{ borderBottom: "1px solid var(--hairline)" }}>
        <span className="text-[14px] font-semibold truncate">{p.name}</span>
        <span className="mono text-[11px] shrink-0 truncate" style={{ color: "var(--text-medium)" }}>agent {p.agent.id.toString()} · {p.explorer ? <a href={`${p.explorer}/address/${p.agent.key}`} target="_blank" rel="noreferrer" className="hover:underline">{short(p.agent.key)}</a> : short(p.agent.key)}</span>
        <CopyButton text={p.agent.key} label="Copy the agent's address" size={26} />
        <span className="flex-1" />
        <span className="hidden sm:inline mono text-[11px] tabular" style={{ color: "var(--text-light)" }}>{p.position}</span>
        <button type="button" onClick={p.onPrev} disabled={!p.onPrev} aria-label="previous agent" title="[" className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-[13px] outline-none focus-visible:ring-2 disabled:opacity-35" style={{ color: "var(--text-medium)" }}>‹</button>
        <button type="button" onClick={p.onNext} disabled={!p.onNext} aria-label="next agent" title="]" className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-[13px] outline-none focus-visible:ring-2 disabled:opacity-35" style={{ color: "var(--text-medium)" }}>›</button>
        <button type="button" onClick={p.onBack} aria-label="close" title="esc" className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-[15px] outline-none focus-visible:ring-2" style={{ color: "var(--text-medium)" }}>×</button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-5">
        <Module bare slim headless agent={p.agent} name={p.name} now={p.now} events={p.events} indexed={p.indexed} extra={p.extra} explorer={p.explorer} busy={p.busy} onToggle={p.onToggle} onStop={p.onStop} />
        <Recent events={p.history.events} loading={p.history.loading} now={p.now} href={p.recordHref} />
        {/* the agent's gas: it signs with its own key, so it pays from its own
            wallet. low is said in orange, and the faucet is one press away */}
        {p.balance !== undefined && p.agent.status !== "revoked" && p.agent.status !== "rotated" && (
          <div className="flex items-center gap-2 min-w-0 text-[12px]">
            <span className="eyebrow">balance</span>
            <span className="mono tabular" style={{ color: p.balance < LOW_GAS ? "var(--orange-text)" : "var(--text-dark)" }}>{monText(p.balance)}</span>
            {p.balance < LOW_GAS && <span className="mono text-[10.5px]" style={{ color: "var(--orange-text)" }}>low</span>}
            <span className="flex-1" />
            {p.faucet && <a href={p.faucet} target="_blank" rel="noreferrer" className="mono text-[11px] hover:underline whitespace-nowrap" style={{ color: "var(--orange-text)" }}>get testnet MON ↗</a>}
          </div>
        )}
        <div>{inspector}</div>
      </div>
    </div>
  );
  return (
    <div className="flex-1 min-h-0 flex flex-col min-w-0">
      {nav}
      <div className="flex-1 min-h-0 grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="sheet min-h-0 flex flex-col p-4 sm:p-5 gap-4 min-w-0">
          <Module bare slim agent={p.agent} name={p.name} now={p.now} events={p.events} indexed={p.indexed} extra={p.extra} explorer={p.explorer} busy={p.busy} onToggle={p.onToggle} onStop={p.onStop} />
          <History agent={p.agent} events={p.history.events} total={p.history.total} more={p.history.more} loading={p.history.loading} indexed={p.indexed} now={p.now} explorer={p.explorer} />
        </div>
        <div className="hidden lg:flex sheet min-h-0 flex-col p-3 min-w-0">{inspector}</div>
      </div>
      {/* the drawer, below lg */}
      {drawer && (
        <div className="lg:hidden fixed inset-0 z-[60]" role="dialog" aria-label="Settings">
          <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.35)" }} onClick={() => setDrawer(false)} />
          <div className="absolute right-0 top-0 bottom-0 w-[min(340px,92vw)] flex flex-col p-3" style={{ background: "var(--surface)", borderLeft: "1px solid var(--hairline)" }}>
            <button type="button" onClick={() => setDrawer(false)} className="self-end text-[13px] px-2 py-1 mb-1" style={{ color: "var(--text-medium)" }} aria-label="close">×</button>
            {inspector}
          </div>
        </div>
      )}
    </div>
  );
}

/* what the agent did last, in words.
 *
 * the panel used to carry the explorer's whole history, with its tabs and its
 * paging, below ten settings rows where nobody scrolled. the panel is where an
 * owner acts, and for that the last few things the agent did are enough; the
 * whole record is one press away on the explorer, which is where it is kept.
 * a registration's own status change is implied by it and left out. */
function Recent({ events, loading, now, href }: { events: PulseEvent[]; loading?: boolean; now: number; href?: string }) {
  const regAt = new Set(events.filter(e => e.kind === "AgentRegistered").map(e => e.at));
  const rows = events.filter(e => !(e.kind === "StatusChanged" && regAt.has(e.at))).slice().sort((a, b) => b.at - a.at).slice(0, 3);
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="eyebrow">recent</span>
        <span className="flex-1" />
        {href && <Link href={href} className="mono text-[11px] hover:underline whitespace-nowrap" style={{ color: "var(--text-medium)" }}>full history →</Link>}
      </div>
      {rows.length === 0
        ? <p className="text-[12px]" style={{ color: "var(--text-medium)" }}>{loading ? "reading…" : "nothing yet"}</p>
        : <ul className="flex flex-col">
            {rows.map((e, i) => {
              const w = say({ kind: e.kind, data: e.data ?? {} } as Ev);
              return (
                <li key={i} className="flex items-center gap-2.5 min-w-0 py-1.5 text-[12.5px]" style={{ borderTop: i ? "1px solid var(--hairline)" : undefined }}>
                  <span aria-hidden className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: TONE[w.tone] }} />
                  <span className="truncate min-w-0 flex-1">{w.text}</span>
                  <span className="mono text-[11px] tabular whitespace-nowrap" style={{ color: "var(--text-medium)" }}>{span(Math.max(0, now - e.at))} ago</span>
                </li>
              );
            })}
          </ul>}
    </div>
  );
}
const TONE = { live: "var(--sage)", off: "var(--orange)", quiet: "var(--terra)", plain: "var(--text-light)" } as const;
