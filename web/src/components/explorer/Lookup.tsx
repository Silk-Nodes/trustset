"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ago } from "@/app/(app)/explorer/words";

/* look an agent up. the question a counterparty brings is about one agent:
 * may I deal with this one, now. so the page asks for that agent and answers
 * about it, and nothing here lists the agents nobody asked about.
 *
 * the server enforces the same line: no query, no rows; and an address matches
 * an agent key only, never a cold key, so an owner's whole fleet cannot be
 * pulled up by the one key that can stop it. */
type Hit = { id: number; name: string | null; agent_key: string; state: "trusted" | "expired" | "quiet" | "paused" | "stopped"; last_at: string | null };
const WORD: Record<Hit["state"], string> = { trusted: "trusted", expired: "expired", quiet: "gone quiet", paused: "paused", stopped: "stopped" };
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const quiet = { color: "var(--text-medium)" } as const;

export default function Lookup({ base }: { base?: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const term = q.trim();

  useEffect(() => {
    const ctl = new AbortController();
    const t = setTimeout(() => {
      const u = new URL("/api/explorer/agents", base || location.origin);
      if (term) { u.searchParams.set("q", term); u.searchParams.set("per", "10"); }
      fetch(u, { cache: "no-store", signal: ctl.signal })
        .then(r => r.json())
        .then(j => { if (!j.indexed) return; if (!term) { setTotal(j.fleet ?? 0); setHits(null); } else { setHits(j.agents ?? []); setCursor(0); } })
        .catch(() => {});
    }, term ? 180 : 0);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [term, base]);

  const onKey = (e: React.KeyboardEvent) => {
    if (!hits?.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor(c => Math.min(hits.length - 1, c + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setCursor(c => Math.max(0, c - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); router.push(`/explorer/${hits[cursor].id}`); }
  };

  return (
    <section aria-label="Look up an agent">
      <h1 className="text-[22px] sm:text-[26px] font-semibold tracking-[-0.02em]">Is this agent trusted?</h1>
      <p className="text-[13.5px] mt-1.5 max-w-[62ch]" style={quiet}>
        Look an agent up by its id, its key or its name, and get what the switch says about it right now.
        {total !== null && <> <span className="tabular">{total}</span> agents are on the switch.</>}
      </p>

      <div className="relative mt-4 max-w-[640px]">
        {/* drawn, not typed: the ⌕ character is missing from most system fonts
            and left an empty gap at the start of the field on a phone */}
        <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
          className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: "var(--text-medium)" }}><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
        <input ref={input} value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKey} spellCheck={false} autoComplete="off"
          placeholder="13, 0x4d37…, or a name" aria-label="Agent id, agent key or name"
          className="w-full h-12 rounded-xl pl-10 pr-4 text-[15px] outline-none focus-visible:ring-2"
          style={{ background: "var(--surface)", border: "1px solid var(--hairline)", color: "var(--text-dark)" }} />

        {term && hits !== null && (
          <div className="sheet mt-2 overflow-hidden">
            {hits.length === 0 ? (
              <p className="px-4 py-5 text-[13px]" style={quiet}>No agent matches <span className="mono">{term}</span>. An id, an agent key, or part of a name.</p>
            ) : hits.map((h, i) => (
              <Link key={h.id} href={`/explorer/${h.id}`} onMouseMove={() => setCursor(i)}
                className="grid grid-cols-[8px_minmax(0,1fr)_auto] sm:grid-cols-[8px_minmax(0,1fr)_96px_72px] items-center gap-3 px-4 h-12 outline-none focus-visible:ring-2 focus-visible:ring-inset"
                style={{ borderBottom: i < hits.length - 1 ? "1px solid var(--hairline)" : undefined, background: i === cursor ? "color-mix(in srgb, var(--text-dark) 5%, transparent)" : undefined }}>
                <span className="w-2 h-2 rounded-full" style={{ background: h.state === "trusted" ? "var(--sage)" : h.state === "stopped" ? "var(--text-light)" : "var(--terra)" }} />
                <span className="min-w-0 leading-tight">
                  <span className="block text-[13.5px] font-semibold truncate">{h.name || `Agent ${h.id}`}</span>
                  <span className="block mono text-[10.5px] truncate" style={quiet}>agent {h.id} · {short(h.agent_key)}</span>
                </span>
                <span className="mono text-[10.5px] uppercase tracking-[0.1em] whitespace-nowrap"
                  style={{ color: h.state === "trusted" ? "var(--sage-text)" : h.state === "stopped" ? "var(--text-medium)" : "var(--orange-text)" }}>{WORD[h.state]}</span>
                <span className="hidden sm:block mono text-[11px] text-right tabular" style={quiet}>{h.last_at ? ago(h.last_at) : "never"}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
