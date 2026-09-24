"use client";
import { useEffect, useRef } from "react";
/* aurora nova, fixed to the viewport so the atmosphere stays while the page
   scrolls over it.

   no translateZ(0) and no will-change here, deliberately. promoting these
   layers to their own compositor layer put the whole aurora ON TOP of the
   headline, the body copy and the buttons: the hero read as a pink wash with
   ghost text in it. the blur is expensive without the hint and correct with
   it left off, which is the right way round. blend modes composite against the body ground:
   hard-light and soft-light on the dark ground, multiply on the light one.
   a fine grain over all of it. */
const NOISE = "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.9 0'/></filter><rect width='160' height='160' filter='url(%23n)'/></svg>\")";
const G = "linear-gradient(rgba(0, 0, 0, 0) 0%, rgba(0, 138, 255, 0.9) 40%, rgb(255, 255, 255) 70%, rgb(247, 164, 66) 80%, rgb(233, 66, 247) 100%)";
const G3 = "linear-gradient(to top, rgb(0, 0, 31) 0%, rgba(0, 0, 31, 0.85) 8.1%, rgba(0, 0, 31, 0.7) 15.5%, rgba(0, 0, 31, 0.55) 22.5%, rgba(0, 0, 31, 0.4) 29%, rgba(0, 0, 31, 0.25) 35.3%, rgba(0, 0, 31, 0.15) 41.2%, rgba(0, 0, 31, 0) 50%)";

/* intensity follows scroll: full behind the hero, dimmed to a deep ground while
   the story text is on screen, back up for the proof. the text stays legible
   without a scrim and the atmosphere never leaves. */
function useScrollDim(ref: React.RefObject<HTMLDivElement | null>, light: boolean, level?: number) {
  useEffect(() => {
    const el = ref.current; if (!el) return;
    /* a fixed level: the app's window never scrolls, its work area does, and
       a working screen wants a steady ground rather than a changing one */
    if (level !== undefined) { el.style.opacity = level.toFixed(3); return; }
    const lo = light ? 0.34 : 0.26, hi = light ? 0.62 : 0.8;
    let raf = 0;
    const tick = () => {
      raf = 0;
      const y = window.scrollY, h = document.documentElement.scrollHeight - window.innerHeight;
      let o = hi;
      if (y > 500) o = hi - (Math.min(y - 500, 500) / 500) * (hi - lo);
      if (h - y < 900) o = Math.max(o, lo + (1 - (h - y) / 900) * (hi * 0.85 - lo));
      el.style.opacity = o.toFixed(3);
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(tick); };
    tick(); window.addEventListener("scroll", on, { passive: true }); window.addEventListener("resize", on);
    return () => { window.removeEventListener("scroll", on); window.removeEventListener("resize", on); if (raf) cancelAnimationFrame(raf); };
  }, [ref, light, level]);
}

/* the aurora blooms out of the bottom right and falls away before it reaches
   the reading column. without this it was a full-viewport wash: the hero
   paragraph sat on a near-white band at roughly 1.6:1 and the buttons
   disappeared into it. the atmosphere is the same, it just stops competing
   with the words. */
const MASK = "radial-gradient(120% 110% at 88% 92%, #000 0%, rgba(0,0,0,0.92) 34%, rgba(0,0,0,0.5) 62%, rgba(0,0,0,0) 86%)";

export default function Backdrop({ light, level }: { light: boolean; level?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useScrollDim(ref, light, level);
  const layer = (mode: string, blur: string, extra?: React.CSSProperties): React.CSSProperties => ({
    position: "absolute", inset: 0, background: G, mixBlendMode: (light ? "multiply" : mode) as React.CSSProperties["mixBlendMode"], filter: `blur(${blur})`, pointerEvents: "none",
    maskImage: MASK, WebkitMaskImage: MASK, ...extra,
  });
  return (
    /* isolate, and paint the page ground inside.
     *
     * without isolation the hard-light and soft-light layers blend against
     * everything already painted in the root stacking context, so the aurora
     * came out ON TOP of the headline and the buttons rather than behind
     * them. isolating makes this one self-contained picture: the layers blend
     * against the ground drawn on the line below and against nothing else. */
    <div aria-hidden="true" ref={ref} style={{ position: "fixed", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0, isolation: "isolate", transition: "opacity .25s linear" }}>
      <div style={{ position: "absolute", inset: 0, background: "var(--bg-base)" }} />
      <div className="aura-l1" style={layer("hard-light", "126px")} />
      <div className="aura-l2" style={layer("soft-light", "36px")} />
      <div style={{ position: "absolute", inset: 0, background: G3, mixBlendMode: "normal", filter: "blur(260px)", opacity: 0.1, pointerEvents: "none" }} />
      <div style={{ position: "absolute", inset: 0, backgroundImage: NOISE, backgroundSize: "160px 160px", opacity: light ? 0.035 : 0.06, mixBlendMode: light ? "multiply" : "overlay" }} />
    </div>
  );
}
