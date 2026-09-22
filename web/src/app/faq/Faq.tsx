"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { useMotionPrefs } from "@/lib/motion";
import { GROUPS, ALL } from "./questions";

/* the answers, all of them, on the page.
 *
 * the obvious build for a faq is an accordion, and it is the wrong one here.
 * an accordion hides the text from ctrl+f, from anyone who arrives on a deep
 * link, and from a reader who wants to skim four answers rather than open
 * four. these answers are three sentences each, so the whole page is shorter
 * than the clicking would be. what a long list actually needs is a way to
 * find the one you came for, which is the filter and the index, not a hinge.
 *
 * the index follows the reader down the page, every question owns an anchor
 * you can copy, and the filter narrows by question AND answer so searching
 * for a word buried in an answer still finds it. */
const EASE = [0.23, 1, 0.32, 1] as const;

export default function Faq() {
  const m = useMotionPrefs();
  const [q, setQ] = useState("");
  const [here, setHere] = useState(GROUPS[0].id);
  const [copied, setCopied] = useState<string | null>(null);
  const search = useRef<HTMLInputElement>(null);

  const needle = q.trim().toLowerCase();
  const groups = useMemo(() => {
    if (!needle) return GROUPS;
    return GROUPS
      .map(g => ({ ...g, questions: g.questions.filter(x => (x.q + " " + x.a).toLowerCase().includes(needle)) }))
      .filter(g => g.questions.length > 0);
  }, [needle]);
  const found = groups.reduce((n, g) => n + g.questions.length, 0);

  /* the index follows the page. rootMargin pins the switch to the band just
     under the header rather than to the viewport's middle, so the heading you
     are reading is the one that is lit. */
  useEffect(() => {
    if (needle) return;
    const seen = new Map<string, number>();
    const io = new IntersectionObserver(
      entries => {
        for (const e of entries) seen.set(e.target.id, e.intersectionRatio);
        let best = "", top = -1;
        for (const [id, r] of seen) if (r > top) { top = r; best = id; }
        if (best && top > 0) setHere(best);
      },
      { rootMargin: "-88px 0px -55% 0px", threshold: [0, 0.25, 0.6, 1] },
    );
    for (const g of GROUPS) { const el = document.getElementById(g.id); if (el) io.observe(el); }
    return () => io.disconnect();
  }, [needle]);

  /* "/" focuses the filter, the same key the console uses for its search */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "/") { e.preventDefault(); search.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const copy = async (id: string) => {
    try { await navigator.clipboard.writeText(`${location.origin}/faq#${id}`); setCopied(id); setTimeout(() => setCopied(c => c === id ? null : c), 1400); }
    catch { /* a browser that refuses the clipboard still has the address bar */ }
  };

  return (
    <div className="grid lg:grid-cols-[200px_minmax(0,1fr)] gap-8 lg:gap-12 items-start">
      {/* the index, following the reader */}
      <nav aria-label="On this page" className="hidden lg:block lg:sticky lg:top-24 min-w-0">
        <div className="text-[10.5px] mono uppercase tracking-[0.14em] mb-3" style={{ color: "var(--text-medium)" }}>On this page</div>
        <ul className="grid gap-0.5">
          {GROUPS.map(g => (
            <li key={g.id}>
              <a href={`#${g.id}`} className="flex items-baseline gap-2 text-[13.5px] py-1.5 pl-3 transition-colors"
                style={{
                  color: here === g.id && !needle ? "var(--text-dark)" : "var(--text-medium)",
                  fontWeight: here === g.id && !needle ? 600 : 400,
                  borderLeft: `2px solid ${here === g.id && !needle ? "var(--orange)" : "var(--hairline)"}`,
                }}>
                {g.title}
                <span className="mono text-[10.5px] tabular ml-auto" style={{ color: "var(--text-light)" }}>{g.questions.length}</span>
              </a>
            </li>
          ))}
        </ul>
        <div className="mt-6 pt-5 text-[12.5px] leading-relaxed" style={{ borderTop: "1px solid var(--hairline)", color: "var(--text-medium)" }}>
          Not here? The <Link href="/how" className="hover:underline" style={{ color: "var(--text-dark)" }}>docs</Link> have the addresses and the integration, and the{" "}
          <a href="https://github.com/Silk-Nodes/trustset" target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: "var(--text-dark)" }}>source</a> has the rest.
        </div>
      </nav>

      <div className="min-w-0">
        {/* the filter. answers are searched too, so a word buried in one still finds it. */}
        <div className="flex flex-wrap items-center gap-3 mb-8">
          <label className="relative flex-1 min-w-[240px]">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 mono text-[12px] pointer-events-none" style={{ color: "var(--text-light)" }}>/</span>
            <input ref={search} value={q} onChange={e => setQ(e.target.value)} placeholder="Search the questions and the answers" spellCheck={false}
              aria-label="Search the questions"
              className="w-full h-11 rounded-full pl-9 pr-4 text-[14px] outline-none focus-visible:ring-2 transition-colors"
              style={{ background: "var(--surface)", border: "1px solid var(--hairline)", color: "var(--text-dark)" }} />
          </label>
          <span className="mono text-[11.5px] tabular whitespace-nowrap" style={{ color: "var(--text-medium)" }}>
            {needle ? `${found} of ${ALL.length}` : `${ALL.length} questions`}
          </span>
        </div>

        {found === 0 && (
          <div className="sheet px-6 py-12 text-center">
            <p className="text-[15px]" style={{ color: "var(--text-dark)" }}>Nothing matches “{q}”.</p>
            <p className="text-[13.5px] mt-2" style={{ color: "var(--text-medium)" }}>
              Try the <Link href="/how" className="hover:underline">docs</Link>, or{" "}
              <button type="button" onClick={() => setQ("")} className="underline">clear the search</button>.
            </p>
          </div>
        )}

        {groups.map((g, gi) => (
          <section key={g.id} id={g.id} className="scroll-mt-24 mb-12 last:mb-0">
            <div className="flex items-baseline gap-3 pb-3 mb-5" style={{ borderBottom: "1px solid var(--hairline)" }}>
              <h2 className="text-[20px] sm:text-[22px] font-semibold tracking-[-0.02em]">{g.title}</h2>
              <span className="mono text-[11px] tabular" style={{ color: "var(--text-light)" }}>{g.questions.length}</span>
            </div>

            <div className="grid gap-3">
              {g.questions.map((item, i) => (
                <motion.article
                  key={item.id} id={item.id}
                  /* min-w-0 because a grid item refuses to shrink below its
                     min-content, and one answer carries a 42 character contract
                     address. without both this and the wrap below, that single
                     unbreakable word widened the column and gave the whole page
                     35px of horizontal scroll on a phone. */
                  className="faq-card scroll-mt-24 sheet px-5 py-5 sm:px-6 sm:py-6 relative group min-w-0"
                  initial={m.reduced ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={m.reduced ? { duration: 0.15 } : { duration: 0.42, ease: EASE, delay: Math.min(i * 0.035 + gi * 0.02, 0.24) }}>
                  <h3 className="text-[16px] sm:text-[17px] font-semibold tracking-[-0.01em] leading-snug pr-8 [overflow-wrap:anywhere]">{item.q}</h3>
                  <p className="text-[14.5px] leading-[1.65] mt-2.5 [overflow-wrap:anywhere]" style={{ color: "var(--text-medium)" }}>{item.a}</p>
                  {item.code && (
                    <code className="mono text-[12.5px] mt-3.5 inline-block rounded-lg px-3 py-2 max-w-full [overflow-wrap:anywhere]"
                      style={{ background: "var(--bg-base)", border: "1px solid var(--hairline)", color: "var(--text-dark)" }}>{item.code}</code>
                  )}
                  {/* the anchor, for sending somebody one answer rather than the page */}
                  <button type="button" onClick={() => copy(item.id)}
                    aria-label={`Copy a link to “${item.q}”`}
                    className="absolute top-5 right-4 sm:top-6 sm:right-5 mono text-[11px] rounded-md px-1.5 py-0.5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 outline-none focus-visible:ring-2 transition-opacity"
                    style={{ color: copied === item.id ? "var(--sage-text)" : "var(--text-light)" }}>
                    {copied === item.id ? "copied" : "#"}
                  </button>
                </motion.article>
              ))}
            </div>
          </section>
        ))}

        {/* the end of the page should go somewhere, not stop */}
        {found > 0 && (
          <div className="sheet px-6 py-7 mt-12 flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="min-w-0">
              <div className="text-[15px] font-semibold tracking-[-0.01em]">Still not answered?</div>
              <p className="text-[13.5px] mt-1" style={{ color: "var(--text-medium)" }}>Everything here is readable on chain, and the contracts are in the open.</p>
            </div>
            <div className="flex flex-wrap gap-2 ml-auto">
              <Link href="/how" className="drawn-btn btn-gold" style={{ padding: "8px 16px", fontSize: "0.82rem" }}>Read the docs</Link>
              <Link href="/demo" className="drawn-btn btn-orange" style={{ padding: "8px 16px", fontSize: "0.82rem" }}>Try it on testnet</Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
