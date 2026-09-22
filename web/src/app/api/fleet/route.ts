import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { cfg, provider } from "@/lib/rpc.server";
import { db } from "@/lib/db.server";

export const dynamic = "force-dynamic";

/* the fleet's extras, for many agents in one request.
 *
 * the console used to ask the chain for every agent's passkey one call at a
 * time, and the index for every agent's last day one request at a time. at
 * a hundred agents that is a hundred of each, and the public rpc refuses
 * anything past fifteen a second, so the panic column went grey from agent
 * sixteen on whether or not a passkey existed. this route answers for the
 * whole list at once: one sql for the latest event per agent, one for the
 * last day, and the passkey reads through the throttled server provider,
 * cached for a short while so many tabs are one burst, not many. */
const ABI = ["function stopKeyOf(uint256) view returns (uint256 x, uint256 y, bytes32 rpIdHash, uint64 nonce, bool set)"];
const TTL = 20_000;
type Key = { set: boolean; nonce: number };
const keys = new Map<string, { at: number; v: Record<string, Key> }>();
const inflight = new Map<string, Promise<Record<string, Key>>>();

async function stopKeys(ids: number[]): Promise<Record<string, Key>> {
  const k = ids.join(",");
  const hit = keys.get(k);
  if (hit && Date.now() - hit.at < TTL) return hit.v;
  const running = inflight.get(k);
  if (running) return running;
  const job = (async () => {
    const c = await cfg();
    const ks = new ethers.Contract(c.killSwitch, ABI, provider(c));
    const out: Record<string, Key> = {};
    const rs = await Promise.all(ids.map(id => ks.stopKeyOf(id).catch(() => null) as Promise<[bigint, bigint, string, bigint, boolean] | null>));
    ids.forEach((id, i) => { const r = rs[i]; if (r) out[id] = { set: r[4], nonce: Number(r[3]) }; });
    keys.set(k, { at: Date.now(), v: out });
    return out;
  })();
  inflight.set(k, job);
  try { return await job; } finally { inflight.delete(k); }
}

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("ids") ?? "";
  const ids = [...new Set(raw.split(",").filter(s => /^\d+$/.test(s)).map(Number))].slice(0, 500);
  if (!ids.length) return NextResponse.json({ error: "no ids" }, { status: 400 });

  const [sk, index] = await Promise.all([
    stopKeys(ids).catch(() => ({} as Record<string, Key>)),
    (async () => {
      const p = db();
      if (!p) return { indexed: false as const };
      try {
        const since = new Date(Date.now() - 24 * 3600_000).toISOString();
        const [latest, day, linked] = await Promise.all([
          p.query(`SELECT DISTINCT ON (agent_id) agent_id, kind, at, actor, tx_hash, data FROM events WHERE agent_id = ANY($1) ORDER BY agent_id, id DESC`, [ids]),
          p.query(`SELECT agent_id, kind, at, actor, tx_hash, data FROM events WHERE agent_id = ANY($1) AND at >= $2 ORDER BY id DESC LIMIT 5000`, [ids, since]),
          p.query(`SELECT DISTINCT ON (agent_id) agent_id, data FROM events WHERE agent_id = ANY($1) AND kind = 'Linked8004' ORDER BY agent_id, id DESC`, [ids]),
        ]);
        const ev = (r: { kind: string; at: string; actor: string | null; tx_hash: string; data: Record<string, unknown> }) => ({ kind: r.kind, at: Math.floor(Date.parse(r.at) / 1000), actor: r.actor, data: { ...(r.data ?? {}), tx: r.tx_hash } });
        const last: Record<string, unknown> = {}; const events24: Record<string, unknown[]> = {}; const erc8004: Record<string, number> = {};
        for (const r of latest.rows) last[r.agent_id] = ev(r);
        for (const r of day.rows) (events24[r.agent_id] ??= []).push(ev(r));
        for (const r of linked.rows) { const n = Number((r.data as { erc8004Id?: unknown })?.erc8004Id ?? 0); if (n) erc8004[r.agent_id] = n; }
        return { indexed: true as const, last, events24, erc8004 };
      } catch (e) {
        return { indexed: false as const, error: e instanceof Error ? e.message : String(e) };
      }
    })(),
  ]);
  return NextResponse.json({ stopKeys: sk, ...index }, { headers: { "cache-control": "no-store" } });
}
