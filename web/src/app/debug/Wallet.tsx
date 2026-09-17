"use client";
import { useEffect, useRef, useState } from "react";

/* a page that says exactly what this browser's wallet is doing.
 *
 * built because "connect does not work" was diagnosed twice from guesses and
 * both guesses were wrong. every step of the connect sequence runs here on its
 * own, reports what it got back, and dumps the raw error object rather than
 * ethers' one-line summary of it. */
type Row = { step: string; ok: boolean | null; detail: string };

const dump = (e: unknown): string => {
  try {
    const seen = new WeakSet();
    return JSON.stringify(e, (_k, v) => {
      if (typeof v === "object" && v !== null) { if (seen.has(v)) return "[circular]"; seen.add(v); }
      if (v instanceof Error) return { name: v.name, message: v.message, ...(v as unknown as Record<string, unknown>) };
      return typeof v === "bigint" ? v.toString() : v;
    }, 1).slice(0, 1400);
  } catch { return String(e); }
};

export default function Wallet() {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const add = (step: string, ok: boolean | null, detail: unknown) =>
    setRows(r => [...r, { step, ok, detail: typeof detail === "string" ? detail : dump(detail) }]);

  /* strict mode mounts twice in development, which ran the whole report twice
     and printed every row two times. */
  const ran = useRef(false);
  useEffect(() => { if (ran.current) return; ran.current = true; void passive(); }, []);

  async function passive() {
    setRows([]);
    add("User agent", null, navigator.userAgent);
    add("Origin", null, location.origin);
    const eth = (window as unknown as { ethereum?: Record<string, unknown> }).ethereum;
    add("window.ethereum present", !!eth, eth ? "yes" : "NO. nothing injected into this page.");
    if (eth) {
      add("Wallet flags", null, JSON.stringify({
        isMetaMask: eth.isMetaMask, isRabby: eth.isRabby, isPhantom: eth.isPhantom,
        isBraveWallet: eth.isBraveWallet, isCoinbaseWallet: eth.isCoinbaseWallet,
        providers: Array.isArray(eth.providers) ? (eth.providers as unknown[]).length : 0,
      }));
    }
    /* EIP-6963: what announces itself, which is what a modern wallet does
       instead of, or as well as, setting window.ethereum. */
    const found: string[] = [];
    const onA = (ev: Event) => { const d = (ev as CustomEvent<{ info?: { name?: string } }>).detail; if (d?.info?.name) found.push(d.info.name); };
    window.addEventListener("eip6963:announceProvider", onA);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    await new Promise(r => setTimeout(r, 600));
    window.removeEventListener("eip6963:announceProvider", onA);
    add("EIP-6963 announced", found.length > 0, found.length ? found.join(", ") : "none announced");

    try { const r = await fetch("/api/chain", { cache: "no-store" }); add("GET /api/chain", r.ok, await r.text()); }
    catch (e) { add("GET /api/chain", false, e); }

    if (!eth) return;
    try { add("eth_chainId", true, String(await (eth.request as (a: unknown) => Promise<unknown>)({ method: "eth_chainId" }))); }
    catch (e) { add("eth_chainId", false, e); }
    try { add("eth_accounts (no prompt)", true, JSON.stringify(await (eth.request as (a: unknown) => Promise<unknown>)({ method: "eth_accounts" }))); }
    catch (e) { add("eth_accounts (no prompt)", false, e); }
  }

  /* the one step that opens the extension. kept behind its own button so the
     passive report above can be read without a prompt in the way. */
  async function prompt() {
    setBusy(true);
    const eth = (window as unknown as { ethereum?: { request: (a: unknown) => Promise<unknown> } }).ethereum;
    if (!eth) { add("eth_requestAccounts", false, "no window.ethereum"); setBusy(false); return; }
    try { add("eth_requestAccounts", true, JSON.stringify(await eth.request({ method: "eth_requestAccounts" }))); }
    catch (e) { add("eth_requestAccounts", false, e); }
    try { add("wallet_switchEthereumChain 0x279f", true, String(await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x279f" }] }))); }
    catch (e) { add("wallet_switchEthereumChain 0x279f", false, e); }
    try { add("eth_chainId after switch", true, String(await eth.request({ method: "eth_chainId" }))); }
    catch (e) { add("eth_chainId after switch", false, e); }
    setBusy(false);
  }

  const text = rows.map(r => `${r.ok === null ? "·" : r.ok ? "ok" : "FAIL"}  ${r.step}\n    ${r.detail.replace(/\n/g, "\n    ")}`).join("\n\n");

  return (
    <main className="w-full max-w-4xl mx-auto px-4 pt-10 pb-16">
      <h1 className="text-2xl font-semibold tracking-tight mb-1">Wallet diagnostics</h1>
      <p className="text-sm text-ink/70 mb-5">Nothing here signs or spends. The first section runs on load without any prompt.</p>
      <div className="flex gap-2 mb-5">
        <button type="button" className="drawn-btn btn-orange" onClick={prompt} disabled={busy}>Run the prompting steps</button>
        <button type="button" className="drawn-btn btn-gold" onClick={() => navigator.clipboard?.writeText(text)}>Copy report</button>
        <button type="button" className="drawn-btn btn-gold" onClick={() => void passive()}>Re-run</button>
      </div>
      <div className="sheet overflow-clip">
        {rows.map((r, i) => (
          <div key={i} className="px-4 py-3 text-sm" style={{ borderTop: i ? "1px solid var(--hairline)" : undefined }}>
            <div className="flex items-baseline gap-2">
              <span className="mono text-[11px]" style={{ color: r.ok === null ? "var(--text-medium)" : r.ok ? "var(--sage-text)" : "var(--orange-text)" }}>{r.ok === null ? "·" : r.ok ? "ok" : "FAIL"}</span>
              <span className="font-medium">{r.step}</span>
            </div>
            <pre className="mono text-[11px] mt-1.5 whitespace-pre-wrap break-all" style={{ color: "var(--text-medium)" }}>{r.detail}</pre>
          </div>
        ))}
      </div>
    </main>
  );
}
