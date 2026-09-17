import type { Cfg } from "@/lib/chain";

/* a transaction, as a link to where anyone can check it. every notice about
   something the reader sent carries one, because the product's whole claim
   is that this is chain state and not our word for it. */
export const txUrl = (cfg: Cfg | undefined, hash: string) => cfg?.explorer ? `${cfg.explorer}/tx/${hash}` : null;
export const addrUrl = (cfg: Cfg | undefined, addr: string) => cfg?.explorer ? `${cfg.explorer}/address/${addr}` : null;

export default function TxLink({ cfg, hash, label = "View transaction" }: { cfg?: Cfg; hash?: string | null; label?: string }) {
  if (!hash) return null;
  const url = txUrl(cfg, hash);
  if (!url) return <span className="mono">{hash.slice(0, 10)}…</span>;
  return <a href={url} target="_blank" rel="noreferrer" className="underline whitespace-nowrap" style={{ color: "var(--orange-text)" }}>{label}</a>;
}
