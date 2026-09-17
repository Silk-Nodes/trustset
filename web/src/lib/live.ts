/* the numbers the landing page opens on. read from the chain the app points
   at, otherwise honest zeros labelled as such. one shape either way. */
export interface Live {
  source: "monad-testnet" | "anvil" | "none";
  chain: string;
  block: number;
  agents: number;
  revoked: number;
  refunds: number;
  asOf: string;
}
export const EMPTY: Live = { source: "none", chain: "Monad testnet", block: 0, agents: 0, revoked: 0, refunds: 0, asOf: "" };
