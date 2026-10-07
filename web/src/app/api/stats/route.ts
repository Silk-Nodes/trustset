import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { readAll, summarise } from "@/lib/visits.server";

/* the counts, for the operator only. the same token the live agent's operator
   actions take, and closed when none is configured: an unset secret must
   never read as "no check needed". */
function operator(req: Request) {
  const want = process.env.OPERATOR_TOKEN || "";
  if (!want) return false;
  const a = Buffer.from(req.headers.get("x-trustset-operator") || ""), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  if (!operator(req)) return NextResponse.json({ error: "operator token required" }, { status: 401, headers: { "cache-control": "no-store" } });
  return NextResponse.json(summarise(await readAll()), { headers: { "cache-control": "no-store" } });
}
