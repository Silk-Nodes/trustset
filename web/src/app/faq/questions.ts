/* the questions, once.
 *
 * the page renders these and the FAQPage json-ld is generated from the same
 * array, so the answer a crawler lifts and the answer a reader sees cannot
 * drift apart. that is the only reason the answers are plain strings: schema
 * wants text, and a second hand-kept copy of twenty answers would be wrong
 * within a month.
 *
 * every number here was read off the deployed contract rather than typed from
 * memory. the delays are immutable, so they are true until the day a new
 * switch is deployed, and on that day this file is part of the change. */

export type Q = {
  id: string;
  q: string;
  /* plain text, because the schema carries this verbatim */
  a: string;
  /* an optional line to show under the answer, not part of the schema text */
  code?: string;
};
export type Group = { id: string; title: string; questions: Q[] };

export const GROUPS: Group[] = [
  {
    id: "what",
    title: "What it is",
    questions: [
      {
        id: "what-is-trustset",
        q: "What is trustset?",
        a: "An off switch for AI agents, on chain. Your agent signs with its own key; trustset makes your wallet its owner, the one wallet that can stop it, and gives every app it talks to one call to check before acting. Eight primitives, each an immutable contract with no admin.",
      },
      {
        id: "what-happens-on-stop",
        q: "What actually happens when I press stop?",
        a: "One transaction from your wallet writes a new status into the KillSwitch contract. From the next block, isTrusted(agentId) returns false to everyone who asks. Pausing is reversible, stopping for good is not.",
      },
      {
        id: "how-fast",
        q: "How fast is it?",
        a: "Next block. There is no queue of ours, no webhook and no propagation: the status is a storage slot on Monad, so the moment your transaction is in a block, every reader sees it.",
      },
      {
        id: "eight-layers",
        q: "What are the eight layers?",
        a: "The switch, a passkey panic button, guardians, time limits, past signatures, identity, human proof, and refunds. You can use one and ignore the rest. They are separate contracts, not a bundle you opt into.",
      },
    ],
  },
  {
    id: "using",
    title: "Using it",
    questions: [
      {
        id: "permission",
        q: "Do I need permission, or an account?",
        a: "No. There is no sign-up, no allowlist, no tiers and no fee beyond gas. trustset has no user table; your wallet is your identity. Anyone can register an agent and gets all eight layers immediately.",
      },
      {
        id: "no-wallet",
        q: "Do I need a crypto wallet?",
        a: "No. On the console you can sign in with an email instead. Dynamic sends you a code and makes an embedded wallet for you on your first sign-in, and that wallet becomes the owner for your agents: it registers them, pauses them and stops them, exactly as a browser wallet would. A new email wallet gets a small, one-time amount of testnet gas so your first registration goes through.",
      },
      {
        id: "register-my-agent",
        q: "Could someone register my agent without me?",
        a: "No. Registration requires the agent's own consent: either it sends the transaction, or it signs a message naming the exact owner. Without that signature the contract reverts with BadAgentSignature. That signature names which owner, so it cannot be replayed to put your agent under somebody else's wallet.",
      },
      {
        id: "change-my-code",
        q: "Do I have to change my agent's code?",
        a: "To register, no. trustset never runs your agent and never holds its key. To get the full benefit your agent, or the venue it trades on, should call isTrusted before acting, which is one function call.",
      },
      {
        id: "cold-key",
        q: "Who owns an agent, and why can the owner not spend?",
        a: "The owner is the wallet you register with (the contract calls it the revocation key), and it is the only wallet that can pause, stop or rotate the agent. It has no power to move the agent's money, because the contract gives it none. That is the point: you can keep it somewhere inconvenient and safe.",
      },
      {
        id: "lost-cold-key",
        q: "What if I lose the owner wallet?",
        a: "If you named guardians, they can vote to pause the agent, and if you do nothing for the escalation delay they can stop it for good. They can also replace the owner after a delay you are able to cancel. If you registered with no guardians, nobody can stop that agent, which is why the register dialog calls that choice permanent.",
      },
      {
        id: "sealed-runbook",
        q: "What is a sealed runbook?",
        a: "Notes about an agent that only its owner can read: where it runs, how to restart it, why it was stopped. Your passkey derives an encryption key in your browser through Mera, using the WebAuthn PRF extension, with a fresh salt for every note. Only the ciphertext is stored on chain. Any device your passkey syncs to can recreate the key and open the note, with no wallet and nothing stored anywhere. Nobody else can, including us.",
      },
      {
        id: "registered-elsewhere",
        q: "My agent was registered by a script or another tool. Will trustset see it?",
        a: "Yes. Agents are found by their address and their owner, not by anything stored in our app. If it is already registered, the register dialog tells you which agent id it is. If your wallet is its owner, it simply appears in your fleet with no registration step at all.",
      },
    ],
  },
  {
    id: "control",
    title: "Who controls it",
    questions: [
      {
        id: "turn-it-off",
        q: "Who can turn trustset off?",
        a: "Nobody, including us. The contracts have no admin: there is no owner address in the source, no proxy, no initialize, no delegatecall and no selfdestruct. There is no key anybody could subpoena and no switch we could flip.",
      },
      {
        id: "upgradeable",
        q: "Can you change the contract?",
        a: "No. It is immutable, which means the deployed bytecode is fixed. The three delays are immutable variables set once at deployment and baked into the code: a 24 hour owner change, and 10 minutes each for guardian escalation and guardian recovery. We cannot change a line of it or one of those numbers.",
      },
      {
        id: "bug",
        q: "Then what happens if you find a bug?",
        a: "We deploy a new contract beside the old one. Existing agents keep working in the old one and stay stoppable; new agents register in the new one; apps move when they choose by changing one address. The cost is honest: agents do not carry over, and anyone who linked an ERC-8004 identity republishes their pointer. That is the price of nobody being able to change the rules under you.",
      },
      {
        id: "live-agent-key",
        q: "Who holds the live agent's key?",
        a: "Not our server alone. The agent on /demo signs every trade through a Dynamic 2-of-2 MPC server wallet: the key is split between Dynamic and us, and neither half can sign by itself. Our half is backed up to Dynamic encrypted under a password only our server knows. It still asks the switch before every action, so it stops the moment its owner, which it never touches, says so.",
      },
      {
        id: "custody",
        q: "Do you hold my money, or sit in the path?",
        a: "No server of ours is in any path. Only the refund rail holds funds, it is an escrow, and it only ever moves money back to the payer named in storage. The KillSwitch holds no funds at all, so a bug there produces a wrong status, never a lost coin.",
      },
    ],
  },
  {
    id: "limits",
    title: "The limits",
    questions: [
      {
        id: "not-protected",
        q: "What does a stop not protect me from?",
        a: "An agent that has been taken over and rewritten. A compromised agent holding a valid key passes every check perfectly, and stopping it does not recover what the key has already sent. trustset ends an agent's authority going forward; it does not undo the past.",
      },
      {
        id: "venue-never-checks",
        q: "What if the venue never checks?",
        a: "Then nothing changes for that venue. A switch only binds an agent that checks it, or an app that checks on its behalf. This is the real limit of the design, and it is why the SDK is one line.",
      },
      {
        id: "audited",
        q: "Is it audited?",
        a: "Not by a third party. It has 147 tests and eleven invariants asserted across 128,000 fuzzed calls per run, and every invariant was verified by deleting the guard it depends on and confirming the suite goes red. That is real work and it is not the same thing as an audit.",
      },
      {
        id: "mainnet",
        q: "Is this on mainnet?",
        a: "No. Monad testnet only. Nothing here is holding real money.",
      },
    ],
  },
  {
    id: "integrating",
    title: "Integrating",
    questions: [
      {
        id: "how-to-check",
        q: "How does my app check an agent?",
        a: "One call to isTrusted(agentId) against the switch at 0x54D8211233Cc65b62C594cBAb900930dd37ED3b8, or the SDK with npm i @trustset/check. There is nothing to register with us and no key to obtain.",
        code: "npx @trustset/check 24",
      },
      {
        id: "erc8004",
        q: "Does it work with ERC-8004?",
        a: "Yes, in the direction that is safe. The identity's owner publishes a pointer at their trustset agent, and then the SDK resolves it. We read the registry and never write to it, because if trustset could claim an identity then anyone could claim any identity.",
        code: "npx @trustset/check --erc8004 41",
      },
      {
        id: "cost",
        q: "What does it cost?",
        a: "Gas, and nothing else. There is no fee, no token and no subscription. Reading the switch is a view call, so checking an agent costs a caller nothing at all.",
      },
    ],
  },
];

export const ALL: Q[] = GROUPS.flatMap(g => g.questions);

/* the schema google and the ai crawlers read, built from the array above so
   it can never describe a page that does not exist. */
export const faqJsonLd = () => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: ALL.map(q => ({
    "@type": "Question",
    name: q.q,
    acceptedAnswer: { "@type": "Answer", text: q.a },
  })),
});
