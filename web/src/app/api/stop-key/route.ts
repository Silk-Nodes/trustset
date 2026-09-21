import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { ethers } from "ethers";
import { cfg, provider, payer } from "@/lib/demo.server";

export const dynamic = "force-dynamic";

/* nominating the passkey that may pause an agent.
 *
 * the private half never leaves the device that made it. what travels is the
 * public point and the hash of the site it was registered to, and the contract
 * stores exactly those two things. so this route carries nothing secret, and
 * the worst it could do with a forged body is nominate a key nobody holds,
 * which is why it is still gated: that would quietly disarm the panic button.
 *
 * it signs with the cold key, because setStopKey is an owner call. the same
 * operator token as the live agent control, for the same reason. */
const ABI = [
  "function setStopKey(uint256 agentId, uint256 x, uint256 y, bytes32 rpIdHash)",
  "function stopKeyOf(uint256) view returns (uint256 x, uint256 y, bytes32 rpIdHash, uint64 nonce, bool set)",
  "function getAgent(uint256) view returns (tuple(address agentKey,address revocationKey,address pendingRevocationKey,uint64 revocationKeyChangeAt,uint8 guardianThreshold,uint8 status,uint64 statusSince,uint256 successorId,bytes32 reasonHash,uint64 expiresAt,uint64 heartbeatWindow,uint64 lastBeat,address[] guardians))",
  "error NotRevocationKey()", "error Terminal()",
];

function operator(req: Request) {
  const want = process.env.OPERATOR_TOKEN || "";
  if (!want) return false;
  const got = req.headers.get("x-trustset-operator") || "";
  const a = Buffer.from(got), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id || !/^\d+$/.test(id)) return NextResponse.json({ error: "no agent" }, { status: 400 });
  try {
    const c = await cfg();
    const p = provider(c);
    const ks = new ethers.Contract(c.killSwitch, ABI, p);
    const [k, a, boss] = await Promise.all([
      ks.stopKeyOf(id), ks.getAgent(id),
      payer(c, p).then(w => w.address).catch(() => null),
    ]);
    /* whether this server can sign the nomination at all. the page says so
       instead of offering a button that reverts with NotRevocationKey. */
    const holdsColdKey = !!boss && boss.toLowerCase() === a.revocationKey.toLowerCase();
    return NextResponse.json({
      agentId: id, set: k.set, x: k.x.toString(), y: k.y.toString(), rpIdHash: k.rpIdHash,
      nonce: Number(k.nonce), status: Number(a.status), holdsColdKey, explorer: c.explorer,
      /* who the chain says may nominate. the page compares a connected wallet
         against this, so a reader who holds the cold key signs it themselves
         rather than being told the server cannot. */
      coldKey: ethers.getAddress(a.revocationKey as string),
      expiresAt: Number(a.expiresAt), heartbeatWindow: Number(a.heartbeatWindow), lastBeat: Number(a.lastBeat),
    }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!operator(req)) return NextResponse.json({ error: "Nominating a passkey needs the operator token." }, { status: 401 });
  try {
    const { agentId, x, y, rpIdHash } = await req.json();
    if (agentId === undefined || x === undefined || y === undefined || !rpIdHash) {
      return NextResponse.json({ error: "incomplete key" }, { status: 400 });
    }
    if (!/^0x[0-9a-fA-F]{64}$/.test(rpIdHash)) return NextResponse.json({ error: "rpIdHash is not 32 bytes" }, { status: 400 });
    const c = await cfg();
    const p = provider(c);
    const ks = new ethers.Contract(c.killSwitch, ABI, await payer(c, p));
    /* monad charges the gas limit, not the gas used, so it is estimated rather
       than guessed high. */
    const args = [BigInt(agentId), BigInt(x), BigInt(y), rpIdHash] as const;
    let gasLimit: bigint;
    try { gasLimit = ((await ks.setStopKey.estimateGas(...args)) * 12n) / 10n; }
    catch { gasLimit = 140000n; }
    const tx = await ks.setStopKey(...args, { gasLimit });
    const rc = await p.waitForTransaction(tx.hash);
    return NextResponse.json({ ok: rc?.status === 1, hash: tx.hash, block: rc?.blockNumber ?? null, explorer: c.explorer });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    const named = /NotRevocationKey/.test(m) ? "This server does not hold that agent's cold key, so it cannot nominate a passkey for it."
      : /Terminal/.test(m) ? "That agent has been stopped for good. Nothing can be nominated for it."
      : m.slice(0, 200);
    return NextResponse.json({ error: named }, { status: 400 });
  }
}
