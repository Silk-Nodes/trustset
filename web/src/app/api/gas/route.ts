import { NextResponse } from "next/server";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { ethers } from "ethers";
import { cfg, provider, payer } from "@/lib/demo.server";
import { gasDay, gasMessage } from "@/lib/gas";

export const dynamic = "force-dynamic";

/* a little testnet gas for a wallet that has none.
 *
 * somebody who signs in with an email gets a brand new wallet with nothing in
 * it, and registering an agent is a transaction. without this the email path
 * dead-ends at the first button. so a new wallet can ask once for enough to
 * register and act a few times, paid by the server's demo key.
 *
 * what keeps it from being a tap anyone can drain:
 * - the wallet signs the request, so a drip only goes to an address whose
 *   owner is at the keyboard, not to addresses sprayed at the endpoint
 * - once per address, ever, and only while it is nearly empty
 * - a daily ceiling across everybody
 * testnet MON has no price; the ceiling is about the demo key staying funded. */
const DRIP = ethers.parseEther("0.05");
const EMPTY = ethers.parseEther("0.02");
const DAILY = ethers.parseEther("2");
const ROOT = () => process.env.TRUSTSET_ROOT || join(process.cwd(), "..");
const STORE = () => process.env.GAS_STORE || join(ROOT(), ".gas-drips.json");

type Store = { paid: Record<string, string>; days: Record<string, string> };
async function load(): Promise<Store> {
  try { return JSON.parse(await readFile(/*turbopackIgnore: true*/ STORE(), "utf8")); } catch { return { paid: {}, days: {} }; }
}

export async function POST(req: Request) {
  let body: { address?: string; signature?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "send JSON" }, { status: 400 }); }
  const address = body.address && ethers.isAddress(body.address) ? ethers.getAddress(body.address) : null;
  if (!address || !body.signature) return NextResponse.json({ error: "address and signature are required" }, { status: 400 });

  const today = gasDay();
  let signer: string;
  try { signer = ethers.verifyMessage(gasMessage(address, today), body.signature); } catch { signer = ""; }
  if (signer !== address) return NextResponse.json({ error: "the signature is not from that address, or is from another day" }, { status: 401 });

  const c = await cfg();
  const p = provider(c);
  const s = await load();
  const key = address.toLowerCase();
  if (s.paid[key]) return NextResponse.json({ error: "this address has had its gas already", tx: s.paid[key] }, { status: 409 });
  const bal = await p.getBalance(address);
  if (bal >= EMPTY) return NextResponse.json({ ok: true, skipped: true, balance: ethers.formatEther(bal) });
  const spent = BigInt(s.days[today] ?? "0");
  if (spent + DRIP > DAILY) return NextResponse.json({ error: "today's testnet gas is used up. try tomorrow, or use the Monad faucet" }, { status: 429 });

  /* recorded before sending, so two requests racing cannot both be paid */
  s.days[today] = (spent + DRIP).toString();
  s.paid[key] = "pending";
  await writeFile(/*turbopackIgnore: true*/ STORE(), JSON.stringify(s, null, 2));
  try {
    const w = await payer(c, p);
    /* 21000 exactly: monad refuses a plain transfer sent with more */
    const tx = await w.sendTransaction({ to: address, value: DRIP, gasLimit: 21000 });
    s.paid[key] = tx.hash;
    await writeFile(/*turbopackIgnore: true*/ STORE(), JSON.stringify(s, null, 2));
    await tx.wait(1);
    return NextResponse.json({ ok: true, tx: tx.hash, amount: ethers.formatEther(DRIP) });
  } catch (e) {
    /* nothing was sent: give the address its chance back */
    delete s.paid[key]; s.days[today] = spent.toString();
    await writeFile(/*turbopackIgnore: true*/ STORE(), JSON.stringify(s, null, 2)).catch(() => {});
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
