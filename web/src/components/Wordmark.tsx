"use client";
import { useEffect, useRef, useState } from "react";

/* the name, sized to run edge to edge of its column at any width.
 *
 * a fixed clamp fit one viewport and floated at the rest, left-hung with a
 * gap on the right. this measures the word's natural width once, at a known
 * size, and scales the font so the word is exactly as wide as the column,
 * then crops the bottom so the page ends inside the letters. */
export default function Wordmark({ text = "trustset", opacity = 0.26, show = 0.62 }: { text?: string; opacity?: number; show?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState(0);
  useEffect(() => {
    const fit = () => {
      if (!box.current || !probe.current) return;
      const natural = probe.current.getBoundingClientRect().width; // at 100px
      if (natural > 0) setSize((box.current.clientWidth / natural) * 100);
    };
    fit();
    const ro = new ResizeObserver(fit); if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, []);
  /* the visible band is a fraction of the cap height, so the letters read
     whole and the baseline is cut, not the tops. */
  const height = size ? Math.round(size * 0.72 * show) : 0;
  return (
    <div ref={box} aria-hidden className="relative overflow-hidden select-none w-full" style={{ height }}>
      <span ref={probe} className="absolute invisible font-semibold whitespace-nowrap" style={{ fontSize: 100, letterSpacing: "-0.055em", lineHeight: 1 }}>{text}</span>
      {size > 0 && (
        <span className="block font-semibold whitespace-nowrap" style={{ fontSize: size, lineHeight: 0.78, letterSpacing: "-0.055em", color: "var(--orange)", opacity, transform: "translateY(-0.02em)" }}>{text}</span>
      )}
    </div>
  );
}
