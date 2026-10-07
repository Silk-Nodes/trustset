import type { Metadata } from "next";
import Footer from "@/components/Footer";
import Docs from "./Docs";

export const metadata: Metadata = {
  title: "Docs",
  description: "How trustset works: register an agent, check it with isTrusted(agentId) in one call, and use the eight layers. Contracts, SDK and integration on Monad.",
  alternates: { canonical: "/how" },
};

/* the docs as what they are, an article by Silk Nodes, so an answer engine
   can cite who wrote them and when */
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "TechArticle",
  headline: "trustset docs: the trust stack for AI agents on Monad",
  description: "Register an agent, check it with isTrusted(agentId), and use the eight layers: the switch, a passkey panic button, guardians, time limits, past signatures, identity, human proof and refunds.",
  url: "https://trustset.silknodes.io/how",
  author: { "@type": "Organization", name: "Silk Nodes", url: "https://silknodes.io" },
  publisher: { "@type": "Organization", name: "Silk Nodes", url: "https://silknodes.io" },
  about: "AI agent safety on Monad",
  proficiencyLevel: "Beginner",
  dateModified: "2026-10-07",
};

export default function How() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <main className="w-full max-w-6xl mx-auto px-4 sm:px-5 pt-8 sm:pt-12 pb-16 min-w-0">
        <div className="mb-10 sm:mb-14 max-w-3xl">
          <h1 className="text-[38px] sm:text-[52px] font-semibold tracking-[-0.035em] leading-[1.02]">Docs</h1>
          <p className="text-[17px] sm:text-[19px] text-ink/70 mt-4 max-w-[52ch]">
            What is deployed, how an app reads it, and what it does not do.
          </p>
        </div>
        <Docs />
      </main>
      <Footer />
    </>
  );
}
