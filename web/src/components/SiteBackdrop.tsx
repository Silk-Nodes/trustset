"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Backdrop from "@/components/landing/Backdrop";
import { isAppPath } from "@/components/Header";

/* the atmosphere, on every page.
 *
 * the aurora used to be rendered by the landing page alone, so the console
 * and the explanation sat on a flat dark ground and looked like a different
 * site. it is mounted once here, under everything, and follows the theme. */
const APP_DARK = 0.24, APP_LIGHT = 0.18;

export default function SiteBackdrop() {
  const [light, setLight] = useState(false);
  useEffect(() => {
    const read = () => setLight(document.documentElement.dataset.theme !== "dark");
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);
  /* the app gets the same light, turned down and held still: it shows in the
     gaps around the panels, every panel is opaque, and colour in the app
     carries meaning (orange is paused) that a bright aurora would compete with */
  const app = isAppPath(usePathname() ?? "");
  return <Backdrop light={light} level={app ? (light ? APP_LIGHT : APP_DARK) : undefined} />;
}
