"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import ThemeToggle from "./ThemeToggle";
import Mark from "./Mark";
import { useMotionPrefs, DUR } from "@/lib/motion";

/* the bar is two zones, not a nav row.
 *
 * left is identity and state: the mark, the name, and what the chain is doing.
 * right is the way in: the reader pages as plain links, then one accented
 * action. home is the wordmark, not a tab.
 *
 * the split is by audience. reader pages (how it works, later the explorer)
 * belong here; operator pages (agents, refunds) belong in the console's own
 * pill row, where you are already signed in. so this bar does not grow when a
 * page is added to the console. no pill and no glass: transparent until you
 * scroll. */
const reader = [
  { href: "/demo", label: "Try it" },
  { href: "/explorer", label: "Explorer" },
  /* docs is not one of the three things a reader does here, and a nav that
     lists everything ranks nothing. it lives in the footer, where people look
     for it. */
];
const ACTION = { href: "/agents", label: "Agents" };

function NavDrawer({ pathname }: { pathname: string }) {
  const m = useMotionPrefs();
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open]);
  return (
    <>
      <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open} aria-label={open ? "Close menu" : "Open menu"}
        className="lg:hidden shrink-0 w-9 h-9 flex items-center justify-center rounded-full transition-colors hover:bg-ink/5" style={{ color: "var(--text-medium)" }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
          {open ? <><path d="M6 6l12 12" /><path d="M18 6L6 18" /></> : <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>}
        </svg>
      </button>
      <AnimatePresence>
        {open && (
          <>
            <motion.div className="lg:hidden fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.35)" }} initial={m.reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={m.t(DUR.fast)} onClick={() => setOpen(false)} aria-hidden />
            <motion.div className="lg:hidden fixed left-0 right-0 z-50 px-3" style={{ top: 64 }} initial={m.reduced ? false : { opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={m.reduced ? { opacity: 0 } : { opacity: 0, y: -8 }} transition={m.t(DUR.base)}>
              <nav className="sheet p-2 grid grid-cols-2 gap-1" style={{ boxShadow: "var(--glass-shadow)" }}>
                {[...reader, ACTION].map(t => { const a = pathname === t.href; return (
                  <Link key={t.href} href={t.href} onClick={() => setOpen(false)} className="rounded-xl px-3 py-2.5 text-sm whitespace-nowrap transition-colors"
                    style={{ color: a ? "var(--pill-accent-text)" : "var(--text-medium)", fontWeight: a ? 600 : 500, background: a ? "var(--pill-accent-bg)" : "transparent" }}>{t.label}</Link>
                ); })}
              </nav>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

export default function Header() {
  const [live, setLive] = useState<{ agents: number; revoked: number; block: number } | null>(null);
  useEffect(() => {
    let alive = true;
    const pull = async () => { try { const r = await fetch("/api/live", { cache: "no-store" }); const j = await r.json(); if (alive) setLive(j); } catch {} };
    pull(); const t = setInterval(pull, 6000); return () => { alive = false; clearInterval(t); };
  }, []);
  const m = useMotionPrefs();
  const pathname = usePathname();
  const home = pathname === "/";
  const inConsole = pathname.startsWith("/agents");
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on(); window.addEventListener("scroll", on, { passive: true }); return () => window.removeEventListener("scroll", on);
  }, []);
  /* the bar carries live chain state next to the wordmark, so the one piece of
     chrome on the page says something true and changing rather than being a
     generic product bar. */
  const links = (cls: string) => reader.map(t => { const on = pathname === t.href; return (
    <Link key={t.href} href={t.href} className={cls} style={{ color: on ? "var(--text-dark)" : "var(--text-medium)", fontWeight: on ? 600 : 500 }}>
      {t.label}
      {on && <motion.span layoutId="nav-line" className="absolute left-0 right-0 -bottom-0.5 h-[2px] rounded-full" style={{ background: "var(--orange)" }} transition={m.spring()} />}
    </Link>
  ); });

  return (
    <div className="sticky top-0 z-50">
      {/* scrolled, the bar keeps its type legible with a scrim that fades out
          at the bottom instead of a filled strip with a rule under it. a hard
          edge across the full width reads as a box bolted to the page; a fade
          reads as the page passing underneath. the scrim is its own layer so
          the mask never touches the text. */}
      <div aria-hidden className="absolute inset-0 pointer-events-none" style={{
        opacity: scrolled ? 1 : 0, transition: "opacity .3s",
        background: "linear-gradient(to bottom, color-mix(in srgb, var(--bg-base) 82%, transparent), transparent)",
        backdropFilter: "blur(18px) saturate(160%)", WebkitBackdropFilter: "blur(18px) saturate(160%)",
        maskImage: "linear-gradient(to bottom, #000 45%, transparent)", WebkitMaskImage: "linear-gradient(to bottom, #000 45%, transparent)",
      }} />
      <header className="relative max-w-6xl mx-auto flex items-center gap-5 px-4 sm:px-5 h-16">
        <Link href="/" className="flex items-center gap-2.5 shrink-0"><Mark size={24} /><span className="mono font-medium text-[16px] tracking-tight text-ink">trustset</span></Link>
        {/* the strip is the full count on the landing page, where it is part of
            the argument, and the block number alone once you are inside, where
            the page below is already reading the chain for you. */}
        <span className="hidden md:flex items-center gap-2 mono text-[11px] tabular" style={{ color: "var(--text-medium)" }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--sage)" }} />
          {live
            ? (home ? `${live.agents} agents · ${live.revoked} stopped · block ${live.block}` : `block ${live.block}`)
            : "Reading the chain"}
        </span>
        <nav className="hidden lg:flex items-center gap-7 ml-auto">{links("relative py-2 text-[14px] transition-colors")}</nav>
        <div className={`flex items-center gap-2 ml-auto lg:ml-0 ${inConsole ? "" : "lg:ml-5"}`}>
          {/* already in the console: its own tab row and wallet chip are right
              below, so the bar does not repeat them. */}
          {!inConsole && (
            <Link href={ACTION.href} className="hidden lg:block rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors"
              style={{ background: "var(--pill-accent-bg)", color: "var(--pill-accent-text)" }}>{ACTION.label}</Link>
          )}
          <NavDrawer pathname={pathname} /><ThemeToggle />
        </div>
      </header>
    </div>
  );
}
