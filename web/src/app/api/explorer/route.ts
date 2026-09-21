import { NextResponse } from "next/server";
import { db } from "@/lib/db.server";

export const dynamic = "force-dynamic";

/* the explorer's one read.
 *
 * everything here comes from the index, which comes from logs. a refused trade
 * is a reverted transaction and emits no logs at all, so it is not counted and
 * not shown; an index built this way cannot honestly claim to have seen one.
 */
const KINDS: Record<string, string[]> = {
  registered: ["AgentRegistered"],
  stopped: ["StatusChanged"],
  limits: ["LimitsSet", "Beat"],
  guardians: ["GuardianVoted"],
  keys: ["RevocationKeyChangeProposed", "RevocationKeyChanged", "Rotated"],
  labels: ["Labelled"],
  work: ["TradeAccepted", "Beat"],
  identity: ["Linked8004"],
};

export async function GET(req: Request) {
  const p = db();
  if (!p) return NextResponse.json({ indexed: false, stats: null, events: [] }, { headers: { "cache-control": "no-store" } });

  const u = new URL(req.url);
  const filter = u.searchParams.get("filter") ?? "";
  const q = (u.searchParams.get("q") ?? "").trim();
  const before = Number(u.searchParams.get("before") ?? 0);
  /* offset paging, so a reader can jump to page six rather than walk to it. it
     shifts when new events land above, which at this rate is an event an hour,
     and only the first page follows the head anyway. */
  const offset = Math.max(0, Number(u.searchParams.get("offset") ?? 0));
  const limit = Math.min(Number(u.searchParams.get("limit") ?? 60), 200);

  const where: string[] = [];
  const args: unknown[] = [];
  const add = (sql: string, v: unknown) => { args.push(v); where.push(sql.replace("$?", `$${args.length}`)); };

  if (KINDS[filter]) add("e.kind = ANY($?)", KINDS[filter]);
  /* a stop filter means the three status words people mean by it, not every
     status change, which would include every registration. */
  if (filter === "stopped") where.push("e.data->>'status' IN ('paused','revoked')");
  if (before > 0) add("e.id < $?", before);
  if (q) {
    if (/^\d+$/.test(q)) add("e.agent_id = $?", Number(q));
    else if (/^0x[0-9a-fA-F]{64}$/.test(q)) add("lower(e.tx_hash) = lower($?)", q);
    else if (/^0x[0-9a-fA-F]{40}$/.test(q)) {
      args.push(q);
      where.push(`(lower(e.actor) = lower($${args.length}) OR e.agent_id IN (SELECT id FROM agents WHERE lower(agent_key) = lower($${args.length}) OR lower(cold_key) = lower($${args.length})))`);
    } else add("a.name ILIKE $?", `%${q}%`);
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  try {
    const [events, matching, stats] = await Promise.all([
      p.query(
        `SELECT e.id, e.block, e.tx_hash, e.at, e.kind, e.agent_id, e.actor, e.data,
                a.name, a.agent_key, a.cold_key
           FROM events e LEFT JOIN agents a ON a.id = e.agent_id
           ${clause}
          ORDER BY e.id DESC
          LIMIT ${limit} OFFSET ${offset}`, args),
      /* how many rows this filter matches, not how many exist, or the page
         numbers would be wrong the moment somebody filters. */
      p.query(`SELECT count(*)::int AS n FROM events e LEFT JOIN agents a ON a.id = e.agent_id ${clause}`, args),
      p.query(
        `SELECT
           (SELECT count(*) FROM agents)                                          AS agents,
           /* "live now" has to mean isTrusted, not the status word. an agent
              whose end date has passed or whose heartbeat has gone quiet is
              still 'active' in storage, so counting the word made the landing
              page say three were live while clicking each one showed Expired.
              the same three conditions the contract checks, in sql. */
           (SELECT count(*) FROM agents
             WHERE status = 'active'
               AND (expires_at = 0 OR expires_at > extract(epoch FROM now())::bigint)
               AND (heartbeat_window = 0 OR last_beat + heartbeat_window >= extract(epoch FROM now())::bigint))
                                                                                  AS active,
           (SELECT count(*) FROM agents WHERE status = 'paused')                  AS paused,
           (SELECT count(*) FROM agents WHERE status IN ('revoked','rotated'))    AS stopped,
           (SELECT count(*) FROM agents WHERE expires_at > 0 OR heartbeat_window > 0) AS limited,
           (SELECT count(*) FROM events)                                          AS events,
           (SELECT max(block) FROM events)                                        AS head,
           (SELECT block FROM cursor WHERE name = 'main')                         AS cursor`),
    ]);
    return NextResponse.json({ indexed: true, stats: stats.rows[0], total: matching.rows[0].n, events: events.rows }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    /* the index may simply not be built yet on a fresh machine. */
    return NextResponse.json({ indexed: false, error: e instanceof Error ? e.message : String(e), stats: null, total: 0, events: [] },
      { status: 200, headers: { "cache-control": "no-store" } });
  }
}
