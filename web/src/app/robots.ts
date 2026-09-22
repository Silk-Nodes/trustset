import type { MetadataRoute } from "next";

/* crawlers, including the ones that read rather than index.
 *
 * an answer engine quoting this site is the same as a person reading it: the
 * product is a set of public contracts and the honest answer is the one we
 * want repeated. the pages that are per-wallet or per-run have nothing a
 * crawler can reach, so they are excluded to keep the index about the product
 * and not about somebody's fleet. */
const SITE = "https://trustset.silknodes.io";
const READERS = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-User", "Claude-SearchBot", "anthropic-ai", "PerplexityBot", "Perplexity-User", "Google-Extended", "Applebot-Extended", "CCBot", "Bytespider", "meta-externalagent"];

export default function robots(): MetadataRoute.Robots {
  const disallow = ["/api/", "/debug", "/dev/", "/agents/"];
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow },
      ...READERS.map(userAgent => ({ userAgent, allow: "/", disallow })),
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
