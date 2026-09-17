"use client";
import StatusDot from "./StatusDot";
import StopButton from "./StopButton";
import { type Agent, short, ago, expired, lapsed } from "@/lib/chain";
/* one agent, one line. name, status, last thing that happened, the control.
   no layout animation: with it, selecting a row reflowed the whole list and
   the panel flashed at the top of the page before it settled beside it. */
export default function AgentRow({ agent, name, last, selected, stopState, onSelect, onStop, onPause, pausing }: {
  agent: Agent; name: string; last: string; selected: boolean; stopState: "ready" | "busy" | "done"; onSelect: () => void; onStop: () => void;
  /* pause when active, resume when paused. reversible, unlike stop. */
  onPause?: () => void; pausing?: boolean;
}) {
  const live = agent.status === "active" || agent.status === "paused";
  /* the contract still calls these Active. the page says what isTrusted says. */
  const out = agent.status === "active" && expired(agent) ? "Expired" : agent.status === "active" && lapsed(agent) ? "Gone quiet" : null;
  return (
    <div onClick={onSelect} role="button" tabIndex={0} onKeyDown={e => { if (e.key === "Enter") onSelect(); }}
      className="grid grid-cols-[18px_1fr_auto] sm:grid-cols-[18px_180px_1fr_110px_auto] items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3.5 cursor-pointer transition-colors"
      style={{ background: selected ? "color-mix(in srgb, var(--text-dark) 5%, transparent)" : "transparent", borderBottom: "1px solid var(--hairline)" }}>
      <StatusDot status={agent.status} live={!out} />
      <div className="min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold truncate">{name}</span>
          {out && <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold mono whitespace-nowrap"
            style={{ background: "color-mix(in srgb, var(--terra) 18%, transparent)", color: "var(--text-dark)" }}>{out}</span>}
        </div>
        <div className="mono text-[11px] text-ink/70 truncate">{short(agent.key)}</div>
      </div>
      <div className="hidden sm:block text-sm text-ink/70 truncate">{last}</div>
      <div className="hidden sm:block mono text-xs text-ink/70 tabular text-right">{ago(agent.since)}</div>
      <div onClick={e => e.stopPropagation()} className="flex items-center gap-1.5 justify-end">
        {live && onPause && (
          <button type="button" className="drawn-btn btn-gold" style={{ padding: "6px 12px", fontSize: "0.78rem" }} disabled={pausing} onClick={onPause}>
            {pausing ? "…" : agent.status === "paused" ? "Resume" : "Pause"}
          </button>
        )}
        <StopButton size="sm" state={agent.status === "revoked" || agent.status === "rotated" ? "done" : stopState} onClick={onStop} />
      </div>
    </div>
  );
}
