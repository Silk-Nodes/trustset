import { NextResponse } from "next/server";
import { db } from "@/lib/db.server";

export const dynamic = "force-dynamic";

/* one agent's whole life, from the index. */
export async function GET(req: Request) {
  const p = db();
  const id = Number(new URL(req.url).searchParams.get("id") ?? 0);
  /* the directory's hover preview wants three events, not two hundred. */
  const limit = Math.min(Math.max(Number(new URL(req.url).searchParams.get("limit") ?? 200) || 200, 1), 200);
  if (!p || !id) return NextResponse.json({ indexed: !!p, agent: null, events: [] }, { headers: { "cache-control": "no-store" } });
  try {
    const [agent, events] = await Promise.all([
      p.query("SELECT * FROM agents WHERE id = $1", [id]),
      p.query(`SELECT id, block, tx_hash, at, kind, actor, data FROM events WHERE agent_id = $1 ORDER BY id DESC LIMIT $2`, [id, limit]),
    ]);
    return NextResponse.json({ indexed: true, agent: agent.rows[0] ?? null, events: events.rows }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ indexed: false, error: e instanceof Error ? e.message : String(e), agent: null, events: [] }, { headers: { "cache-control": "no-store" } });
  }
}
