"use client";
import { useState } from "react";
import Link from "next/link";

function Head({ title, note }: { title: string; note?: string }) {
  return <div className="sec-head"><h2 className="font-semibold">{title}</h2>{note && <span className="note">{note}</span>}</div>;
}

/* 3. what trustset stops, what it does not. the no rows are the point, so the
   table gets no container: it is reference, read on the page itself. */
const THREATS: [string, string, string, string][] = [
  ["Agent key leaks", "Yes, one transaction from the cold key", "Nobody, it is chain state", ""],
  ["Runaway loop, agent keeps trading", "Yes, next block refuses it", "Nobody", ""],
  ["Prompt injection makes the agent act", "Yes, if the owner notices", "Nobody", "Detection is not trustset's job"],
  ["Cold key stolen", "Attacker can only stop the agent", "Nobody", "Key change is time locked, spending is impossible"],
  ["App that never checks the switch", "No", "The app", "The notice still exists, the app chose to ignore it"],
  ["Trade already mined before the stop", "No", "Nobody", "Nothing reverses a mined block"],
];
export function Threats() {
  return (
    <section className="mt-16 sm:mt-24">
      <Head title="What it stops, what it does not" note="The two no rows are the honest limits" />
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: 640 }}>
          <thead><tr style={{ color: "var(--text-medium)" }}>
            <th className="text-[12px] font-medium text-left pb-2.5 pr-4">Threat</th>
            <th className="text-[12px] font-medium text-left pb-2.5 pr-4">Stopped</th>
            <th className="text-[12px] font-medium text-left pb-2.5 pr-4">Who you have to trust</th>
            <th className="text-[12px] font-medium text-left pb-2.5">Note</th>
          </tr></thead>
          <tbody>
            {THREATS.map(([t, a, b, n]) => (
              <tr key={t} style={{ borderTop: "1px solid var(--hairline)" }}>
                <td className="py-3.5 pr-4 font-medium align-top">{t}</td>
                <td className="py-3.5 pr-4 align-top" style={{ color: a === "No" ? "var(--orange-text)" : "var(--text-medium)" }}>{a || "—"}</td>
                <td className="py-3.5 pr-4 align-top" style={{ color: b.startsWith("Nobody") ? "var(--sage-text)" : "var(--orange-text)" }}>{b || "—"}</td>
                <td className="py-3.5 align-top text-ink/70">{n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* the integrator's section, and the page's real argument.
 *
 * this used to sit at the bottom under "one line to integrate", below six
 * screens aimed at the agent's owner. that had the page backwards: the owner
 * presses stop once and maybe never, while the app reads the switch on every
 * call. an off switch nobody reads is worth nothing, so the read side leads
 * now and the owner's console is the proof rather than the pitch. */
const SNIPPET = `// inside your own function, before you act for an agent
if (!killSwitch.isTrusted(agentId)) revert AgentNotTrusted(agentId);`;
/* one snippet, one reader. the TypeScript version that used to sit beside
   this was for an agent checking itself, a different reader and the soft
   version of the promise; it lives on /how now under its own heading. */
export function OneLine() {
  const [copied, setCopied] = useState(false);
  return (
    <section id="integrate" className="mt-24 sm:mt-36 scroll-mt-24">
      <div className="mb-8 sm:mb-10">
        <Big lit="The whole integration." dim="One line, inside your own call." />
      </div>
      <div className="sheet p-2 max-w-4xl sm:ml-[72px]">
        <div className="flex items-center gap-1 px-2 pt-1 pb-2">
          <span className="rounded-full px-3 py-1.5 text-xs font-semibold" style={{ background: "var(--pill-accent-bg)", color: "var(--pill-accent-text)" }}>Solidity</span>
          <button type="button" className="ml-auto rounded-full px-3 py-1.5 text-xs" style={{ color: "var(--text-medium)" }} onClick={() => { navigator.clipboard?.writeText(SNIPPET); setCopied(true); setTimeout(() => setCopied(false), 1200); }}>{copied ? "Copied" : "Copy"}</button>
        </div>
        <pre className="code-window" style={{ borderRadius: "var(--radius-sm)" }}>{SNIPPET}</pre>
      </div>
      <p className="mt-4 text-sm max-w-[60ch] sm:ml-[72px]" style={{ color: "var(--text-medium)" }}>A stopped agent is refused inside your transaction, so nothing upstream can skip it. Addresses and the rest on <Link href="/how" className="underline">How it works</Link>.</p>
    </section>
  );
}


/* one headline-sized statement: a lit clause, then a dimmed one. */
function Big({ lit, dim }: { lit: string; dim: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] sm:grid-cols-[72px_minmax(0,1fr)] gap-x-4 items-start max-w-5xl">
      <span className="hidden sm:block" />
      <h2 className="text-[34px] sm:text-[46px] lg:text-[54px] font-semibold tracking-[-0.03em] leading-[1.04]">
        <span>{lit}</span>{" "}<span style={{ color: "var(--dim)" }}>{dim}</span>
      </h2>
    </div>
  );
}
