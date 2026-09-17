"use client";
import { useEffect, useRef, useState } from "react";
import { useInView } from "motion/react";

/* "has the reader reached this yet", answered so that it can never be wrong.
 *
 * useInView alone only fires while an element passes through the viewport, so
 * anything the reader jumps over (an anchor, a restored scroll position, a
 * programmatic scroll) stays parked at its initial opacity for good. measured:
 * six blocks invisible after one jump. so we also check position directly on
 * mount and on scroll, and nothing is ever left waiting on an observer that
 * already missed it. */
export function useArrived(margin = "-80px 0px") {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref as React.RefObject<Element>, { once: true, margin: margin as `${number}px ${number}px` });
  const [past, setPast] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const check = () => { if (el.getBoundingClientRect().top < window.innerHeight) setPast(true); };
    check();
    window.addEventListener("scroll", check, { passive: true });
    return () => window.removeEventListener("scroll", check);
  }, []);
  return { ref, arrived: inView || past };
}
