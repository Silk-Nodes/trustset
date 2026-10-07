"use client";
/* one hit to our own counter: a page view, or an action when an event name is
   given. sendBeacon so it never holds up the page or a navigation; fetch with
   keepalive where the beacon is missing. never throws. see /api/hit. */
export function track(e?: "sample-pause" | "sample-stop" | "live-pause" | "demo-switch") {
  try {
    if (navigator.webdriver) return;
    const q = new URLSearchParams(location.search);
    const body = JSON.stringify({ p: location.pathname, r: document.referrer || undefined, from: q.get("from") || undefined, e });
    if (navigator.sendBeacon?.("/api/hit", new Blob([body], { type: "text/plain" }))) return;
    fetch("/api/hit", { method: "POST", body, keepalive: true }).catch(() => {});
  } catch { /* the counter is never the reason anything breaks */ }
}
