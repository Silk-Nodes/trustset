"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { type Agent, short } from "@/lib/chain";
import { type LayerKey, type PulseEvent, span, switchState } from "@/lib/layers";
import { type Bucket, type Density, type Filter, type Group, type Row, type Sort, type StateKey, type View, BUILT_IN, GROUP_WORD, NO_FILTER, SORT_WORD, STATE_WORD, apply, counts, densityFor, fromParams, grouped, isFiltered, loadDensity, loadViews, saveDensity, saveViews, toParams } from "@/lib/fleet";
import LayerIcon from "./LayerIcon";
import Pulse from "./Pulse";
import StatusDot from "./StatusDot";
import Switch from "./Switch";

/* the fleet. every agent this wallet owns, at the density the reader chose.
 *
 * fleet is the default: a views rail, a count strip, a table with the eight
 * layers as eight columns, group headers, a bulk bar, and rows drawn only
 * while on screen. rows drops the furniture, cards adds the switch and the
 * pulse inline. the columns never change between densities; only the air
 * around them does, so a habit formed at three agents works at three hundred.
 * the view lives in the url, so a filtered fleet can be sent to someone. */
const LAYERS: { k: LayerKey; name: string }[] = [
  { k: "switch", name: "Kill switch" }, { k: "panic", name: "Panic button" }, { k: "guardians", name: "Guardians" }, { k: "limits", name: "Limits" },
  { k: "past", name: "Past signatures" }, { k: "identity", name: "Identity" }, { k: "human", name: "Human proof" }, { k: "refunds", name: "Refunds" },
];
const STATES: StateKey[] = ["trusted", "expired", "quiet", "paused", "stopped"];
const HEIGHT: Record<Density, number> = { cards: 76, rows: 44, fleet: 40 };
const DAY = 86400;
const WINDOWS: [string, number][] = [["Off", 0], ["10 minutes", 600], ["1 hour", 3600], ["6 hours", 21600], ["1 day", DAY]];
const ENDS: [string, number][] = [["Never", 0], ["1 day", DAY], ["7 days", 7 * DAY], ["30 days", 30 * DAY], ["90 days", 90 * DAY]];
const quiet = { color: "var(--text-medium)" } as const;
const faint = { color: "var(--text-light)" } as const;
const chip = (on: boolean) => ({ background: on ? "var(--pill-accent-bg)" : "transparent", color: on ? "var(--pill-accent-text)" : "var(--text-medium)", border: `1px solid ${on ? "var(--pill-accent-bg)" : "var(--hairline)"}` });
const chipCls = "rounded-full px-2.5 h-7 inline-flex items-center gap-1.5 text-[12px] font-medium whitespace-nowrap outline-none focus-visible:ring-2 transition-colors";
const btn = { padding: "4px 10px", fontSize: "0.74rem" } as const;
const field = { background: "var(--bg-base)", border: "1px solid var(--hairline)", color: "var(--text-dark)" } as const;

export type BulkKind = "pause" | "resume" | "stop" | "limits";
export type FleetProps = {
  agents: Agent[]; rows: Row[]; now: number; pulses: Record<string, { events: PulseEvent[] } | undefined>;
  busy: Set<string>; canSign: boolean;
  onOpen: (id: bigint, open?: LayerKey) => void; onToggle: (a: Agent) => void; onStop: (a: Agent) => void;
  onBulk: (kind: BulkKind, rows: Row[], limits?: { expiresAt: number; window: number }) => void;
};

