"use client";
import Tip from "./Tip";

/* a word with its meaning attached.
 *
 * three words carry all the meaning on the agents page: agent key, cold key
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
  "agent key": "The key the agent signs with. This is what gets refused after a stop. The agent already exists and already holds it; trustset never runs the agent.",
  "cold key": "Your wallet. The only key that can pause or stop the agent, and one that can never spend from it.",
  "register": "Tell the switch which key belongs to which agent, so it can be stopped. Nothing is created. The agent lives wherever you run it.",
  "guardians": "Who stops the agent if you cannot. Wallets you chose that can pause it by vote. If you then do nothing for the delay, they can stop it. They can never spend and never stop it instantly.",
  "stop": "Permanent. From the next block, every app that checks the switch refuses this key. Nothing already mined is reversed.",
  /* on the explorer, where a reader is looking at somebody else's wallet and
     may wonder whether seeing it means something leaked. it did not: the
     contract returns it to anyone who asks. */
  "public keys": "Both keys are public. The contract returns them to anyone who calls it, and the registration is a log, so this is not something the explorer reveals. Knowing a cold key lets nobody use it: it can only pause or stop that one agent, and can never spend.",
  "on chain forever": "Registering is a public transaction. Anyone can then see that this wallet controls this agent, and read that wallet's own history. The switch needs the link to work, so use a wallet that does nothing else.",
} as const;
export type TermKey = keyof typeof TERMS;

/* the glossary on top of Tip: the same card, the word named in its eyebrow,
   the same sentence everywhere the word appears. */
export default function Term({ k, children, tip }: { k?: TermKey; children: React.ReactNode; tip?: string }) {
  return <Tip text={tip ?? (k ? TERMS[k] : "")} label={k} underline>{children}</Tip>;
}
