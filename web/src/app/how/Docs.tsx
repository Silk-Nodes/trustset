"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

/* the reference.
 *
 * this was "how it works", thirteen sections of prose, and it explained the
 * product from scratch: what it is, the four steps, the case for guardians. the
 * landing page and the walkthrough both do that now, and do it with real
 * transactions, so the explaining half had become the third telling of the same
 * story and the half that earns its place, the addresses, the two integration
 * snippets, the limits and the status, was buried under it.
 *
 * so it is a reference now, in the shape references take: a nav that follows
 * where you are, figures instead of sentences wherever a figure will do, a
 * table for the addresses rather than nine paragraphs, and copy buttons on the
 * things people copy. the prose that survived is the part nothing else on the
 * site says, chiefly why a guardian may pause but not stop.
 *
 * it is off the header on purpose. the header is for the three things a reader
 * does, and docs is not one of them; the footer is where people look for it. */

const EXPLORER = "https://testnet.monadexplorer.com";

const NAV = [
  ["stack", "The stack"],
  ["start", "Start here"],
  ["addresses", "Addresses"],
  ["states", "The four states"],
  ["guardians", "Guardians"],
  ["passkey", "Passkey and refunds"],
  ["limits", "What it is not"],
  ["status", "What is true today"],
] as const;

/* the eight layers, in the order the landing page shows them. each one names
   the contract it lives in, because a stack that cannot be traced to code is a
   diagram, and the point of this page is that everything here can be read. */
const LAYERS: [string, string, string][] = [
  ["Identity", "An agent id, a human label, its owner, and an ERC-8004 identity that points back at the switch.", "KillSwitch, AgentLabels"],
  ["The switch", "The owner pauses or stops it. Every app that checks refuses it from the next block.", "KillSwitch"],
  ["Panic button", "A passkey on a phone that can pause and nothing else, verified on chain by the P256 precompile.", "KillSwitch"],
  ["Guardians", "People you chose pause by vote, and replace a lost owner wallet through a delay you can cancel.", "KillSwitch"],
  ["Limits", "An end date, or a heartbeat it has to keep. When either lapses it stops being trusted with nobody awake.", "KillSwitch"],
  ["Past signatures", "isTrustedAt(id, at), so a venue judges an order by when it was signed rather than by now.", "KillSwitch"],
  ["Human proof", "A passkey assertion recorded against an action, so anyone can later ask whether a person was present.", "HumanTouch"],
  ["Refunds", "An escrow with a window, and a refund anybody may send that pays the payer named in storage.", "RefundRail"],
];

const CONTRACTS: [string, string, string?][] = [
  ["Kill switch", "0x54D8211233Cc65b62C594cBAb900930dd37ED3b8", "The one an app reads."],
  ["Agent labels", "0x1fc5CF0a5bD938cc36EcE4ca34F2279e0e5b5f0f", "An owner's words about an agent. Nothing that decides trust reads them."],
  ["Sealed notes", "0xaB0E5F2A9B737dBEA6633a89851b8d6551Ac83dc", "An agent's runbook and stop reasons as ciphertext, opened only with the owner's passkey through Mera."],
  ["Human touch", "0x059563eb1dC1BBd7a8261309E92063A3f41AAda0", "Passkey assertions as proof a person was present."],
  ["Refund rail", "0xf8E44F08263fFB04660483Af44b70E1b25347748", "Escrow for agent payments."],
  ["Example venue", "0x532cC6c80B4a55249131d3790dF8B79D896Ba145", "The counterparty the walkthrough trades against."],
  ["Mock dollar", "0x8f3B4042ce030A7c3C6c1B507ba83Da7e2e2B24D", "Six decimals, mintable by anyone, for trying the rail."],
  ["ERC-8004 identity", "0x8004A818BFB912233c491871b3d84c89A494BD9e", "The canonical testnet registry. We did not deploy it and do not control it."],
];

const STATES: [string, string, string][] = [
  ["Active", "live", "Apps proceed. The owner can pause or stop. Guardians can vote to pause."],
  ["Paused", "off", "Reversible. A guardian pause left untouched for the delay can be escalated."],
  ["Revoked", "off", "Terminal. The history keeps the timestamp, so old signatures are still judged fairly."],
  ["Rotated", "quiet", "Terminal for that id, and names the successor trust moved to."],
];

