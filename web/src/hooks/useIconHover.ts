"use client";
import { useRef } from "react";

/* Wires a lucide-animated icon to the BUTTON it sits in.
 *
 * Every icon in the set exposes the same {startAnimation, stopAnimation}
 * handle, and every use here has the same need: the hover target is the
 * whole button, not the icon's own 16px of svg, which on a padded button
 * fires for maybe one hover in three. One hook instead of a ref and two
 * callbacks per call site.
 *
 *   const stake = useIconHover();
 *   <button {...stake.hoverProps}><TrendingUpIcon ref={stake.ref} size={14}/>Stake</button>
 */
export interface IconHandle { startAnimation: () => void; stopAnimation: () => void }

export function useIconHover() {
  const ref = useRef<IconHandle>(null);
  return {
    ref,
    hoverProps: {
      onMouseEnter: () => ref.current?.startAnimation(),
      onMouseLeave: () => ref.current?.stopAnimation(),
    },
  };
}
