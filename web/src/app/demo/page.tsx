import type { Metadata } from "next";
import Venue from "./Venue";
import Footer from "@/components/Footer";

export const metadata: Metadata = { title: "Try it" };

export default function Page() {
  return (
    <>
      <main className="w-full max-w-6xl mx-auto px-3 sm:px-4 pt-10 sm:pt-14 pb-16 min-w-0">
        <h1 className="text-[38px] sm:text-[54px] font-semibold tracking-[-0.035em] leading-[1.02] max-w-3xl">
          You built the agent.<br /><span style={{ color: "var(--dim)" }}>Here is everything around it.</span>
        </h1>
        <p className="text-lg sm:text-xl mt-5 max-w-[56ch]" style={{ color: "var(--text-medium)" }}>
          It buys, it sells, it chases a spread while you sleep. What it does not have is a way to be
          stopped, watched, handed to someone else, or given an end date, unless you build all of that
          yourself.
        </p>
        <p className="text-base sm:text-lg mt-3 mb-9 max-w-[56ch]" style={{ color: "var(--text-medium)" }}>
          Register the key it already signs with and you get the rest. Seven steps below, each one a real
          transaction on Monad testnet. Nothing here is a recording.
        </p>
        <Venue />
      </main>
      <Footer />
    </>
  );
}
