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
const ABI = ["function stopKeyOf(uint256) view returns (uint256 x, uint256 y, bytes32 rpIdHash, uint64 nonce, bool set)", "function agentCount() view returns (uint256)"];
const TTL = 20_000;
type Key = { set: boolean; nonce: number };
/* cached per agent, not per list. keyed by the list, any made up list was a
   fresh key: five hundred reads each time, and a cache that only grew. */
const keys = new Map<number, { at: number; v: Key }>();
let count: { at: number; n: number } | null = null;

async function stopKeys(ids: number[]): Promise<Record<string, Key>> {
  const c = await cfg();
  const ks = new ethers.Contract(c.killSwitch, ABI, provider(c));
  const now = Date.now();
  for (const [id, e] of keys) if (now - e.at > TTL) keys.delete(id);
  /* ids that exist only: a number past the last agent costs a read and
     answers nothing */
  if (!count || now - count.at > TTL) count = { at: now, n: Number(await ks.agentCount()) };
  const want = ids.filter(id => id >= 1 && id <= count!.n && !keys.has(id));
  /* ten at a time, through the server's throttled provider */
  for (let i = 0; i < want.length; i += 10) {
    const part = want.slice(i, i + 10);
    const rs = await Promise.all(part.map(id => ks.stopKeyOf(id).catch(() => null) as Promise<[bigint, bigint, string, bigint, boolean] | null>));
    /* a failed read is left out and asked again next time, never cached */
    part.forEach((id, k) => { const r = rs[k]; if (r) keys.set(id, { at: Date.now(), v: { set: r[4], nonce: Number(r[3]) } }); });
  }
  const out: Record<string, Key> = {};
  for (const id of ids) { const e = keys.get(id); if (e) out[id] = e.v; }
  return out;
}

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("ids") ?? "";
  const ids = [...new Set(raw.split(",").filter(s => /^\d+$/.test(s)).map(Number))].slice(0, 200);
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
        console.error("fleet: index read failed", e instanceof Error ? e.message : e);
        return { indexed: false as const, error: "index unavailable" };
      }
    })(),
  ]);
  return NextResponse.json({ stopKeys: sk, ...index }, { headers: { "cache-control": "no-store" } });
}
