import { NextResponse } from "next/server";
import { db } from "@/lib/db.server";

export const dynamic = "force-dynamic";

/* the directory, one page at a time, filtered and counted by postgres.
 *
 * the first cut sent every agent to the browser and let it filter, sort and
 * tally them. that is fine at thirteen agents, and it is two bugs waiting at a
 * thousand: the page becomes ninety screens of scroll, and the row cap quietly
 * hides everything past it while the chips keep claiming a total.
 *
 * so the work happens where the data already is. one query for the page, one
 * for the totals per state, one for coverage across the whole fleet. the
 * counts therefore describe every agent rather than the fifty on screen, which
 * is the part that could not be true the other way round.
 *
 * `trusted` is not a column. it is the three conditions the contract checks,
 * written once here as a sql fragment and reused by every query in the file,
 * because a second copy of it is a second chance to disagree with the chain. */
const TRUSTED = `(a.status = 'active'
  AND (a.expires_at = 0 OR a.expires_at > extract(epoch FROM now())::bigint)
  AND (a.heartbeat_window = 0 OR a.last_beat + a.heartbeat_window >= extract(epoch FROM now())::bigint))`;
/* the same expression as a single word per agent, so filtering by state and
   counting by state cannot drift apart. */
const STATE = `CASE
  WHEN a.status IN ('revoked','rotated') THEN 'stopped'
  WHEN a.status = 'paused' THEN 'paused'
  WHEN a.expires_at <> 0 AND a.expires_at <= extract(epoch FROM now())::bigint THEN 'expired'
  WHEN a.heartbeat_window <> 0 AND a.last_beat + a.heartbeat_window < extract(epoch FROM now())::bigint THEN 'quiet'
  WHEN ${TRUSTED} THEN 'trusted'
  ELSE 'paused' END`;

const STATES = ["trusted", "expired", "quiet", "paused", "stopped"];
/* each sort carries its own direction, and reversing flips it here. the first
   cut appended ASC or DESC after these, which produced "last_at DESC NULLS
   LAST ASC": invalid sql, caught below, and rendered as an empty index.
   nulls last on both orders: an agent that has never done anything should
   not outrank one that acted a minute ago just because the column is null. */
const SORTS: Record<string, (rev: boolean) => string> = {
  recent: r => `last_at ${r ? "ASC" : "DESC"} NULLS LAST`,
  busy: r => `events_24h ${r ? "ASC" : "DESC"}, last_at ${r ? "ASC" : "DESC"} NULLS LAST`,
  expiry: r => `CASE WHEN a.expires_at = 0 THEN 2 WHEN a.expires_at <= extract(epoch FROM now())::bigint THEN 1 ELSE 0 END ${r ? "DESC" : "ASC"}, a.expires_at ${r ? "DESC" : "ASC"}`,
  id: r => `a.id ${r ? "ASC" : "DESC"}`,
};

