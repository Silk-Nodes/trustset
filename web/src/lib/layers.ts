import { type Agent, expired, lapsed, trusted } from "@/lib/chain";

/* what a module says about an agent, worked out in one place.
 *
 * the console used to show a status word and a control. everything else the
 * product does for an agent was behind a "+" in a side panel, and nothing on
 * the page said whether the agent was alive. these are the derivations that
 * fix that: the eight layers as set or not set, the nearest clock, the last
 * thing that happened, and which way the switch is thrown. pure functions on
 * data the page already has, so they can be checked without a browser. */

export type PulseEvent = { kind: string; at: number; actor?: string | null; data?: Record<string, unknown> };

export type LayerKey = "switch" | "panic" | "guardians" | "limits" | "past" | "identity" | "human" | "refunds";
export type Layer = { key: LayerKey; name: string; set: boolean; value: string };

/* reads the module needs beyond the agent record itself */
export type Extra = { stopKey?: boolean; humanCount?: number; refunds?: number; erc8004?: number | null };

export function span(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d) return h ? `${d}d ${h}h` : `${d}d`;
  if (h) return m ? `${h}h ${m}m` : `${h}h`;
  if (m) return `${m}m`;
  return `${s}s`;
}

/* the liveness word, capitalised for a header. mirrors isTrusted. */
export function livenessWord(a: Agent, now = Date.now() / 1000): string {
  if (a.status === "revoked") return "Stopped for good";
  if (a.status === "rotated") return "Rotated";
  if (a.status === "paused") return "Paused";
  if (a.status === "active" && expired(a, now)) return "Expired";
  if (a.status === "active" && lapsed(a, now)) return "Gone quiet";
  if (trusted(a, now)) return "Trusted";
  return "Not trusted";
}

export function layersOf(a: Agent, x: Extra, now = Date.now() / 1000): Layer[] {
  const ends = a.expiresAt > 0, beats = a.heartbeatWindow > 0;
  const limits = !ends && !beats ? "none set"
    : [
      ends ? (a.expiresAt > now ? `ends in ${span(a.expiresAt - now)}` : `end date passed ${span(now - a.expiresAt)} ago`) : null,
      beats ? (a.lastBeat + a.heartbeatWindow > now ? `beat every ${span(a.heartbeatWindow)}` : `gone quiet ${span(now - a.lastBeat - a.heartbeatWindow)} ago`) : null,
    ].filter(Boolean).join(" · ");
  const label = a.label?.name;
  const identity = label && x.erc8004 ? `"${label}" · 8004 #${x.erc8004}`
    : label ? `named "${label}"` : x.erc8004 ? `ERC-8004 #${x.erc8004}` : "unnamed"
  const human = x.humanCount ?? 0, refunds = x.refunds ?? 0;
  return [
    { key: "switch", name: "The switch", set: true, value: livenessWord(a, now).toLowerCase() },
    { key: "panic", name: "Panic button", set: !!x.stopKey, value: x.stopKey ? "passkey nominated" : "no passkey" },
    { key: "guardians", name: "Guardians", set: a.guardians.length > 0, value: a.guardians.length ? `${a.threshold} of ${a.guardians.length} to pause` : "none" },
    { key: "limits", name: "Limits", set: ends || beats, value: limits },
    { key: "past", name: "Past signatures", set: true, value: a.history.length > 1 ? `${a.history.length} on record` : "since registration" },
    { key: "identity", name: "Identity", set: !!label || !!x.erc8004, value: identity },
    { key: "human", name: "Human proof", set: human > 0, value: human ? `${human} attested` : "none yet" },
    { key: "refunds", name: "Refunds", set: refunds > 0, value: refunds ? `${refunds} through the rail` : "none yet" },
  ];
}

/* the nearest thing that will happen without anybody sending a transaction.
   the soonest one still ahead; failing that, the most recent one behind, so
   an expired agent says how long ago rather than saying nothing. */
export type Clock = { key: "end" | "beat" | "key"; at: number; text: string };
export function nextClock(a: Agent, now = Date.now() / 1000): Clock | null {
  const cs: Clock[] = [];
  if (a.expiresAt > 0) cs.push({ key: "end", at: a.expiresAt, text: a.expiresAt > now ? `end date in ${span(a.expiresAt - now)}` : `end date passed ${span(now - a.expiresAt)} ago` });
  if (a.heartbeatWindow > 0) { const due = a.lastBeat + a.heartbeatWindow; cs.push({ key: "beat", at: due, text: due > now ? `beat due in ${span(due - now)}` : `missed its beat ${span(now - due)} ago` }); }
  if (a.pendingColdKey && a.coldKeyChangeAt) cs.push({ key: "key", at: a.coldKeyChangeAt, text: a.coldKeyChangeAt > now ? `key change applies in ${span(a.coldKeyChangeAt - now)}` : "key change ready to apply" });
  if (!cs.length) return null;
  const ahead = cs.filter(c => c.at > now).sort((p, q) => p.at - q.at);
  if (ahead.length) return ahead[0];
  return cs.sort((p, q) => q.at - p.at)[0];
}

const VERB: Record<string, string> = {
  TradeAccepted: "traded", Beat: "said it is alive", GuardianVoted: "a guardian voted", LimitsSet: "limits set",
  Labelled: "named", Linked8004: "claimed by ERC-8004", AgentRegistered: "registered",
  RevocationKeyChangeProposed: "key change proposed", RevocationKeyChanged: "cold key changed", Rotated: "rotated",
};
export function lastActivity(events: PulseEvent[], a: Agent): { text: string; at: number } {
  const e = events[0];
  if (!e) return { text: "registered", at: a.since };
  if (e.kind === "StatusChanged") {
    const s = String(e.data?.status ?? "");
    return { at: e.at, text: s === "paused" ? "paused" : s === "active" ? "brought back" : s === "revoked" ? "stopped for good" : s === "rotated" ? "rotated" : "status changed" };
  }
  return { at: e.at, text: VERB[e.kind] ?? e.kind };
}

/* which way the switch is thrown, and by whom. a breaker is on, off, or
   tripped; here tripped means a guardian threw it, which the cold key can
   undo and a guardian cannot. ended is the one position with no way back. */
export type SwitchState = "on" | "off" | "tripped" | "ended";
export function switchState(a: Agent, events: PulseEvent[]): SwitchState {
  if (a.status === "revoked" || a.status === "rotated") return "ended";
  if (a.status !== "paused") return "on";
  const last = events.find(e => e.kind === "StatusChanged" && String(e.data?.status ?? "") === "paused");
  const byGuardian = !!last?.actor && last.actor.toLowerCase() !== a.coldKey.toLowerCase();
  return byGuardian ? "tripped" : "off";
}
