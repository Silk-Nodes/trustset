"use client";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/* the explanation, on the thing it explains.
 *
 * the pages said everything twice: a label, then a sentence under it saying
 * what the label meant. the sentence lives here now, on the label, and comes
 * when it is asked for: hover on a pointer, tap on a phone, focus on a
 * keyboard. what someone has to act on never goes in one of these, and
 * neither does a link, because a tooltip is gone the moment the pointer
 * moves towards it.
 *
 * the first tip waits a moment, so a pointer crossing the page does not set
 * off a string of them; once one is open, the next opens at once, because the
 * reader is now reading tips. the card is drawn at the document root from the
 * trigger's own rectangle, so no scrolling container clips it, it goes below
 * when there is no room above, and it never leaves the viewport.
 *
 * interactive children (a switch, a button) keep their own tap: the tip shows
 * for them on hover and focus only, so a tap does the thing, not the tip. */
const GAP = 8, PAD = 12, WIDTH = 260, DELAY = 400, WARM = 500;
let lastClosed = 0;

export default function Tip({ text, label, children, tap = true, underline = false, focusable = true, block = false, className = "" }: {
  text: React.ReactNode; label?: string; children: React.ReactNode;
  /* false when the child is itself a control: tapping it must do the control's work */
  tap?: boolean;
  /* the dotted underline that says a word has more behind it */
  underline?: boolean;
  /* false when the child is already focusable, so the tab order has one stop, not two */
  focusable?: boolean;
  block?: boolean; className?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);     // tapped
  const [hover, setHover] = useState(false);   // pointer or focus
  const [pos, setPos] = useState<{ left: number; top: number; below: boolean; caretX: number } | null>(null);
  const trigger = useRef<HTMLSpanElement>(null);
  const card = useRef<HTMLSpanElement>(null);
  const wait = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shown = open || hover;

  /* whether this tip is open, read synchronously: the next tip's enter runs
     in the same event as this one's leave, before any state has rendered */
  const isOpen = useRef(false);
  const show = (v: boolean) => { isOpen.current = v; setHover(v); };
  const enter = () => {
    if (wait.current) clearTimeout(wait.current);
    if (Date.now() - lastClosed < WARM) { show(true); return; }
    wait.current = setTimeout(() => show(true), DELAY);
  };
  const leave = () => {
    if (wait.current) { clearTimeout(wait.current); wait.current = null; }
    if (isOpen.current) lastClosed = Date.now();
    show(false);
  };
  useEffect(() => () => { if (wait.current) clearTimeout(wait.current); }, []);

  useLayoutEffect(() => {
    if (!shown || !trigger.current) { setPos(null); return; }
    const place = () => {
      const w = trigger.current!.getBoundingClientRect();
      const h = card.current?.getBoundingClientRect().height ?? 0;
      const width = Math.min(WIDTH, window.innerWidth - PAD * 2);
      const cx = w.left + w.width / 2;
      const left = Math.min(Math.max(PAD, cx - width / 2), window.innerWidth - PAD - width);
      const below = w.top - h - GAP < PAD;
      setPos({ left, top: below ? w.bottom + GAP : w.top - h - GAP, below, caretX: Math.min(Math.max(12, cx - left), width - 12) });
    };
    place();
    /* measured again once the card has laid out, so its height is real */
    const r = requestAnimationFrame(place);
    window.addEventListener("scroll", place, true); window.addEventListener("resize", place);
    return () => { cancelAnimationFrame(r); window.removeEventListener("scroll", place, true); window.removeEventListener("resize", place); };
  }, [shown, text]);

  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => { if (!trigger.current?.contains(e.target as Node) && !card.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); show(false); } };
    document.addEventListener("pointerdown", off); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", off); document.removeEventListener("keydown", esc); };
  }, [open]);

  const width = typeof window === "undefined" ? WIDTH : Math.min(WIDTH, window.innerWidth - PAD * 2);
  const Wrap = block ? "div" : "span";
  return (
    <>
      <Wrap ref={trigger as React.RefObject<HTMLDivElement & HTMLSpanElement>} aria-describedby={shown ? id : undefined}
        tabIndex={focusable ? 0 : undefined} role={focusable && tap ? "button" : undefined}
        onPointerEnter={e => { if (e.pointerType === "mouse") enter(); }} onPointerLeave={e => { if (e.pointerType === "mouse") leave(); }}
        onFocus={() => show(true)} onBlur={() => show(false)}
        onClick={tap ? () => setOpen(v => !v) : undefined}
        onKeyDown={tap && focusable ? e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(v => !v); } } : undefined}
        className={`${block ? "" : "inline"} ${tap ? "cursor-help" : ""} outline-none focus-visible:ring-2 rounded-sm ${underline ? "underline decoration-dotted underline-offset-[3px] decoration-[1.5px]" : ""} ${className}`}
        style={underline ? { textDecorationColor: "var(--orange)" } : undefined}>
        {children}
      </Wrap>
      {shown && typeof document !== "undefined" && createPortal(
        <span ref={card} role="tooltip" id={id}
          className="tip-card fixed z-[100] px-3 py-2.5 text-left font-normal normal-case tracking-normal"
          style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, width, background: "var(--surface)", color: "var(--text-dark)", border: "1px solid var(--hairline)", borderRadius: 10, boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
            visibility: pos ? "visible" : "hidden", transformOrigin: `${pos?.caretX ?? width / 2}px ${pos?.below ? "top" : "bottom"}` }}>
          {label && <span className="block eyebrow mb-1" style={{ color: "var(--orange-text)" }}>{label}</span>}
          <span className="block text-[12.5px] leading-[1.5]">{text}</span>
          <span aria-hidden className="absolute w-[9px] h-[9px] rotate-45" style={{ left: (pos?.caretX ?? 0) - 4.5, [pos?.below ? "top" : "bottom"]: -5.5, background: "var(--surface)",
            borderLeft: pos?.below ? "1px solid var(--hairline)" : undefined, borderTop: pos?.below ? "1px solid var(--hairline)" : undefined,
            borderRight: pos?.below ? undefined : "1px solid var(--hairline)", borderBottom: pos?.below ? undefined : "1px solid var(--hairline)" }} />
        </span>, document.body)}
    </>
  );
}

/* a small circled i, for a title whose explanation used to be a paragraph
   under it. the title stays a title; the paragraph is one tap away. */
export function InfoTip({ text, label }: { text: React.ReactNode; label?: string }) {
  return (
    <Tip text={text} label={label} className="inline-flex align-middle ml-1.5">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-label="about this" style={{ color: "var(--text-light)" }}>
        <circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" />
      </svg>
    </Tip>
  );
}
