"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
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
  /* a button that needs a signer asks for one: the sign-in panel opens with
     the reason on it, and the button carries on once somebody is signed in. */
  ask: string | null;
  askSignIn: (reason: string) => void;
  clearAsk: () => void;
  /* email sign-in through Dynamic. null when this deployment has none. */
  email: null | {
    send: (address: string) => Promise<void>;
    verify: (code: string) => Promise<void>;
  };
};
const WalletCtx = createContext<Ctx | null>(null);
const REMEMBER = "trustset:wallet:connected";
/* "1" is the browser wallet, as it always was; "email" is a Dynamic session */
const EMAIL = "email";

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [conn, setConn] = useState<Conn | null | undefined>(undefined);
  const [who, setWho] = useState<Signer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ask, setAsk] = useState<string | null>(null);
  const askSignIn = useCallback((reason: string) => setAsk(reason), []);
  const clearAsk = useCallback(() => setAsk(null), []);
  /* signed in: whatever asked has its answer */
  useEffect(() => { if (who) setAsk(null); }, [who]);
  const [resuming, setResuming] = useState(() => { try { return !!localStorage.getItem(REMEMBER); } catch { return false; } });
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
    if (who?.kind === "email" && conn?.cfg.dynamicEnvironmentId) {
      import("@/lib/dynamic").then(d => d.signOutEmail(conn.cfg.dynamicEnvironmentId!)).catch(() => {});
    }
    setWho(null);
    try { localStorage.removeItem(REMEMBER); } catch { /* fine */ }
  }, [who, conn]);

  /* the code sent to an address, kept between the two steps. a ref, not state:
     nothing renders from it, and the SDK's object is not meant to be copied. */
  const pending = useRef<unknown>(null);
  const env = conn?.cfg.dynamicEnvironmentId;
  const email = useMemo(() => !conn || !env ? null : {
    send: async (address: string) => {
      setError(null);
      const d = await import("@/lib/dynamic");
      pending.current = await d.sendCode(env, address);
    },
    verify: async (code: string) => {
      setError(null);
      const d = await import("@/lib/dynamic");
      if (!pending.current) throw new Error("Ask for a code first");
      await d.verifyCode(env, pending.current as Parameters<typeof d.verifyCode>[1], code);
      pending.current = null;
      const s = await d.emailSigner(env, conn.p);
      if (!s) throw new Error("Signed in, but Dynamic returned no wallet");
      setWho({ address: s.address, signer: s.signer, kind: "email", email: s.email });
      try { localStorage.setItem(REMEMBER, EMAIL); } catch { /* fine */ }
      /* a new email wallet is empty, and registering an agent costs gas. ask
         for a first drip, signed so it only goes to the wallet at the
         keyboard. quietly: a wallet that already has gas is simply skipped. */
      try {
        const { gasMessage, gasDay } = await import("@/lib/gas");
        const signature = await s.signer.signMessage(gasMessage(s.address, gasDay()));
        await fetch("/api/gas", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: s.address, signature }) });
      } catch (e) { console.warn("trustset: gas drip failed", e); }
    },
  }, [conn, env]);

  /* silent return: only when this browser chose to connect before, and only
     with what the wallet already approved. never a prompt on page load.
     the wallet can inject a moment after the page, so this looks for it for
     a few seconds rather than once, and says why if it gives up. */
  useEffect(() => {
    if (!conn || who) return;
    let remembered = false;
    try { remembered = localStorage.getItem(REMEMBER) === "1"; } catch { /* fine */ }

    let how: string | null = null;
    try { how = localStorage.getItem(REMEMBER); } catch { /* fine */ }
    /* an email session: Dynamic keeps it in this browser and restores it on
       init. no prompt, no code, unless it has expired. */
    if (how === EMAIL) {
      let alive = true;
      (async () => {
        try {
          if (!conn.cfg.dynamicEnvironmentId) return;
          const d = await import("@/lib/dynamic");
          const s = await d.emailSigner(conn.cfg.dynamicEnvironmentId, conn.p);
          if (s && alive) setWho({ address: s.address, signer: s.signer, kind: "email", email: s.email });
          else if (!s) { try { localStorage.removeItem(REMEMBER); } catch { /* fine */ } }
        } catch (e) { console.warn("trustset: email session did not resume", e); }
        finally { if (alive) setResuming(false); }
      })();
      return () => { alive = false; };
    }
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

  /* the extension is its own UI. switching account or network there lands here.
     an email wallet has no extension to switch in. */
  useEffect(() => {
    if (!who || who.kind === "email") return;
    return onWalletChange(() => { connectNow().catch(e => { setWho(null); setError(explain(e)); }); });
  }, [who, connectNow]);

  return <WalletCtx.Provider value={{ conn, who, walletOk, error, resuming: resuming && !who, connectNow, disconnect, email, ask, askSignIn, clearAsk }}>{children}</WalletCtx.Provider>;
}

export function useWallet() {
  const v = useContext(WalletCtx);
  if (!v) throw new Error("useWallet outside WalletProvider");
  return v;
}
