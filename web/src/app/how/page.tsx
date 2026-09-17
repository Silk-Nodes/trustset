import type { Metadata } from "next";
import Link from "next/link";
import Footer from "@/components/Footer";
import { Threats } from "@/components/landing/Sections";
export const metadata: Metadata = { title: "How it works" };

/* the one page of explanation. plain, short, no components. */
const S = ({ k, children }: { k: string; children: React.ReactNode }) => (
  <section className="grid sm:grid-cols-[170px_1fr] gap-2 sm:gap-8 py-7" style={{ borderTop: "1px solid var(--hairline)" }}>
    <div className="eyebrow pt-1">{k}</div>
    <div className="text-[15px] leading-relaxed text-ink/80 max-w-[62ch] flex flex-col gap-3">{children}</div>
  </section>
);

const A = ({ a }: { a: string }) => (
  <a className="mono text-[13px] underline break-all" href={`https://testnet.monadexplorer.com/address/${a}`} target="_blank" rel="noreferrer">{a}</a>
);

export default function How() {
  return (
    <>
      <main className="w-full max-w-6xl mx-auto px-3 sm:px-4 pt-6 sm:pt-10 pb-16 min-w-0">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-1">How it works</h1>
        <p className="text-sm text-ink/70 mb-8">Testnet, unaudited. Built by Silk Nodes for Monad Metropolis.</p>

        <S k="What it is">
          <p>AI agents hold wallets and act on their own. Trustset gives their owners an off switch: one transaction from a cold key, and every app that checks refuses the agent from the next block on. It is chain state, not a service. There is nobody to ask and nothing to keep running.</p>
        </S>
        <S k="Who is involved">
          <p><b>The agent</b> signs with a hot key. <b>The owner</b> holds a cold key that can only change the agent&apos;s status, never spend. <b>Apps</b> read the switch inside their own transaction. That is the whole cast.</p>
        </S>
        <S k="Four steps">
          <p><b>1. Register.</b> The agent key, the cold key, optional guardians with a threshold.</p>
          <p><b>2. Act.</b> Apps read <span className="mono">isTrusted(agentId)</span> in the same transaction they act in.</p>
          <p><b>3. Stop.</b> The cold key sets the status to revoked. Permanent, and the next block already refuses.</p>
          <p><b>4. Recover.</b> Register a successor and point the old id at it, so anyone who trusted the old agent can see where trust moved.</p>
        </S>
        <S k="Why Monad">
          <p>300 millisecond blocks and 600 millisecond finality, so a stop lands before an agent&apos;s next move. Reads are a view call, so checking costs an app nothing. And the P256 precompile makes the passkey work below possible on chain rather than in a service.</p>
        </S>
        <S k="Four states">
          <p><b>Active</b> is the default. Apps proceed. The owner can pause or revoke, guardians can vote to pause.</p>
          <p><b>Paused</b> is temporary. A guardian pause that stands untouched for the delay lets any guardian revoke.</p>
          <p><b>Revoked</b> is final. Apps refuse, and the history keeps the timestamp so old signatures are still judged fairly.</p>
          <p><b>Rotated</b> is final for that id and names a successor.</p>
          <p>Changing the cold key is time locked, so an owner sees a takeover attempt before it lands. Guardians can never spend and can never revoke instantly.</p>
        </S>
        <S k="Guardians">
          <p><b>Who stops an agent if the owner cannot?</b> The switch is built so that only the cold key can stop an agent. That has a hole: lose the key, or have it stolen by someone who then does nothing, and a misbehaving agent has nobody left who can stop it. Guardians exist for that case and nothing else.</p>
          <p><b>Three rules.</b> Guardians can pause, because pause is reversible and cheap to hand out; if they were wrong, the owner resumes. Guardians cannot stop instantly, because stop is permanent and two guardians with a grudge, or one stolen guardian key, must not be able to end an agent. And if a guardian pause stands untouched for three days, any guardian may stop it, because an owner who was present would have resumed or stopped it themselves; three days of silence is the proof they are gone. Only a pause that guardians made can be escalated: an owner&apos;s own pause never can. On this testnet the delay is ten minutes, so the path can be watched; mainnet would use days.</p>
          <p><b>In practice.</b> A team runs a trading agent. One person holds the cold key, two colleagues are guardians. The key holder disappears and the agent starts doing something wrong. The colleagues pause it within a minute. Three days later, still nobody, they stop it for good. Without guardians that agent runs until the money is gone. If it is only you and one agent, skip guardians; the registration step says so.</p>
          <p>The threshold is the owner&apos;s choice at registration, one to five guardians, any number of votes up to that. A vote round resets when a pause resolves. Guardians can never spend, never rotate, never change the cold key.</p>
        </S>
        <S k="For apps and wallets">
          <p>One line inside your own function: <span className="mono">if (!killSwitch.isTrusted(agentId)) revert AgentNotTrusted(agentId);</span></p>
          <p>Judging an old signature: <span className="mono">killSwitch.isTrustedAt(agentId, t)</span>, by timestamp, never by current state, because on Monad the latest block is still speculative for a moment.</p>
          <p>Owners: <span className="mono">register(agentKey, coldKey, guardians, threshold, agentSig)</span>, where <span className="mono">agentSig</span> is the agent key&apos;s signature over <span className="mono">registrationDigest(agentKey, coldKey)</span>, or the agent registers itself and signs nothing. Nobody can register a key that did not agree to it. Then <span className="mono">setStatus(id, Revoked, reason)</span>. Guardians: <span className="mono">guardianPause(id)</span>, and <span className="mono">guardianEscalate(id)</span> after the delay.</p>
        </S>
        <S k="For an agent checking itself">
          <p>The line above is the hard version: the app refuses, and the agent cannot skip it. An agent can also check before it signs, which is the soft version, useful for an agent talking to something that does not read the switch yet. In TypeScript:</p>
          <pre className="code-window">{`// before your agent signs anything
const ok = await killSwitch.isTrusted(agentId);
if (!ok) throw new Error("agent revoked");

// judging something the agent signed earlier
const wasOk = await killSwitch.isTrustedAt(agentId, signedAt);`}</pre>
          <p>Soft, because the agent holds the key and could skip its own check. Where the money must be safe, put it behind a contract that reads the switch, so the key holds permission and not funds.</p>
        </S>
        <S k="Human proof">
          <p>Touch answers a second question: was it a person, or another program? A passkey assertion is verified on chain from its own authenticator data with the P256 precompile. A session key cannot forge it, because the user-verified flag is set by the secure enclave rather than by software.</p>
          <p>On the agents page it sits on the one action where it matters. Stop an agent, then prove a human pressed Stop. The assertion is signed over that stop transaction&apos;s own hash, so the proof belongs to that stop and cannot be replayed onto another.</p>
        </S>
        <S k="Refunds">
          <p>An agent that paid for something and got nothing had no way to get the money back. The rail puts the payment in escrow first. The service is paid when it can show a receipt the payer signed, over the payment id and the rail&apos;s own address, so a receipt cannot be replayed. If the window closes without one, anyone may send the money home. Mechanical, with nobody to appeal to.</p>
          <p><span className="mono">pay(service, token, amount, window, requestHash)</span> from the agent. <span className="mono">settle(id, receiptHash, payerSig)</span> from the service, or <span className="mono">release(id, receiptHash)</span> from the payer. <span className="mono">refund(id)</span> from anyone once the deadline has passed. Native MON or any ERC20. No owner, no fee.</p>
          <p>What it does not do yet: read x402 headers. Today an agent calls the rail directly; wiring it behind a facilitator so an x402 request lands in escrow without the agent changing anything is the next step.</p>
        </S>
        <div className="py-2"><Threats /></div>
        <S k="What it is not">
          <p>Not a reputation score: it records facts, not rankings. Not a wallet: it plugs into the wallets and apps that exist. Not on the signing path: a bug here mislabels an agent, it never moves a coin. Not a network you have to trust: reading the switch is reading Monad.</p>
          <p>There is an attestation layer in the repo, an operator registry where validators post a bond and co-sign facts with aggregated BLS signatures. It is built and tested, and it is not part of the product, because reading the chain already answers the question for anyone on Monad. It becomes useful the day a consumer on another chain needs the same answer without reading Monad, and not before.</p>
        </S>
        <S k="Deployed addresses">
          <p>Monad testnet, chain id 10143. Verify any of these by reading them yourself.</p>
          <p><b>Kill switch</b> <A a="0x54D8211233Cc65b62C594cBAb900930dd37ED3b8" /></p>
          <p><b>Human touch</b> <A a="0x059563eb1dC1BBd7a8261309E92063A3f41AAda0" /></p>
          <p><b>Example counterparty</b> <A a="0x532cC6c80B4a55249131d3790dF8B79D896Ba145" /></p>
          <p><b>Agent labels</b> <A a="0x1fc5CF0a5bD938cc36EcE4ca34F2279e0e5b5f0f" /></p>
          <p><b>Refund rail</b> <A a="0xf8E44F08263fFB04660483Af44b70E1b25347748" /></p>
          <p><b>Mock dollar</b> <A a="0x8f3B4042ce030A7c3C6c1B507ba83Da7e2e2B24D" />, six decimals, mintable by anyone, for trying the rail on a testnet with no stable to hand.</p>
          <p><b>ERC-8004 identity registry</b> <A a="0x8004A818BFB912233c491871b3d84c89A494BD9e" />, the canonical testnet deployment, which we did not deploy and do not control. The live agent holds token 1873 there, and its owner published a pointer back to this switch under the metadata key <span className="mono">trustset</span>. The identity says who an agent is; the switch says whether it may act. Anyone who publishes the same pointer is linked here automatically, with no permission from us.</p>
          <p>Labels are the owner&apos;s words about an agent, a name and what it is for, written by the cold key and read with one view call. Nothing that decides trust reads them. They are stored rather than emitted because Monad caps log queries at a hundred blocks, and a label that needs an indexer to find is a label that needs a service.</p>
          <p>Four agents are registered there already, ids 1 to 4, each with its own key&apos;s signed consent. The agents page only lists agents whose cold key is the wallet you connect, so a fresh wallet starts empty and can register its own.</p>
        </S>
        <S k="What is true today">
          <p>The kill switch, the human proof, the labels and the refund rail are built, audited once by their author (see AUDIT.md in the repo) and tested: 139 unit and fuzz tests, real WebAuthn and BLS vectors verified against Monad&apos;s own precompiles, a fork test against the mainnet staking precompile.</p>
          <p>The passkey ceremony has been run end to end on Monad testnet with a real Touch ID: passkey registered on chain, a stop made, the assertion signed over that stop&apos;s own transaction hash, and the origin read back as human. The contract half is proven against generated assertions; the browser half is proven with a finger on a sensor.</p>
          <p>Deployed to Monad testnet, not to mainnet. Nothing is audited.</p>
          <p><Link href="/agents" className="underline">See your agents</Link></p>
        </S>
      </main>
      <Footer />
    </>
  );
}