const TONE: Record<string, string> = { live: "var(--sage)", off: "var(--orange)", quiet: "var(--terra)" };

const SOLIDITY = `if (!killSwitch.isTrusted(agentId)) revert AgentNotTrusted(agentId);`;
const PAST = `// judge a signature by the moment it was signed, never by now
bool wasOk = killSwitch.isTrustedAt(agentId, signedAt);`;
const NPX = `npx @trustset/check 24`;

function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" aria-label="Copy"
      onClick={() => { navigator.clipboard?.writeText(text); setDone(true); setTimeout(() => setDone(false), 1200); }}
      className="mono text-[11px] rounded-full px-2.5 py-1 transition-colors shrink-0"
      style={{ color: "var(--text-medium)", border: "1px solid var(--hairline)" }}>
      {done ? "Copied" : "Copy"}
    </button>
  );
}

function Code({ code, label }: { code: string; label: string }) {
  return (
    <div className="sheet p-2 min-w-0">
      <div className="flex items-center gap-2 px-2 pt-0.5 pb-2">
        <span className="mono text-[11px]" style={{ color: "var(--text-medium)" }}>{label}</span>
        <span className="ml-auto"><Copy text={code} /></span>
      </div>
      {/* the code scrolls inside its own box. a long line must never widen the
          document, which is what an overflow on the page would do. */}
      <pre className="code-window overflow-x-auto" style={{ borderRadius: "var(--radius-sm)" }}>{code}</pre>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28 pt-10 sm:pt-14 first:pt-0">
      <h2 className="text-[22px] sm:text-[26px] font-semibold tracking-[-0.02em]">{title}</h2>
      {/* the measure is for reading, so it applies to paragraphs and lists and
          not to the code windows, the address table or the state cards, which
          were being squeezed to prose width and looked cramped for it. */}
      <div className="mt-4 flex flex-col gap-4 text-[15px] leading-relaxed [&>p]:max-w-[68ch] [&>ol]:max-w-[68ch]" style={{ color: "var(--text-medium)" }}>{children}</div>
    </section>
  );
}

const Fact = ({ n, k }: { n: string; k: string }) => (
  <div className="min-w-0">
    <div className="text-[26px] sm:text-[30px] font-semibold tabular leading-none tracking-[-0.03em]" style={{ color: "var(--text-dark)" }}>{n}</div>
    <div className="text-[11px] mono uppercase tracking-[0.12em] mt-1.5" style={{ color: "var(--text-medium)" }}>{k}</div>
  </div>
);

