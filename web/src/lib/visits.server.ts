import { appendFile, readFile } from "fs/promises";
import { createHash, randomBytes } from "crypto";
import { join } from "path";

/* our own visit counter.
 *
 * one line per page view or action, appended to a file beside the app, the
 * way the public pause is kept. no cookie, no third party script, no raw ip:
 * a visitor is a hash of the day, a secret and what the request carried, so
 * the same person counts once a day and cannot be followed from one day to
 * the next, or traced back at all once the secret is gone.
 *
 * the index database is the indexer's, written by it and read here, so the
 * counter does not ask it for write access it was never given. */
const ROOT = () => process.env.TRUSTSET_ROOT || join(process.cwd(), "..");
const FILE = () => process.env.VISITS_FILE || join(ROOT(), ".visits.jsonl");

/* the secret behind the daily hash. read from the env; without it a random one
   per process start, so counting still works but a restart splits a day's
   visitors in two. said once in the log rather than guessed around. */
let secret = process.env.VISIT_SALT || "";
if (!secret) { secret = randomBytes(32).toString("hex"); console.error("VISIT_SALT is not set, so unique visitors reset whenever the server restarts"); }

export type Visit = {
  t: number;          // unix seconds
  p: string;          // the path, never the query
  v: string;          // the day's visitor hash
  ref?: string;       // the referring host only, never the full address
  from?: string;      // a ?from= tag on the link they came in by
  dev: "phone" | "desktop";
  e?: string;         // an action rather than a page view
};

export const EVENTS = ["sample-pause", "sample-stop", "live-pause", "demo-switch"] as const;

const BOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|facebookexternalhit|embedly|whatsapp|telegram|discord|slack|curl|wget|python|node-fetch|go-http/i;

export function isBot(ua: string) { return !ua || BOT.test(ua); }

export function visitorOf(ip: string, ua: string, day: string) {
  return createHash("sha256").update(`${secret}|${day}|${ip}|${ua}`).digest("hex").slice(0, 16);
}

export async function record(v: Visit) {
  await appendFile(/*turbopackIgnore: true*/ FILE(), JSON.stringify(v) + "\n");
}

export async function readAll(): Promise<Visit[]> {
  try {
    const raw = await readFile(/*turbopackIgnore: true*/ FILE(), "utf8");
    return raw.split("\n").filter(Boolean).flatMap(l => { try { return [JSON.parse(l) as Visit]; } catch { return []; } });
  } catch { return []; }
}

const dayOf = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);

/* where a visit came from, as one word a person reads at a glance */
export function sourceOf(v: Visit): string {
  if (v.from) return v.from === "x" || v.from === "twitter" ? "X" : v.from;
  const h = (v.ref || "").replace(/^www\./, "");
  if (!h) return "direct";
  if (h === "t.co" || h === "x.com" || h === "twitter.com") return "X";
  if (h.endsWith("github.com")) return "GitHub";
  if (h.endsWith("silknodes.io")) return h === "trustset.silknodes.io" ? "inside the site" : "silknodes.io";
  if (/google\./.test(h)) return "Google";
  return h;
}

/* the numbers the stats page shows, worked out on the server so the browser
   never receives a visitor hash */
export function summarise(all: Visit[], now = Math.floor(Date.now() / 1000), days = 14) {
  const since = now - days * 86400;
  const recent = all.filter(v => v.t >= since);
  const views = recent.filter(v => !v.e);
  const byDay: Record<string, { views: number; visitors: Set<string>; actions: number }> = {};
  for (let i = days - 1; i >= 0; i--) byDay[dayOf(now - i * 86400)] = { views: 0, visitors: new Set(), actions: 0 };
  for (const v of recent) {
    const d = byDay[dayOf(v.t)]; if (!d) continue;
    if (v.e) d.actions++; else { d.views++; d.visitors.add(v.v); }
  }
  const count = (xs: string[]) => Object.entries(xs.reduce<Record<string, number>>((m, x) => { m[x] = (m[x] ?? 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]);
  /* a source counts each visitor once a day, not each page they then opened */
  const firstOfDay = new Map<string, Visit>();
  for (const v of views) { const k = `${dayOf(v.t)}|${v.v}`; if (!firstOfDay.has(k)) firstOfDay.set(k, v); }
  const last24 = views.filter(v => v.t >= now - 86400);
  return {
    asOf: new Date(now * 1000).toISOString(),
    total: { views: views.length, visitors: firstOfDay.size },
    last24: { views: last24.length, visitors: new Set(last24.map(v => `${dayOf(v.t)}|${v.v}`)).size },
    days: Object.entries(byDay).map(([day, d]) => ({ day, views: d.views, visitors: d.visitors.size, actions: d.actions })),
    pages: count(views.map(v => v.p)).slice(0, 15),
    sources: count([...firstOfDay.values()].map(sourceOf)).slice(0, 12),
    devices: count([...firstOfDay.values()].map(v => v.dev)),
    actions: count(recent.filter(v => v.e).map(v => v.e!)),
  };
}
