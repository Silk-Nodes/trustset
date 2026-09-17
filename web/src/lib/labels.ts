"use client";

/* what the owner says an agent is.
 *
 * the chain knows an agent as a key, a cold key, guardians and a status, and
 * nothing more. trustset cannot see what an agent does. so a name and a
 * purpose are the owner's own words, and until they live on chain they live
 * here, in this browser, keyed by chain and agent id. the console says so
 * where it shows them rather than passing them off as chain data.
 *
 * the id is only known after the registration is mined, so a label is first
 * parked against the agent key and moved onto the id once the agent shows up
 * in the owner's list. */
export type Label = { name: string; purpose?: string };

const KEY = "trustset:labels:v1";
const PENDING = "trustset:labels:pending:v1";

type Store = Record<string, Label>;

const read = (k: string): Store => {
  try { return JSON.parse(localStorage.getItem(k) ?? "{}") as Store; } catch { return {}; }
};
const write = (k: string, s: Store) => { try { localStorage.setItem(k, JSON.stringify(s)); } catch { /* private mode, blocked storage: the label is simply not kept */ } };

const idKey = (chain: string, id: bigint) => `${chain}:${id.toString()}`;

export function getLabel(chain: string, id: bigint): Label | null {
  return read(KEY)[idKey(chain, id)] ?? null;
}

export function setLabel(chain: string, id: bigint, label: Label) {
  const s = read(KEY); s[idKey(chain, id)] = label; write(KEY, s);
}

export function parkLabel(chain: string, agentKey: string, label: Label) {
  const s = read(PENDING); s[`${chain}:${agentKey.toLowerCase()}`] = label; write(PENDING, s);
}

/* move any parked label onto the id of the agent that now carries that key. */
export function adoptParked(chain: string, agents: { id: bigint; key: string }[]) {
  const p = read(PENDING); let moved = false;
  for (const a of agents) {
    const k = `${chain}:${a.key.toLowerCase()}`;
    if (p[k]) { setLabel(chain, a.id, p[k]); delete p[k]; moved = true; }
  }
  if (moved) write(PENDING, p);
}

/* what to print for an agent with no label: the truth, which is its id. */
export const fallbackName = (id: bigint) => `Agent ${id.toString()}`;