export default function Docs() {
  const [here, setHere] = useState<string>(NAV[0][0]);

  /* the nav follows the reader. rootMargin pins the trigger near the top of
     the viewport so a heading counts as current once it reaches the header,
     not when it first appears at the bottom. */
  useEffect(() => {
    const seen = new Map<string, boolean>();
    const io = new IntersectionObserver(
      entries => {
        for (const e of entries) seen.set(e.target.id, e.isIntersecting);
        /* the LAST one intersecting, not the first. two sections can both
           cross the band when one ends inside it, and the one you are
           entering is the later one; picking the first named the section you
           had just scrolled past. */
        for (let i = NAV.length - 1; i >= 0; i--) {
          if (seen.get(NAV[i][0])) { setHere(NAV[i][0]); return; }
        }
      },
      { rootMargin: "-96px 0px -70% 0px" },
    );
    for (const [id] of NAV) { const el = document.getElementById(id); if (el) io.observe(el); }
    return () => io.disconnect();
  }, []);

  return (
    <div className="grid lg:grid-cols-[200px_minmax(0,1fr)] gap-10 xl:gap-16 items-start">
      <nav aria-label="On this page" className="hidden lg:block lg:sticky lg:top-24 min-w-0">
        <div className="text-[10.5px] mono uppercase tracking-[0.14em] mb-3" style={{ color: "var(--text-medium)" }}>On this page</div>
        <ul className="grid gap-0.5">
          {NAV.map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`} className="block text-[13.5px] py-1.5 pl-3 transition-colors"
                style={{
                  color: here === id ? "var(--text-dark)" : "var(--text-medium)",
                  fontWeight: here === id ? 600 : 400,
                  borderLeft: `2px solid ${here === id ? "var(--orange)" : "var(--hairline)"}`,
                }}>{label}</a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="min-w-0">
        <Section id="stack" title="The stack">
          <p>trustset is the trust stack for AI agents: eight primitives that make an agent&apos;s standing authorisation revocable, recoverable and accountable. Each is its own immutable contract with no admin, no owner and no funds, except the escrow, which only ever moves money back to whoever put it in. A set an app picks from, not a platform it joins.</p>
          <div className="drawn-box overflow-clip not-prose">
            {LAYERS.map(([name, what, where], i) => (
              <div key={name} className="grid sm:grid-cols-[132px_minmax(0,1fr)_auto] gap-x-4 gap-y-1 items-baseline px-4 sm:px-5 py-3.5"
                style={{ borderBottom: i < LAYERS.length - 1 ? "1px solid var(--hairline)" : undefined }}>
                <div className="text-[14px] font-semibold" style={{ color: "var(--text-dark)" }}>{name}</div>
                <div className="text-[13px]">{what}</div>
                <div className="mono text-[11px] whitespace-nowrap" style={{ color: "var(--text-medium)" }}>{where}</div>
              </div>
            ))}
          </div>
          <p>The switch is the door: one view call is the whole integration, and the rest of this page is about that call. The other seven are there the day you need them and cost nothing until then.</p>
        </Section>

        <Section id="start" title="Start here">
          <p>An app asks the switch inside its own transaction, so the check and the action cannot be separated. That is the whole integration.</p>
          <Code label="Solidity, inside your own function" code={SOLIDITY} />
          <p>A venue that takes orders off chain and settles them later asks a different question: not whether the agent is trusted now, but whether it was trusted when it signed.</p>
          <Code label="Solidity, for an order signed earlier" code={PAST} />
          <p>To try it against the live chain without installing anything:</p>
          <Code label="Terminal" code={NPX} />
          <p>An agent can also check itself before it signs. That is the soft version, useful against something that does not read the switch yet, and it is soft because the agent holds the key and could skip its own check. Where money must be safe, put it behind a contract that reads the switch.</p>
        </Section>

        <Section id="addresses" title="Addresses">
          <p>Monad testnet, chain id 10143. Read any of them yourself.</p>
          <div className="drawn-box overflow-clip not-prose">
            {CONTRACTS.map(([name, addr, note], i) => (
              <div key={addr} className="grid sm:grid-cols-[150px_minmax(0,1fr)_auto] gap-x-4 gap-y-1 items-center px-4 sm:px-5 py-3.5"
                style={{ borderBottom: i < CONTRACTS.length - 1 ? "1px solid var(--hairline)" : undefined }}>
                <div className="text-[14px] font-semibold" style={{ color: "var(--text-dark)" }}>{name}</div>
                <div className="min-w-0">
                  <a href={`${EXPLORER}/address/${addr}`} target="_blank" rel="noreferrer"
                    className="mono text-[12px] break-all hover:underline" style={{ color: "var(--orange-text)" }}>{addr}</a>
                  {note && <div className="text-[12.5px] mt-0.5">{note}</div>}
                </div>
                <div className="justify-self-start sm:justify-self-end"><Copy text={addr} /></div>
              </div>
            ))}
          </div>
          <p>The live agent holds ERC-8004 token 1873 and published a pointer back to this switch under the metadata key <span className="mono">trustset</span>. Anyone who publishes the same pointer is linked automatically, with no permission from us.</p>
        </Section>

        <Section id="states" title="The four states">
          <div className="grid sm:grid-cols-2 gap-3 not-prose">
            {STATES.map(([name, tone, what]) => (
              <div key={name} className="sheet p-4 sm:p-5">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: TONE[tone] }} />
                  <span className="text-[15px] font-semibold" style={{ color: "var(--text-dark)" }}>{name}</span>
                </div>
                <p className="text-[13px] mt-2">{what}</p>
              </div>
            ))}
          </div>
          <p>Changing the owner is timelocked, so an owner sees a takeover coming before it lands. Guardians can never spend, and never stop an agent instantly.</p>
        </Section>

        <Section id="guardians" title="Guardians">
          <p>Only the owner can stop an agent, which leaves a hole: lose that wallet and a misbehaving agent has nobody left who can stop it. Guardians exist for that case and no other.</p>
          <ol className="grid gap-3 not-prose">
            {[
              ["They can pause", "Pause is reversible and cheap to hand out. If they were wrong, the owner resumes."],
              ["They cannot stop, at first", "Stopping is permanent. Two guardians with a grudge, or one stolen guardian key, must not be able to end an agent."],
              ["Unless the pause stands", "After the delay, any guardian may stop it. An owner who was there would have resumed or stopped it themselves, so the silence is the proof they are gone."],
            ].map(([k, v], i) => (
              <li key={k} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
                <span className="mono text-[11px] tabular pt-1" style={{ color: "var(--text-medium)" }}>{String(i + 1).padStart(2, "0")}</span>
                <span><b style={{ color: "var(--text-dark)" }}>{k}.</b> {v}</span>
              </li>
            ))}
          </ol>
          <p>Only a pause the guardians made can be escalated; an owner&apos;s own pause never can. On this testnet the delay is ten minutes so the path can be watched, and mainnet would use days. Guardians can also vote to move the owner to a new one, which takes a threshold plus a delay in which the current owner can refuse it.</p>
        </Section>

        <Section id="passkey" title="Passkey and refunds">
          <p><b style={{ color: "var(--text-dark)" }}>A passkey can pause an agent and nothing else.</b> The chain verifies the assertion itself through Monad&apos;s P256 precompile, so no server is trusted with it, and the device has to have verified a person rather than merely felt a touch. A nonce is spent on every use, so an assertion is good exactly once. <Link href="/passkey" className="underline" style={{ color: "var(--orange-text)" }}>Nominate one</Link>.</p>
          <p><b style={{ color: "var(--text-dark)" }}>The refund rail</b> holds an agent&apos;s payment in escrow. The service is paid when it shows a receipt the payer signed over the payment id and the rail&apos;s own address, so a receipt cannot be replayed. If the window closes without one, anyone may send the money home. It does not read x402 headers yet; today an agent calls the rail directly.</p>
        </Section>

        <Section id="limits" title="What it is not">
          <p><b style={{ color: "var(--text-dark)" }}>The limit worth knowing.</b> A switch only binds an agent that checks it, or a venue that checks it for them. It does not save you from an agent that has been taken over and rewritten, because a compromised agent holding a valid key passes every check perfectly.</p>
          <p>It is not a reputation score: it records facts, not rankings. Not a wallet: it plugs into the ones that exist. Not on the signing path: a bug here mislabels an agent, it never moves a coin. Not a network to trust: reading the switch is reading Monad.</p>
          <p>There is an operator registry in the repo where validators post a bond and co-sign facts with aggregated BLS signatures. It is built and tested and deliberately not part of the product, because reading the chain already answers the question for anyone on Monad. It matters the day a consumer on another chain needs the same answer without reading Monad, and not before.</p>
        </Section>

        <Section id="status" title="What is true today">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-5 sm:gap-6 not-prose">
            <Fact n="147" k="tests passing" />
            <Fact n="11" k="invariants" />
            <Fact n="128,000" k="fuzzed calls a run" />
            <Fact n="0" k="audits" />
          </div>
          <p>The invariants are the properties the product rests on: that revoked is terminal, that ownership moves through exactly two timelocked doors and no other, that nothing skips its delay, that guardians cannot pause below their threshold. Each was checked by deleting the guard it depends on from the contract and confirming the suite goes red. One was removed rather than kept, because the handler cannot forge a WebAuthn assertion and the property could never have failed.</p>
          <p>Proved on chain, not only in tests: a passkey nominated from a phone and used to pause the live agent, guardian recovery run from proposal through to execution, and an order signed before a stop honoured while one signed after it was refused.</p>
          <p><b style={{ color: "var(--text-dark)" }}>Deployed to Monad testnet, never to mainnet. Nothing here is audited by anyone but its author.</b></p>
          <div className="flex flex-wrap gap-2 pt-1 not-prose">
            <Link href="/demo" className="drawn-btn btn-orange" style={{ padding: "10px 18px", fontSize: "0.87rem" }}>Try it on testnet</Link>
            <Link href="/agents" className="drawn-btn btn-gold" style={{ padding: "10px 18px", fontSize: "0.87rem" }}>See your agents</Link>
          </div>
        </Section>
      </div>
    </div>
  );
}
