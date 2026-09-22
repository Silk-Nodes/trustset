import Home from "./home";

/* the site carried no structured data at all, so an answer engine describing
   trustset had to infer everything from prose. this states the plain facts it
   would otherwise guess at: what the thing is, that it costs nothing, who
   wrote it, and where the source is. nothing here is a claim the pages do not
   already make. */
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "trustset",
  applicationCategory: "DeveloperApplication",
  description:
    "An off switch for AI agents, on chain. One transaction from a cold key and every app that checks refuses the agent in the next block. Eight primitives, each an immutable contract with no admin.",
  url: "https://trustset.silknodes.io",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  operatingSystem: "Any",
  author: { "@type": "Organization", name: "Silk Nodes", url: "https://silknodes.io" },
  codeRepository: "https://github.com/Silk-Nodes/trustset",
  isAccessibleForFree: true,
};

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Home />
    </>
  );
}
