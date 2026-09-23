import type { Metadata } from "next";
import Venue from "./Venue";
import Footer from "@/components/Footer";
import LiveAgent from "@/components/LiveAgent";

export const metadata: Metadata = { title: "Try it" };

/* two things to try, said as two things.
 *
 * the page used to show two agents with nothing between them: the real one at
 * the top (it runs on our server and trades every hour) and a practice one the
 * seven steps act on, shared by every visitor without a wallet so the steps can
 * set end dates and guardian votes without breaking the real one. both were
 * good reasons and neither was written down, so it read as the page
 * contradicting itself. each now has a heading that says which agent it is and
 * what it is for, and the thirty second version comes first for anybody who
 * only has thirty seconds.
 *
 * full width like the explorer and the console: the walkthrough and its rail
 * sit side by side, and a centred column spent a third of a desktop on margin. */
export default function Page() {
  return (
    <>
      <main className="w-full px-4 sm:px-5 pt-8 sm:pt-10 pb-16 min-w-0">
        <h1 className="text-[32px] sm:text-[44px] font-semibold tracking-[-0.035em] leading-[1.04] max-w-4xl">
          You built the agent. <span style={{ color: "var(--dim)" }}>Here is everything around it.</span>
        </h1>
        <p className="text-base sm:text-lg mt-3 max-w-[64ch]" style={{ color: "var(--text-medium)" }}>
          Two ways to see it. Every button below sends a real transaction on Monad testnet; nothing here is a recording.
        </p>

        <LiveAgent lead={<Section eyebrow="The quick version" title="Stop a real agent" meta="30 seconds"
          note="A real agent on our server, trading every hour. Switch it off and watch it stop; it comes back on its own after two minutes." />} />

        <Section eyebrow="The full walkthrough" title="Everything around the switch" meta="7 steps"
          note="On a practice agent, shared by visitors so you can press anything. Connect a wallet and the page gives you your own." />
        <Venue />
      </main>
      <Footer />
    </>
  );
}

/* a label, not a number. the walkthrough numbers its own steps one to seven
   in circles, and a numbered circle above it read as step two sitting over
   step one. */
function Section({ eyebrow, title, meta, note }: { eyebrow: string; title: string; meta: string; note: string }) {
  return (
    <div className="mt-10 mb-4">
      <div className="eyebrow mb-1.5" style={{ color: "var(--orange-text)" }}>{eyebrow}</div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <h2 className="text-[20px] sm:text-[22px] font-semibold tracking-[-0.015em]">{title}</h2>
        <span className="mono text-[11px] uppercase tracking-[0.12em]" style={{ color: "var(--text-medium)" }}>{meta}</span>
      </div>
      <p className="text-[13.5px] mt-1 max-w-[70ch]" style={{ color: "var(--text-medium)" }}>{note}</p>
    </div>
  );
}
