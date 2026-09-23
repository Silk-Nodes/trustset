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

/* fifteen: enough to read a morning's activity at a glance, few enough that
   the pager is still the way through rather than the scroll bar. */
const PAGE = 15;
const chip = (on: boolean) => ({ background: on ? "var(--pill-accent-bg)" : "transparent", color: on ? "var(--pill-accent-text)" : "var(--text-medium)", border: `1px solid ${on ? "var(--pill-accent-bg)" : "var(--hairline)"}` });
const chipCls = "rounded-full px-2.5 h-7 inline-flex items-center text-[12px] font-medium whitespace-nowrap outline-none focus-visible:ring-2 transition-colors";

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

  /* one row per transaction. a guardian vote that pauses an agent logs the
     vote and the pause, a rotation logs the retirement and the move, and two
     rows saying one thing made the feed read twice as busy as it was. */
  const groups = useMemo(() => {
    const out: { day: string; rows: Ev[][] }[] = [];
    for (const e of rows) {
      const d = dayOf(e.at);
      if (out.at(-1)?.day !== d) out.push({ day: d, rows: [] });
      const g = out.at(-1)!;
      const prev = g.rows.at(-1);
      if (prev && prev[0].tx_hash === e.tx_hash && prev[0].agent_id === e.agent_id) prev.push(e);
      else g.rows.push([e]);
    }
    return out;
  }, [rows]);
  const from = total === 0 ? 0 : (page - 1) * PAGE + 1;
  const to = Math.min(page * PAGE, total);

  if (state === "none") return <NoIndex />;

  /* the tabs open the same row as whichever filters belong to them, so the
     page has one line of controls above the table instead of two. the agents
     count is the whole fleet, never the filtered total: the tab names the
     thing, the pager counts the view. */
  const fleet = Object.values(dir.counts).reduce((a, b) => a + (b ?? 0), 0);
  const tabs = (
    <div className="flex gap-1 rounded-full p-1" style={{ background: "color-mix(in srgb, var(--text-dark) 5%, transparent)" }}>
      {([["agents", "Agents", fleet], ["activity", "Activity", total]] as const).map(([k, label, count]) => (
        <button key={k} type="button" onClick={() => setTab(k)} aria-current={tab === k ? "page" : undefined}
          className="rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors whitespace-nowrap inline-flex items-center gap-1.5"
          style={{ background: tab === k ? "var(--pill-accent-bg)" : "transparent", color: tab === k ? "var(--pill-accent-text)" : "var(--text-medium)" }}>
          {label}<span className="mono text-[11px] tabular" style={{ opacity: 0.65 }}>{count || ""}</span>
        </button>
      ))}
    </div>
  );

  return (
    <>
      {tab === "activity" && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {tabs}
          <span className="hidden sm:block w-px h-4 mx-1" style={{ background: "var(--hairline)" }} />
          {FILTERS.map(([k, label]) => (
            <button key={k} type="button" onClick={() => setFilter(k)} className={chipCls} style={chip(filter === k)}>{label}</button>
          ))}
        </div>
      )}

      {tab === "agents" && <Directory rows={agents} total={dir.total} counts={dir.counts} coverage={dir.coverage}
          query={dq} onQuery={next => setDq(d => ({ ...d, ...next }))} loading={dirLoading && agents.length === 0} base={indexAt} lead={tabs} />}

      {/* the feed stays mounted so switching tabs does not refetch a page the
          reader already has, and is simply not drawn while the directory is up. */}
      <div className="sheet overflow-hidden" style={tab === "agents" ? { display: "none" } : undefined}>
        {state === "loading" && rows.length === 0 && <p className="px-5 py-8 text-sm" style={{ color: "var(--text-medium)" }}>Reading the index…</p>}
        {state === "ready" && rows.length === 0 && (
          <p className="px-5 py-8 text-sm" style={{ color: "var(--text-medium)" }}>Nothing matches {q ? <span className="mono">{q}</span> : "that filter"}.</p>
        )}
        {groups.map(g => (
          <div key={g.day}>
            <div className="px-3 h-8 flex items-center eyebrow"
              style={{ background: "color-mix(in srgb, var(--surface) 94%, var(--text-dark))", borderBottom: "1px solid var(--hairline)" }}>{g.day}</div>
            {/* no AnimatePresence here. a page change replaces ten rows with ten
                others, and cross-fading them means the old ten only leave when
                their exit animation finishes, which in a backgrounded tab it
                never does: the feed ends up holding twenty. rows still animate
                in, which is the half that carries meaning. */}
            {g.rows.map(es => <Row key={es[0].id} es={es} explorer={explorer} reduced={m.reduced} />)}
          </div>
        ))}
        {total > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
            <span className="mono text-[11.5px] tabular" style={{ color: "var(--text-medium)" }}>{from} to {to} of {total} events</span>
            <span className="flex-1" />
            <div className="flex items-center gap-1">
              <PageBtn onClick={() => setPage(1)} disabled={page === 1} label="newest page">«</PageBtn>
              <PageBtn onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} label="newer">‹</PageBtn>
              <span className="mono text-[11.5px] tabular px-2" style={{ color: "var(--text-medium)" }}>{page} / {last}</span>
              <PageBtn onClick={() => setPage(p => Math.min(last, p + 1))} disabled={page >= last} label="older">›</PageBtn>
              <PageBtn onClick={() => setPage(last)} disabled={page >= last} label="oldest page">»</PageBtn>
            </div>
          </div>
        )}
      </div>

      {tab === "activity" && (
        <p className="mt-3 mono text-[11px]" style={{ color: "var(--text-medium)" }}>
          indexed to block {stats?.head ?? "…"} · <span data-tip="A refused trade is a transaction that reverted. It emits no logs, so an index built from logs cannot see it.">refusals are not logged</span>
        </p>
      )}
    </>
  );
}

