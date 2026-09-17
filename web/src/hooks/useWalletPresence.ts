"use client";
import { useEffect, useState } from "react";
import { hasWallet } from "@/lib/chain";

/* is there an injected wallet in this browser?
 *
 * this cannot be answered once at mount. an extension injects window.ethereum
 * from a content script, which can land after react has already rendered, and
 * a single check at mount left the connect button permanently disabled for
 * anyone whose wallet was a few hundred milliseconds late. so: check now,
 * listen for the announcement, and keep looking for a short while. */
export function useWalletPresence() {
  const [present, setPresent] = useState(false);
  useEffect(() => {
    let alive = true;
    const check = () => { if (alive && hasWallet()) { setPresent(true); return true; } return false; };
    if (check()) return;
    /* EIP-6963 is how modern wallets announce themselves, and the older
       ethereum#initialized event is what the rest still fire. */
    const onAnnounce = () => check();
    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.addEventListener("ethereum#initialized", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    const t = setInterval(() => { if (check()) clearInterval(t); }, 250);
    const stop = setTimeout(() => clearInterval(t), 4000);
    return () => {
      alive = false; clearInterval(t); clearTimeout(stop);
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
      window.removeEventListener("ethereum#initialized", onAnnounce);
    };
  }, []);
  return present;
}
