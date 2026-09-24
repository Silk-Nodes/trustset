"use client";
import { useRef, useState } from "react";
import { IconCopy } from "./icons";

/* copy a value, most often an address someone is about to paste into a
   faucet or a wallet. the icon turns into a check for a moment, and a screen
   reader hears "copied". it never opens or selects anything around it. */
export default function CopyButton({ text, label = "Copy", size = 28 }: { text: string; label?: string; size?: number }) {
  const [done, setDone] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
      setDone(true);
      if (t.current) clearTimeout(t.current);
      t.current = setTimeout(() => setDone(false), 1500);
    }).catch(() => {});
  };
  return (
    <button type="button" onClick={copy} aria-label={done ? "Copied" : label} title={done ? "copied" : label}
      className="shrink-0 rounded-lg inline-flex items-center justify-center outline-none focus-visible:ring-2 active:scale-[0.94] transition-transform"
      style={{ width: size, height: size, color: done ? "var(--sage-text)" : "var(--text-medium)" }}>
      <IconCopy done={done} />
      <span className="sr-only" aria-live="polite">{done ? "copied" : ""}</span>
    </button>
  );
}
