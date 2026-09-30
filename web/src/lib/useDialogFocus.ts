"use client";
import { useEffect, type RefObject } from "react";

/* a modal that keeps the keyboard inside it.
 *
 * on open, focus moves into the dialog (to the element marked data-autofocus,
 * or the first control). tab and shift tab cycle inside it and never reach the
 * page behind, which a screen reader user could otherwise operate blind. on
 * close, focus goes back to whatever opened it, instead of to the top of the
 * document. */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useDialogFocus(ref: RefObject<HTMLElement | null>, open: boolean) {
  useEffect(() => {
    if (!open) return;
    const back = document.activeElement as HTMLElement | null;
    const box = ref.current;
    if (!box) return;
    const items = () => [...box.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(el => el.offsetParent !== null);
    (box.querySelector<HTMLElement>("[data-autofocus]") ?? items()[0])?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const xs = items(); if (!xs.length) return;
      const first = xs[0], last = xs[xs.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      else if (!box.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); if (back && document.contains(back)) back.focus(); };
  }, [open, ref]);
}
