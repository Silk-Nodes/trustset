"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { say, ago, type Ev } from "@/app/explorer/words";
import LayerIcon from "@/components/agents/LayerIcon";
import type { LayerKey } from "@/lib/layers";
import { span } from "@/lib/layers";

/* every agent on the switch, fifty at a time.
 *
 * the same table grammar as the console's fleet, because somebody who has used
 * one should not have to learn the other. two things differ. this reader owns
 * none of these agents, so the column the console spends on actions is spent
 * here on the owner. and the filtering, sorting and counting happen in
 * postgres rather than in the browser: at a thousand agents the old way was
 * ninety screens of scroll and a row cap that hid the rest while the chips
 * still claimed a total.
 *
 * every control lives above the table it controls, and the whole view lives in
 * the url, so any page of any filter is a link somebody can send. */
export type State = "trusted" | "expired" | "quiet" | "paused" | "stopped";
export type Sort = "recent" | "busy" | "expiry" | "id";
export type Row = {
  id: number; agent_key: string; cold_key: string; status: string;
  name: string | null; purpose: string | null;
  guardians: string[] | null; threshold: number;
  expires_at: string | number; heartbeat_window: string | number; last_beat: string | number;
  erc8004_id: number | null; registered_at: string;
  trusted: boolean; state: State; last_at: string | null; last_kind: string | null; events_24h: number;
  spark?: number[] | null;
};
export type Missing = "guardians" | "limits" | "identity";
export type Query = { page: number; per: number; sort: Sort; rev: boolean; states: State[]; missing: Missing[]; q: string };

/* views are just filters with a name. each one is a set of url params, so a
   view is a link as much as anything else here, and picking one twice clears it. */
const VIEWS: { key: string; label: string; states: State[]; missing: Missing[] }[] = [
  { key: "attention", label: "needs attention", states: ["expired", "quiet", "paused"], missing: [] },
  { key: "unguarded", label: "trusted, no guardians", states: ["trusted"], missing: ["guardians"] },
  { key: "unlimited", label: "no limits", states: [], missing: ["limits"] },
  { key: "unnamed", label: "unnamed", states: [], missing: ["identity"] },
];
const same = <T,>(a: T[], b: T[]) => a.length === b.length && a.every(x => b.includes(x));

const WORD: Record<State, string> = { trusted: "trusted", expired: "expired", quiet: "gone quiet", paused: "paused", stopped: "stopped" };
const STATES: State[] = ["trusted", "expired", "quiet", "paused", "stopped"];
const PERS = [25, 50, 100];
const n = (v: string | number) => typeof v === "number" ? v : Number(v || 0);
const short = (a?: string | null) => a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";
const quiet = { color: "var(--text-medium)" } as const;
const faint = { color: "var(--text-light)" } as const;
const chip = (on: boolean) => ({ background: on ? "var(--pill-accent-bg)" : "transparent", color: on ? "var(--pill-accent-text)" : "var(--text-medium)", border: `1px solid ${on ? "var(--pill-accent-bg)" : "var(--hairline)"}` });
const chipCls = "rounded-full px-2.5 h-7 inline-flex items-center gap-1.5 text-[12px] font-medium whitespace-nowrap outline-none focus-visible:ring-2 transition-colors";
const COLS_CLS = "grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1.5fr)_120px_92px_84px_64px_172px] lg:grid-cols-[minmax(0,1.5fr)_120px_92px_84px_112px_172px]";

/* the eight, and which of them this index can answer. the passkey, the human
   proof and the refunds live in contracts the indexer does not walk, so they
   are drawn faint and claim nothing. a crossed mark would be a lie. */
