import { NextResponse } from "next/server";
import { EVENTS, isBot, record, visitorOf } from "@/lib/visits.server";

/* one page view or action, sent by the page itself. it answers 204 whatever
   happens: a counter must never be the reason a page shows an error. */
export async function POST(req: Request) {
  try {
    const ua = req.headers.get("user-agent") || "";
    if (isBot(ua)) return new NextResponse(null, { status: 204 });
    const text = await req.text();
    if (text.length > 1024) return new NextResponse(null, { status: 204 });
    const b = JSON.parse(text) as { p?: string; r?: string; from?: string; e?: string };
    /* the path only: no query, so nothing a link carried is kept */
    const p = typeof b.p === "string" && b.p.startsWith("/") ? b.p.split("?")[0].slice(0, 120) : null;
    if (!p) return new NextResponse(null, { status: 204 });
    const e = typeof b.e === "string" && (EVENTS as readonly string[]).includes(b.e) ? b.e : undefined;
    /* the referring host only, never the page they were on */
    let ref: string | undefined;
    try { if (b.r) ref = new URL(b.r).hostname.slice(0, 80); } catch { /* not a url */ }
    const from = typeof b.from === "string" && /^[a-z0-9-]{1,20}$/i.test(b.from) ? b.from.toLowerCase() : undefined;
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || "";
    const t = Math.floor(Date.now() / 1000);
    await record({ t, p, v: visitorOf(ip, ua, new Date(t * 1000).toISOString().slice(0, 10)), ref, from, dev: /mobile|iphone|android/i.test(ua) ? "phone" : "desktop", e });
  } catch (err) {
    console.error("visit not recorded:", err instanceof Error ? err.message : err);
  }
  return new NextResponse(null, { status: 204 });
}
