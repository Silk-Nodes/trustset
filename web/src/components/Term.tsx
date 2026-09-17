"use client";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/* a word with its meaning attached.
 *
 * three words carry all the meaning on the agents page: agent key, cold key
 * and register. everything that was confusing about the product came down to
 * one of them being read the wrong way. so each one is underlined, and
 * hovering or tapping it says exactly what it means, in the same words every
 * time. hover on a pointer, tap on a phone, focus on a keyboard.
 *
 * the card is rendered at the document root, positioned from the word's own
 * rectangle. drawn inside the word's parent it was clipped by any scrolling
 * container, the register dialog for one, and ran off the left of the page
 * when the word sat near an edge. it goes below the word when there is no
 * room above, and never leaves the viewport. */
export const TERMS = {
  "agent key": "The key the agent signs with. This is what gets refused after a stop. The agent already exists and already holds it; trustset never runs the agent.",
  "cold key": "Your wallet. The only key that can pause or stop the agent, and one that can never spend from it.",
  "register": "Tell the switch which key belongs to which agent, so it can be stopped. Nothing is created. The agent lives wherever you run it.",
  "guardians": "Who stops the agent if you cannot. Wallets you chose that can pause it by vote. If you then do nothing for the delay, they can stop it. They can never spend and never stop it instantly.",
  "stop": "Permanent. From the next block, every app that checks the switch refuses this key. Nothing already mined is reversed.",
  /* on the explorer, where a reader is looking at somebody else's wallet and
     may wonder whether seeing it means something leaked. it did not: the
     contract returns it to anyone who asks. */
  "public keys": "Both keys are public. The contract returns them to anyone who calls it, and the registration is a log, so this is not something the explorer reveals. Knowing a cold key lets nobody use it: it can only pause or stop that one agent, and can never spend.",
  "on chain forever": "Registering is a public transaction. Anyone can then see that this wallet controls this agent, and read that wallet's own history. The switch needs the link to work, so use a wallet that does nothing else.",
} as const;
export type TermKey = keyof typeof TERMS;

const GAP = 10, PAD = 16, WIDTH = 300;

export default function Term({ k, children, tip }: { k?: TermKey; children: React.ReactNode; tip?: string }) {
  const text = tip ?? (k ? TERMS[k] : "");
  const id = useId();
  const [open, setOpen] = useState(false);     // tapped or focused
  const [hover, setHover] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; below: boolean; caretX: number } | null>(null);
  const word = useRef<HTMLButtonElement>(null);
  const card = useRef<HTMLSpanElement>(null);
  const shown = open || hover;

  useLayoutEffect(() => {
    if (!shown || !word.current) return;
    const place = () => {
      const w = word.current!.getBoundingClientRect();
      const h = card.current?.getBoundingClientRect().height ?? 0;
      const width = Math.min(WIDTH, window.innerWidth - PAD * 2);
      const cx = w.left + w.width / 2;
      const left = Math.min(Math.max(PAD, cx - width / 2), window.innerWidth - PAD - width);
      const below = w.top - h - GAP < PAD;
      const top = below ? w.bottom + GAP : w.top - h - GAP;
      setPos({ left, top, below, caretX: Math.min(Math.max(12, cx - left), width - 12) });
    };
    place();
    window.addEventListener("scroll", place, true); window.addEventListener("resize", place);
    return () => { window.removeEventListener("scroll", place, true); window.removeEventListener("resize", place); };
  }, [shown, text]);

  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => { if (!word.current?.contains(e.target as Node) && !card.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", off); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", off); document.removeEventListener("keydown", esc); };
  }, [open]);

  const width = typeof window === "undefined" ? WIDTH : Math.min(WIDTH, window.innerWidth - PAD * 2);
  return (
    <>
      <button ref={word} type="button" aria-describedby={id} onClick={() => setOpen(v => !v)}
        onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onFocus={() => setHover(true)} onBlur={() => setHover(false)}
        className="cursor-help underline decoration-dotted underline-offset-[3px] decoration-[1.5px] rounded-sm outline-none focus-visible:ring-2"
        style={{ textDecorationColor: "var(--orange)", font: "inherit", color: "inherit", background: "none", padding: 0, border: 0 }}>
        {children}
      </button>
      {shown && typeof document !== "undefined" && createPortal(
        <span ref={card} role="tooltip" id={id}
          className="fixed z-[100] px-3.5 py-3 text-left font-normal normal-case tracking-normal"
          style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, width, background: "var(--surface)", color: "var(--text-dark)", border: "1px solid var(--hairline)", borderRadius: "var(--radius-sm)", boxShadow: "var(--glass-shadow)", visibility: pos ? "visible" : "hidden" }}>
          {k && <span className="block eyebrow mb-1.5" style={{ color: "var(--orange-text)" }}>{k}</span>}
          <span className="block text-[12.5px] leading-relaxed">{text}</span>
          {/* the caret, on whichever edge faces the word */}
          <span aria-hidden className="absolute w-[10px] h-[10px] rotate-45" style={{ left: (pos?.caretX ?? 0) - 5, [pos?.below ? "top" : "bottom"]: -6, background: "var(--surface)", borderLeft: pos?.below ? "1px solid var(--hairline)" : undefined, borderTop: pos?.below ? "1px solid var(--hairline)" : undefined, borderRight: pos?.below ? undefined : "1px solid var(--hairline)", borderBottom: pos?.below ? undefined : "1px solid var(--hairline)" }} />
        </span>, document.body)}
    </>
  );
}
