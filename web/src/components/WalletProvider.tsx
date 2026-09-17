"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { connect, connectWallet, explain, onWalletChange, type Conn, type Signer } from "@/lib/chain";
import { useWalletPresence } from "@/hooks/useWalletPresence";

/* one wallet, for the whole site.
 *
 * the console and the refunds page each used to own their connection, so a
 * reader who walked from one to the other and back was asked to connect
 * again. the connection lives here now, above every page. it also comes back
 * on its own after a reload: if this browser connected before, the provider
 * asks the wallet what accounts are already approved (eth_accounts, which
 * opens no prompt) and picks up where it left off. disconnect forgets that. */
type Ctx = {
  conn: Conn | null | undefined;
  who: Signer | null;
  walletOk: boolean;
  error: string | null;
  /* true while a remembered connection is being picked back up after a load */
  resuming: boolean;
  connectNow: () => Promise<void>;
  disconnect: () => void;
};
const WalletCtx = createContext<Ctx | null>(null);
const REMEMBER = "trustset:wallet:connected";

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [conn, setConn] = useState<Conn | null | undefined>(undefined);
  const [who, setWho] = useState<Signer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resuming, setResuming] = useState(() => { try { return localStorage.getItem(REMEMBER) === "1"; } catch { return false; } });
  const walletOk = useWalletPresence();

  useEffect(() => { connect().then(setConn).catch(() => setConn(null)); }, []);

  const connectNow = useCallback(async () => {
    setError(null);
    const c = conn ?? await connect();
    setConn(c);
    const s = await connectWallet(c.cfg);
    setWho(s);
    try { localStorage.setItem(REMEMBER, "1"); } catch { /* fine */ }
  }, [conn]);

  const disconnect = useCallback(() => {
    setWho(null);
    try { localStorage.removeItem(REMEMBER); } catch { /* fine */ }
  }, []);

  /* silent return: only when this browser chose to connect before, and only
     with what the wallet already approved. never a prompt on page load.
     the wallet can inject a moment after the page, so this looks for it for
     a few seconds rather than once, and says why if it gives up. */
  useEffect(() => {
    if (!conn || who) return;
    let remembered = false;
    try { remembered = localStorage.getItem(REMEMBER) === "1"; } catch { /* fine */ }
    if (!remembered) { setResuming(false); return; }
    let alive = true;
    (async () => {
      try {
        let eth = window.ethereum;
        for (let i = 0; i < 20 && !eth && alive; i++) { await new Promise(r => setTimeout(r, 250)); eth = window.ethereum; }
        if (!eth) { console.warn("trustset: no wallet injected, cannot resume"); return; }
        const accounts = (await eth.request({ method: "eth_accounts" })) as string[];
        if (!accounts?.length) { console.warn("trustset: wallet has no approved account for this site, or is locked; not resuming"); return; }
        const chainId = (await eth.request({ method: "eth_chainId" })) as string;
        if (chainId.toLowerCase() !== conn.cfg.chainIdHex) { console.warn(`trustset: wallet is on ${chainId}, page wants ${conn.cfg.chainIdHex}; not resuming without a prompt`); return; }
        const s = await connectWallet(conn.cfg);
        if (alive) setWho(s);
      } catch (e) { console.warn("trustset: resume failed", e); }
      finally { if (alive) setResuming(false); }
    })();
    return () => { alive = false; };
  }, [conn, who]);

  /* the extension is its own UI. switching account or network there lands here. */
  useEffect(() => {
    if (!who) return;
    return onWalletChange(() => { connectNow().catch(e => { setWho(null); setError(explain(e)); }); });
  }, [who, connectNow]);

  return <WalletCtx.Provider value={{ conn, who, walletOk, error, resuming: resuming && !who, connectNow, disconnect }}>{children}</WalletCtx.Provider>;
}

export function useWallet() {
  const v = useContext(WalletCtx);
  if (!v) throw new Error("useWallet outside WalletProvider");
  return v;
}
