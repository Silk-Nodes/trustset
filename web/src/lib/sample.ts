import { ethers } from "ethers";
import type { Agent, Guarded } from "@/lib/chain";
import type { Extra, PulseEvent } from "@/lib/layers";

/* the fleet a visitor sees before connecting anything.
 *
 * the console used to answer a visitor with an empty card and the word
 * connect, which shows nothing about what the product does and is the worst
 * screen on the site to land on. this is the same console, drawn from a
 * written-out fleet instead of the chain: eight agents chosen so that every
 * state and most of the eight layers appear at least once, and so the count
 * strip, the filters, the groups and an agent's own page all have something
 * real to work on.
 *
 * it is a sample and the page says so. nothing here can sign, the addresses
 * are derived from their own names and belong to nobody, and the ids sit in
 * their own range so a sample agent can never be confused for a registered
 * one. */
const addr = (seed: string) => ethers.getAddress("0x" + ethers.id("trustset:sample:" + seed).slice(26));
const MIN = 60, HOUR = 3600, DAY = 86400;
/* read off the deployed KillSwitch: guardianEscalationDelay is 600 seconds.
   it is immutable, so this is true until a new switch is deployed. */
const ESCALATION_DELAY = 600;

/* the guardian set most of these share, so the sample reads as one operator */
const GUARDIANS = [addr("guardian:ops"), addr("guardian:risk"), addr("guardian:founder")];

type Spec = {
  n: number; name: string; purpose: string; group: string;
  status: Agent["status"];
  /* seconds from now. negative is the past. */
  since: number; expiresAt?: number; heartbeatWindow?: number; lastBeat?: number;
  guardians?: string[]; threshold?: number;
  extra: Extra;
  /* how the last day looked: trades per hour, and whether it beats */
  trades?: number; beats?: boolean;
  history?: { at: number; status: Agent["status"] }[];
};

const SPECS: Spec[] = [
  {
    n: 1, name: "usd-market-maker", purpose: "Quotes both sides of the USDC book", group: "trading",
    status: "active", since: -18 * DAY, expiresAt: 6 * DAY, heartbeatWindow: HOUR, lastBeat: -4 * MIN,
    guardians: GUARDIANS, threshold: 2, trades: 3,
    extra: { stopKey: true, humanCount: 2, refunds: 14, erc8004: 412 },
  },
  {
    n: 2, name: "eth-basis", purpose: "Carries the perp basis on ETH", group: "trading",
    status: "active", since: -11 * DAY, heartbeatWindow: 6 * HOUR, lastBeat: -41 * MIN,
    guardians: GUARDIANS, threshold: 2, trades: 2,
    extra: { stopKey: false, humanCount: 2, refunds: 0, erc8004: null },
  },
  {
    n: 3, name: "arb-scout", purpose: "Watches two venues for a spread worth taking", group: "trading",
    status: "active", since: -26 * DAY, expiresAt: -2 * HOUR, trades: 1,
    guardians: GUARDIANS, threshold: 2,
    extra: { stopKey: true, humanCount: 2, refunds: 0, erc8004: null },
  },
  {
    n: 4, name: "index-rebalancer", purpose: "Holds the index to its weights once a day", group: "trading",
    status: "active", since: -34 * DAY, heartbeatWindow: HOUR, lastBeat: -5 * HOUR,
    guardians: GUARDIANS, threshold: 2,
    extra: { stopKey: true, humanCount: 2, refunds: 3, erc8004: null },
  },
  {
    n: 5, name: "treasury-ops", purpose: "Moves the treasury between vaults on a schedule", group: "ops",
    status: "paused", since: -3 * HOUR, expiresAt: 21 * DAY, heartbeatWindow: 6 * HOUR, lastBeat: -3 * HOUR,
    guardians: GUARDIANS, threshold: 2,
    extra: { stopKey: true, humanCount: 2, refunds: 0, erc8004: 88 },
    /* paused by a guardian, not by the owner: the switch shows TRIPPED */
    history: [{ at: -3 * HOUR, status: "paused" }],
  },
  {
    n: 6, name: "payments-relay", purpose: "Pays per call through the refund rail", group: "ops",
    status: "active", since: -7 * DAY, expiresAt: 58 * DAY, heartbeatWindow: DAY, lastBeat: -2 * HOUR,
    guardians: GUARDIANS, threshold: 2, beats: true,
    extra: { stopKey: true, humanCount: 2, refunds: 221, erc8004: 175 },
  },
  {
    n: 7, name: "research-crawler", purpose: "Reads filings and writes a summary", group: "research",
    status: "active", since: -2 * DAY,
    extra: { stopKey: false, humanCount: 2, refunds: 0, erc8004: null },
  },
  {
    n: 8, name: "nft-sweeper", purpose: "Swept floors until it was stopped", group: "research",
    status: "revoked", since: -9 * DAY, expiresAt: -4 * DAY,
    guardians: GUARDIANS, threshold: 2,
    extra: { stopKey: true, humanCount: 2, refunds: 0, erc8004: null },
    history: [{ at: -9 * DAY, status: "revoked" }],
  },
];

/* ids well above anything the testnet registry will reach for a long while,
   and never rendered as a link to a chain that does not hold them. */
export const SAMPLE_BASE = 900001;
export const isSample = (id: bigint) => id >= BigInt(SAMPLE_BASE);

