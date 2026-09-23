"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import WalletButton from "./WalletButton";
import { useWallet } from "@/components/WalletProvider";

/* the frame every console page sits in: title, a small tab row for the
   pages, and the wallet chip. one place, so the pages agree. */
const TABS = [
  { href: "/agents", label: "Agents" },
  { href: "/agents/refunds", label: "Refunds" },
  { href: "/agents/guarding", label: "Guarding" },
];
export default function Shell({ title, note, actions, frame, wide, badges, children }: { title: string; note?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode;
  /* a count beside a tab, by href: the guarding tab says how many wait on you */
  badges?: Record<string, number>;
  /* frame: the console as an app, edge to edge and exactly one window tall,
     its children scrolling inside it rather than the page. */
  frame?: boolean;
  /* wide: the frame's width and gutters, the page's own height */
  wide?: boolean;
}) {
  const p = usePathname();
  const w = useWallet();
  /* the frame holds one window only where there is room for two columns to
     scroll side by side. on a phone it squeezed an agent's history into a box
     three rows tall inside a page that also scrolled, so below lg the page
     simply flows. */
  return (
    <main className={frame ? "w-full px-4 sm:px-5 pt-4 pb-10 lg:pb-3 min-w-0 flex flex-col lg:h-[calc(100dvh-64px)]" : wide ? "w-full px-4 sm:px-5 pt-4 pb-16 min-w-0" : "w-full max-w-6xl mx-auto px-3 sm:px-4 pt-6 sm:pt-10 pb-16 min-w-0"}>
      <div className={`flex flex-wrap items-center gap-x-4 gap-y-3 ${frame || wide ? "mb-3 shrink-0" : "mb-5"}`}>
        <nav className="flex gap-1 rounded-full p-1" style={{ background: "color-mix(in srgb, var(--text-dark) 5%, transparent)" }} aria-label="Agent pages">
          {TABS.map(t => { const on = p === t.href; return (
            <Link key={t.href} href={t.href} className="rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors"
              style={{ background: on ? "var(--pill-accent-bg)" : "transparent", color: on ? "var(--pill-accent-text)" : "var(--text-medium)" }}>{t.label}{badges?.[t.href] ? <span className="mono text-[11px] tabular ml-1.5" style={{ color: on ? "var(--pill-accent-text)" : "var(--orange-text)" }}>{badges[t.href]}</span> : null}</Link>
          ); })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {actions}
          <WalletButton address={w.who?.address ?? null} kind={w.who?.kind ?? null} available={w.walletOk} explorer={w.conn?.cfg.explorer} resuming={w.resuming}
            onConnect={() => w.connectNow().catch(() => {})} onDisconnect={w.disconnect} />
        </div>
      </div>
      {frame || wide
        ? <div className="flex items-baseline gap-3 mb-3 shrink-0"><h2 className="text-[17px] font-semibold tracking-[-0.01em]">{title}</h2>{note && <span className="text-[12px] tabular" style={{ color: "var(--text-medium)" }}>{note}</span>}</div>
        : <div className="sec-head"><h2 className="font-semibold">{title}</h2>{note && <span className="note tabular">{note}</span>}</div>}
      {w.error && <div className="sheet px-4 py-3 mb-3 text-xs mono break-all" style={{ color: "var(--orange-text)" }}>{w.error}</div>}
      {children}
    </main>
  );
}
