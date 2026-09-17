"use client";
import { useEffect, useState } from "react";
import { ethers } from "ethers";
import Footer from "@/components/Footer";
import Shell from "@/components/agents/Shell";
import TxLink from "@/components/agents/TxLink";
import RefundReplay from "@/components/agents/RefundReplay";
import { useWallet } from "@/components/WalletProvider";
import Term from "@/components/Term";
import { explain, ownerTx, pinRead, READ, retry, settled, short, type Conn } from "@/lib/chain";

/* the refund rail, driven by hand.
 *
 * here your wallet plays the agent. it pays a demo service through the rail
 * with a short window, and then does one of the two things that can happen
 * next: releases the money on a receipt, or waits the window out and sends
 * the money home. every button is a transaction against the deployed rail,
 * and the list underneath is the rail's own record of your payments. */
const RAIL_ABI = [
  "function pay(address service, address token, uint256 amount, uint64 window, bytes32 requestHash) returns (uint256)",
  "function release(uint256 id, bytes32 receiptHash)",
  "function refund(uint256 id)",
  "function count() view returns (uint256)",
  "function get(uint256) view returns (tuple(address payer,address service,address token,uint256 amount,uint64 deadline,bytes32 requestHash,uint8 state))",
  "function refundable(uint256) view returns (bool)",
];
const USD_ABI = [
  "function mint(address to, uint256 amount)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address, address) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
];
const STATE = ["none", "open", "settled", "refunded"] as const;
/* the same throwaway service the seed payments went to. it never answers,
   which is the point: it is the API that took the money and went quiet. */
const SERVICE = "0x3E2748A24847a1F0CCca63253ef0fD09aEd62A35";
const AMOUNT = 4000n; // 0.004 mUSD, six decimals
const WINDOW = 30;

type Row = { id: bigint; amount: bigint; deadline: number; state: (typeof STATE)[number]; refundable: boolean };

