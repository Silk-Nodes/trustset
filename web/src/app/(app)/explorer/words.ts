/* how an event reads to a person.
 *
 * the index stores what the log said. this turns it into the sentence somebody
 * would use out loud, because "StatusChanged status=revoked" is a fact and
 * "stopped for good" is what happened. */
export type Ev = {
  id: number; block: number; tx_hash: string; at: string; kind: string;
  agent_id: number | null; actor: string | null; data: Record<string, unknown>;
  name?: string | null; agent_key?: string | null; cold_key?: string | null;
};

export type Tone = "live" | "off" | "quiet" | "plain";

export function say(e: Ev): { text: string; tone: Tone } {
  const d = e.data ?? {};
  switch (e.kind) {
    case "AgentRegistered":
      return { text: "Registered on trustset", tone: "live" };
    case "StatusChanged": {
      const s = String(d.status ?? "");
      if (s === "active") return { text: "Back to active", tone: "live" };
      if (s === "paused") return { text: "Paused", tone: "off" };
      if (s === "revoked") return { text: "Stopped for good", tone: "off" };
      if (s === "rotated") return { text: "Retired to a successor", tone: "quiet" };
      return { text: s || "Status changed", tone: "plain" };
    }
    case "Rotated": return { text: `Trust moved to agent ${d.successorId}`, tone: "quiet" };
    case "RevocationKeyChangeProposed": return { text: "Cold key change proposed", tone: "plain" };
    case "RevocationKeyChanged": return { text: "Cold key changed", tone: "plain" };
    case "GuardianVoted": {
      const v = Number(d.votes ?? 0), t = Number(d.threshold ?? 0);
      return { text: v >= t ? `Guardians reached ${v} of ${t} and paused it` : `A guardian voted to pause, ${v} of ${t}`, tone: v >= t ? "off" : "plain" };
    }
    case "LimitsSet": {
      const ex = Number(d.expiresAt ?? 0), hb = Number(d.heartbeatWindow ?? 0);
      if (!ex && !hb) return { text: "Limits cleared", tone: "plain" };
      const parts = [];
      if (ex) parts.push(`trusted until ${new Date(ex * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`);
      if (hb) parts.push(`must report every ${every(hb)}`);
      return { text: parts.join(", "), tone: "plain" };
    }
    case "Beat": return { text: "Said it is alive", tone: "quiet" };
    case "Labelled": return { text: `Named "${d.name}"`, tone: "plain" };
    case "TradeAccepted": return { text: "Traded on the venue", tone: "live" };
    case "Linked8004": return { text: `Claimed by ERC-8004 agent ${d.erc8004Id}`, tone: "plain" };
    /* the agent's own staking, read from monad's staking precompile */
    case "Staked": return { text: `Staked ${monOf(d.amount)} with validator ${d.validatorId}`, tone: "live" };
    case "Unstaked": return { text: `Unstaked ${monOf(d.amount)} from validator ${d.validatorId}`, tone: "plain" };
    case "Withdrew": return { text: `Withdrew ${monOf(d.amount)} from validator ${d.validatorId}`, tone: "plain" };
    case "ClaimedRewards": return { text: `Claimed ${monOf(d.amount)} in rewards from validator ${d.validatorId}`, tone: "live" };
    default: return { text: e.kind, tone: "plain" };
  }
}

/* an amount in wei, as MON, without a float's tail */
export function monOf(wei: unknown) {
  try { const v = BigInt(String(wei)); const whole = v / 10n ** 18n, frac = (v % 10n ** 18n).toString().padStart(18, "0").slice(0, 6).replace(/0+$/, ""); return `${whole}${frac ? "." + frac : ""} MON`; }
  catch { return "MON"; }
}

export const every = (s: number) =>
  s % 86400 === 0 ? `${s / 86400} day${s === 86400 ? "" : "s"}`
  : s % 3600 === 0 ? `${s / 3600} hour${s === 3600 ? "" : "s"}`
  : `${Math.round(s / 60)} minutes`;

export const short = (a?: string | null) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");

export function ago(iso: string, now = Date.now()) {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export const dayOf = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
