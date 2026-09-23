"use client";
import { useEffect, useRef, useState } from "react";
import { short } from "@/lib/chain";

/* one control: connect, or show who is signing.
 *
 * connected, it is a chip with the short address. the chip opens a card with
 * the whole address, a copy button and disconnect, because a shortened
 * address you cannot copy is a decoration, not information. */
export default function WalletButton({ address, kind, onConnect, onDisconnect, available, explorer, resuming = false, email = null, signedInAs = null }: {
  address: string | null; kind: "demo" | "wallet" | "email" | null; onConnect: () => void; onDisconnect: () => void; available: boolean; explorer?: string; resuming?: boolean;
  /* email sign-in, when this deployment has Dynamic configured */
  email?: { send: (a: string) => Promise<void>; verify: (c: string) => Promise<void> } | null;
  signedInAs?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", off); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", off); document.removeEventListener("keydown", esc); };
  }, [open]);

  if (address && (kind === "wallet" || kind === "email")) return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open} className="drawn-btn btn-gold" style={{ padding: "8px 14px", fontSize: "0.8rem" }}>
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--sage)" }} /><span className="mono">{short(address)}</span>
      </button>
      {open && (
        <div role="dialog" aria-label="Connected wallet" className="absolute right-0 mt-2 z-50 sheet p-4 w-[min(400px,calc(100vw-2rem))]" style={{ boxShadow: "var(--glass-shadow)" }}>
          {/* 42 mono characters at 12.5px is about 330px; the card gives them
              room on one line. on a phone the line scrolls sideways inside
              the card rather than breaking. a chopped last character is not
              a layout. */}
          <div className="eyebrow mb-1.5">{kind === "email" ? <>Signed in{signedInAs ? <> as <span className="normal-case tracking-normal">{signedInAs}</span></> : null} · the cold key</> : "Connected as the cold key"}</div>
          <div className="mono text-[12.5px] whitespace-nowrap overflow-x-auto select-all leading-relaxed no-scrollbar">{address}</div>
          <div className="flex flex-wrap gap-2 mt-3">
            <button type="button" className="drawn-btn btn-gold" style={{ padding: "6px 12px", fontSize: "0.75rem" }}
              onClick={async () => { try { await navigator.clipboard.writeText(address); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch { /* select-all is the fallback */ } }}>
              {copied ? "Copied" : "Copy address"}
            </button>
            {explorer && <a href={`${explorer}/address/${address}`} target="_blank" rel="noreferrer" className="drawn-btn btn-gold" style={{ padding: "6px 12px", fontSize: "0.75rem" }}>Explorer</a>}
            <button type="button" className="drawn-btn btn-gold ml-auto" style={{ padding: "6px 12px", fontSize: "0.75rem" }} onClick={() => { setOpen(false); onDisconnect(); }}>{kind === "email" ? "Sign out" : "Disconnect"}</button>
          </div>
        </div>
      )}
    </div>
  );
  if (resuming) return (
    <span className="drawn-btn btn-gold" style={{ padding: "8px 14px", fontSize: "0.8rem", opacity: 0.7 }}><span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--text-light)" }} />Reconnecting</span>
  );
  /* signed out. with email configured, one "Sign in" that offers both ways:
     an email first, because most people who arrive have no wallet extension,
     and the browser wallet under it. without email, the old single button. */
  const walletLink = !available
    ? <a href="https://metamask.io/download/" target="_blank" rel="noreferrer" className="drawn-btn btn-gold" style={{ padding: "8px 14px", fontSize: "0.8rem" }} title="No wallet found in this browser">Get a wallet</a>
    : <button type="button" onClick={() => { setOpen(false); onConnect(); }} className="drawn-btn" style={{ padding: "8px 14px", fontSize: "0.8rem" }} title="Connect wallet">Connect wallet</button>;
  if (!email) return walletLink;
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open} className="drawn-btn" style={{ padding: "8px 14px", fontSize: "0.8rem" }}>Sign in</button>
      {open && (
        <div role="dialog" aria-label="Sign in" className="absolute right-0 mt-2 z-50 sheet p-4 w-[min(340px,calc(100vw-2rem))]" style={{ boxShadow: "var(--glass-shadow)" }}>
          <EmailSignIn email={email} onDone={() => setOpen(false)} />
          <div className="flex items-center gap-2 my-3.5"><span className="flex-1 h-px" style={{ background: "var(--hairline)" }} /><span className="eyebrow">or</span><span className="flex-1 h-px" style={{ background: "var(--hairline)" }} /></div>
          <div className="flex items-center gap-2">
            {walletLink}
            <span className="text-[11.5px]" style={{ color: "var(--text-medium)" }}>{available ? "MetaMask or any browser wallet" : "no wallet in this browser"}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* two steps, one field at a time: the address, then the code Dynamic sends to
   it. the wallet is made on the first sign-in and becomes the cold key. */
function EmailSignIn({ email, onDone }: { email: { send: (a: string) => Promise<void>; verify: (c: string) => Promise<void> }; onDone: () => void }) {
  const [step, setStep] = useState<"address" | "code">("address");
  const [value, setValue] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const field = { background: "var(--bg-base)", border: "1px solid var(--hairline)", color: "var(--text-dark)" } as const;
  const ok = step === "address" ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) : /^\d{4,8}$/.test(value.trim());

  const go = async () => {
    if (!ok || busy) return;
    setBusy(true); setErr(null);
    try {
      if (step === "address") { await email.send(value.trim()); setSentTo(value.trim()); setValue(""); setStep("code"); }
      else { await email.verify(value.trim()); onDone(); }
    } catch (e) {
      setErr(e instanceof Error ? e.message.replace(/^.*?:\s*/, "").slice(0, 160) || "That did not work. Try again." : "That did not work. Try again.");
    } finally { setBusy(false); }
  };

  return (
    <form onSubmit={e => { e.preventDefault(); go(); }} className="flex flex-col gap-2">
      <div className="eyebrow">{step === "address" ? "Continue with email" : "Check your email"}</div>
      <p className="text-[12px]" style={{ color: "var(--text-medium)" }}>
        {step === "address"
          ? "A wallet is made for you on first sign-in, through Dynamic. It becomes the cold key for your agents."
          : <>We sent a code to <span style={{ color: "var(--text-dark)" }}>{sentTo}</span>.</>}
      </p>
      <input autoFocus value={value} onChange={e => setValue(e.target.value)} disabled={busy}
        type={step === "address" ? "email" : "text"} inputMode={step === "code" ? "numeric" : undefined} autoComplete={step === "code" ? "one-time-code" : "email"}
        placeholder={step === "address" ? "you@example.com" : "6-digit code"} aria-label={step === "address" ? "Email address" : "Code"}
        className="h-9 rounded-lg px-3 text-[13px] outline-none focus-visible:ring-2" style={field} />
      <div className="flex items-center gap-2">
        <button type="submit" disabled={!ok || busy} className="drawn-btn btn-orange" style={{ padding: "6px 14px", fontSize: "0.78rem", opacity: !ok || busy ? 0.6 : 1 }}>
          {busy ? (step === "address" ? "Sending…" : "Signing in…") : step === "address" ? "Send code" : "Sign in"}
        </button>
        {step === "code" && <button type="button" onClick={() => { setStep("address"); setValue(sentTo); setErr(null); }} className="text-[12px] underline" style={{ color: "var(--text-medium)" }}>use another email</button>}
      </div>
      {err && <p className="text-[12px]" style={{ color: "var(--orange-text)" }}>{err}</p>}
    </form>
  );
}