export default function Fleet(p: FleetProps) {
  const { rows, now } = p;
  /* density: fleet unless the reader chose otherwise; auto lets the count pick */
  const [chosen, setChosen] = useState<Density | null>("fleet");
  useEffect(() => { setChosen(loadDensity() ?? "fleet"); }, []);
  const density: Density = chosen ?? densityFor(p.agents.length);
  const pick = (d: Density | null) => { setChosen(d); saveDensity(d); };

  /* the view: filter, sort, grouping. built-ins plus the browser's own. read
     from the url once, written back on every change. */
  const [saved, setSaved] = useState<View[]>([]);
  const views = useMemo(() => [...BUILT_IN, ...saved], [saved]);
  const [viewId, setViewId] = useState<string>("all");
  const [f, setF] = useState<Filter>(NO_FILTER);
  const [sort, setSort] = useState<Sort>("attention");
  const [rev, setRev] = useState(false);
  const [group, setGroup] = useState<Group>("none");
  const ready = useRef(false);
  useEffect(() => {
    const sv = loadViews(); setSaved(sv);
    const u = fromParams(new URLSearchParams(location.search));
    if (u) {
      const v = [...BUILT_IN, ...sv].find(x => x.id === u.viewId);
      if (v && !isFiltered(u.filter) && u.sort === "attention" && u.group === "none") { setViewId(v.id); setF(v.filter); setSort(v.sort); setGroup(v.group); setRev(!!v.rev); }
      else { setViewId(u.viewId ?? "-"); setF(u.filter); setSort(u.sort); setGroup(u.group); setRev(u.rev); }
    }
    ready.current = true;
  }, []);
  useEffect(() => {
    if (!ready.current) return;
    const p = toParams({ viewId, filter: f, sort, group, rev }, new URLSearchParams(location.search));
    const q = p.toString();
    history.replaceState(null, "", location.pathname + (q ? "?" + q : ""));
  }, [viewId, f, sort, group, rev]);
  const openView = (v: View) => { setViewId(v.id); setF(v.filter); setSort(v.sort); setGroup(v.group); setRev(!!v.rev); setSel(new Set()); };
  const current = views.find(v => v.id === viewId);
  const dirty = !current || JSON.stringify(current.filter) !== JSON.stringify(f) || current.sort !== sort || current.group !== group || !!current.rev !== rev;
  /* saving and renaming, inline. no browser prompt. */
  const [naming, setNaming] = useState<null | { id?: string; text: string }>(null);
  const commitName = () => {
    if (!naming) return; const text = naming.text.trim(); if (!text) { setNaming(null); return; }
    if (naming.id) { const next = saved.map(v => v.id === naming.id ? { ...v, name: text } : v); setSaved(next); saveViews(next); }
    else { const v: View = { id: `v${Date.now()}`, name: text, filter: f, sort, group, rev }; const next = [...saved, v]; setSaved(next); saveViews(next); setViewId(v.id); }
    setNaming(null);
  };
  const dropView = (id: string) => { const next = saved.filter(v => v.id !== id); setSaved(next); saveViews(next); if (viewId === id) openView(BUILT_IN[0]); };

  const shown = useMemo(() => apply(rows, f, sort, rev), [rows, f, sort, rev]);
  const buckets = useMemo(() => grouped(shown, group), [shown, group]);
  const c = useMemo(() => counts(rows), [rows]);

  /* selection and the cursor. j and k walk, enter opens, x selects, / finds. */
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState(0);
  const search = useRef<HTMLInputElement>(null);
  const flat = shown;
  useEffect(() => { if (cursor >= flat.length) setCursor(Math.max(0, flat.length - 1)); }, [flat.length, cursor]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if (e.key === "/" && !typing) { e.preventDefault(); search.current?.focus(); return; }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "j" || e.key === "ArrowDown") { e.preventDefault(); setCursor(i => Math.min(flat.length - 1, i + 1)); }
      else if (e.key === "k" || e.key === "ArrowUp") { e.preventDefault(); setCursor(i => Math.max(0, i - 1)); }
      else if (e.key === "Enter" && flat[cursor]) p.onOpen(flat[cursor].a.id);
      else if (e.key === "x" && flat[cursor] && density !== "cards") toggleSel(flat[cursor].id);
      else if (e.key === "Escape") setSel(new Set());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flat, cursor, density]);
  const toggleSel = (id: string) => setSel(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selected = flat.filter(r => sel.has(r.id));
  const [limitsOpen, setLimitsOpen] = useState(false);
  const [bEnds, setBEnds] = useState(0); const [bWin, setBWin] = useState(0);

  /* the list draws only what is on screen once it is long. every item, group
     header included, is one row height, so a scroll offset is one division. */
  type Item = { kind: "group"; b: Bucket } | { kind: "row"; r: Row; i: number };
  const items = useMemo<Item[]>(() => {
    const out: Item[] = []; let i = 0;
    for (const b of buckets) { if (b.label) out.push({ kind: "group", b }); for (const r of b.rows) out.push({ kind: "row", r, i: i++ }); }
    return out;
  }, [buckets]);
  const fleet = density === "fleet", cards = density === "cards";
  /* the views rail needs a wide screen; below it the views are chips */
  const [wide, setWide] = useState(true);
  useEffect(() => { const m = matchMedia("(min-width: 1024px)"); const f = () => setWide(m.matches); f(); m.addEventListener("change", f); return () => m.removeEventListener("change", f); }, []);
  /* a phone gets the same columns folded: the marks under the name, the state
     word at the right, and the filters behind one chip */
  const [phone, setPhone] = useState(false);
  useEffect(() => { const m = matchMedia("(max-width: 767px)"); const f = () => setPhone(m.matches); f(); m.addEventListener("change", f); return () => m.removeEventListener("change", f); }, []);
  const h = phone ? (density === "cards" ? 80 : 68) : HEIGHT[density];
  const scroller = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(0);
  const [vh, setVh] = useState(800);
  useEffect(() => {
    const el = scroller.current; if (!el) return;
    const ro = new ResizeObserver(() => setVh(el.clientHeight)); ro.observe(el); setVh(el.clientHeight);
    return () => ro.disconnect();
  }, [density, phone]);
  const windowed = items.length > 60;
  const start = windowed ? Math.max(0, Math.floor(top / h) - 6) : 0;
  const end = windowed ? Math.min(items.length, Math.ceil((top + vh) / h) + 6) : items.length;
  useEffect(() => {
    const el = scroller.current; if (!el || !windowed) return;
    const idx = items.findIndex(it => it.kind === "row" && it.i === cursor); if (idx < 0) return;
    const y = idx * h; if (y < el.scrollTop) el.scrollTop = y; else if (y + h > el.scrollTop + el.clientHeight) el.scrollTop = y + h - el.clientHeight;
  }, [cursor, items, h, windowed]);

  const setState = (s: StateKey) => setF(x => ({ ...x, states: x.states.includes(s) ? x.states.filter(v => v !== s) : [...x.states, s], attention: false }));
  const setMissing = (k: LayerKey) => setF(x => ({ ...x, missing: x.missing.includes(k) ? x.missing.filter(v => v !== k) : [...x.missing, k] }));
  /* a header press sorts by that column; a second press turns it round */
  const sortBy = (s: Sort) => { if (sort === s) setRev(r => !r); else { setSort(s); setRev(false); } };

  /* grid columns are the same at every density; cards add a switch and a
     pulse, rows and fleet add a quick-action column at the end */
  const cols = cards
    ? "grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1.2fr)_132px_minmax(100px,1fr)_64px_172px_84px]"
    : "grid-cols-[24px_minmax(0,1fr)_auto] md:grid-cols-[24px_minmax(0,1fr)_190px_92px_88px_84px_172px]";

  const viewRow = (v: View, vertical: boolean) => {
    const on = viewId === v.id;
    const n = v.id === "attention" ? c.attention : v.id === "24h" ? c.within24 : 0;
    if (naming?.id === v.id) return <input key={v.id} autoFocus value={naming.text} onChange={e => setNaming({ id: v.id, text: e.target.value })} onBlur={commitName} onKeyDown={e => { if (e.key === "Enter") commitName(); if (e.key === "Escape") setNaming(null); }} className="h-8 w-full rounded-lg px-2.5 text-[13px] outline-none focus-visible:ring-2" style={field} />;
    return (
      <div key={v.id} className={vertical ? "group flex items-center" : "inline-flex"}>
        <button type="button" onClick={() => openView(v)} onDoubleClick={() => { if (!v.builtIn) setNaming({ id: v.id, text: v.name }); }} aria-current={on ? "page" : undefined}
          className={vertical ? "flex-1 min-w-0 text-left flex items-center gap-2 rounded-lg px-2.5 h-8 text-[13px] outline-none focus-visible:ring-2" : chipCls}
          style={vertical ? { background: on ? "color-mix(in srgb, var(--text-dark) 7%, transparent)" : "transparent", color: on ? "var(--text-dark)" : "var(--text-medium)", fontWeight: on ? 600 : 500 } : chip(on)}>
          <span className="truncate">{v.name}</span>
          {n > 0 && <span className="mono text-[11px] tabular ml-auto" style={{ color: on && !vertical ? "inherit" : v.id === "attention" ? "var(--orange-text)" : "var(--text-medium)" }}>{n}</span>}
        </button>
        {!v.builtIn && vertical && (
          <span className="flex opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
            <button type="button" onClick={() => setNaming({ id: v.id, text: v.name })} className="w-6 h-8 text-[11px]" style={faint} aria-label={`rename ${v.name}`}>✎</button>
            <button type="button" onClick={() => dropView(v.id)} className="w-6 h-8 text-[12px]" style={faint} aria-label={`remove ${v.name}`}>×</button>
          </span>
        )}
      </div>
    );
  };
  const viewList = (vertical: boolean) => (
    <>
      {views.map(v => viewRow(v, vertical))}
      {dirty && (naming && !naming.id
        ? <input autoFocus value={naming.text} onChange={e => setNaming({ text: e.target.value })} onBlur={commitName} onKeyDown={e => { if (e.key === "Enter") commitName(); if (e.key === "Escape") setNaming(null); }} placeholder="name this view" className={vertical ? "h-8 w-full rounded-lg px-2.5 text-[13px] outline-none focus-visible:ring-2 mt-1" : "h-7 rounded-full px-2.5 text-[12px] outline-none focus-visible:ring-2"} style={field} />
        : <button type="button" onClick={() => setNaming({ text: "" })} className={vertical ? "w-full text-left rounded-lg px-2.5 h-8 text-[12px] outline-none focus-visible:ring-2 mt-1" : chipCls} style={vertical ? faint : { ...chip(false), borderStyle: "dashed" }}>+ save view</button>)}
    </>
  );

  /* the eight marks. orange when set, dashed when not, dimmed until the
     extras that decide three of them have arrived. */
  const dots = (r: Row) => (
    <div className="flex items-center gap-1" aria-label={r.known ? `${r.set} of 8 layers set` : "reading"} style={{ opacity: r.known ? 1 : 0.4, transition: "opacity .3s" }}>
      {r.layers.map(l => (
        <span key={l.key} data-tip={r.known ? `${l.name}: ${l.value}` : `${l.name}: reading…`} className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-[5px]"
          style={{ color: l.set ? "var(--orange-text)" : "var(--text-light)", background: l.set ? "color-mix(in srgb, var(--orange) 16%, transparent)" : "transparent", border: l.set ? "1px solid color-mix(in srgb, var(--orange) 35%, transparent)" : "1px dashed var(--hairline)" }}>
          <LayerIcon k={l.key} size={12} />
        </span>
      ))}
    </div>
  );
  /* the state word is one press from its fix: an end date or a missed beat
     opens the limits, a pause opens the agent with its switch in reach. */
  const fixOf = (r: Row): LayerKey | undefined => r.state === "expired" || r.state === "quiet" ? "limits" : undefined;
  const stateWord = (r: Row) => (
    <button type="button" onClick={e => { e.stopPropagation(); p.onOpen(r.a.id, fixOf(r)); }} data-tip={r.state === "expired" || r.state === "quiet" ? "open its limits" : r.state === "paused" ? "open the switch" : undefined}
      className="mono text-[10.5px] uppercase tracking-[0.1em] whitespace-nowrap rounded outline-none focus-visible:ring-2 hover:underline text-left"
      style={{ color: r.state === "trusted" ? "var(--sage-text)" : r.state === "stopped" ? "var(--text-medium)" : "var(--orange-text)" }}>{STATE_WORD[r.state]}</button>
  );
  const expires = (r: Row) => r.expiresIn === null ? <span style={quiet}>none</span> : r.expiresIn <= 0 ? <span style={{ color: "var(--orange-text)" }}>ran out</span> : <span style={r.expiresIn <= DAY ? { color: "var(--orange-text)" } : undefined}>{span(r.expiresIn)}</span>;
  const last = (r: Row) => r.last === null ? <span data-tip="the index is not reachable" style={faint}>index away</span> : <span style={quiet}>{span(r.last)}</span>;
  /* the quick actions at a row's end: pause or bring back in one press,
     stop with a held one. shown on hover and focus so the table stays quiet. */
  const quick = (r: Row) => {
    const ended = r.state === "stopped";
    const paused = r.a.status === "paused";
    return (
      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity whitespace-nowrap" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
        {!ended && <button type="button" className="drawn-btn btn-gold" style={btn} disabled={!p.canSign || p.busy.has("p" + r.id)} onClick={() => p.onToggle(r.a)}>{p.busy.has("p" + r.id) ? "…" : paused ? "bring back" : "pause"}</button>}
        {!ended && <Hold small disabled={!p.canSign || p.busy.has(r.id)} onHeld={() => p.onStop(r.a)} />}
      </div>
    );
  };
  const th = (s: Sort, label: string) => (
    <button type="button" onClick={() => sortBy(s)} className="eyebrow text-left inline-flex items-center gap-1 outline-none focus-visible:ring-2 rounded" style={sort === s ? { color: "var(--text-dark)" } : undefined} aria-sort={sort === s ? (rev ? "descending" : "ascending") : "none"}>
      {label}{sort === s && <span aria-hidden className="text-[9px]">{rev ? "▴" : "▾"}</span>}
    </button>
  );

  const rowEl = (r: Row, i: number) => {
    const on = i === cursor, isSel = sel.has(r.id);
    const ev = p.pulses[r.id]?.events ?? [];
    const sw = switchState(r.a, ev);
    return (
      <div key={r.id} role="row" aria-selected={isSel} data-cursor={on || undefined}
        onClick={() => { setCursor(i); p.onOpen(r.a.id); }} onKeyDown={e => { if (e.key === "Enter") p.onOpen(r.a.id); }} tabIndex={0}
        className={`group grid ${cols} items-center gap-3 px-3 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset transition-colors`}
        style={{ height: h, borderBottom: "1px solid var(--hairline)", background: isSel ? "color-mix(in srgb, var(--orange) 8%, transparent)" : on ? "color-mix(in srgb, var(--text-dark) 4%, transparent)" : "transparent" }}>
        {!cards && (
          <span role="gridcell" onClick={e => { e.stopPropagation(); if (e.target === e.currentTarget) toggleSel(r.id); }} className="inline-flex items-center justify-center w-6 h-6 -ml-1">
            <input type="checkbox" checked={isSel} onChange={() => toggleSel(r.id)} aria-label={`select ${r.name}`} className="w-3.5 h-3.5 accent-[var(--orange)]" />
          </span>
        )}
        <div role="gridcell" className="flex items-center gap-2.5 min-w-0">
          <StatusDot status={r.a.status} size={8} live={r.state === "trusted"} />
          <div className="min-w-0 leading-tight">
            <div className={`truncate ${cards ? "text-[14px]" : "text-[13px]"} font-semibold`}>{r.name}</div>
            <div className="mono text-[10.5px] truncate" style={quiet}>agent {r.id} · {short(r.a.key)}{r.tag ? ` · ${r.tag}` : ""}</div>
            {phone && <div className="mt-1">{dots(r)}</div>}
          </div>
        </div>
        {!cards && !phone && <div role="gridcell" className="hidden md:block">{quick(r)}</div>}
        {cards
          ? <div role="gridcell" className="hidden md:block" onClick={e => e.stopPropagation()}><Switch state={sw} live={r.state === "trusted"} busy={p.busy.has("p" + r.id)} disabled={!p.canSign} onToggle={() => p.onToggle(r.a)} label={sw === "on" ? `pause ${r.name}` : `bring ${r.name} back`} /></div>
          : <div role="gridcell" className="hidden md:block">{stateWord(r)}</div>}
        {cards
          ? <div role="gridcell" className="hidden md:block min-w-0"><Pulse events={ev} now={now} height={22} /></div>
          : <div role="gridcell" className="hidden md:block mono text-[11.5px] tabular">{expires(r)}</div>}
        <div role="gridcell" className="hidden md:block mono text-[11.5px] tabular">{last(r)}</div>
        <div role="gridcell">{phone ? stateWord(r) : dots(r)}</div>
        {cards && !phone && <div role="gridcell" className="hidden md:block"><div className="flex justify-end opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>{r.state !== "stopped" && <Hold small disabled={!p.canSign || p.busy.has(r.id)} onHeld={() => p.onStop(r.a)} />}</div></div>}
      </div>
    );
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3 min-w-0">
      {/* the count strip: four numbers, each a filter */}
      {fleet && !phone && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {([["trusted", c.trusted, "trusted", () => { openView(BUILT_IN[0]); setF({ ...NO_FILTER, states: ["trusted"] }); }], ["attention", c.attention, "need attention", () => openView(BUILT_IN[1])], ["24h", c.within24, "expire in 24h", () => openView(BUILT_IN[2])], ["stopped", c.stopped, "stopped", () => { openView(BUILT_IN[0]); setF({ ...NO_FILTER, states: ["stopped"] }); }]] as [string, number, string, () => void][]).map(([k, n, w, go]) => (
            <button key={k} type="button" onClick={go} className="sheet text-left px-4 py-3 outline-none focus-visible:ring-2 flex items-baseline gap-2">
              <span className="text-[22px] font-semibold tabular tracking-[-0.02em]" style={{ color: k === "attention" && n > 0 ? "var(--orange-text)" : "var(--text-dark)" }}>{n}</span>
              <span className="text-[12px]" style={quiet}>{w}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 min-h-0 flex gap-4">
        {fleet && wide && <nav aria-label="Views" className="flex w-[220px] shrink-0 flex-col gap-0.5"><div className="eyebrow px-2.5 mb-1">views</div>{viewList(true)}</nav>}

        <div className="flex-1 min-h-0 min-w-0 flex flex-col">
          {/* toolbar: search, then the filters the density earns */}
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <label className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 mono text-[11px]" style={faint}>/</span>
              <input ref={search} value={f.q} onChange={e => setF(x => ({ ...x, q: e.target.value }))} placeholder="name, id, key" spellCheck={false}
                className="h-8 w-[200px] rounded-full pl-7 pr-3 text-[13px] outline-none focus-visible:ring-2" style={{ background: "var(--surface)", border: "1px solid var(--hairline)", color: "var(--text-dark)" }} />
            </label>
            {!cards && phone && (
              <>
                <Menu label={f.states.length ? f.states.map(s => STATE_WORD[s]).join(", ") : "state"} on={f.states.length > 0}>
                  {STATES.map(s => <Check key={s} on={f.states.includes(s)} onClick={() => setState(s)}>{STATE_WORD[s]}</Check>)}
                </Menu>
                <Menu label="more" on={f.missing.length > 0 || f.within > 0 || f.active24 || group !== "none"} align="right">
                  <div className="eyebrow px-2.5 pt-1.5 pb-1">missing layer</div>
                  {LAYERS.filter(l => l.k !== "switch" && l.k !== "past").map(l => <Check key={l.k} on={f.missing.includes(l.k)} onClick={() => setMissing(l.k)}><LayerIcon k={l.k} size={13} />{l.name}</Check>)}
                  <div className="eyebrow px-2.5 pt-2 pb-1">expires in</div>
                  {([["off", 0], ["a day", DAY], ["a week", 7 * DAY], ["30 days", 30 * DAY]] as [string, number][]).map(([w, s]) => <Check key={s} on={f.within === s} onClick={() => setF(x => ({ ...x, within: s }))}>{w}</Check>)}
                  <Check on={f.active24} onClick={() => setF(x => ({ ...x, active24: !x.active24 }))}>active in 24h</Check>
                  <div className="eyebrow px-2.5 pt-2 pb-1">group</div>
                  {(Object.keys(GROUP_WORD) as Group[]).map(g => <Check key={g} on={group === g} onClick={() => setGroup(g)}>{GROUP_WORD[g]}</Check>)}
                  <div className="eyebrow px-2.5 pt-2 pb-1">sort</div>
                  {(Object.keys(SORT_WORD) as Sort[]).map(s => <Check key={s} on={sort === s} onClick={() => setSort(s)}>{SORT_WORD[s]}</Check>)}
                </Menu>
                {isFiltered(f) && <button type="button" onClick={() => setF(NO_FILTER)} className={chipCls} style={{ ...chip(false), border: "1px solid transparent" }}>clear</button>}
                <span className="flex-1" />
              </>
            )}
            {!cards && !phone && (
              <>
                <Menu label={f.states.length ? f.states.map(s => STATE_WORD[s]).join(", ") : "state"} on={f.states.length > 0}>
                  {STATES.map(s => <Check key={s} on={f.states.includes(s)} onClick={() => setState(s)}>{STATE_WORD[s]}</Check>)}
                </Menu>
                <Menu label={f.missing.length ? `missing ${f.missing.length}` : "missing layer"} on={f.missing.length > 0}>
                  {LAYERS.filter(l => l.k !== "switch" && l.k !== "past").map(l => <Check key={l.k} on={f.missing.includes(l.k)} onClick={() => setMissing(l.k)}><LayerIcon k={l.k} size={13} />{l.name}</Check>)}
                </Menu>
                <Menu label={f.within ? `expires in ${span(f.within)}` : "expires in"} on={f.within > 0}>
                  {([["off", 0], ["a day", DAY], ["a week", 7 * DAY], ["30 days", 30 * DAY]] as [string, number][]).map(([w, s]) => <Check key={s} on={f.within === s} onClick={() => setF(x => ({ ...x, within: s }))}>{w}</Check>)}
                </Menu>
                <button type="button" onClick={() => setF(x => ({ ...x, active24: !x.active24 }))} className={chipCls} style={chip(f.active24)}>active 24h</button>
                {isFiltered(f) && <button type="button" onClick={() => setF(NO_FILTER)} className={chipCls} style={{ ...chip(false), border: "1px solid transparent" }}>clear</button>}
                <span className="flex-1" />
                <Menu label={GROUP_WORD[group]} on={group !== "none"}>{(Object.keys(GROUP_WORD) as Group[]).map(g => <Check key={g} on={group === g} onClick={() => setGroup(g)}>{GROUP_WORD[g]}</Check>)}</Menu>
                <Menu label={`${SORT_WORD[sort]}${rev ? " ↑" : ""}`} on={false}>{(Object.keys(SORT_WORD) as Sort[]).map(s => <Check key={s} on={sort === s} onClick={() => sortBy(s)}>{SORT_WORD[s]}</Check>)}</Menu>
              </>
            )}
            {cards && <span className="flex-1" />}
            {!phone && <Menu label={`${density}${chosen ? "" : " · auto"}`} on={false} align="right">
              {(["cards", "rows", "fleet"] as Density[]).map(d => <Check key={d} on={chosen === d} onClick={() => pick(d)}>{d}</Check>)}
              <Check on={chosen === null} onClick={() => pick(null)}>auto by count</Check>
            </Menu>}
          </div>
          {!cards && !(fleet && wide) && <div className="flex flex-wrap gap-1.5 mb-2">{viewList(false)}</div>}

          <div className="sheet flex-1 min-h-0 flex flex-col overflow-clip">
            {!cards && (
              <div role="row" className={`grid ${cols} items-center gap-3 px-3 h-9 shrink-0`} style={{ borderBottom: "1px solid var(--hairline)", background: "color-mix(in srgb, var(--surface) 94%, var(--text-dark))" }}>
                <span className="inline-flex items-center justify-center w-6 h-6 -ml-1"><input type="checkbox" aria-label="select all shown" checked={flat.length > 0 && selected.length === flat.length} onChange={() => setSel(selected.length === flat.length ? new Set() : new Set(flat.map(r => r.id)))} className="w-3.5 h-3.5 accent-[var(--orange)]" /></span>
                {th("name", "agent")}
                {!phone && <span className="hidden md:block" />}
                <span className="hidden md:block">{th("attention", "state")}</span>
                <span className="hidden md:block">{th("expiry", "expires")}</span>
                <span className="hidden md:block">{th("last", "last")}</span>
                {phone ? <span className="eyebrow">state</span> : <span className="flex items-center gap-1">{LAYERS.map(l => <span key={l.k} data-tip={l.name} className="inline-flex w-[18px] h-[18px] items-center justify-center" style={quiet}><LayerIcon k={l.k} size={12} /></span>)}</span>}
              </div>
            )}
            <div ref={scroller} onScroll={e => setTop((e.target as HTMLDivElement).scrollTop)} className="flex-1 min-h-0 overflow-y-auto" role="grid" aria-rowcount={flat.length}>
              {items.length === 0 && (
                <div className="px-4 py-10 text-[13px] text-center flex flex-col items-center gap-3" style={quiet}>
                  <span>{rows.length ? "nothing matches" : "no agents yet"}</span>
                  {rows.length > 0 && isFiltered(f) && <button type="button" onClick={() => openView(BUILT_IN[0])} className="drawn-btn btn-gold" style={btn}>clear filters</button>}
                </div>
              )}
              {windowed && start > 0 && <div style={{ height: start * h }} />}
              {items.slice(start, end).map(it => it.kind === "group"
                ? <div key={"g" + it.b.key} className="flex items-center gap-2 px-3 eyebrow sticky top-0 z-[1]" style={{ height: h, background: "var(--surface)", borderBottom: "1px solid var(--hairline)" }}><span style={{ color: "var(--text-dark)" }}>{it.b.label}</span><span className="mono tabular">{it.b.rows.length}</span></div>
                : rowEl(it.r, it.i))}
              {windowed && end < items.length && <div style={{ height: (items.length - end) * h }} />}
            </div>
            {/* the bulk bar. each action is one transaction per agent, and says so. */}
            {selected.length > 0 && (
              <div className="shrink-0" style={{ borderTop: "1px solid var(--hairline)", background: "color-mix(in srgb, var(--orange) 6%, var(--surface))" }}>
                <div className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <span className="text-[12.5px] font-semibold tabular">{selected.length} selected</span>
                  <span className="text-[11.5px]" style={quiet}>{selected.length} transaction{selected.length > 1 ? "s" : ""}, one per agent</span>
                  <span className="flex-1" />
                  <button type="button" className="drawn-btn btn-gold" style={btn} disabled={!p.canSign || !selected.some(r => r.a.status === "active")} onClick={() => p.onBulk("pause", selected.filter(r => r.a.status === "active"))}>pause</button>
                  <button type="button" className="drawn-btn btn-gold" style={btn} disabled={!p.canSign || !selected.some(r => r.state === "paused")} onClick={() => p.onBulk("resume", selected.filter(r => r.state === "paused"))}>bring back</button>
                  <button type="button" className="drawn-btn btn-gold" style={btn} disabled={!p.canSign || !selected.some(r => r.state !== "stopped")} onClick={() => setLimitsOpen(o => !o)} aria-expanded={limitsOpen}>set limits</button>
                  <Hold disabled={!p.canSign || !selected.some(r => r.state !== "stopped")} onHeld={() => p.onBulk("stop", selected.filter(r => r.state !== "stopped"))} />
                  <button type="button" onClick={() => { setSel(new Set()); setLimitsOpen(false); }} className="text-[12px] px-1" style={quiet} aria-label="clear selection">×</button>
                </div>
                {limitsOpen && (
                  <div className="flex flex-wrap items-end gap-3 px-3 pb-3">
                    <label className="block"><span className="eyebrow">Trusted until</span><select value={bEnds} onChange={e => setBEnds(Number(e.target.value))} className="block mt-1 text-[13px] rounded-lg px-2.5 py-1.5 outline-none" style={field}>{ENDS.map(([w, v]) => <option key={v} value={v}>{v === 0 ? w : `${w} from now`}</option>)}</select></label>
                    <label className="block"><span className="eyebrow">Must report every</span><select value={bWin} onChange={e => setBWin(Number(e.target.value))} className="block mt-1 text-[13px] rounded-lg px-2.5 py-1.5 outline-none" style={field}>{WINDOWS.map(([w, v]) => <option key={v} value={v}>{w}</option>)}</select></label>
                    <button type="button" className="drawn-btn btn-orange" style={btn} disabled={!p.canSign} onClick={() => { p.onBulk("limits", selected.filter(r => r.state !== "stopped"), { expiresAt: bEnds === 0 ? 0 : Math.floor(Date.now() / 1000) + bEnds, window: bWin }); setLimitsOpen(false); }}>set on {selected.filter(r => r.state !== "stopped").length}</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* a chip that opens a small list. closes on outside click and escape. */
function Menu({ label, on, align, children }: { label: string; on: boolean; align?: "right"; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", off); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", off); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className={chipCls} style={chip(on)}>{label}<span className="text-[9px]" aria-hidden>▾</span></button>
      {open && (
        <div className={`absolute z-20 mt-1 min-w-[180px] rounded-xl p-1 flex flex-col ${align === "right" ? "right-0" : "left-0"}`} style={{ background: "var(--surface)", border: "1px solid var(--hairline)", boxShadow: "0 12px 32px rgba(0,0,0,0.12)", transformOrigin: align === "right" ? "top right" : "top left" }}>
          {children}
        </div>
      )}
    </div>
  );
}
function Check({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" role="menuitemcheckbox" aria-checked={on} onClick={onClick} className="flex items-center gap-2 rounded-lg px-2.5 h-8 text-[13px] text-left outline-none focus-visible:ring-2 hover:bg-[color-mix(in_srgb,var(--text-dark)_5%,transparent)]" style={{ color: "var(--text-dark)" }}>
      <span className="mono text-[11px] w-3" style={{ color: on ? "var(--orange-text)" : "transparent" }}>✓</span>{children}
    </button>
  );
}

/* the held press. same 1500ms clock as the module's. */
export function Hold({ disabled, onHeld, small }: { disabled: boolean; onHeld: () => void; small?: boolean }) {
  const [holding, setHolding] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const begin = () => { if (disabled) return; setHolding(true); t.current = setTimeout(() => { t.current = null; setHolding(false); onHeld(); }, 1500); };
  const end = () => { if (t.current) { clearTimeout(t.current); t.current = null; } setHolding(false); };
  return (
    <button type="button" disabled={disabled} onPointerDown={e => { e.preventDefault(); begin(); }} onPointerUp={end} onPointerLeave={end} onPointerCancel={end}
      onKeyDown={e => { if (e.key === " " && !e.repeat) { e.preventDefault(); begin(); } }} onKeyUp={e => { if (e.key === " ") end(); }}
      className={`relative overflow-hidden rounded-full mono tracking-[0.08em] select-none outline-none focus-visible:ring-2 disabled:opacity-45 ${small ? "text-[10px] px-2.5 h-[26px]" : "text-[11px] px-3.5 h-[30px]"}`}
      style={{ border: "1.5px solid var(--orange)", color: "var(--orange-text)", touchAction: "none" }}>
      <span aria-hidden className="absolute inset-0" style={{ background: "var(--orange)", clipPath: holding ? "inset(0 0 0 0)" : "inset(0 100% 0 0)", transition: holding ? "clip-path 1500ms linear" : "clip-path 180ms cubic-bezier(0.23, 1, 0.32, 1)" }} />
      <span className="relative" style={{ color: holding ? "#160A06" : undefined }}>{holding ? "keep holding" : "hold to stop"}</span>
    </button>
  );
}
