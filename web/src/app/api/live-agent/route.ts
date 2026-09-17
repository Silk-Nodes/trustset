import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { timingSafeEqual } from "crypto";
import { ethers } from "ethers";
import { cfg, provider, payer } from "@/lib/demo.server";

export const dynamic = "force-dynamic";

/* the live agent, as it describes itself.
 *
 * everything else on the site reads the chain. this reads the agent: a file it
 * rewrites every minute with what the switch told it and whether it is acting.
 * that is the only way to show the half of enforcement that is not on chain,
 * which is an agent choosing to obey. it is also, honestly, the agent's own
 * claim about itself, and the page says so.
 */
const STATE = process.env.AGENT_STATE || "/home/zoltan/trustset-state/.agent-state.json";
const KS = [
  "function setStatus(uint256,uint8,bytes32)",
  "function liveness(uint256) view returns (bool trusted, bool expired, bool lapsed, uint64 expiresAt, uint64 nextBeatBy)",
  "function getAgent(uint256) view returns (tuple(address agentKey,address revocationKey,address pendingRevocationKey,uint64 revocationKeyChangeAt,uint8 guardianThreshold,uint8 status,uint64 statusSince,uint256 successorId,bytes32 reasonHash,uint64 expiresAt,uint64 heartbeatWindow,uint64 lastBeat,address[] guardians))",
];

async function saidByTheAgent() {
  try {
    const s = JSON.parse(await readFile(STATE, "utf8"));
    return { agentId: String(s.agentId), key: s.key, why: s.why as string, at: s.at as string, balance: s.balance as string };
  } catch { return null; }
}

export async function GET() {
  const said = await saidByTheAgent();
  try {
    const c = await cfg();
    const ks = new ethers.Contract(c.killSwitch, KS, provider(c));
    const id = said?.agentId ?? process.env.LIVE_AGENT_ID ?? "14";
    const [l, a, boss] = await Promise.all([ks.liveness(id), ks.getAgent(id), payer(c, provider(c)).then(w => w.address).catch(() => null)]);
    /* whether this server could switch it off, and when it will be able to. the
       card says so rather than offering a button that reverts. */
    const holdsColdKey = !!boss && boss.toLowerCase() === a.revocationKey.toLowerCase();
    const handover = a.pendingRevocationKey !== ethers.ZeroAddress && boss && a.pendingRevocationKey.toLowerCase() === boss.toLowerCase()
      ? Number(a.revocationKeyChangeAt) : 0;
    /* the 8004 identity, if its owner published the pointer. read from the
       index rather than the chain: the registry does not answer "which token
       claims this agent", only the other way round. */
    let erc8004: number | null = null;
    try {
      const pool = (await import("@/lib/db.server")).db();
      if (pool) {
        const r = await pool.query("SELECT erc8004_id FROM agents WHERE id = $1", [id]);
        erc8004 = r.rows[0]?.erc8004_id ? Number(r.rows[0].erc8004_id) : null;
      }
    } catch { /* no index on this machine; the card simply omits it */ }
    return NextResponse.json({
      agentId: id, said, explorer: c.explorer, key: a.agentKey, erc8004,
      coldKey: a.revocationKey, holdsColdKey, handoverAt: handover,
      chain: { trusted: l.trusted, expired: l.expired, lapsed: l.lapsed, status: Number(a.status), nextBeatBy: Number(l.nextBeatBy) },
    }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e), said }, { status: 500 });
  }
}

/* pause and resume, signed by the key this server holds.
 *
 * that key is not automatically the agent's cold key, and the difference is the
 * point: a server that runs an agent should not be able to switch it off by
 * default. this route is refused until the cold key is actually handed to the
 * server's key, which takes a day, because handing an agent over quietly is
 * exactly what the timelock exists to prevent. */
/* the site went from vpn-only to a public domain, and this route signs with a
 * key the server holds. the passkey route next door can stay open because the
 * assertion is the authority and this server can forge none of it. here there
 * is no such proof: the request itself is the whole authority, so anybody who
 * could reach the domain could pause or resume the agent. it takes an operator
 * token now, and it fails closed when no token is configured, because an
 * unset secret must never read as "no check needed". */
function operator(req: Request) {
  const want = process.env.OPERATOR_TOKEN || "";
  if (!want) return false;
  const got = req.headers.get("x-trustset-operator") || "";
  const a = Buffer.from(got), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!operator(req)) return NextResponse.json({ error: "That control needs the operator token." }, { status: 401 });
  try {
    const { action } = (await req.json()) as { action: "pause" | "resume" };
    if (action !== "pause" && action !== "resume") return NextResponse.json({ error: "unknown action" }, { status: 400 });
    const c = await cfg();
    const p = provider(c);
    const ks = new ethers.Contract(c.killSwitch, KS, await payer(c, p));
    const id = (await saidByTheAgent())?.agentId ?? process.env.LIVE_AGENT_ID ?? "14";
    const to = action === "pause" ? 2 : 1;
    const tx = await ks.setStatus(id, to, ethers.id(action === "pause" ? "paused from the site" : "resumed from the site"), { gasLimit: 200000 });
    const rc = await p.waitForTransaction(tx.hash);
    return NextResponse.json({ ok: rc?.status === 1, hash: tx.hash, block: rc?.blockNumber ?? null, explorer: c.explorer });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: /NotRevocationKey/.test(m) ? "This server does not hold that agent's cold key." : m.slice(0, 200) }, { status: 400 });
  }
}
