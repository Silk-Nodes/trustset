"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { useMotionPrefs } from "@/lib/motion";

/* one way in, from anywhere.
 *
 * the explorer's search used to be a 56px field that only existed on the
 * explorer. this is the same search from every page, and it costs the page
 * nothing: the header carries a trigger that looks like a field and opens
 * this, which is the shape linear, vercel and github all settled on.
 *
 * the parts that make it a tool rather than a box: results grouped under
 * headings so the KIND of answer is never in doubt, the arrow keys and enter
 * without touching the mouse, focus trapped while it is open and returned to
 * whatever opened it on escape, and every row saying what pressing it does.
 *
 * it reads agents from the index. with no index it still navigates, and an
 * id typed straight in still resolves, because /explorer/12 is a url and not
 * a search result. */
type Agent = { id: number; name: string | null; agent_key: string; state: string };
type Item = { id: string; group: string; label: string; hint?: string; sub?: string; tone?: "live" | "off" | "plain"; go: () => void };

const PAGES: { label: string; href: string; hint: string }[] = [
  { label: "Your agents", href: "/agents", hint: "the console" },
  { label: "Explorer", href: "/explorer", hint: "look an agent up" },
  { label: "Guarding", href: "/agents/guarding", hint: "agents you guard" },
  { label: "Refunds", href: "/agents/refunds", hint: "the rail" },
  { label: "Try it", href: "/demo", hint: "a real stop on testnet" },
  { label: "Questions", href: "/faq", hint: "the FAQ" },
  { label: "Docs", href: "/how", hint: "addresses and integration" },
];
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export default function Palette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const m = useMotionPrefs();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const [agents, setAgents] = useState<Agent[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  /* whatever had focus before this opened, so escape can hand it back */
  const opener = useRef<HTMLElement | null>(null);
  /* onClose through a ref, never through the deps.
     the parent passes a fresh arrow on every render, so depending on it tore
     the effect down and set it up again each time: the cleanup restored body
     overflow and yanked focus back to the trigger, which fought the input for
     focus and left escape listening on a listener that had just been removed. */
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });

  /* the directory, fetched once the first time it is opened rather than on
     every page load: a palette nobody opens should cost nothing. */
  /* the directory pages now, so fetching it once only ever saw the first
     fifty agents. the search goes to the server with the query instead, and
     the footer reports the real total rather than the length of one page. */
  const [total, setTotal] = useState<number | null>(null);
  const term = q.trim();
  useEffect(() => {
    if (!open) return;
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/explorer/agents?per=10${term ? `&q=${encodeURIComponent(term)}` : ""}`, { cache: "no-store", signal: ctl.signal })
        .then(r => r.json())
        .then(j => { if (j.indexed) { setAgents(j.agents ?? []); if (!term) setTotal(j.fleet ?? 0); } })
        .catch(() => {});
    }, term ? 120 : 0);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [open, term]);

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement as HTMLElement | null;
    setQ(""); setCursor(0);
    const t = setTimeout(() => input.current?.focus(), 10);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    /* escape on the window, not only on the dialog. the handler below fires
       from the input, but a reader who has clicked the backdrop has focus on
       the body and their escape never reaches the subtree, which left the
       palette stuck open with no keyboard way out. capture, so a child that
       stops propagation cannot swallow it either. */
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); closeRef.current(); } };
    window.addEventListener("keydown", esc, true);
    return () => {
      clearTimeout(t); window.removeEventListener("keydown", esc, true);
      document.body.style.overflow = prev; opener.current?.focus?.();
    };
  }, [open]);

  const needle = q.trim().toLowerCase();
  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    const go = (href: string) => () => { router.push(href); onClose(); };

    /* an id, an address or a transaction is an answer, not a search. it goes
       first and it works whether or not the index is reachable. */
    if (/^\d+$/.test(needle)) out.push({ id: "jump-id", group: "Go straight there", label: `Agent ${needle}`, hint: "open", sub: "on the explorer", go: go(`/explorer/${needle}`) });

    /* the server already matched these; it matches an agent address and never a
       owner, so a pasted owner address finds nothing here by design. */
    const matched = needle.length === 0 ? [] : agents.slice(0, 6);
    for (const a of matched) {
      out.push({
        id: `a${a.id}`, group: "Agents", label: a.name || `Agent ${a.id}`,
        sub: `agent ${a.id} · ${short(a.agent_key)}`,
        hint: a.state === "trusted" ? "trusted" : a.state === "stopped" ? "stopped" : "not trusted",
        tone: a.state === "trusted" ? "live" : "off",
        go: go(`/explorer/${a.id}`),
      });
    }

    for (const p of PAGES) {
      /* both sides lowered. the hints carry real capitals ("the FAQ"), so
         matching the raw hint meant typing faq found nothing at all. */
      if (needle && !p.label.toLowerCase().includes(needle) && !p.hint.toLowerCase().includes(needle)) continue;
      out.push({ id: "p" + p.href, group: "Go to", label: p.label, sub: p.hint, hint: "open", go: go(p.href) });
    }
    return out;
  }, [needle, q, agents, router, onClose]);

  useEffect(() => { setCursor(0); }, [needle]);
  const run = useCallback((i: number) => { items[i]?.go(); }, [items]);

  /* arrows and enter, bound to the INPUT rather than to the dialog.
     focus is always in the field while this is open, and relying on the event
     bubbling up to the dialog wrapper left enter doing nothing at all: the
     palette stayed open and nothing navigated. the element that has focus is
     the element that should hear the key. */
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor(c => Math.min(items.length - 1, c + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setCursor(c => Math.max(0, c - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); run(cursor); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
    else if (e.key === "Tab") e.preventDefault();
  };
  /* keep the cursor's row in view without scrolling the page behind */
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-i="${cursor}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  if (typeof document === "undefined") return null;
  let seen = "";
  return createPortal(
    <AnimatePresence>
      {open && (
        /* the key is not decoration: AnimatePresence tracks its children by
           key, and without one it never ran the exit, so the dialog stayed in
           the dom after closing. the state had already flipped, which is why
           body overflow was restored while the palette was still on screen. */
        <motion.div key="palette" className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[12vh]"
          initial={m.reduced ? { opacity: 0 } : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.14 }}>
          <div className="absolute inset-0" style={{ background: "rgba(8,8,10,0.45)", backdropFilter: "blur(2px)" }} onClick={onClose} aria-hidden />
          <motion.div role="dialog" aria-modal="true" aria-label="Search"
            className="relative w-full max-w-[600px] rounded-2xl overflow-hidden"
            style={{ background: "var(--surface)", border: "1px solid var(--hairline)", boxShadow: "0 24px 60px rgba(0,0,0,0.30)" }}
            initial={m.reduced ? false : { opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={m.reduced ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}>
            <div className="flex items-center gap-3 px-4 h-14" style={{ borderBottom: "1px solid var(--hairline)" }}>
              <span className="mono text-[13px]" style={{ color: "var(--text-light)" }}>⌕</span>
              <input ref={input} value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKey} spellCheck={false}
                placeholder="An agent, an address, a transaction, or a page"
                className="flex-1 min-w-0 bg-transparent outline-none text-[15px]" style={{ color: "var(--text-dark)" }} />
              <kbd className="mono text-[10.5px] rounded px-1.5 py-0.5" style={{ border: "1px solid var(--hairline)", color: "var(--text-medium)" }}>esc</kbd>
            </div>

            <div ref={listRef} className="max-h-[52vh] overflow-y-auto py-1.5">
              {items.length === 0 && (
                <p className="px-4 py-8 text-[13px] text-center" style={{ color: "var(--text-medium)" }}>
                  {needle ? <>Nothing matches “{q}”.</> : "Type an agent id, a name, a key or an address."}
                </p>
              )}
              {items.map((it, i) => {
                const head = it.group !== seen ? (seen = it.group) : null;
                const on = i === cursor;
                return (
                  <div key={it.id}>
                    {head && <div className="eyebrow px-4 pt-2.5 pb-1">{head}</div>}
                    <button type="button" data-i={i} onMouseMove={() => setCursor(i)} onClick={() => run(i)}
                      className="w-full text-left flex items-center gap-3 px-4 h-11 outline-none"
                      style={{ background: on ? "color-mix(in srgb, var(--text-dark) 6%, transparent)" : "transparent" }}>
                      {it.tone && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: it.tone === "live" ? "var(--sage)" : "var(--orange)" }} />}
                      <span className="text-[14px] font-medium truncate" style={{ color: "var(--text-dark)" }}>{it.label}</span>
                      {it.sub && <span className="mono text-[11px] truncate" style={{ color: "var(--text-medium)" }}>{it.sub}</span>}
                      {it.hint && <span className="ml-auto mono text-[10.5px] uppercase tracking-[0.1em] shrink-0" style={{ color: on ? "var(--text-medium)" : "var(--text-light)" }}>{it.hint}</span>}
                      {on && <kbd className="mono text-[10.5px] shrink-0" style={{ color: "var(--text-light)" }}>↵</kbd>}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center gap-4 px-4 h-9 mono text-[10.5px]" style={{ borderTop: "1px solid var(--hairline)", color: "var(--text-light)" }}>
              <span>↑↓ move</span><span>↵ open</span><span>esc close</span>
              <span className="ml-auto">{total !== null ? `${total} agents indexed` : "no index"}</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
