"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Mark from "@/components/Mark";
import ThemeToggle from "@/components/ThemeToggle";
import Palette from "@/components/Palette";
import { motion, useReducedMotion } from "motion/react";
import { IconAgents, IconDocs, IconFaq, IconPin, IconRefund, IconSearch, IconShield, IconTry } from "./icons";

/* the app.
 *
 * the console and the explorer used to be pages of the marketing site: its
 * header with the landing links, its gradient, its footer, and five layers of
 * navigation stacked above a table that began a quarter of the way down the
 * screen. an app has its own frame. this is it: navigation in one place down
 * the left, a thin bar with the page's title and its one action, the work
 * filling everything else, and a status line at the foot. the frame is
 * exactly one window tall and never moves; the work scrolls inside it.
 *
 * the site (landing, try it, faq, docs) keeps its own chrome. the two are
 * different places on purpose, and the logo is the way back. */
type NavItem = { href: string; label: string; icon: React.ReactNode; match: (p: string) => boolean; badge?: string };

const PIN_KEY = "trustset.rail.pinned";
const BadgeCtx = createContext<{ set: (href: string, n: number) => void } | null>(null);
/* a page tells the sidebar a count, by href: the console says how many guard
   votes wait on you, and the sidebar shows it beside Guarding. */
export function useNavBadge(href: string, n: number) {
  /* the setter, not the context object: depending on the object re-ran this
     on every render of the shell, and each run set state in the shell, which
     rendered it again. */
  const set = useContext(BadgeCtx)?.set;
  useEffect(() => { set?.(href, n); return () => set?.(href, 0); }, [set, href, n]);
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [badges, setBadges] = useState<Record<string, number>>({});
  const set = useCallback((href: string, n: number) => setBadges(b => (b[href] === n ? b : { ...b, [href]: n })), []);
  const badgeCtx = useMemo(() => ({ set }), [set]);
  const openSearch = useCallback(() => setPalette(true), []);
  const [palette, setPalette] = useState(false);
  const closePalette = useCallback(() => setPalette(false), []);
  const [block, setBlock] = useState<number | null>(null);
  const [pinned, setPinned] = useState(false);
  const [peek, setPeek] = useState(false);
  useEffect(() => { try { setPinned(localStorage.getItem(PIN_KEY) === "1"); } catch { /* storage blocked: stays a rail */ } }, []);
  const togglePin = useCallback(() => setPinned(v => { const n = !v; try { localStorage.setItem(PIN_KEY, n ? "1" : "0"); } catch { /* not remembered */ } if (!n) setPeek(false); return n; }), []);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette(p => !p); }
      else if ((e.metaKey || e.ctrlKey) && e.key === "\\") { e.preventDefault(); togglePin(); }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [togglePin]);
  /* the chain's head for the status line, the same read the site header makes */
  useEffect(() => {
    let alive = true;
    const pull = () => fetch("/api/live", { cache: "no-store" }).then(r => r.json()).then(j => { if (alive && j?.block) setBlock(j.block); }).catch(() => {});
    pull(); const t = setInterval(pull, 6000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const inAgents = (p: string) => p === "/agents" || /^\/agents\/\d+/.test(p);
  const OPERATE: NavItem[] = [
    { href: "/agents", label: "Agents", icon: <IconAgents />, match: inAgents },
    { href: "/agents/guarding", label: "Guarding", icon: <IconShield />, match: p => p.startsWith("/agents/guarding") },
    { href: "/agents/refunds", label: "Refunds", icon: <IconRefund />, match: p => p.startsWith("/agents/refunds") },
  ];
  const PUBLIC: NavItem[] = [
    { href: "/explorer", label: "Explorer", icon: <IconSearch />, match: p => p.startsWith("/explorer") },
  ];
  /* the site's pages, drawn like the app's own rows so the rail is one list
     of icons when it is folded; they are links out of the app, nothing more */
  const SITE: NavItem[] = [
    { href: "/demo", label: "Try it", icon: <IconTry />, match: () => false },
    { href: "/how", label: "Docs", icon: <IconDocs />, match: () => false },
    { href: "/faq", label: "FAQ", icon: <IconFaq />, match: () => false },
  ];
  /* the rail. 56px of icons by default, so the work gets the width; the
     pointer or the keyboard resting on it slides the labels out over the page
     without moving it, and cmd+backslash pins it open for people who want it.
     pinned is remembered per browser, a convenience only. */
  const open = pinned || peek;
  const still = !!useReducedMotion();
  const item = (n: NavItem) => {
    const on = n.match(pathname);
    const count = badges[n.href] ?? 0;
    return (
      <MLink key={n.href} href={n.href} aria-current={on ? "page" : undefined} aria-label={n.label}
        /* a pointer click folds the rail and lets go of focus; enter from the
           keyboard (detail 0) keeps focus where the reader is */
        onClick={(e: React.MouseEvent<HTMLAnchorElement>) => { if (e.detail > 0) { setPeek(false); e.currentTarget.blur(); } }}
        initial="rest" animate="rest" whileHover={still ? undefined : "hover"} whileFocus={still ? undefined : "hover"}
        className="relative flex items-center gap-2.5 h-8 px-2.5 rounded-lg text-[13px] outline-none focus-visible:ring-2 transition-colors whitespace-nowrap"
        style={{ background: on ? "color-mix(in srgb, var(--text-dark) 8%, transparent)" : "transparent", color: on ? "var(--text-dark)" : "var(--text-medium)", fontWeight: on ? 600 : 500 }}>
        <span className="relative w-4 h-4 inline-flex items-center justify-center shrink-0" style={{ color: on ? "var(--text-dark)" : "var(--text-light)" }}>
          {n.icon}
          {count > 0 && !open && <span aria-hidden className="absolute -top-1 -right-1 w-[7px] h-[7px] rounded-full" style={{ background: "var(--orange)", boxShadow: "0 0 0 2px var(--rail)" }} />}
        </span>
        <span className="transition-opacity duration-150" style={{ opacity: open ? 1 : 0 }}>{n.label}</span>
        {count > 0 && <span className="ml-auto mono text-[11px] tabular transition-opacity duration-150" style={{ color: "var(--orange-text)", opacity: open ? 1 : 0 }}>{count}</span>}
      </MLink>
    );
  };
  const leave = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peekOn = () => { if (leave.current) { clearTimeout(leave.current); leave.current = null; } setPeek(true); };
  const peekOff = () => { if (leave.current) clearTimeout(leave.current); leave.current = setTimeout(() => setPeek(false), 140); };

  return (
    <BadgeCtx.Provider value={badgeCtx}>
      {/* no ground of its own: the site's aurora sits under the frame, turned
          down for work, and shows in the gaps around the panels */}
      <div className="fixed inset-0 z-[5] flex">
        <div className="hidden lg:block relative shrink-0 transition-[width] duration-200 ease-out" style={{ width: pinned ? 228 : 56 }}>
        <aside aria-label="App" onMouseEnter={peekOn} onMouseLeave={peekOff}
          /* keyboard focus opens it, so tabbing in shows the labels. a click
             also leaves focus on the link it pressed, and opening on that
             kept the rail spread over the page after every click until the
             reader clicked somewhere else. */
          onFocus={e => { if ((e.target as HTMLElement).matches(":focus-visible")) peekOn(); }}
          onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) peekOff(); }}
          className="absolute inset-y-0 left-0 z-[40] flex flex-col overflow-hidden"
          style={{ width: open ? 228 : 56, transition: "width 200ms cubic-bezier(0.23, 1, 0.32, 1), box-shadow 200ms ease", borderRight: "1px solid var(--hairline)", background: "var(--rail)",
            boxShadow: peek && !pinned ? "12px 0 32px rgba(0,0,0,0.22)" : "none" }}>
          <div className="flex items-center h-12 shrink-0" style={{ borderBottom: "1px solid var(--hairline)" }}>
            <Link href="/" className="flex items-center gap-2.5 h-12 pl-[18px] pr-2 flex-1 min-w-0 outline-none focus-visible:ring-2 whitespace-nowrap" title="Back to the site">
              <span className="shrink-0"><Mark size={20} /></span>
              <span className="mono font-medium text-[14.5px] tracking-tight transition-opacity duration-150" style={{ opacity: open ? 1 : 0 }}>trustset</span>
            </Link>
            <motion.button type="button" initial="rest" animate="rest" whileHover={still ? undefined : "hover"} onClick={() => togglePin()} aria-pressed={pinned} aria-label={pinned ? "Unpin the sidebar" : "Pin the sidebar open"} title={"\u2318\\"}
              className="mr-2 w-7 h-7 shrink-0 rounded-lg inline-flex items-center justify-center outline-none focus-visible:ring-2 transition-opacity duration-150"
              style={{ opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none", color: pinned ? "var(--text-dark)" : "var(--text-light)" }}><IconPin on={pinned} /></motion.button>
          </div>
          <nav className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-2.5 py-3 flex flex-col gap-0.5">
            <div className="eyebrow px-2.5 h-6 flex items-center whitespace-nowrap">{open ? "your agents" : <span className="block w-4 h-px" style={{ background: "var(--hairline)" }} />}</div>
            {OPERATE.map(item)}
            <div className="eyebrow px-2.5 mt-3 h-6 flex items-center whitespace-nowrap">{open ? "public" : <span className="block w-4 h-px" style={{ background: "var(--hairline)" }} />}</div>
            {PUBLIC.map(item)}
            <div className="mt-auto pt-4 flex flex-col gap-0.5">
              <div className="eyebrow px-2.5 h-6 flex items-center whitespace-nowrap">{open ? "the site" : <span className="block w-4 h-px" style={{ background: "var(--hairline)" }} />}</div>
              {SITE.map(item)}
            </div>
          </nav>
          <div className="shrink-0 h-11 flex items-center gap-2 pl-[15px] pr-3 mono text-[11px] whitespace-nowrap" style={{ borderTop: "1px solid var(--hairline)", color: "var(--text-medium)" }}>
            <ThemeToggle />
            <span className="flex items-center gap-2 transition-opacity duration-150" style={{ opacity: open ? 1 : 0 }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: block ? "var(--sage)" : "var(--text-light)" }} />Monad testnet
            </span>
          </div>
        </aside>
        </div>

        <div className="flex-1 min-w-0 flex flex-col">
          <div id="app-scroll" className="flex-1 min-h-0 overflow-y-auto overflow-x-clip pb-14 lg:pb-0">
            <AppSearch.Provider value={openSearch}>{children}</AppSearch.Provider>
          </div>
          <div className="hidden lg:flex shrink-0 h-7 items-center gap-4 px-4 mono text-[10.5px] app-material" style={{ borderTop: "1px solid var(--hairline)", color: "var(--text-medium)" }}>
            <span className="tabular">{block ? `block ${block.toLocaleString("en-US")}` : "reading the chain"}</span>
          </div>
        </div>

        {/* on a phone the sidebar becomes a tab bar, where a thumb reaches */}
        <nav aria-label="App" className="lg:hidden fixed bottom-0 inset-x-0 z-[6] h-14 grid grid-cols-4 app-material" style={{ borderTop: "1px solid var(--hairline)" }}>
          {[...OPERATE, ...PUBLIC].map(n => {
            const on = n.match(pathname); const count = badges[n.href] ?? 0;
            return (
              <Link key={n.href} href={n.href} aria-current={on ? "page" : undefined} className="relative flex flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium outline-none"
                style={{ color: on ? "var(--text-dark)" : "var(--text-medium)" }}>
                <span className="w-5 h-5 inline-flex items-center justify-center">{n.icon}</span>{n.label}
                {count > 0 && <span className="absolute top-1.5 right-[calc(50%-18px)] mono text-[9.5px] rounded-full px-1" style={{ background: "var(--orange)", color: "#160A06" }}>{count}</span>}
              </Link>
            );
          })}
        </nav>
      </div>
      <Palette open={palette} onClose={closePalette} />
    </BadgeCtx.Provider>
  );
}

