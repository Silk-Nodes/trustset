import { NextResponse } from "next/server";

/* a POST that moves money or changes the chain must come from our own page.
 *
 * a request with content-type application/json cannot be sent cross-site
 * without a cors preflight, which this site never answers. without the check,
 * any website could fire text/plain posts at these routes from its visitors'
 * browsers, spreading a drain across thousands of addresses that no per-ip
 * limit would catch. returns a response to send back, or null to carry on. */
export function jsonOnly(req: Request): NextResponse | null {
  const t = (req.headers.get("content-type") || "").toLowerCase();
  return t.startsWith("application/json") ? null : NextResponse.json({ error: "send JSON" }, { status: 415 });
}
