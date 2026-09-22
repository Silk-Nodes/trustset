import type { MetadataRoute } from "next";

/* the pages worth arriving on. the console, the panic page and the per-agent
   explorer routes are left out: they are about one wallet or one id and say
   nothing to somebody who has neither. */
const SITE = "https://trustset.silknodes.io";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const pages: [string, number, MetadataRoute.Sitemap[number]["changeFrequency"]][] = [
    ["", 1, "weekly"],
    ["/faq", 0.9, "monthly"],
    ["/how", 0.9, "monthly"],
    ["/demo", 0.8, "monthly"],
    ["/explorer", 0.7, "daily"],
    ["/passkey", 0.5, "monthly"],
  ];
  return pages.map(([path, priority, changeFrequency]) => ({
    url: `${SITE}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  }));
}
