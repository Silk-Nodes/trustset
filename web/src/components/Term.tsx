"use client";
import Tip from "./Tip";

/* a word with its meaning attached.
 *
 * three words carry all the meaning on the agents page: agent address, owner
 * and register. everything that was confusing about the product came down to
 * one of them being read the wrong way. so each one is underlined, and
 * hovering or tapping it says exactly what it means, in the same words every
 * time. hover on a pointer, tap on a phone, focus on a keyboard.
 *
 * the card is rendered at the document root, positioned from the word's own
 * rectangle. drawn inside the word's parent it was clipped by any scrolling
 * container, the register dialog for one, and ran off the left of the page
 * when the word sat near an edge. it goes below the word when there is no
 * room above, and never leaves the viewport. */
export const TERMS = {
  "agent address": "The public address your agent signs from. After a stop, this is what every app that checks refuses. The agent keeps its own private key; trustset never sees it and never runs the agent.",
  "owner": "Your wallet. The only wallet that can pause or stop the agent, and it can never spend the agent's money. The contract calls it the revocation key.",
  "register": "Tell the switch which key belongs to which agent, so it can be stopped. Nothing is created. The agent lives wherever you run it.",
  "guardians": "Who stops the agent if you cannot. Wallets you chose that can pause it by vote. If you then do nothing for the delay, they can stop it. They can never spend and never stop it instantly.",
  "stop": "Permanent. From the next block, every app that checks the switch refuses this key. Nothing already mined is reversed.",
  /* on the explorer, where a reader is looking at somebody else's wallet and
     may wonder whether seeing it means something leaked. it did not: the
     contract returns it to anyone who asks. */
  "public keys": "Both are public addresses, not keys anyone can import. The contract returns them to anyone who asks, so the explorer reveals nothing new. Knowing the owner's address lets nobody act as it.",
  "on chain forever": "Registering is a public transaction. Anyone can then see that this wallet controls this agent, and read that wallet's own history. The switch needs the link to work, so use a wallet that does nothing else.",
} as const;
export type TermKey = keyof typeof TERMS;

/* the glossary on top of Tip: the same card, the word named in its eyebrow,
   the same sentence everywhere the word appears. */
export default function Term({ k, children, tip }: { k?: TermKey; children: React.ReactNode; tip?: string }) {
  return <Tip text={tip ?? (k ? TERMS[k] : "")} label={k} underline>{children}</Tip>;
}