/* the page's own bar: its title, a note, its actions. sticky inside the
   scrolling work area, so it stays while a long list moves under it. */
export const AppSearch = createContext<(() => void) | null>(null);
export function TopBar({ title, note, actions }: { title: React.ReactNode; note?: React.ReactNode; actions?: React.ReactNode }) {
  const open = useContext(AppSearch);
  const still = !!useReducedMotion();
  return (
    <div className="sticky top-0 z-[20] h-12 flex items-center gap-2 sm:gap-3 px-4 sm:px-5 app-material" style={{ borderBottom: "1px solid var(--hairline)" }}>
      <Link href="/" className="lg:hidden shrink-0" aria-label="trustset home"><Mark size={20} /></Link>
      <h1 className="text-[15px] font-semibold tracking-[-0.01em] whitespace-nowrap shrink-0 flex items-center">{title}</h1>
      {/* the title never gives way: on a phone the note steps out of the bar
          and the page draws it under the bar instead */}
      {note && <span className="hidden sm:inline-flex items-center text-[12px] min-w-0 shrink-0" style={{ color: "var(--text-medium)" }}>{note}</span>}
      <span className="flex-1" />
      {open && (
        <motion.button type="button" initial="rest" animate="rest" whileHover={still ? undefined : "hover"} onClick={open} className="hidden md:inline-flex items-center gap-2 h-8 rounded-lg px-2.5 text-[12.5px] outline-none focus-visible:ring-2"
          style={{ border: "1px solid var(--hairline)", color: "var(--text-medium)" }} aria-label="Search">
          <IconSearch /> Search <kbd className="mono text-[10.5px] rounded px-1" style={{ border: "1px solid var(--hairline)" }}>⌘K</kbd>
        </motion.button>
      )}
      {actions}
    </div>
  );
}

const MLink = motion.create(Link);
