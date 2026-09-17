"use client";
import { useEffect, useState } from "react";
import Backdrop from "@/components/landing/Backdrop";

/* the atmosphere, on every page.
 *
 * the aurora used to be rendered by the landing page alone, so the console
 * and the explanation sat on a flat dark ground and looked like a different
 * site. it is mounted once here, under everything, and follows the theme. */
export default function SiteBackdrop() {
  const [light, setLight] = useState(false);
  useEffect(() => {
    const read = () => setLight(document.documentElement.dataset.theme !== "dark");
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);
  return <Backdrop light={light} />;
}