export async function GET(req: Request) {
  const p = db();
  if (!p) return NextResponse.json({ indexed: false, agents: [], total: 0, counts: {}, coverage: {} }, { headers: { "cache-control": "no-store" } });

  const u = new URL(req.url).searchParams;
  const per = Math.min(Math.max(Number(u.get("per") ?? 50) || 50, 10), 200);
  const page = Math.max(1, Number(u.get("page") ?? 1) || 1);
  const sortKey = u.get("sort") ?? "recent";
  const rev = u.get("rev") === "1";
  const order = (SORTS[sortKey] ?? SORTS.recent)(rev);
  const states = (u.get("state") ?? "").split(",").filter(s => STATES.includes(s));
  const missing = (u.get("missing") ?? "").split(",").filter(s => ["panic", "guardians", "limits", "identity"].includes(s));
  const q = (u.get("q") ?? "").trim();

  /* every filter as a parameter, never as interpolated text. the sort and the
     page size are the only things that reach the sql as literals and both are
     looked up in a table above rather than taken from the caller. */
  const where: string[] = [];
  const args: unknown[] = [];
  const add = (sql: string, v: unknown) => { args.push(v); where.push(sql.replace("$?", `$${args.length}`)); };

  if (states.length) add(`${STATE} = ANY($?)`, states);
  if (missing.includes("guardians")) where.push("coalesce(array_length(a.guardians, 1), 0) = 0");
  if (missing.includes("limits")) where.push("a.expires_at = 0 AND a.heartbeat_window = 0");
  if (missing.includes("identity")) where.push("(a.name IS NULL OR a.name = '') AND a.erc8004_id IS NULL");
  /* the panic button is not in the index at all, so "missing panic" cannot be
     answered here. it is refused rather than silently ignored, because a filter
     that returns everything looks like an answer. */
  if (missing.includes("panic")) return NextResponse.json({ error: "the panic button is not in the index; open an agent to read it from the chain" }, { status: 400 });
  if (q) {
    if (/^\d+$/.test(q)) add("a.id = $?", Number(q));
    else if (/^0x[0-9a-fA-F]{40}$/.test(q)) { args.push(q); where.push(`(lower(a.agent_key) = lower($${args.length}) OR lower(a.cold_key) = lower($${args.length}))`); }
    else add("a.name ILIKE $?", `%${q}%`);
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  try {
    const [rows, total, counts, coverage] = await Promise.all([
      p.query(`
        SELECT a.id, a.agent_key, a.cold_key, a.status, a.name, a.purpose,
               a.guardians, a.threshold, a.expires_at, a.heartbeat_window, a.last_beat,
               a.erc8004_id, a.registered_at,
               ${TRUSTED} AS trusted, ${STATE} AS state,
               l.at AS last_at, l.kind AS last_kind, COALESCE(d.n, 0)::int AS events_24h, s.spark
          FROM agents a
          LEFT JOIN LATERAL (SELECT e.at, e.kind FROM events e WHERE e.agent_id = a.id ORDER BY e.id DESC LIMIT 1) l ON TRUE
          LEFT JOIN LATERAL (SELECT count(*) AS n FROM events e WHERE e.agent_id = a.id AND e.at >= now() - interval '24 hours') d ON TRUE
          /* the last day in 24 hourly buckets, oldest first, so a row can draw
             the difference between busy, steady and stuck without a request
             of its own. empty hours come back as zeros, never as gaps. */
          LEFT JOIN LATERAL (
            SELECT array_agg(coalesce(c.n, 0) ORDER BY h.i) AS spark
              FROM generate_series(0, 23) AS h(i)
              LEFT JOIN (SELECT 23 - floor(extract(epoch FROM (now() - e.at)) / 3600)::int AS b, count(*)::int AS n
                           FROM events e WHERE e.agent_id = a.id AND e.at >= now() - interval '24 hours' GROUP BY 1) c ON c.b = h.i
          ) s ON TRUE
          ${clause}
         ORDER BY ${order}, a.id DESC
         LIMIT ${per} OFFSET ${(page - 1) * per}`, args),
      p.query(`SELECT count(*)::int AS n FROM agents a ${clause}`, args),
      /* the chips describe every agent, not the page, which is the whole
         reason the counting moved here. */
      p.query(`SELECT ${STATE} AS state, count(*)::int AS n FROM agents a GROUP BY 1`),
      p.query(`
        SELECT count(*)::int AS agents,
               count(*) FILTER (WHERE coalesce(array_length(a.guardians, 1), 0) > 0)::int AS guardians,
               count(*) FILTER (WHERE a.expires_at <> 0 OR a.heartbeat_window <> 0)::int AS limits,
               count(*) FILTER (WHERE (a.name IS NOT NULL AND a.name <> '') OR a.erc8004_id IS NOT NULL)::int AS identity
          FROM agents a`),
    ]);

    const c = coverage.rows[0] ?? { agents: 0 };
    const pct = (n: number) => c.agents ? Math.round(n / c.agents * 100) : 0;
    return NextResponse.json({
      indexed: true,
      agents: rows.rows,
      total: total.rows[0]?.n ?? 0,
      page, per,
      counts: Object.fromEntries(STATES.map(s => [s, counts.rows.find(r => r.state === s)?.n ?? 0])),
      /* the three the indexer cannot see are absent rather than zero. a zero
         here would read as "no agent has a panic button", which is a claim
         this database is in no position to make. */
      coverage: { switch: 100, guardians: pct(c.guardians), limits: pct(c.limits), past: 100, identity: pct(c.identity) },
    }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ indexed: false, error: e instanceof Error ? e.message : String(e), agents: [], total: 0, counts: {}, coverage: {} },
      { headers: { "cache-control": "no-store" } });
  }
}
