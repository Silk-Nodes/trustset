import type { Metadata } from "next";
import Footer from "@/components/Footer";
import Faq from "./Faq";
import { faqJsonLd } from "./questions";

export const metadata: Metadata = {
  title: "FAQ",
  description: "What trustset does, what it deliberately does not do, who can change it (nobody), and what a stop will not protect you from. Answers read off the deployed contracts.",
  alternates: { canonical: "/faq" },
  openGraph: {
    title: "trustset FAQ",
    description: "Who controls it, what a stop does not protect you from, and why the contract can never be changed.",
    url: "https://trustset.silknodes.io/faq",
    images: [{ url: "/og.png", width: 1280, height: 640, alt: "trustset, the trust stack for AI agents" }],
  },
  twitter: { card: "summary_large_image", title: "trustset FAQ", images: ["/og.png"] },
};

export default function Page() {
  return (
    <>
      {/* generated from the same array the page renders, so what a crawler
          lifts and what a reader sees are the same sentences. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd()) }} />
      <main className="w-full max-w-6xl mx-auto px-4 sm:px-5 pt-8 sm:pt-12 pb-16 min-w-0">
        <div className="mb-10 sm:mb-14 max-w-3xl">
          <h1 className="text-[38px] sm:text-[52px] font-semibold tracking-[-0.035em] leading-[1.02]">Questions</h1>
          <p className="text-[17px] sm:text-[19px] text-ink/70 mt-4 max-w-[54ch]">
            What it does, what it will not do for you, and who can change it.
          </p>
        </div>
        <Faq />
      </main>
      <Footer />
    </>
  );
}