export function sampleAgents(now: number): Agent[] {
  return SPECS.map(s => {
    const since = now + s.since;
    const history: Agent["history"] = [{ at: since, status: "active" }];
    for (const h of s.history ?? []) history.push({ at: now + h.at, status: h.status });
    return {
      id: BigInt(SAMPLE_BASE + s.n),
      key: addr("agent:" + s.name),
      coldKey: addr("cold"),
      guardians: s.guardians ?? [],
      threshold: s.threshold ?? 0,
      status: s.status,
      since: s.history?.length ? now + s.history[s.history.length - 1].at : since,
      successor: 0n,
      history,
      label: { name: s.name, purpose: s.purpose, by: addr("cold"), at: since },
      expiresAt: s.expiresAt === undefined ? 0 : now + s.expiresAt,
      heartbeatWindow: s.heartbeatWindow ?? 0,
      lastBeat: s.lastBeat === undefined ? 0 : now + s.lastBeat,
    };
  });
}

export function sampleExtras(): Record<string, Extra> {
  return Object.fromEntries(SPECS.map(s => [String(SAMPLE_BASE + s.n), s.extra]));
}

export function sampleGroups(): Record<string, string> {
  return Object.fromEntries(SPECS.map(s => [String(SAMPLE_BASE + s.n), s.group]));
}

/* a day of events per agent, so the pulse is a line and not a blank rule.
   spaced by a fixed stride rather than at random, because a sample that
   reshuffles itself every second is a distraction, not a demonstration. */
export function samplePulses(now: number): Record<string, { events: PulseEvent[]; indexed: boolean | null }> {
  const out: Record<string, { events: PulseEvent[]; indexed: boolean | null }> = {};
  for (const s of SPECS) {
    const id = String(SAMPLE_BASE + s.n);
    const events: PulseEvent[] = [];
    const stopped = s.status === "revoked" || s.status === "rotated";
    const ends = s.expiresAt !== undefined && s.expiresAt < 0;
    /* a stopped or lapsed agent goes quiet part way through the day, which is
       the whole point of the picture */
    const until = stopped || ends ? (s.expiresAt ?? -4 * DAY) : 0;
    if (s.trades) {
      const stride = Math.floor(HOUR / s.trades);
      for (let t = -DAY; t < Math.min(0, until || 0); t += stride) events.push({ kind: "TradeAccepted", at: now + t });
    }
    if (s.heartbeatWindow && !stopped) {
      for (let t = -DAY; t < (s.lastBeat ?? 0); t += s.heartbeatWindow) events.push({ kind: "Beat", at: now + t });
      if (s.lastBeat !== undefined) events.push({ kind: "Beat", at: now + s.lastBeat });
    }
    for (const h of s.history ?? []) events.push({ kind: "StatusChanged", at: now + h.at, actor: h.status === "paused" ? GUARDIANS[0] : addr("cold"), data: { status: h.status } });
    events.sort((a, b) => b.at - a.at);
    out[id] = { events, indexed: true };
  }
  return out;
}

/* ten agents somebody else owns and this wallet was named to guard.
 *
 * ten rather than two because the guarding tab has more branches than any
 * other screen: a vote not yet cast, a vote already in, an agent whose end
 * date passed, one that went quiet, a pause that can be escalated and one
 * that cannot yet, and two that are already over. every one of those appears
 * below, so the page shows a guardian the whole job rather than a short list
 * and a lot of empty room. */
type GSpec = {
  n: number; name: string; status: Agent["status"]; since: number;
  votes: number; voted: boolean;
  expiresAt?: number; heartbeatWindow?: number; lastBeat?: number;
};
const GUARDED: GSpec[] = [
  { n: 1, name: "counterparty-bot", status: "active", since: -12 * DAY, votes: 1, voted: false },
  { n: 2, name: "settlement-agent", status: "active", since: -5 * DAY, votes: 0, voted: false },
  { n: 3, name: "liquidator", status: "active", since: -21 * DAY, votes: 1, voted: true },
  { n: 4, name: "oracle-poster", status: "active", since: -30 * DAY, votes: 0, voted: false, expiresAt: -6 * HOUR },
  { n: 5, name: "bridge-watcher", status: "active", since: -16 * DAY, votes: 1, voted: false, heartbeatWindow: HOUR, lastBeat: -9 * HOUR },
  /* the wait is not a field: the contract computes it as statusSince plus the
     escalation delay, so these are paused at times that put one past the
     delay and two still inside it. */
  { n: 6, name: "vault-keeper", status: "paused", since: -3 * DAY, votes: 2, voted: true },
  { n: 7, name: "yield-router", status: "paused", since: -4 * MIN, votes: 2, voted: true },
  { n: 8, name: "collateral-bot", status: "paused", since: -90, votes: 2, voted: false },
  { n: 9, name: "airdrop-claimer", status: "revoked", since: -2 * DAY, votes: 2, voted: true },
  { n: 10, name: "legacy-mm", status: "rotated", since: -8 * DAY, votes: 0, voted: false },
];

export function sampleGuarded(now: number): Guarded[] {
  return GUARDED.map(g => ({
    id: BigInt(SAMPLE_BASE + 50 + g.n),
    key: addr("guarded:" + g.name),
    coldKey: addr("other-owner:" + g.name),
    guardians: GUARDIANS, threshold: 2,
    status: g.status, since: now + g.since, successor: 0n,
    history: [{ at: now + g.since, status: g.status }],
    label: { name: g.name, purpose: "", by: addr("other-owner:" + g.name), at: now + g.since },
    expiresAt: g.expiresAt === undefined ? 0 : now + g.expiresAt,
    heartbeatWindow: g.heartbeatWindow ?? 0,
    lastBeat: g.lastBeat === undefined ? 0 : now + g.lastBeat,
    votes: g.votes, voted: g.voted,
    /* exactly as the chain derives it: statusSince + guardianEscalationDelay */
    escalateAt: g.status === "paused" ? now + g.since + ESCALATION_DELAY : 0,
    delay: ESCALATION_DELAY,
  }));
}
