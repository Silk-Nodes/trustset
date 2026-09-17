import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { cfg, provider, payer } from "@/lib/demo.server";

export const dynamic = "force-dynamic";

/* the relayer for the panic button.
 *
 * pausing with a passkey needs a transaction, and somebody has to pay for it. that
 * cannot be the person, because the whole point is that they have a phone and no
 * wallet. so this carries the assertion to the chain and pays the gas.
 *
 * it is not trusted with anything. the assertion is the authority: the contract
 * verifies it against the passkey the owner nominated, checks the challenge is the
 * one it issued for that agent at that count, and requires the device to have
 * verified a person. this server can forge none of that, and the worst a broken or
 * hostile relayer can do is refuse to send, which is why the page also offers the
 * raw call for anyone who would rather send it themselves. */
const ABI = [
  "function pauseWithPasskey(uint256 agentId, (bytes authenticatorData, bytes clientDataJSON, uint256 r, uint256 s) assertion)",
  "function stopChallenge(uint256) view returns (bytes32)",
  "function stopKeyOf(uint256) view returns (uint256 x, uint256 y, bytes32 rpIdHash, uint64 nonce, bool set)",
  /* without these ethers reports a revert as "unknown custom error" and the page
     shows a selector to somebody holding a phone in a hurry. */
  "error BadAssertion()", "error NoStopKey()", "error BadTransition()", "error Terminal()",
];

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "no agent" }, { status: 400 });
  try {
    const c = await cfg();
    const ks = new ethers.Contract(c.killSwitch, ABI, provider(c));
    const [challenge, key] = await Promise.all([ks.stopChallenge(id), ks.stopKeyOf(id)]);
    return NextResponse.json({
      challenge, set: key.set, rpIdHash: key.rpIdHash, nonce: Number(key.nonce), explorer: c.explorer,
    }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { agentId, authenticatorData, clientDataJSON, r, s } = await req.json();
    if (agentId === undefined || !authenticatorData || !clientDataJSON || !r || !s) {
      return NextResponse.json({ error: "incomplete assertion" }, { status: 400 });
    }
    const c = await cfg();
    const p = provider(c);
    const ks = new ethers.Contract(c.killSwitch, ABI, await payer(c, p));
    const tx = await ks.pauseWithPasskey(agentId, { authenticatorData, clientDataJSON, r, s });
    const rc = await p.waitForTransaction(tx.hash);
    return NextResponse.json({ ok: rc?.status === 1, hash: tx.hash, block: rc?.blockNumber ?? null, explorer: c.explorer });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    /* the contract's own words, when it has any, rather than ethers' summary. */
    /* by name when ethers decoded it, by selector when it did not. */
    const sel = /0x0bd43c39/.test(m) ? "BadAssertion" : /0x0dc5f05f/.test(m) ? "NoStopKey"
      : /0x55f0afcd/.test(m) ? "BadTransition" : /0x523437db/.test(m) ? "Terminal" : "";
    const which = (n: string) => new RegExp(n).test(m) || sel === n;
    const named = which("BadAssertion") ? "That passkey was refused. The touch may have been used already, or the device did not verify a person."
      : which("NoStopKey") ? "No passkey is nominated for this agent."
      : which("BadTransition") ? "That agent is not active right now, so there is nothing to pause."
      : which("Terminal") ? "That agent has already been stopped for good."
      : m.slice(0, 200);
    return NextResponse.json({ error: named }, { status: 400 });
  }
}
