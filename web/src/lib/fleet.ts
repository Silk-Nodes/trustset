import { ethers } from "ethers";
import { type Agent, expired, lapsed, trusted } from "@/lib/chain";
import { type Extra, type Layer, type LayerKey, type PulseEvent, layersOf } from "@/lib/layers";

/* the fleet: many agents at once, worked out in one place.
 *
 * one owner has three agents, another has three hundred. the same page has to
 * serve both, so everything that decides what the fleet shows is a pure
 * function here: the state word, the attention score, the filters, the sort,
 * the grouping, the density the count earns, and the views a browser keeps.
 * the page draws what these return. none of it needs a browser to be checked. */

export type Density = "cards" | "rows" | "fleet";
/* the count picks the default. up to six agents fit on one screen as cards;
   up to thirty as one-line rows; past that the fleet needs its furniture. */
/* the breaker panel for a fleet a person can hold in their head, the table past it */
export const densityFor = (n: number): Density => n <= 30 ? "cards" : "fleet";

export type StateKey = "trusted" | "expired" | "quiet" | "paused" | "stopped";
export const STATE_WORD: Record<StateKey, string> = { trusted: "trusted", expired: "expired", quiet: "gone quiet", paused: "paused", stopped: "stopped" };
export function stateOf(a: Agent, now: number): StateKey {
  if (a.status === "revoked" || a.status === "rotated") return "stopped";
  if (a.status === "paused") return "paused";
  if (expired(a, now)) return "expired";
  if (lapsed(a, now)) return "quiet";
  return trusted(a, now) ? "trusted" : "paused";
}

export type Row = {
  a: Agent; id: string; name: string; state: StateKey; layers: Layer[]; set: number;
  /* seconds since the last indexed event; null when the index is away */
  last: number | null;
  /* the extras (passkey, index) have arrived for this agent */
  known: boolean;
  /* seconds until the end date, null when there is none, negative when passed */
  expiresIn: number | null;
  attention: number; tag: string;
  /* wants a person now: not trusted and not ended, or an end date inside a day */
  needs: boolean;
};

/* how much this row wants a person. not trusted and not ended is the loudest;
   an end date inside a day is next; each missing safety layer adds one. ended
   agents score below zero so they sink to the bottom of any attention sort. */
export function attentionOf(state: StateKey, expiresIn: number | null, layers: Layer[]): number {
  if (state === "stopped") return -1;
  let n = 0;
  if (state !== "trusted") n += 4;
  if (expiresIn !== null && expiresIn > 0 && expiresIn <= 86400) n += 2;
  for (const k of ["panic", "guardians", "limits"] as LayerKey[]) if (!layers.find(l => l.key === k)?.set) n += 1;
  return n;
}

export function rowsOf(agents: Agent[], names: Record<string, string>, extras: Record<string, Extra>, pulses: Record<string, { events: PulseEvent[]; indexed?: boolean | null } | undefined>, tags: Record<string, string>, now: number): Row[] {
  return agents.map(a => {
    const id = a.id.toString();
    const layers = layersOf(a, extras[id] ?? {}, now);
    const state = stateOf(a, now);
    const pl = pulses[id];
    const ev = pl?.events?.[0];
    const last = pl?.indexed === false ? null : Math.max(0, now - (ev?.at ?? a.since));
    const expiresIn = a.expiresAt > 0 ? a.expiresAt - now : null;
    const needs = (state !== "trusted" && state !== "stopped") || (expiresIn !== null && expiresIn > 0 && expiresIn <= 86400);
    return { a, id, name: names[id] ?? `Agent ${id}`, state, layers, set: layers.filter(l => l.set).length, last, known: id in extras, expiresIn, attention: attentionOf(state, expiresIn, layers), tag: tags[id] ?? "", needs };
  });
}

export type Filter = {
  q: string; states: StateKey[]; missing: LayerKey[];
  /* an end date inside this many seconds, 0 for off */
  within: number;
  /* any indexed event in the last day */
  active24: boolean;
  /* the kpi's own filter: not trusted, or an end date inside a day */
  attention: boolean;
};
export const NO_FILTER: Filter = { q: "", states: [], missing: [], within: 0, active24: false, attention: false };
export const isFiltered = (f: Filter) => !!f.q || f.states.length > 0 || f.missing.length > 0 || f.within > 0 || f.active24 || f.attention;

export type Sort = "attention" | "expiry" | "last" | "name";
export const SORT_WORD: Record<Sort, string> = { attention: "attention first", expiry: "expiry soonest", last: "last activity", name: "name" };
export type Group = "none" | "state" | "tag" | "expiry";
export const GROUP_WORD: Record<Group, string> = { none: "no grouping", state: "by state", tag: "by group", expiry: "by expiry" };

