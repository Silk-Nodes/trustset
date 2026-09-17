"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { useMotionPrefs } from "@/lib/motion";
import { say, ago, dayOf, short, type Ev, type Tone } from "./words";

/* the explorer.
 *
 * not a block explorer. a block explorer answers what happened in a block; this
 * answers who is running agents and when anyone actually pulled a switch. one
 * line per event, newest first, every line a transaction anybody can open.
 *
 * everything on this page came out of a log. refused trades are absent on
 * purpose: a refusal is a reverted transaction, it emits no logs, and an index
 * built from logs cannot see one. the page says so rather than quietly
 * implying the feed is everything that happened. */
type Stats = { agents: string; active: string; paused: string; stopped: string; limited: string; events: string; head: string; cursor: string };
const FILTERS = [
  ["", "Everything"], ["registered", "Registered"], ["stopped", "Paused and stopped"],
  ["limits", "Limits"], ["work", "Work"], ["guardians", "Guardians"], ["keys", "Keys"], ["labels", "Names"],
] as const;

const PAGE = 5;

/* which page buttons to draw: always the first and the last, always the ones
   either side of where you are, and an ellipsis for the rest. fourteen pages of
   five must not become fourteen buttons on a phone. */
function pageWindow(current: number, last: number): (number | "gap")[] {
  if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1);
  const keep = new Set([1, last, current, current - 1, current + 1]);
  if (current <= 3) [2, 3, 4].forEach(n => keep.add(n));
  if (current >= last - 2) [last - 3, last - 2, last - 1].forEach(n => keep.add(n));
  const shown = [...keep].filter(n => n >= 1 && n <= last).sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  shown.forEach((n, i) => { if (i && n - shown[i - 1] > 1) out.push("gap"); out.push(n); });
  return out;
}

const TONE: Record<Tone, string> = { live: "var(--sage)", off: "var(--orange)", quiet: "var(--terra)", plain: "var(--text-light)" };

export default function Explorer({ explorer }: { explorer: string }) {
  const m = useMotionPrefs();
  const [filter, setFilter] = useState("");
  const [q, setQ] = useState("");
  const [typed, setTyped] = useState("");
  const [rows, setRows] = useState<Ev[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "none">("loading");
  /* one page of five, addressed by number, so a reader can jump rather than
     walk. the feed used to append forever, which turned a glance at the last
     few events into a page you had to scroll. */
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  /* typing searches when you stop, not on every keystroke. */
  useEffect(() => { const t = setTimeout(() => setQ(typed.trim()), 350); return () => clearTimeout(t); }, [typed]);

  const load = useCallback(async (which: number) => {
    const u = new URL("/api/explorer", window.location.origin);
    if (filter) u.searchParams.set("filter", filter);
    if (q) u.searchParams.set("q", q);
    u.searchParams.set("limit", String(PAGE));
    u.searchParams.set("offset", String((which - 1) * PAGE));
    const r = await fetch(u, { cache: "no-store" });
    const j = await r.json();
    if (!j.indexed) { setState("none"); return; }
    setStats(j.stats);
    setTotal(Number(j.total ?? 0));
    setRows(j.events ?? []);
    setState("ready");
  }, [filter, q]);

  /* a new filter or a new search starts at the newest page again. */
  useEffect(() => { setPage(1); }, [filter, q]);
  useEffect(() => { setState(s => (s === "none" ? s : "loading")); load(page).catch(() => setState("none")); }, [load, page]);
  /* the head moves every few seconds; the feed follows it without the page
     jumping, because new rows land on top and the rest keep their place. */
  /* the head moves every few seconds. only the newest page follows it: moving
     the ground under a reader on page four would be rude. */
  useEffect(() => {
    if (page !== 1) return;
    const t = setInterval(() => load(1).catch(() => {}), 12_000);
    return () => clearInterval(t);
  }, [load, page]);

  const last = Math.max(1, Math.ceil(total / PAGE));

  const groups = useMemo(() => {
    const out: { day: string; rows: Ev[] }[] = [];
    for (const e of rows) {
      const d = dayOf(e.at);
      if (out.at(-1)?.day !== d) out.push({ day: d, rows: [] });
      out.at(-1)!.rows.push(e);
    }
    return out;
  }, [rows]);

  if (state === "none") return <NoIndex />;

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-px rounded-2xl overflow-hidden mb-6" style={{ background: "var(--hairline)" }}>
        <Stat label="Agents" v={stats?.agents} />
        <Stat label="Live now" v={stats?.active} tone="live" />
        <Stat label="Paused" v={stats?.paused} tone="quiet" />
        <Stat label="Stopped" v={stats?.stopped} tone="off" />
        <Stat label="With limits" v={stats?.limited} />
        <Stat label="Events" v={stats?.events} />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex flex-wrap gap-1 rounded-full p-1" style={{ background: "color-mix(in srgb, var(--text-dark) 5%, transparent)" }}>
          {FILTERS.map(([k, label]) => (
            <button key={k} type="button" onClick={() => setFilter(k)}
              className="rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors whitespace-nowrap"
              style={{ background: filter === k ? "var(--pill-accent-bg)" : "transparent", color: filter === k ? "var(--pill-accent-text)" : "var(--text-medium)" }}>
              {label}
            </button>
          ))}
        </div>
        <input value={typed} onChange={e => setTyped(e.target.value)} spellCheck={false}
          placeholder="Agent id, address, transaction, name"
          className="mono text-[13px] rounded-full px-4 py-2 outline-none sm:ml-auto w-full sm:w-[320px]"
          style={{ background: "var(--bg-base)", border: "1px solid var(--hairline)", color: "var(--text-dark)" }} />
      </div>

      <div className="sheet overflow-hidden">
        {state === "loading" && rows.length === 0 && <p className="px-5 py-8 text-sm" style={{ color: "var(--text-medium)" }}>Reading the index…</p>}
        {state === "ready" && rows.length === 0 && (
          <p className="px-5 py-8 text-sm" style={{ color: "var(--text-medium)" }}>Nothing matches {q ? <span className="mono">{q}</span> : "that filter"}.</p>
        )}
        {groups.map(g => (
          <div key={g.day}>
            <div className="px-4 sm:px-5 py-2 text-[11px] mono uppercase tracking-[0.12em]"
              style={{ color: "var(--text-medium)", background: "color-mix(in srgb, var(--text-dark) 3%, transparent)", borderBottom: "1px solid var(--hairline)" }}>{g.day}</div>
            {/* no AnimatePresence here. a page change replaces ten rows with ten
                others, and cross-fading them means the old ten only leave when
                their exit animation finishes, which in a backgrounded tab it
                never does: the feed ends up holding twenty. rows still animate
                in, which is the half that carries meaning. */}
            {g.rows.map(e => <Row key={e.id} e={e} explorer={explorer} reduced={m.reduced} />)}
          </div>
        ))}
        {last > 1 && (
          <div className="px-4 sm:px-5 py-3 flex flex-wrap items-center gap-1.5">
            <button type="button" aria-label="Newer" className="rounded-lg px-2.5 py-1.5 text-[13px] font-semibold transition-colors"
              disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}
              style={{ color: page === 1 ? "var(--text-light)" : "var(--text-medium)", opacity: page === 1 ? 0.5 : 1 }}>←</button>
            {pageWindow(page, last).map((n, i) => n === "gap"
              ? <span key={`gap${i}`} className="px-1 text-[13px]" style={{ color: "var(--text-light)" }}>…</span>
              : (
                <button key={n} type="button" onClick={() => setPage(n)} aria-current={n === page ? "page" : undefined}
                  className="rounded-lg min-w-[32px] px-2 py-1.5 text-[13px] font-semibold tabular transition-colors"
                  style={{ background: n === page ? "var(--pill-accent-bg)" : "transparent", color: n === page ? "var(--pill-accent-text)" : "var(--text-medium)" }}>{n}</button>
              ))}
            <button type="button" aria-label="Older" className="rounded-lg px-2.5 py-1.5 text-[13px] font-semibold transition-colors"
              disabled={page === last} onClick={() => setPage(p => Math.min(last, p + 1))}
              style={{ color: page === last ? "var(--text-light)" : "var(--text-medium)", opacity: page === last ? 0.5 : 1 }}>→</button>
            <span className="ml-auto mono text-[11px] tabular" style={{ color: "var(--text-medium)" }}>{total} event{total === 1 ? "" : "s"}</span>
          </div>
        )}
      </div>

      <p className="mt-4 text-xs max-w-[70ch]" style={{ color: "var(--text-medium)" }}>
        Every line here came from a log on Monad testnet, indexed to block {stats?.head ?? "…"}. A refused trade is a transaction
        that reverted, which emits no logs, so refusals cannot appear here and are not counted.
      </p>
    </>
  );
}