const COLS: { k: LayerKey; name: string }[] = [
  { k: "switch", name: "Kill switch" }, { k: "panic", name: "Panic button" }, { k: "guardians", name: "Guardians" }, { k: "limits", name: "Limits" },
  { k: "past", name: "Past signatures" }, { k: "identity", name: "Identity" }, { k: "human", name: "Human proof" }, { k: "refunds", name: "Refunds" },
];
const KNOWN: LayerKey[] = ["switch", "guardians", "limits", "past", "identity"];
type Mark = "set" | "unset" | "unknown";
function markOf(r: Row, k: LayerKey): { mark: Mark; tip: string } {
  const ends = n(r.expires_at) > 0, beats = n(r.heartbeat_window) > 0, g = r.guardians?.length ?? 0;
  if (k === "switch") return { mark: "set", tip: `Kill switch: ${r.status}` };
  if (k === "guardians") return g ? { mark: "set", tip: `Guardians: ${r.threshold} of ${g} to pause` } : { mark: "unset", tip: "Guardians: none" };
  if (k === "limits") return ends || beats
    ? { mark: "set", tip: `Limits: ${[ends ? "an end date" : null, beats ? "a heartbeat" : null].filter(Boolean).join(" and ")}` }
    : { mark: "unset", tip: "Limits: none set" };
  if (k === "past") return { mark: "set", tip: "Past signatures: answerable since registration" };
  if (k === "identity") return r.name || r.erc8004_id
    ? { mark: "set", tip: `Identity: ${r.name ? `named "${r.name}"` : ""}${r.name && r.erc8004_id ? " · " : ""}${r.erc8004_id ? `ERC-8004 #${r.erc8004_id}` : ""}` }
    : { mark: "unset", tip: "Identity: unnamed" };
  return { mark: "unknown", tip: `${COLS.find(c => c.k === k)!.name}: not in the index, open an agent to read it from the chain` };
}

export type DirectoryProps = {
  rows: Row[]; total: number; counts: Partial<Record<State, number>>; coverage: Partial<Record<string, number>>;
  query: Query; onQuery: (q: Partial<Query>) => void; loading?: boolean;
  /* where the index lives, for the hover preview. empty means this origin. */
  base?: string;
  /* whatever opens the toolbar row, the page's tabs */
  lead?: React.ReactNode;
};

export default function Directory({ rows, total, counts, coverage, query, onQuery, loading, base, lead }: DirectoryProps) {
  const router = useRouter();
  /* the keyboard cursor, the same j and k as the console's fleet. -1 is none,
     so a reader who never touches the keys never sees a highlighted row. */
  const [cursor, setCursor] = useState(-1);
  const rowEls = useRef<(HTMLAnchorElement | null)[]>([]);
  useEffect(() => { setCursor(-1); }, [query.page, query.sort, query.rev, query.states, query.missing, query.q]);
  const rowsRef = useRef(rows); rowsRef.current = rows;
  const cursorRef = useRef(cursor); cursorRef.current = cursor;
  useEffect(() => { if (cursor >= 0) rowEls.current[cursor]?.scrollIntoView({ block: "nearest" }); }, [cursor]);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || t?.closest("input, textarea, select, [contenteditable], [role=dialog]")) return;
      const len = rowsRef.current.length;
      if (!len) return;
      /* a functional update, so two presses inside one frame still move two rows */
      const move = (d: number) => { e.preventDefault(); setCursor(c => Math.min(len - 1, Math.max(0, c + d))); };
      if (e.key === "j" || e.key === "ArrowDown" && cursorRef.current >= 0) move(1);
      else if (e.key === "k" || e.key === "ArrowUp" && cursorRef.current >= 0) move(-1);
      else if ((e.key === "Enter" || e.key === "o") && cursorRef.current >= 0 && t === document.body) { e.preventDefault(); router.push(`/explorer/${rowsRef.current[cursorRef.current].id}`); }
      else if (e.key === "Escape" && cursorRef.current >= 0) setCursor(-1);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [router]);

  /* the hover preview. it waits a beat before opening so sweeping the mouse
     down the table does not flash eight cards, and once one is open the next
     row's opens at once, which is how a toolbar of tooltips should feel too. */
  const [peek, setPeek] = useState<{ row: Row; top: number; left: number; up: boolean } | null>(null);
  const [events, setEvents] = useState<Record<number, Ev[] | "loading">>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warm = useRef(false);
  const open = (r: Row, el: HTMLElement) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const b = el.getBoundingClientRect();
      const up = b.bottom + 260 > innerHeight;
      setPeek({ row: r, left: b.left + 32, top: up ? b.top - 6 : b.bottom + 6, up });
      warm.current = true;
      setEvents(prev => {
        if (prev[r.id]) return prev;
        fetch(new URL(`/api/explorer/agent?id=${r.id}&limit=3`, base || location.origin), { cache: "no-store" })
          .then(x => x.json()).then(j => setEvents(p => ({ ...p, [r.id]: j.events ?? [] })))
          .catch(() => setEvents(p => ({ ...p, [r.id]: [] })));
        return { ...prev, [r.id]: "loading" };
      });
    }, warm.current ? 0 : 380);
  };
  const close = () => {
    if (timer.current) clearTimeout(timer.current);
    setPeek(null);
    timer.current = setTimeout(() => { warm.current = false; }, 300);
  };
  useEffect(() => {
    if (!peek) return;
    const off = () => setPeek(null);
    addEventListener("scroll", off, { passive: true, capture: true });
    return () => removeEventListener("scroll", off, { capture: true });
  }, [peek]);

  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => { const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 10_000); return () => clearInterval(t); }, []);
  const [roomy, setRoomy] = useState(false);
  const [phone, setPhone] = useState(false);
  useEffect(() => { const m = matchMedia("(max-width: 767px)"); const f = () => setPhone(m.matches); f(); m.addEventListener("change", f); return () => m.removeEventListener("change", f); }, []);

  const pages = Math.max(1, Math.ceil(total / query.per));
  const from = total === 0 ? 0 : (query.page - 1) * query.per + 1;
  const to = Math.min(query.page * query.per, total);
  const h = phone ? 68 : roomy ? 50 : 38;

  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const out = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    addEventListener("mousedown", out); addEventListener("keydown", esc);
    return () => { removeEventListener("mousedown", out); removeEventListener("keydown", esc); };
  }, [menu]);
  const view = VIEWS.find(v => same(v.states, query.states) && same(v.missing, query.missing));
  const pickView = (v: typeof VIEWS[number]) => onQuery(view?.key === v.key ? { states: [], missing: [], page: 1 } : { states: v.states, missing: v.missing, page: 1 });
  const toggleState = (s: State) => onQuery({ states: query.states.includes(s) ? query.states.filter(v => v !== s) : [...query.states, s], page: 1 });
  const sortBy = (s: Sort) => onQuery(s === query.sort ? { rev: !query.rev, page: 1 } : { sort: s, rev: false, page: 1 });
  const th = (s: Sort, label: string) => (
    <button type="button" onClick={() => sortBy(s)} className="eyebrow text-left inline-flex items-center gap-1 outline-none focus-visible:ring-2 rounded"
      style={query.sort === s ? { color: "var(--text-dark)" } : undefined}>
      {label}{query.sort === s && <span aria-hidden className="text-[9px]">{query.rev ? "▴" : "▾"}</span>}
    </button>
  );

  const marks = (r: Row) => (
    <div className="flex items-center gap-1">
      {COLS.map((c, i) => {
        const { mark, tip } = markOf(r, c.k);
        return (
          <span key={c.k} data-tip={tip} {...(i >= COLS.length - 3 ? { "data-tip-end": "" } : {})}
            className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-[5px]"
            style={{
              /* ink, not orange. orange already means paused, expired and gone
                 quiet on this page, and eight orange boxes a row read as eight
                 warnings on an agent that is perfectly healthy. */
              color: mark === "set" ? "var(--text-dark)" : "var(--text-light)",
              background: mark === "set" ? "color-mix(in srgb, var(--text-dark) 8%, transparent)" : "transparent",
              border: mark === "unset" ? "1px dashed var(--hairline)" : "1px solid transparent",
              opacity: mark === "unknown" ? 0.35 : 1,
            }}>
            <LayerIcon k={c.k} size={12} />
          </span>
        );
      })}
    </div>
  );
  const word = (s: State) => (
    <span className="mono text-[10.5px] uppercase tracking-[0.1em] whitespace-nowrap"
      style={{ color: s === "trusted" ? "var(--sage-text)" : s === "stopped" ? "var(--text-medium)" : "var(--orange-text)" }}>{WORD[s]}</span>
  );

  return (
    <div className="min-w-0">
      {/* every control above the table it controls. the sort used to sit under
          it, which is the one place nobody looks for a control. */}
      <div className="relative z-[3] flex flex-wrap items-center gap-2 mb-4">
        {lead}
        {lead && <span className="hidden sm:block w-px h-4 mx-1" style={{ background: "var(--hairline)" }} />}
        {STATES.map(s => (
          <button key={s} type="button" onClick={() => toggleState(s)} className={chipCls} style={chip(query.states.includes(s))}>
            {WORD[s]}
            <span className="mono text-[11px] tabular" style={{ color: query.states.includes(s) ? "inherit" : "var(--text-light)" }}>{counts[s] ?? 0}</span>
          </button>
        ))}
        {(query.states.length > 0 || query.missing.length > 0) && <button type="button" onClick={() => onQuery({ states: [], missing: [], page: 1 })} className={chipCls} style={{ ...chip(false), border: "1px solid transparent" }}>clear</button>}

        {/* the named views live behind one control. four more chips beside the
            five states made the row read as a wall, and a view is something you
            reach for, not something you need to see every time. */}
        <div ref={menuRef} className="relative">
          <button type="button" onClick={() => setMenu(o => !o)} aria-expanded={menu} className={chipCls} style={chip(!!view || query.missing.length > 0)}>
            {view ? view.label : query.missing.length ? `missing ${query.missing.join(", ")}` : "more filters"}
            <span aria-hidden className="text-[9px]">▾</span>
          </button>
          {menu && (
            <div role="menu" className="absolute left-0 top-[calc(100%+6px)] z-[40] w-[220px] rounded-xl p-1"
              style={{ background: "var(--surface)", border: "1px solid var(--hairline)", boxShadow: "0 12px 32px rgba(0,0,0,0.22)" }}>
              {VIEWS.map(v => (
                <button key={v.key} type="button" role="menuitemradio" aria-checked={view?.key === v.key}
                  onClick={() => { pickView(v); setMenu(false); }}
                  className="w-full flex items-center gap-2 rounded-lg px-2.5 h-8 text-[12.5px] text-left outline-none hover:bg-[color-mix(in_srgb,var(--text-dark)_6%,transparent)] focus-visible:ring-2">
                  <span className="w-3 text-[11px]" style={{ color: "var(--orange-text)" }}>{view?.key === v.key ? "✓" : ""}</span>{v.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="sheet">
        <div role="row" className={`grid ${COLS_CLS} items-center gap-3 px-3 h-9 sticky z-[2]`}
          style={{ top: 64, borderBottom: "1px solid var(--hairline)", background: "color-mix(in srgb, var(--surface) 94%, var(--text-dark))" }}>
          <span className="flex items-center min-w-0">
            <span className="xl:w-[288px] shrink-0">{th("id", "agent")}</span>
            <span className="hidden xl:inline eyebrow">purpose</span>
          </span>
          {!phone && <span className="hidden md:block eyebrow">owner</span>}
          <span className="hidden md:block eyebrow">state</span>
          <span className="hidden md:block">{th("expiry", "expires")}</span>
          <span className="hidden md:flex items-center gap-2">
            {/* the sparkline sorts by how busy the day was, the time by the last event */}
            <span className="hidden lg:inline-flex w-[44px]">{th("busy", "24h")}</span>{th("recent", "last")}
          </span>
          {phone ? <span className="eyebrow">state</span> : (
            <span className="flex items-center gap-1">
              {/* the header marks carry the fleet's coverage, which used to take a
                  row of its own above the table */}
              {COLS.map((c, i) => <span key={c.k} data-tip={KNOWN.includes(c.k) ? `${c.name}: set on ${coverage[c.k] ?? 0}% of agents` : `${c.name}: not in the index`} {...(i >= COLS.length - 3 ? { "data-tip-end": "" } : {})}
                className="inline-flex w-[18px] h-[18px] items-center justify-center" style={quiet}><LayerIcon k={c.k} size={12} /></span>)}
            </span>
          )}
        </div>

        {loading && rows.length === 0 && Array.from({ length: 8 }).map((_, i) => (
          <div key={"sk" + i} className={`grid ${COLS_CLS} items-center gap-3 px-3`} style={{ height: h, borderBottom: "1px solid var(--hairline)" }} aria-hidden>
            <div className="flex items-center gap-2.5 min-w-0">
              <Bone w={8} h={8} round />
              <div className="flex flex-col gap-1.5 min-w-0 flex-1"><Bone w={"46%"} h={9} /><Bone w={"68%"} h={7} /></div>
            </div>
            {!phone && <div className="hidden md:block"><Bone w={"70%"} h={8} /></div>}
            <div className="hidden md:block"><Bone w={"60%"} h={8} /></div>
            <div className="hidden md:block"><Bone w={"50%"} h={8} /></div>
            <div className="hidden md:block"><Bone w={"55%"} h={8} /></div>
            <div className="flex gap-1">{Array.from({ length: 8 }).map((_, j) => <Bone key={j} w={18} h={18} />)}</div>
          </div>
        ))}

        {!loading && rows.length === 0 && (
          <p className="px-5 py-10 text-[13px] text-center" style={quiet}>
            {total === 0 && !query.q && query.states.length === 0 ? "No agents in the index yet." : "Nothing matches that filter."}
          </p>
        )}

        {rows.map((r, i) => {
          const ends = n(r.expires_at);
          const last = r.last_at ? Math.max(0, now - Math.floor(Date.parse(r.last_at) / 1000)) : null;
          return (
            <Link key={r.id} href={`/explorer/${r.id}`} ref={el => { rowEls.current[i] = el; }}
              onMouseEnter={e => { if (!phone) open(r, e.currentTarget); }} onMouseLeave={close}
              onFocus={() => setCursor(i)} aria-current={cursor === i ? "true" : undefined}
              className={`group grid ${COLS_CLS} items-center gap-3 px-3 outline-none focus-visible:ring-2 focus-visible:ring-inset transition-colors hover:bg-[color-mix(in_srgb,var(--text-dark)_4%,transparent)]`}
              style={{ height: h, borderBottom: "1px solid var(--hairline)", ...(cursor === i ? { background: "color-mix(in srgb, var(--orange) 8%, transparent)", boxShadow: "inset 2px 0 0 var(--orange)" } : null) }}>
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: r.state === "trusted" ? "var(--sage)" : r.state === "stopped" ? "var(--text-light)" : "var(--terra)" }} />
                <div className="min-w-0 leading-tight xl:w-[260px] xl:shrink-0">
                  <div className="text-[13px] font-semibold truncate">{r.name || `Agent ${r.id}`}</div>
                  <div className="mono text-[10.5px] truncate" style={quiet}>agent {r.id} · {short(r.agent_key)}{r.erc8004_id ? ` · 8004 #${r.erc8004_id}` : ""}</div>
                  {phone && <div className="mt-1">{marks(r)}</div>}
                </div>
                {/* the sentence the owner wrote, in the band that used to be empty */}
                <span className="hidden xl:block min-w-0 truncate text-[12.5px]" style={r.purpose ? quiet : faint}>{r.purpose || "no purpose given"}</span>
              </div>
              {!phone && <div className="hidden md:block mono text-[11.5px] truncate" style={quiet}>{short(r.cold_key)}</div>}
              <div className="hidden md:block">{word(r.state)}</div>
              <div className="hidden md:block mono text-[11.5px] tabular">
                {ends === 0 ? <span style={quiet}>none</span> : ends <= now ? <span style={{ color: "var(--orange-text)" }}>ran out</span> : <span style={ends - now <= 86400 ? { color: "var(--orange-text)" } : undefined}>{span(ends - now)}</span>}
              </div>
              <div className="hidden md:flex items-center gap-2 mono text-[11.5px] tabular" style={quiet}>
                <span className="hidden lg:inline-flex" data-tip={`${r.events_24h} event${r.events_24h === 1 ? "" : "s"} in the last 24 hours`}><Spark v={r.spark} tone={r.state} /></span>
                {last === null ? <span style={faint}>never</span> : span(last)}
              </div>
              <div>{phone ? word(r.state) : marks(r)}</div>
            </Link>
          );
        })}

        {/* the pager says which rows these are out of how many. "page 3" on its
            own tells a reader nothing about how much is left. */}
        {total > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
            <span className="mono text-[11.5px] tabular" style={quiet}>{from} to {to} of {total}</span>
            {!phone && <span className="hidden lg:inline mono text-[10.5px]" style={faint}>j k move · enter open</span>}
            {!phone && <span className="hidden lg:block w-px h-3" style={{ background: "var(--hairline)" }} />}
            {!phone && <button type="button" onClick={() => setRoomy(r => !r)} className="mono text-[11px] hover:underline" style={quiet}>{roomy ? "compact rows" : "roomy rows"}</button>}
            <span className="flex-1" />
            <label className="flex items-center gap-1.5 mono text-[11px]" style={quiet}>
              per page
              <select value={query.per} onChange={e => onQuery({ per: Number(e.target.value), page: 1 })}
                className="rounded-lg px-1.5 py-1 text-[11px] outline-none focus-visible:ring-2"
                style={{ background: "var(--bg-base)", border: "1px solid var(--hairline)", color: "var(--text-dark)" }}>
                {PERS.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            <div className="flex items-center gap-1">
              <Page onClick={() => onQuery({ page: 1 })} disabled={query.page === 1} label="first page">«</Page>
              <Page onClick={() => onQuery({ page: query.page - 1 })} disabled={query.page === 1} label="previous page">‹</Page>
              <span className="mono text-[11.5px] tabular px-2" style={quiet}>{query.page} / {pages}</span>
              <Page onClick={() => onQuery({ page: query.page + 1 })} disabled={query.page >= pages} label="next page">›</Page>
              <Page onClick={() => onQuery({ page: pages })} disabled={query.page >= pages} label="last page">»</Page>
            </div>
          </div>
        )}
      </div>
      {peek && typeof document !== "undefined" && createPortal(<Preview row={peek.row} top={peek.top} left={peek.left} up={peek.up} now={now} events={events[peek.row.id]} />, document.body)}
    </div>
  );
}

/* 24 hourly bars, oldest on the left. an agent that has gone silent reads as a
   flat line with a tail, which is the thing a count of events cannot show. */
function Spark({ v, tone, w = 44, hgt = 14 }: { v?: number[] | null; tone: State; w?: number; hgt?: number }) {
  const b = v?.length === 24 ? v : Array(24).fill(0);
  const max = Math.max(1, ...b);
  const bw = w / 24;
  const fill = tone === "trusted" ? "var(--sage)" : tone === "stopped" ? "var(--text-light)" : "var(--terra)";
  return (
    <svg width={w} height={hgt} viewBox={`0 0 ${w} ${hgt}`} aria-hidden className="shrink-0">
      <line x1="0" x2={w} y1={hgt - 0.5} y2={hgt - 0.5} stroke="var(--hairline)" strokeWidth="1" />
      {b.map((n, i) => n > 0 && <rect key={i} x={i * bw + 0.3} width={Math.max(1, bw - 0.6)} y={hgt - 1 - Math.max(2, (n / max) * (hgt - 2))} height={Math.max(2, (n / max) * (hgt - 2))} rx="0.5" fill={fill} />)}
    </svg>
  );
}

/* the card a hovered row opens: every setting the index can answer, then the
   last three things the agent did. it never takes the pointer, so it cannot
   trap the mouse or hide the row under it from a click. */
function Preview({ row: r, top, left, up, now, events }: { row: Row; top: number; left: number; up: boolean; now: number; events?: Ev[] | "loading" }) {
  const ends = n(r.expires_at), win = n(r.heartbeat_window), beat = n(r.last_beat), g = r.guardians?.length ?? 0;
  const line = (k: string, v: React.ReactNode, warn?: boolean) => (
    <div className="flex items-baseline gap-3 text-[12px]">
      <span className="w-[74px] shrink-0 eyebrow">{k}</span>
      <span className="min-w-0 truncate" style={warn ? { color: "var(--orange-text)" } : undefined}>{v}</span>
    </div>
  );
  return (
    <div role="tooltip" className="fixed z-[80] w-[340px] max-w-[calc(100vw-32px)] rounded-xl p-3.5 pointer-events-none"
      style={{ top, left: Math.min(left, innerWidth - 356), transform: up ? "translateY(-100%)" : undefined, background: "var(--surface)", border: "1px solid var(--hairline)", boxShadow: "0 16px 40px rgba(0,0,0,0.22)" }}>
      <div className="flex items-center gap-2 mb-0.5">
        <span className="text-[14px] font-semibold truncate">{r.name || `Agent ${r.id}`}</span>
        <span className="ml-auto mono text-[10.5px] uppercase tracking-[0.1em]" style={{ color: r.state === "trusted" ? "var(--sage-text)" : r.state === "stopped" ? "var(--text-medium)" : "var(--orange-text)" }}>{WORD[r.state]}</span>
      </div>
      {r.purpose && <p className="text-[12px] mb-2.5 line-clamp-2" style={quiet}>{r.purpose}</p>}
      <div className="flex flex-col gap-1 pt-2.5 mb-3" style={{ borderTop: "1px solid var(--hairline)" }}>
        {line("owner", <span className="mono">{short(r.cold_key)}</span>)}
        {line("guardians", g ? `${r.threshold} of ${g} to pause` : "none", !g)}
        {line("ends", ends === 0 ? "never" : ends <= now ? "ran out" : `in ${span(ends - now)}`, ends !== 0 && ends - now <= 86400)}
        {line("heartbeat", win === 0 ? "not required" : beat + win < now ? `missed, due every ${span(win)}` : `every ${span(win)}, next within ${span(beat + win - now)}`, win !== 0 && beat + win < now)}
        {line("identity", r.name ? `named${r.erc8004_id ? `, ERC-8004 #${r.erc8004_id}` : ""}` : r.erc8004_id ? `ERC-8004 #${r.erc8004_id}` : "unnamed")}
      </div>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="eyebrow">last 24 hours</span>
        <span className="ml-auto mono text-[11px] tabular" style={quiet}>{r.events_24h} event{r.events_24h === 1 ? "" : "s"}</span>
      </div>
      <Spark v={r.spark} tone={r.state} w={312} hgt={22} />
      <div className="flex flex-col gap-1 mt-3 pt-2.5" style={{ borderTop: "1px solid var(--hairline)" }}>
        {events === undefined || events === "loading" ? (
          [0, 1, 2].map(i => <Bone key={i} w={i === 1 ? "70%" : "85%"} h={9} />)
        ) : events.length === 0 ? (
          <span className="text-[12px]" style={quiet}>Nothing on record yet.</span>
        ) : events.map(e => (
          <div key={e.id} className="flex items-baseline gap-3 text-[12px]">
            <span className="min-w-0 truncate">{say(e).text}</span>
            <span className="ml-auto mono text-[10.5px] shrink-0" style={faint}>{ago(e.at)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Page({ onClick, disabled, label, children }: { onClick: () => void; disabled: boolean; label: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label}
      className="w-7 h-7 rounded-lg inline-flex items-center justify-center mono text-[12px] outline-none focus-visible:ring-2 disabled:opacity-30 transition-colors"
      style={{ border: "1px solid var(--hairline)", color: "var(--text-medium)" }}>{children}</button>
  );
}

/* one skeleton bar, pulsed in css rather than by a motion component: eighty of
   these should not each own a javascript clock. */
function Bone({ w, h, round }: { w: number | string; h: number; round?: boolean }) {
  return <span className="block animate-pulse" style={{ width: w, height: h, borderRadius: round ? 999 : 4, background: "color-mix(in srgb, var(--text-dark) 9%, transparent)" }} />;
}