export function apply(rows: Row[], f: Filter, sort: Sort, rev = false): Row[] {
  const q = f.q.trim().toLowerCase();
  let out = rows.filter(r => {
    if (q && !(r.name.toLowerCase().includes(q) || r.id === q || r.a.key.toLowerCase().includes(q) || r.tag.toLowerCase().includes(q))) return false;
    if (f.states.length && !f.states.includes(r.state)) return false;
    if (f.missing.length && !f.missing.every(k => !r.layers.find(l => l.key === k)?.set)) return false;
    if (f.within > 0 && !(r.expiresIn !== null && r.expiresIn > 0 && r.expiresIn <= f.within)) return false;
    if (f.active24 && (r.last === null || r.last > 86400)) return false;
    if (f.attention && !r.needs) return false;
    return true;
  });
  const by: Record<Sort, (p: Row, q: Row) => number> = {
    attention: (p, q) => q.attention - p.attention || (p.last ?? 1e12) - (q.last ?? 1e12),
    /* soonest first; no end date last; passed dates after live ones */
    expiry: (p, q) => key(p) - key(q),
    last: (p, q) => (p.last ?? 1e12) - (q.last ?? 1e12),
    name: (p, q) => p.name.localeCompare(q.name) || Number(p.id) - Number(q.id),
  };
  const key = (r: Row) => r.expiresIn === null ? Number.MAX_SAFE_INTEGER : r.expiresIn <= 0 ? Number.MAX_SAFE_INTEGER / 2 - r.expiresIn : r.expiresIn;
  out = out.slice().sort(by[sort]);
  return rev ? out.reverse() : out;
}

export type Bucket = { key: string; label: string; rows: Row[] };
export function grouped(rows: Row[], g: Group): Bucket[] {
  if (g === "none") return [{ key: "all", label: "", rows }];
  const keyOf = (r: Row): [string, string] => {
    if (g === "state") return [r.state, STATE_WORD[r.state]];
    if (g === "tag") return r.tag ? [r.tag, r.tag] : ["~", "no group"];
    const e = r.expiresIn;
    if (e === null) return ["4 never", "no end date"];
    if (e <= 0) return ["0 passed", "end date passed"];
    if (e <= 86400) return ["1 day", "within a day"];
    if (e <= 7 * 86400) return ["2 week", "within a week"];
    return ["3 later", "later"];
  };
  const m = new Map<string, Bucket>();
  for (const r of rows) { const [k, label] = keyOf(r); (m.get(k) ?? (m.set(k, { key: k, label, rows: [] }).get(k)!)).rows.push(r); }
  return [...m.values()].sort((p, q) => p.key.localeCompare(q.key));
}

export function counts(rows: Row[]) {
  return {
    trusted: rows.filter(r => r.state === "trusted").length,
    attention: rows.filter(r => r.needs).length,
    within24: rows.filter(r => r.expiresIn !== null && r.expiresIn > 0 && r.expiresIn <= 86400).length,
    stopped: rows.filter(r => r.state === "stopped").length,
  };
}

/* views: a filter, a sort and a grouping with a name. four come built in and
   the rest are the reader's, kept in this browser. */
