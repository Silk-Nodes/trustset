"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { useMotionPrefs } from "@/lib/motion";
import { say, ago, dayOf, short, type Ev, type Tone } from "./words";
import Directory, { type Row as AgentRow, type Query as DirQuery, type Sort as DirSort, type State as DirState, type Missing as DirMissing } from "@/components/explorer/Directory";

/* the explorer.
 *
 * not a block explorer. a block explorer answers what happened in a block; this
 * answers who is running agents and whether you can deal with one of them.
 *
 * it used to lead with the feed, which was the wrong object: a reader arrives
 * asking about an AGENT and was handed a river of events with no way to browse
 * the agents at all. so the directory is the page now and the feed is a tab
 * beside it, which is roughly where a reader's interest in it sits.
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
  /* the directory, loaded once beside the feed. one request for every agent,
     not one per agent: the console learned that lesson against the rpc and the
     same arithmetic applies to postgres. */
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [dir, setDir] = useState<{ total: number; counts: Record<string, number>; coverage: Record<string, number> }>({ total: 0, counts: {}, coverage: {} });
  const [dirLoading, setDirLoading] = useState(true);
  const [dq, setDq] = useState<DirQuery>({ page: 1, per: 50, sort: "recent", rev: false, states: [], missing: [], q: "" });
  const [tab, setTab] = useState<"agents" | "activity">("agents");

  /* development only. ?index=https://… reads another deployment's index, which
     is the only way to see this page on a laptop: the database listens on the
     server's loopback and a laptop has no copy.

     there used to be a ?fake=N here too, padding the table with invented rows
     so the layout could be measured at scale. it is gone, and the reason it
     could go is that there are now ten real agents on testnet covering every
     state. the harness had a cost worth being rid of: to page and filter those
     rows it reimplemented the server's sorting, filtering and counting in the
     browser, so the thing I was testing against was a second copy of the logic
     rather than the one that runs. */
  const [indexAt, setIndexAt] = useState("");
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    try {
      const u = new URLSearchParams(location.search);
      const i = u.get("index"); if (i && /^https:\/\/[a-z0-9.-]+$/i.test(i)) setIndexAt(i);
    } catch { /* no window */ }
  }, []);

  /* the view lives in the url, so any page of any filter is a link somebody
     can send. read once on mount, written back with replaceState so the back
     button still means the previous page rather than the previous chip. */
  const urlRead = useRef(false);
  useEffect(() => {
    try {
      const u = new URLSearchParams(location.search);
      const states = (u.get("state") ?? "").split(",").filter(x => ["trusted", "expired", "quiet", "paused", "stopped"].includes(x)) as DirState[];
      const sort = (u.get("sort") ?? "recent") as DirSort;
      setDq(d => ({
        page: Math.max(1, Number(u.get("page") ?? 1) || 1),
        per: [25, 50, 100].includes(Number(u.get("per"))) ? Number(u.get("per")) : 50,
        sort: (["recent", "busy", "expiry", "id"] as DirSort[]).includes(sort) ? sort : "recent",
        rev: u.get("rev") === "1", states,
        missing: (u.get("missing") ?? "").split(",").filter(x => ["guardians", "limits", "identity"].includes(x)) as DirMissing[], q: d.q,
      }));
      if (u.get("tab") === "activity") setTab("activity");
    } catch { /* no window */ }
    urlRead.current = true;
  }, []);
  useEffect(() => {
    if (!urlRead.current) return;
    const u = new URLSearchParams(location.search);
    for (const k of ["page", "per", "sort", "rev", "state", "missing", "tab"]) u.delete(k);
    if (dq.page > 1) u.set("page", String(dq.page));
    if (dq.per !== 50) u.set("per", String(dq.per));
    if (dq.sort !== "recent") u.set("sort", dq.sort);
    if (dq.rev) u.set("rev", "1");
    if (dq.states.length) u.set("state", dq.states.join(","));
    if (dq.missing.length) u.set("missing", dq.missing.join(","));
    if (tab === "activity") u.set("tab", "activity");
    const qs = u.toString();
    history.replaceState(null, "", location.pathname + (qs ? "?" + qs : ""));
  }, [dq, tab]);

  /* typing searches when you stop, not on every keystroke. */
  useEffect(() => { const t = setTimeout(() => setQ(typed.trim()), 350); return () => clearTimeout(t); }, [typed]);

  const load = useCallback(async (which: number) => {
    const u = new URL("/api/explorer", indexAt || window.location.origin);
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
  }, [filter, q, indexAt]);

  const dqKey = `${dq.page}|${dq.per}|${dq.sort}|${dq.rev}|${dq.states.join(",")}|${dq.missing.join(",")}|${q}`;
  useEffect(() => {
    let alive = true;
    setDirLoading(true);
    const pull = () => {
      const u = new URL("/api/explorer/agents", indexAt || window.location.origin);
      u.searchParams.set("page", String(dq.page));
      u.searchParams.set("per", String(dq.per));
      u.searchParams.set("sort", dq.sort);
      if (dq.rev) u.searchParams.set("rev", "1");
      if (dq.states.length) u.searchParams.set("state", dq.states.join(","));
      if (dq.missing.length) u.searchParams.set("missing", dq.missing.join(","));
      if (q) u.searchParams.set("q", q);
      return fetch(u, { cache: "no-store" })
        .then(r => r.json())
        .then(j => {
          if (!alive || !j.indexed) return;
          setAgents(j.agents ?? []);
          setDir({ total: j.total ?? 0, counts: j.counts ?? {}, coverage: j.coverage ?? {} });
        })
        .catch(() => {})
        .finally(() => { if (alive) setDirLoading(false); });
    };
    pull();
    const t = setInterval(pull, 20_000);
    return () => { alive = false; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indexAt, dqKey]);

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
  /* everything registered that is not trusted and not over: expired, gone
     quiet or paused.

     the three stat cards that used to sit here are gone: trusted, not trusted
     and stopped were the same counts the state chips below already carry, and
     the chips are also the filter. two readings of one number, one of which
     did nothing when pressed, is a band of the page spent on nothing. */

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
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex gap-1 rounded-full p-1" style={{ background: "color-mix(in srgb, var(--text-dark) 5%, transparent)" }}>
          {([["agents", `Agents`, dir.total], ["activity", "Activity", total]] as const).map(([k, label, count]) => (
            <button key={k} type="button" onClick={() => setTab(k)} aria-current={tab === k ? "page" : undefined}
              className="rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors whitespace-nowrap inline-flex items-center gap-1.5"
              style={{ background: tab === k ? "var(--pill-accent-bg)" : "transparent", color: tab === k ? "var(--pill-accent-text)" : "var(--text-medium)" }}>
              {label}<span className="mono text-[11px] tabular" style={{ opacity: 0.65 }}>{count || ""}</span>
            </button>
          ))}
        </div>
        {tab === "activity" && (
          <div className="flex flex-wrap gap-1 rounded-full p-1" style={{ background: "color-mix(in srgb, var(--text-dark) 5%, transparent)" }}>
            {FILTERS.map(([k, label]) => (
              <button key={k} type="button" onClick={() => setFilter(k)}
                className="rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors whitespace-nowrap"
                style={{ background: filter === k ? "var(--pill-accent-bg)" : "transparent", color: filter === k ? "var(--pill-accent-text)" : "var(--text-medium)" }}>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {tab === "agents" && <Directory rows={agents} total={dir.total} counts={dir.counts} coverage={dir.coverage}
          query={dq} onQuery={next => setDq(d => ({ ...d, ...next }))} loading={dirLoading && agents.length === 0} base={indexAt} />}

      {/* the feed stays mounted so switching tabs does not refetch a page the
          reader already has, and is simply not drawn while the directory is up. */}
      <div className="sheet overflow-hidden" style={tab === "agents" ? { display: "none" } : undefined}>
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
        {last > 1 && tab === "activity" && (
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

      {tab === "activity" && (
        <p className="mt-4 text-xs max-w-[70ch]" style={{ color: "var(--text-medium)" }}>
          Every line here came from a log on Monad testnet, indexed to block {stats?.head ?? "…"}. A refused trade is a transaction
          that reverted, which emits no logs, so refusals cannot appear here and are not counted.
        </p>
      )}
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
