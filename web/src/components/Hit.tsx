"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { track } from "@/lib/track";

/* a page view, once per path the reader lands on. the stats page itself is
   left out, so checking the numbers does not add to them. */
export default function Hit() {
  const path = usePathname();
  useEffect(() => { if (path && !path.startsWith("/stats")) track(); }, [path]);
  return null;
}
