import type { Metadata } from "next";
import Footer from "@/components/Footer";
import Docs from "./Docs";

export const metadata: Metadata = { title: "Docs" };

export default function How() {
  return (
    <>
      <main className="w-full max-w-6xl mx-auto px-3 sm:px-4 pt-8 sm:pt-12 pb-16 min-w-0">
        <div className="mb-10 sm:mb-14 max-w-3xl">
          <h1 className="text-[38px] sm:text-[52px] font-semibold tracking-[-0.035em] leading-[1.02]">Docs</h1>
          <p className="text-[17px] sm:text-[19px] text-ink/70 mt-4 max-w-[52ch]">
            What is deployed, how an app reads it, and what it does not do. Testnet and unaudited, built by Silk Nodes for Monad Metropolis.
          </p>
        </div>
        <Docs />
      </main>
      <Footer />
    </>
  );
}
