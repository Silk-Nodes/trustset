"use client";
import WalletButton from "./WalletButton";
import { useWallet } from "@/components/WalletProvider";
import { TopBar, useNavBadge } from "@/components/app/AppShell";

/* a console page inside the app: its bar (title, note, the page's action, the
   wallet) and its body. the tabs that used to sit here are the sidebar now.
   frame: the body is exactly the window's height below the bar, and whatever
   is inside scrolls on its own; otherwise the body flows and the work area
   scrolls. the sidebar's guarding count comes from here. */
export default function Shell({ title, note, actions, frame, badges, children }: { title: React.ReactNode; note?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode;
  badges?: Record<string, number>;
  frame?: boolean;
  /* kept for the pages that still pass it; every console page is full width now */
  wide?: boolean;
}) {
  const w = useWallet();
  useNavBadge("/agents/guarding", badges?.["/agents/guarding"] ?? 0);
  return (
    <>
      <TopBar title={title} note={note} actions={<>
        {actions}
        <WalletButton address={w.who?.address ?? null} kind={w.who?.kind ?? null} available={w.walletOk} explorer={w.conn?.cfg.explorer} resuming={w.resuming}
          onConnect={() => w.connectNow().catch(() => {})} onDisconnect={w.disconnect}
          email={w.email} signedInAs={w.who?.email ?? null} ask={w.ask} onAskDone={w.clearAsk} />
      </>} />
      {/* 76px: the bar (48) and the status line (28) */}
      <main className={frame ? "px-4 sm:px-5 pt-4 pb-4 min-w-0 flex flex-col lg:h-[calc(100dvh-76px)]" : "px-4 sm:px-5 pt-4 pb-10 min-w-0"}>
        {w.error && <div className="sheet px-4 py-3 mb-3 text-xs mono break-all shrink-0" style={{ color: "var(--orange-text)" }}>{w.error}</div>}
        {children}
      </main>
    </>
  );
}
