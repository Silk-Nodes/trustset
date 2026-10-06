"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useDialogFocus } from "@/lib/useDialogFocus";
import { useMotionPrefs } from "@/lib/motion";

import { FILMS, type FilmKey } from "@/lib/films";

/* the player: the browser's own controls, a chosen poster, captions on offer.
   nothing loads but the poster and the file's first bytes until play. */
export function FilmPlayer({ film, autoPlay = false }: { film: FilmKey; autoPlay?: boolean }) {
  const f = FILMS[film];
  return (
    <video
      key={f.src}
      className="w-full h-auto block rounded-[14px]"
      style={{ aspectRatio: "16 / 9", background: "#17181A", boxShadow: "0 0 0 1px var(--hairline)" }}
      src={f.src} poster={f.poster} controls playsInline preload="metadata" autoPlay={autoPlay}
      aria-label={`${f.title}, ${f.length}`}
    >
      <track kind="captions" src={f.captions} srcLang="en" label="English" />
    </video>
  );
}

/* the launch film over the page: a dark scrim, the film in the middle, closed
   by escape, the close button, or a click outside it. it never plays until
   the visitor presses play, since a browser will not start a film with sound
   on its own, and a muted launch film loses half of what it is. */
export function FilmModal({ open, onClose, film = "launch" }: { open: boolean; onClose: () => void; film?: FilmKey }) {
  const box = useRef<HTMLDivElement>(null);
  const m = useMotionPrefs();
  useDialogFocus(box, open);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; };
  }, [open, onClose]);
  const f = FILMS[film];
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-center justify-center px-3 sm:px-8"
          style={{ background: "rgba(10,11,12,0.82)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: m.reduced ? 0.1 : 0.22 }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
          {/* as wide as fits, and never taller than the window: the bar above
              and the links below take about 170px, the film keeps 16:9 */}
          <motion.div ref={box} role="dialog" aria-modal="true" aria-label={f.title} className="w-full"
            style={{ maxWidth: "min(64rem, calc((100dvh - 170px) * 16 / 9))" }}
            initial={m.reduced ? { opacity: 0 } : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: m.reduced ? 0.1 : 0.3, ease: [0.23, 1, 0.32, 1] }}>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-[15px] font-semibold" style={{ color: "#F4F4F2" }}>{f.title}</span>
              <span className="mono text-[12px]" style={{ color: "rgba(244,244,242,0.6)" }}>{f.length}</span>
              <button type="button" onClick={onClose} data-autofocus aria-label="Close"
                className="ml-auto mono text-[13px] px-3 py-1.5 rounded-full" style={{ color: "#F4F4F2", boxShadow: "inset 0 0 0 1px rgba(244,244,242,0.25)" }}>
                Close <span aria-hidden>×</span>
              </button>
            </div>
            <FilmPlayer film={film} />
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-4 text-[13px]" style={{ color: "rgba(244,244,242,0.7)" }}>
              <Link href="/demo" onClick={onClose} className="hover:underline">Try it on testnet</Link>
              <Link href="/walkthrough" onClick={onClose} className="hover:underline">The 2:48 walkthrough</Link>
              <span className="ml-auto mono text-[12px]" style={{ color: "rgba(244,244,242,0.5)" }}>Esc to close</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* the landing page shows the launch film once to each new visitor, after the
   page has had a moment to be read, and remembers that it did. a visitor who
   arrives on any other page, or comes back, is never interrupted. */
const SEEN = "trustset.film.seen";
export function useFirstVisitFilm(delayMs = 1400) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let seen = true;
    try { seen = localStorage.getItem(SEEN) === "1"; } catch { /* storage blocked: treat as seen, never nag */ }
    if (seen) return;
    const t = setTimeout(() => {
      setOpen(true);
      try { localStorage.setItem(SEEN, "1"); } catch { /* fine */ }
    }, delayMs);
    return () => clearTimeout(t);
  }, [delayMs]);
  const show = () => { setOpen(true); try { localStorage.setItem(SEEN, "1"); } catch { /* fine */ } };
  return { open, show, close: () => setOpen(false) };
}
