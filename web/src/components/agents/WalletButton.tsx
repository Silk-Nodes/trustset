"use client";
import { useEffect, useRef, useState } from "react";
import { short } from "@/lib/chain";

/* one control: connect, or show who is signing.
 *
 * connected, it is a chip with the short address. the chip opens a card with
 * the whole address, a copy button and disconnect, because a shortened
 * address you cannot copy is a decoration, not information. */
export default function WalletButton({ address, kind, onConnect, onDisconnect, available, explorer, resuming = false }: {
  address: string | null; kind: "demo" | "wallet" | null; onConnect: () => void; onDisconnect: () => void; available: boolean; explorer?: string; resuming?: boolean;
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

  if (address && kind === "wallet") return (
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
          <div className="eyebrow mb-1.5">Connected as the cold key</div>
          <div className="mono text-[12.5px] whitespace-nowrap overflow-x-auto select-all leading-relaxed no-scrollbar">{address}</div>
          <div className="flex flex-wrap gap-2 mt-3">
            <button type="button" className="drawn-btn btn-gold" style={{ padding: "6px 12px", fontSize: "0.75rem" }}
              onClick={async () => { try { await navigator.clipboard.writeText(address); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch { /* select-all is the fallback */ } }}>
              {copied ? "Copied" : "Copy address"}
            </button>
            {explorer && <a href={`${explorer}/address/${address}`} target="_blank" rel="noreferrer" className="drawn-btn btn-gold" style={{ padding: "6px 12px", fontSize: "0.75rem" }}>Explorer</a>}
            <button type="button" className="drawn-btn btn-gold ml-auto" style={{ padding: "6px 12px", fontSize: "0.75rem" }} onClick={() => { setOpen(false); onDisconnect(); }}>Disconnect</button>
          </div>
        </div>
      )}
    </div>
  );
  if (resuming) return (
    <span className="drawn-btn btn-gold" style={{ padding: "8px 14px", fontSize: "0.8rem", opacity: 0.7 }}><span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--text-light)" }} />Reconnecting</span>
  );
  if (!available) return (
    <a href="https://metamask.io/download/" target="_blank" rel="noreferrer" className="drawn-btn btn-gold" style={{ padding: "8px 14px", fontSize: "0.8rem" }} title="No wallet found in this browser">Get a wallet</a>
  );
  return (
    <button type="button" onClick={onConnect} className="drawn-btn" style={{ padding: "8px 14px", fontSize: "0.8rem" }} title="Connect wallet">Connect wallet</button>
  );
}
