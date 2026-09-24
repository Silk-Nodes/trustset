import { NextResponse } from "next/server";
import { db } from "@/lib/db.server";

export const dynamic = "force-dynamic";

/* a lookup: the agents matching one query, and how many agents there are.
 *
 * this used to be a directory. it paged every agent, filtered them by the
 * layers they lacked and reported coverage across the fleet: a ranked list of
 * the least protected agents, which served an attacker and nobody else. every
 * field in it was already public on chain; what we added was the ranking.
 *
 * so the line is drawn here, in the server, not only in the page:
 * - no query, no rows. only the size of the fleet.
 * - no filter by state or by what an agent lacks.
 * - an address matches an agent address only, never an owner. the owner is
 *   the one key worth phishing, and matching it would return its whole fleet.
 * - a hit carries its verdict and nothing an attacker would sort by: no
 *   guardians, no limits, no owner. the agent's own page shows its details,
 *   one agent at a time, to somebody who asked for that agent.
 *
 * `trusted` is the three conditions the contract checks, written once. */
const TRUSTED = `(a.status = 'active'
  AND (a.expires_at = 0 OR a.expires_at > extract(epoch FROM now())::bigint)
  AND (a.heartbeat_window = 0 OR a.last_beat + a.heartbeat_window >= extract(epoch FROM now())::bigint))`;
const STATE = `CASE
  WHEN a.status IN ('revoked','rotated') THEN 'stopped'
  WHEN a.status = 'paused' THEN 'paused'
  WHEN a.expires_at <> 0 AND a.expires_at <= extract(epoch FROM now())::bigint THEN 'expired'
  WHEN a.heartbeat_window <> 0 AND a.last_beat + a.heartbeat_window < extract(epoch FROM now())::bigint THEN 'quiet'
  WHEN ${TRUSTED} THEN 'trusted'
  ELSE 'paused' END`;
const NO_STORE = { headers: { "cache-control": "no-store" } };

export async function GET(req: Request) {
  const p = db();
  if (!p) return NextResponse.json({ indexed: false, agents: [] }, NO_STORE);

  const u = new URL(req.url).searchParams;
  const q = (u.get("q") ?? "").trim().slice(0, 64);
  const per = Math.min(Math.max(Number(u.get("per") ?? 10) || 10, 1), 20);

  try {
    if (!q) {
      const n = await p.query("SELECT count(*)::int AS n FROM agents");
      return NextResponse.json({ indexed: true, agents: [], fleet: n.rows[0]?.n ?? 0 }, NO_STORE);
    }
    /* every value as a parameter, never interpolated */
    const where = /^\d+$/.test(q) ? "a.id = $1"
      : /^0x[0-9a-fA-F]{40}$/.test(q) ? "lower(a.agent_key) = lower($1)"
      : "a.name ILIKE $1";
    const arg = /^\d+$/.test(q) ? Number(q) : /^0x/i.test(q) ? q : `%${q}%`;
    const rows = await p.query(`
      SELECT a.id, a.agent_key, a.name, ${STATE} AS state, l.at AS last_at
        FROM agents a
        LEFT JOIN LATERAL (SELECT e.at FROM events e WHERE e.agent_id = a.id ORDER BY e.id DESC LIMIT 1) l ON TRUE
       WHERE ${where}
       ORDER BY l.at DESC NULLS LAST, a.id DESC
       LIMIT ${per}`, [arg]);
    return NextResponse.json({ indexed: true, agents: rows.rows }, NO_STORE);
  } catch (e) {
    return NextResponse.json({ indexed: false, error: e instanceof Error ? e.message : String(e), agents: [] }, NO_STORE);
  }
}