function Row({ e, explorer, reduced }: { e: Ev; explorer: string; reduced: boolean }) {
  const { text, tone } = say(e);
  const name = e.name || (e.agent_id ? `Agent ${e.agent_id}` : "Unknown");
  return (
    <motion.div initial={reduced ? { opacity: 0 } : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
      className="grid grid-cols-[10px_1fr_auto] sm:grid-cols-[10px_220px_1fr_92px_auto] items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3"
      style={{ borderBottom: "1px solid var(--hairline)" }}>
      <span className="w-[7px] h-[7px] rounded-full" style={{ background: TONE[tone] }} />
      <div className="min-w-0">
        {e.agent_id != null
          ? <Link href={`/explorer/${e.agent_id}`} className="text-sm font-semibold truncate hover:underline block">{name}</Link>
          : <span className="text-sm font-semibold truncate block">{name}</span>}
        <span className="mono text-[11px] block truncate" style={{ color: "var(--text-medium)" }}>{short(e.agent_key)}</span>
      </div>
      <div className="hidden sm:block text-sm truncate">{text}</div>
      <div className="hidden sm:block mono text-[11px] tabular text-right" style={{ color: "var(--text-medium)" }}>{ago(e.at)}</div>
      <a href={`${explorer}/tx/${e.tx_hash}`} target="_blank" rel="noreferrer"
        className="mono text-[11px] tabular hover:underline whitespace-nowrap" style={{ color: "var(--text-medium)" }}>{e.block}</a>
    </motion.div>
  );
}

function Stat({ label, v, tone }: { label: string; v?: string; tone?: Tone }) {
  return (
    <div className="px-4 py-4" style={{ background: "var(--bg-base)" }}>
      <div className="text-[11px] mono uppercase tracking-[0.12em]" style={{ color: "var(--text-medium)" }}>{label}</div>
      <div className="text-[26px] font-semibold tabular mt-1" style={{ color: tone ? TONE[tone] : undefined }}>{v ?? "…"}</div>
    </div>
  );
}

function NoIndex() {
  return (
    <div className="sheet px-5 py-8">
      <h2 className="text-lg font-semibold">No index on this machine</h2>
      <p className="text-sm mt-2 max-w-[62ch]" style={{ color: "var(--text-medium)" }}>
        The explorer reads a Postgres database that the indexer fills from the chain. It runs beside the site on the
        server; a laptop has no copy of it, and nothing here is missing from the chain itself.
      </p>
    </div>
  );
}