export default function Refunds() {
  const { conn, who } = useWallet();
  const [rows, setRows] = useState<Row[]>([]);
  const [bal, setBal] = useState<bigint | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<React.ReactNode>(null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => { const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000); return () => clearInterval(t); }, []);

  const rail = (c: Conn) => new ethers.Contract(c.cfg.refunds!, RAIL_ABI, c.p);
  const usd = (c: Conn) => new ethers.Contract(c.cfg.mockUsd!, USD_ABI, c.p);

  async function refresh(c: Conn, me: string) {
    await pinRead(c);
    const r = rail(c);
    const n = Number(await retry(() => r.count(READ)));
    const ids = Array.from({ length: n }, (_, i) => BigInt(n - i));
    const got = await Promise.all(ids.map(id => retry(() => r.get(id, READ))));
    const mine: Row[] = [];
    for (let k = 0; k < got.length; k++) {
      const g = got[k];
      if (g.payer.toLowerCase() !== me.toLowerCase()) continue;
      mine.push({ id: ids[k], amount: g.amount, deadline: Number(g.deadline), state: STATE[Number(g.state)], refundable: Number(g.state) === 1 && now >= Number(g.deadline) });
    }
    setRows(mine);
    setBal(BigInt(await retry(() => usd(c).balanceOf(me, READ))));
  }
  useEffect(() => {
    if (!conn || !who) return;
    let alive = true;
    const run = () => { if (alive) refresh(conn, who.address).catch(() => {}); };
    run(); const t = setInterval(run, 4000);
    return () => { alive = false; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conn, who]);

  const WORDS: Record<string, string> = { mint: "Minted 10 mUSD.", pay: "Paid 0.004 mUSD into escrow." };
  const run = async (label: string, fn: () => Promise<unknown>) => {
    if (!conn || !who) return;
    setBusy(label); setNote(null);
    try {
      const rc = await ownerTx(fn) as { hash?: string; blockNumber?: number } | undefined;
      await settled(conn, rc?.blockNumber);
      const text = WORDS[label] ?? (label.startsWith("release") ? `Payment #${label.split(":")[1]} released to the service on your receipt.` : label.startsWith("refund") ? `Payment #${label.split(":")[1]} sent back to you.` : "Done.");
      setNote(<>{text} <TxLink cfg={conn.cfg} hash={rc?.hash} /></>);
      await refresh(conn, who.address);
    }
    catch (e) { setNote(explain(e, conn)); }
    finally { setBusy(null); }
  };

  const mint = () => run("mint", async () => (await (usd(conn!).connect(who!.signer) as ethers.Contract).mint(who!.address, 10_000_000n)).wait(2));
  const pay = () => run("pay", async () => {
    const u = usd(conn!).connect(who!.signer) as ethers.Contract;
    if (BigInt(await u.allowance(who!.address, conn!.cfg.refunds!)) < AMOUNT) await (await u.approve(conn!.cfg.refunds!, ethers.MaxUint256)).wait(2);
    const r = rail(conn!).connect(who!.signer) as ethers.Contract;
    return (await r.pay(SERVICE, conn!.cfg.mockUsd!, AMOUNT, WINDOW, ethers.id("GET /token-screener"))).wait(2);
  });
  const release = (id: bigint) => run("release:" + id, async () => (await (rail(conn!).connect(who!.signer) as ethers.Contract).release(id, ethers.id("200 OK, delivered"))).wait(2));
  const refund = (id: bigint) => run("refund:" + id, async () => (await (rail(conn!).connect(who!.signer) as ethers.Contract).refund(id)).wait(2));

  const ready = !!(conn && who);
  const fmt = (v: bigint) => (Number(v) / 1e6).toFixed(3);

  return (
    <>
      <Shell title="Refunds" note="Your wallet plays the agent">
        {note && <div className="sheet px-4 py-3 mb-3 text-xs flex items-start gap-3"><span className="break-words text-ink/80">{note}</span><button type="button" onClick={() => setNote(null)} className="ml-auto text-ink/70" aria-label="Dismiss">×</button></div>}
        {conn === null && <div className="sheet p-6 text-sm text-ink/70">No chain configured.</div>}
        {conn && !conn.cfg.refunds && <div className="sheet p-6 text-sm text-ink/70">This chain has no refund rail deployed.</div>}
        {conn?.cfg.refunds && !who && (
          <div className="grid gap-3 sm:gap-4 lg:grid-cols-[minmax(0,1fr)_340px] items-stretch">
            <div className="min-w-0 lg:min-h-[420px]"><RefundReplay sample /></div>
            <div className="sheet p-6 sm:p-8 flex flex-col justify-center text-center gap-3 min-w-0">
              <div className="text-lg font-semibold tracking-tight">These rows are a sample</div>
              <p className="text-sm text-ink/70">A payment goes into escrow, a receipt releases it to the service, a closed window sends it back, and anyone may press that button. Connect a wallet, top right, and try it with mock dollars.</p>
            </div>
          </div>
        )}
        {ready && conn.cfg.refunds && (
          <div className="grid gap-3 sm:gap-4 lg:grid-cols-[minmax(0,1fr)_340px] items-stretch">
            <div className="drawn-box overflow-clip min-w-0 lg:min-h-[420px] flex flex-col">
              <div className="hidden sm:grid grid-cols-[80px_1fr_150px_auto] gap-4 px-5 py-2.5" style={{ borderBottom: "1px solid var(--hairline)" }}>
                <span className="eyebrow">payment</span><span className="eyebrow">state</span><span className="eyebrow text-right">window</span><span className="eyebrow">control</span>
              </div>
              {rows.length === 0 && <div className="px-5 py-8 text-sm text-ink/70">No payments from {short(who.address)} yet. Pay the demo service to make one.</div>}
              {rows.map(r => {
                const left = r.deadline - now;
                const hot = r.state === "refunded";
                return (
                  <div key={r.id.toString()} className="grid grid-cols-[1fr_auto] sm:grid-cols-[80px_1fr_150px_auto] items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3.5 text-sm" style={{ borderBottom: "1px solid var(--hairline)", background: hot ? "color-mix(in srgb, var(--orange) 6%, transparent)" : undefined }}>
                    <span className="mono text-xs tabular">#{r.id.toString()}</span>
                    <span className="min-w-0">
                      <span className="font-semibold" style={{ color: hot ? "var(--orange-text)" : r.state === "settled" ? "var(--sage-text)" : "var(--text-dark)" }}>
                        {r.state === "open" ? "Held" : r.state === "settled" ? "Delivered" : "Refunded"}
                      </span>
                      <span className="text-ink/70"> · {fmt(r.amount)} mUSD {r.state === "open" ? "in escrow" : r.state === "settled" ? "to the service" : "back to you"}</span>
                    </span>
                    <span className="hidden sm:block mono text-xs tabular text-right" style={{ color: "var(--text-medium)" }}>
                      {r.state !== "open" ? "closed" : left > 0 ? `${left}s left` : "window closed"}
                    </span>
                    <span className="flex gap-1.5">
                      {r.state === "open" && <button type="button" className="drawn-btn btn-gold" style={{ padding: "6px 12px", fontSize: "0.75rem" }} disabled={!!busy} onClick={() => release(r.id)}>{busy === "release:" + r.id ? "…" : "Release"}</button>}
                      {r.state === "open" && <button type="button" className="drawn-btn btn-orange" style={{ padding: "6px 12px", fontSize: "0.75rem" }} disabled={!!busy || left > 0} onClick={() => refund(r.id)} title={left > 0 ? "Opens when the window closes" : "Anyone may press this"}>{busy === "refund:" + r.id ? "…" : "Refund"}</button>}
                    </span>
                  </div>
                );
              })}
            </div>

            <aside className="drawn-box p-5 flex flex-col gap-4 min-w-0">
              <div>
                <div className="eyebrow mb-1">Your balance</div>
                <div className="text-2xl font-semibold tabular tracking-tight">{bal === null ? "…" : fmt(bal)} <span className="text-sm font-normal text-ink/70">mUSD</span></div>
                <div className="text-[11px] mt-1" style={{ color: "var(--text-medium)" }}>A mock dollar, mintable by anyone, because the testnet has no stable to hand.</div>
              </div>
              <button type="button" className="drawn-btn btn-gold" disabled={!!busy} onClick={mint}>{busy === "mint" ? "Minting…" : "Mint 10 mUSD"}</button>
              <div className="rule-top pt-4">
                <div className="text-sm font-semibold">Pay the demo service</div>
                <div className="text-[12px] mt-1 text-ink/70">0.004 mUSD into <Term tip="The money sits in the rail's own contract. The service is paid only on a receipt you signed; otherwise the window closes and the money comes back.">escrow</Term>, {WINDOW} second window, to a service that never answers.</div>
                <button type="button" className="drawn-btn btn-orange mt-3" disabled={!!busy || (bal !== null && bal < AMOUNT)} onClick={pay}>{busy === "pay" ? "Paying…" : "Pay 0.004 mUSD"}</button>
              </div>
              <div className="rule-top pt-4 text-[12px] text-ink/70 flex flex-col gap-2">
                <div><b className="text-ink">Release</b> is the receipt: you saying it was delivered. The service is paid.</div>
                <div><b className="text-ink">Refund</b> opens when the window closes. Anyone may press it. The money comes home.</div>
                <div>A payment is exactly one of held, delivered, refunded. Never two.</div>
              </div>
            </aside>
          </div>
        )}
      </Shell>
      <Footer />
    </>
  );
}
