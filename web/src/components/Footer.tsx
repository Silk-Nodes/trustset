import Link from "next/link";
import Wordmark from "@/components/Wordmark";

/* the footer ends the page on weight, not on small print.
 *
 * the closing claim at headline size, one row of links,
 * and then the name, set enormous and cropped at the waist by the bottom of
 * the page. a single word only: a sentence at that size either wraps or
 * shrinks to nothing, which is why every site doing this crops its name. */
export default function Footer({ close = false }: { close?: boolean }) {
  return (
    <footer className="relative mt-24 sm:mt-36 overflow-hidden" style={{ zIndex: 1, borderTop: "1px solid var(--hairline)", background: "color-mix(in srgb, var(--bg-base) 86%, transparent)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)" }}>
      <div className="max-w-6xl mx-auto px-3 sm:px-4">
        {close && (
          <div className="pt-16 sm:pt-24">
            <h2 className="text-[38px] sm:text-[54px] lg:text-[64px] font-semibold tracking-[-0.03em] leading-[1.02] max-w-5xl">
              Your agent. <span style={{ color: "var(--dim)" }}>Your switch. Every app.</span>
            </h2>
          </div>
        )}

        <div className={`${close ? "mt-16 sm:mt-24" : "mt-10 sm:mt-14"} flex flex-wrap items-center gap-x-6 gap-y-2 text-xs`} style={{ color: "var(--text-medium)" }}>
          <span>Built by <a href="https://silknodes.io" target="_blank" rel="noopener noreferrer" className="font-semibold hover:underline" style={{ color: "var(--text-dark)" }}>Silk Nodes</a></span>
          <nav className="ml-auto flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/faq" className="hover:underline">FAQ</Link>
            <Link href="/how" className="hover:underline">Docs</Link>
            <a href="https://github.com/Silk-Nodes/trustset" target="_blank" rel="noopener noreferrer" className="hover:underline">GitHub</a>
            <a href="https://x.com/silk_nodes" target="_blank" rel="noopener noreferrer" className="hover:underline">X</a>
          </nav>
        </div>
      </div>

      {/* the name, edge to edge of the column and cropped at the baseline.
          decorative: the wordmark in the header already names the site to a
          screen reader. */}
      <div className="max-w-6xl mx-auto px-3 sm:px-4 mt-4 sm:mt-6">
        <Wordmark />
      </div>
    </footer>
  );
}