function Row({ es, explorer, reduced }: { es: Ev[]; explorer: string; reduced: boolean }) {
  const e = es[0];
  /* the most telling line of the transaction leads, the rest follow it */
  /* a registration, a guardian vote that carries, and a rotation each log a
     status change as well. that change is the consequence of the other event,
     so it is dropped rather than printed as a second thing that happened. */
  const causes = es.some(x => x.kind === "AgentRegistered" || x.kind === "Rotated"
    || (x.kind === "GuardianVoted" && Number(x.data?.votes ?? 0) >= Number(x.data?.threshold ?? 1)));
  const said = (causes && es.length > 1 ? es.filter(x => x.kind !== "StatusChanged") : es).map(say);
  const lead = said.find(x => x.tone === "off") ?? said[0];
  const rest = said.filter(x => x !== lead).map(x => x.text.toLowerCase());
  const name = e.name || (e.agent_id ? `Agent ${e.agent_id}` : "Unknown");
  return (
    <motion.div initial={reduced ? { opacity: 0 } : { opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
      className="grid grid-cols-[8px_minmax(0,1fr)_auto] sm:grid-cols-[8px_minmax(0,220px)_minmax(0,1fr)_72px_96px] items-center gap-x-3 gap-y-0.5 px-3 min-h-[44px] py-2 sm:py-0"
      style={{ borderBottom: "1px solid var(--hairline)" }}>
      <span className="w-2 h-2 rounded-full" style={{ background: TONE[lead.tone] }} />
      <div className="min-w-0 flex items-baseline gap-2">
        {e.agent_id != null
          ? <Link href={`/explorer/${e.agent_id}`} className="text-[13px] font-semibold truncate hover:underline">{name}</Link>
          : <span className="text-[13px] font-semibold truncate">{name}</span>}
        {e.agent_id != null && <span className="mono text-[10.5px] shrink-0" style={{ color: "var(--text-medium)" }}>#{e.agent_id}</span>}
      </div>
      <div className="col-start-2 sm:col-start-auto row-start-2 sm:row-start-auto min-w-0 text-[13px] truncate">
        {lead.text}{rest.length > 0 && <span style={{ color: "var(--text-medium)" }}>, {rest.join(", ")}</span>}
      </div>
      <div className="mono text-[11px] tabular text-right" style={{ color: "var(--text-medium)" }}>{ago(e.at)}</div>
      <a href={`${explorer}/tx/${e.tx_hash}`} target="_blank" rel="noreferrer"
        className="hidden sm:block mono text-[11px] tabular text-right hover:underline whitespace-nowrap" style={{ color: "var(--text-medium)" }}>{e.block} ↗</a>
    </motion.div>
  );
}

function PageBtn({ onClick, disabled, label, children }: { onClick: () => void; disabled: boolean; label: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label}
      className="w-7 h-7 rounded-lg inline-flex items-center justify-center mono text-[12px] outline-none focus-visible:ring-2 disabled:opacity-30 transition-colors"
      style={{ border: "1px solid var(--hairline)", color: "var(--text-medium)" }}>{children}</button>
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