export type View = { id: string; name: string; filter: Filter; sort: Sort; group: Group; rev?: boolean; builtIn?: boolean };
export const BUILT_IN: View[] = [
  { id: "all", name: "all", filter: NO_FILTER, sort: "attention", group: "none", builtIn: true },
  { id: "attention", name: "needs attention", filter: { ...NO_FILTER, attention: true }, sort: "attention", group: "none", builtIn: true },
  { id: "24h", name: "expires in 24h", filter: { ...NO_FILTER, within: 86400 }, sort: "expiry", group: "none", builtIn: true },
  { id: "unguarded", name: "no panic button", filter: { ...NO_FILTER, missing: ["panic"] }, sort: "name", group: "none", builtIn: true },
];
const VIEWS_KEY = "trustset.views", TAGS_KEY = "trustset.tags", DENSITY_KEY = "trustset.density.v2";
export function loadViews(): View[] { try { const v = JSON.parse(localStorage.getItem(VIEWS_KEY) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; } }
export function saveViews(v: View[]) { try { localStorage.setItem(VIEWS_KEY, JSON.stringify(v)); } catch { /* no storage */ } }
export function loadTags(chain: string): Record<string, string> { try { return JSON.parse(localStorage.getItem(`${TAGS_KEY}.${chain}`) ?? "{}"); } catch { return {}; } }
export function saveTags(chain: string, t: Record<string, string>) { try { localStorage.setItem(`${TAGS_KEY}.${chain}`, JSON.stringify(t)); } catch { /* no storage */ } }
export function loadDensity(): Density | null { try { const d = localStorage.getItem(DENSITY_KEY); return d === "cards" || d === "rows" || d === "fleet" ? d : null; } catch { return null; } }
export function saveDensity(d: Density | null) { try { if (d) localStorage.setItem(DENSITY_KEY, d); else localStorage.removeItem(DENSITY_KEY); } catch { /* no storage */ } }

/* development only: a fleet of n invented agents, so the hundred-agent case
   can be measured without registering a hundred agents. deterministic, so a
   reload draws the same fleet. never reachable in a production build. */
export function fakeAgents(n: number, now: number): Agent[] {
  const rnd = (i: number, k: number) => { const x = Math.sin(i * 9301 + k * 49297) * 233280; return x - Math.floor(x); };
  const addr = (i: number, k: number) => ethers.getAddress("0x" + ethers.id(`${i}:${k}`).slice(26));
  return Array.from({ length: n }, (_, i) => {
    const r = rnd(i, 1);
    const status = r < 0.82 ? "active" : r < 0.9 ? "paused" : r < 0.97 ? "revoked" : "rotated";
    const ends = rnd(i, 2) < 0.6 ? now + Math.floor((rnd(i, 3) - 0.15) * 20 * 86400) : 0;
    const win = rnd(i, 4) < 0.4 ? 3600 : 0;
    const beat = now - Math.floor(rnd(i, 5) * 7200);
    const since = now - Math.floor(rnd(i, 6) * 60 * 86400);
    const g = rnd(i, 7) < 0.5 ? [addr(i, 10), addr(i, 11), addr(i, 12)] : [];
    return {
      id: BigInt(1000 + i), key: addr(i, 0), coldKey: addr(9999, 0), guardians: g, threshold: g.length ? 2 : 0,
      status, since, successor: 0n, history: [{ at: since, status: "active" }],
      label: rnd(i, 8) < 0.7 ? { name: ["usd", "mm-eth", "arb", "quant", "index", "ops", "hedge", "scout"][i % 8] + "-" + (i + 1), purpose: "" } as Agent["label"] : undefined,
      expiresAt: ends, heartbeatWindow: win, lastBeat: beat,
    } as Agent;
  });
}

/* the view in the url, so a filtered fleet can be bookmarked or sent. every
   key is short and absent when it is the default; other params on the url,
   the development ones included, are left alone. */
export type UrlState = { viewId?: string; filter: Filter; sort: Sort; group: Group; rev: boolean };
const KEYS = ["v", "q", "state", "missing", "within", "active", "attn", "sort", "group", "rev"];
export function toParams(u: UrlState, base: URLSearchParams): URLSearchParams {
  const p = new URLSearchParams(base);
  for (const k of KEYS) p.delete(k);
  if (u.viewId && u.viewId !== "all") p.set("v", u.viewId);
  const f = u.filter;
  if (f.q) p.set("q", f.q);
  if (f.states.length) p.set("state", f.states.join(","));
  if (f.missing.length) p.set("missing", f.missing.join(","));
  if (f.within) p.set("within", String(f.within));
  if (f.active24) p.set("active", "1");
  if (f.attention) p.set("attn", "1");
  if (u.sort !== "attention") p.set("sort", u.sort);
  if (u.group !== "none") p.set("group", u.group);
  if (u.rev) p.set("rev", "1");
  return p;
}
export function fromParams(p: URLSearchParams): UrlState | null {
  if (!KEYS.some(k => p.has(k))) return null;
  const states = (p.get("state") ?? "").split(",").filter((x): x is StateKey => ["trusted", "expired", "quiet", "paused", "stopped"].includes(x));
  const missing = (p.get("missing") ?? "").split(",").filter((x): x is LayerKey => ["switch", "panic", "guardians", "limits", "past", "identity", "human", "refunds"].includes(x));
  const sort = (p.get("sort") ?? "attention") as Sort, group = (p.get("group") ?? "none") as Group;
  return {
    viewId: p.get("v") ?? undefined,
    filter: { q: p.get("q") ?? "", states, missing, within: Math.max(0, Number(p.get("within") ?? 0)) || 0, active24: p.get("active") === "1", attention: p.get("attn") === "1" },
    sort: (["attention", "expiry", "last", "name"] as Sort[]).includes(sort) ? sort : "attention",
    group: (["none", "state", "tag", "expiry"] as Group[]).includes(group) ? group : "none",
    rev: p.get("rev") === "1",
  };
}

/* a group written into the on-chain purpose as a trailing #word, so a second
   browser reads the same group. the local tag wins while it is set. */
export const groupFromPurpose = (purpose?: string) => purpose?.match(/(?:^|\s)#([\w-]{1,24})\s*$/)?.[1] ?? "";
export const purposeWithGroup = (purpose: string, group: string) => { const base = purpose.replace(/(?:^|\s)#[\w-]{1,24}\s*$/, "").trim(); return group ? `${base}${base ? " " : ""}#${group}` : base; };
