/* @trustset/check
 *
 * one question: may this agent act right now.
 *
 * the answer is a single view call against the switch, and it is the same
 * answer a venue gets when it checks inside its own transaction. an agent that
 * asks before it acts obeys its own switch without anybody else adopting
 * anything; a venue that asks makes that obedience compulsory. this package is
 * the first of those, in one line, and the same call is the second.
 *
 * it holds no keys and sends nothing unless you hand it a signer for beat().
 */
import { ethers } from "ethers";

export const MONAD_TESTNET = {
  rpc: "https://testnet-rpc.monad.xyz",
  chainId: 10143,
  explorer: "https://testnet.monadexplorer.com",
  killSwitch: "0x54D8211233Cc65b62C594cBAb900930dd37ED3b8",
  /* erc-8004 trustless agents, identity registry, live on monad testnet. */
  identityRegistry: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
};

/* the metadata key an 8004 owner sets to say where their switch is. */
export const ERC8004_KEY = "trustset";
const IDENTITY_ABI = ["function getMetadata(uint256, string) view returns (bytes)"];

const ABI = [
  "function isTrusted(uint256) view returns (bool)",
  "function liveness(uint256) view returns (bool trusted, bool expired, bool lapsed, uint64 expiresAt, uint64 nextBeatBy)",
  "function getAgent(uint256) view returns (tuple(address agentKey,address revocationKey,address pendingRevocationKey,uint64 revocationKeyChangeAt,uint8 guardianThreshold,uint8 status,uint64 statusSince,uint256 successorId,bytes32 reasonHash,uint64 expiresAt,uint64 heartbeatWindow,uint64 lastBeat,address[] guardians))",
  "function agentIdByKey(address) view returns (uint256)",
  "function beat(uint256)",
  "function isTrustedAt(uint256, uint64) view returns (bool)",
  "function statusAt(uint256, uint64) view returns (uint8)",
  "function historyLength(uint256) view returns (uint256)",
  "function historyAt(uint256, uint256) view returns (tuple(uint64 at, uint8 status))",
];

const STATUS = ["none", "active", "paused", "revoked", "rotated"];

export function client({ rpc = MONAD_TESTNET.rpc, killSwitch = MONAD_TESTNET.killSwitch, provider } = {}) {
  const p = provider ?? new ethers.JsonRpcProvider(rpc, undefined, { staticNetwork: true });
  const ks = new ethers.Contract(killSwitch, ABI, p);

  return {
    provider: p,
    address: killSwitch,
    /* the contract itself, so the free functions below can reach it without a
       second connection and a caller can drop to it when they need to. */
    contract: ks,

    /** Was this agent trusted at that moment. See verifySigned for the why. */
    trustedAt(agentId, when) { return trustedAt(this, agentId, when); },
    /** Every status change the switch recorded, oldest first. */
    history(agentId) { return history(this, agentId); },
    /** A signed message, and whether the switch allowed that agent to sign it then. */
    verifySigned(args) { return verifySigned(this, args); },

    /** The whole integration. True only if the agent is active, inside its dates, and not gone quiet. */
    isTrusted: (agentId) => ks.isTrusted(agentId),

    /** Throws instead of returning false, for code that would rather not check a boolean it might ignore. */
    async requireTrusted(agentId) {
      if (!(await ks.isTrusted(agentId))) throw new NotTrusted(agentId, await this.why(agentId));
      return true;
    },

    /** Why, in one word, for a log line or a page: trusted, expired, silent, paused, stopped. */
    async why(agentId) {
      const [l, a] = await Promise.all([ks.liveness(agentId), ks.getAgent(agentId)]);
      if (l.trusted) return "trusted";
      if (l.expired) return "expired";
      if (l.lapsed) return "silent";
      const s = STATUS[Number(a.status)] ?? "unknown";
      return s === "revoked" ? "stopped" : s;
    },

    /** Dates and deadlines, as seconds since the epoch. Zero means the limit is off. */
    async limits(agentId) {
      const l = await ks.liveness(agentId);
      return { trusted: l.trusted, expired: l.expired, lapsed: l.lapsed, expiresAt: Number(l.expiresAt), nextBeatBy: Number(l.nextBeatBy) };
    },

    /** Which agent is this key, or 0 if it was never registered. */
    idForKey: (address) => ks.agentIdByKey(address),

    /** The agent an ERC-8004 identity points at, or null. See from8004 below. */
    from8004(tokenId, opts) { return from8004(this, tokenId, opts); },
    /** Is the agent behind an ERC-8004 identity allowed to act right now. */
    async isTrusted8004(tokenId, opts) {
      const link = await from8004(this, tokenId, opts);
      return link.ok ? { ...link, trusted: await ks.isTrusted(link.agentId), why: await this.why(link.agentId) } : link;
    },

    /** Say the agent is alive. Only the agent address can, and only inside its window.
     *  Overrides are passed through because Monad charges the whole gas limit,
     *  so a caller that knows the cost should be able to set it. */
    beat: (agentId, signer, overrides = {}) => ks.connect(signer).beat(agentId, overrides),
  };
}

/* ---------- what an agent signed, and whether it was allowed to ----------
 *
 * a venue that takes orders on chain asks isTrusted and is done. a venue that
 * takes signed orders off chain and settles them later cannot: the question is
 * not whether the agent is trusted now, it is whether it was trusted at the
 * moment it signed. a stop at 14:32 must not void an order signed at 14:30, and
 * must void one signed at 14:35.
 *
 * the switch keeps every status change with its timestamp, so it can answer
 * that. two limits are real and are not hidden:
 *
 * an end date is checked against the agent's CURRENT end date, because only the
 * current one is stored. moving the date therefore changes the answer about the
 * past. and a heartbeat cannot be judged historically at all: no record of past
 * beats is kept, so a lapse does not appear here. both are in AUDIT.md.
 */

/** Was this agent trusted at that moment. Seconds since the epoch. */
export async function trustedAt(c, agentId, when) {
  return c.contract.isTrustedAt(agentId, BigInt(Math.floor(seconds(when))));
}

/** Everything the switch knows about how an agent's status moved, oldest first. */
export async function history(c, agentId) {
  const n = Number(await c.contract.historyLength(agentId));
  const rows = await Promise.all(Array.from({ length: n }, (_, i) => c.contract.historyAt(agentId, i)));
  /* positional, not by name: ethers' Result is an array first, so a field
     called "at" resolves to Array.prototype.at and Number(that) is NaN. */
  return rows.map(r => ({ at: Number(r[0]), status: STATUS[Number(r[1])] ?? "unknown" }));
}

const seconds = when =>
  when instanceof Date ? when.getTime() / 1000 : typeof when === "number" && when > 1e11 ? when / 1000 : Number(when);

/**
 * Verify a message an agent signed, and that the switch allowed it to at the time.
 *
 * Returns { ok, agentId, signer, reason }. ok is true only if the signature
 * recovers to a key the switch knows and that agent was trusted at `when`.
 * Nothing here trusts the caller's clock on its own: `when` should come from the
 * order itself, and a venue should refuse a timestamp it did not see.
 */
export async function verifySigned(c, { message, signature, when }) {
  let signer;
  try { signer = ethers.verifyMessage(message, signature); }
  catch { return { ok: false, reason: "that signature does not verify" }; }

  const agentId = await c.contract.agentIdByKey(signer);
  if (agentId === 0n) return { ok: false, signer, reason: "that key is not registered on this switch" };

  const at = Math.floor(seconds(when));
  const ok = await c.contract.isTrustedAt(agentId, BigInt(at));
  return ok
    ? { ok: true, agentId: String(agentId), signer, reason: "trusted when it signed" }
    : { ok: false, agentId: String(agentId), signer, reason: `agent ${agentId} was ${STATUS[Number(await c.contract.statusAt(agentId, BigInt(at)))] ?? "unknown"} at that moment` };
}

export class NotTrusted extends Error {
  constructor(agentId, why) {
    super(`agent ${agentId} is ${why}`);
    this.name = "NotTrusted";
    this.agentId = String(agentId);
    this.why = why;
  }
}

export default client;

/* ---------- the other direction: an erc-8004 identity to its switch ----------
 *
 * the registry links one way already. an owner sets a metadata key on their
 * token whose value is abi.encode(chainId, killSwitch, agentId), which is them
 * saying "the switch for this identity is over there". nothing reads it back.
 *
 * so this reads it back, and the reading is the point. an app that only knows
 * an agent by its 8004 identity can ask whether that agent has been switched
 * off, without knowing trustset exists beforehand and without asking any
 * server of ours: it is two view calls against two public contracts.
 *
 * the pointer is the owner's claim and is checked, not trusted. a value naming
 * another chain or another switch is somebody else's arrangement and is
 * refused here rather than silently answered about the wrong agent. what this
 * cannot check is the reverse direction: the switch does not know which 8004
 * token claims it, so a token could point at an agent whose owner never agreed.
 * that costs the liar nothing and gains them nothing, because the answer is
 * about the agent they named, not about them. it is in AUDIT.md.
 */
export async function from8004(c, tokenId, { registry = MONAD_TESTNET.identityRegistry, chainId = MONAD_TESTNET.chainId } = {}) {
  const reg = new ethers.Contract(registry, IDENTITY_ABI, c.provider);
  let raw;
  try { raw = await reg.getMetadata(BigInt(tokenId), ERC8004_KEY); }
  catch { return { ok: false, reason: "that identity registry did not answer" }; }
  if (!raw || raw === "0x") return { ok: false, reason: `erc-8004 agent ${tokenId} has not published a trustset pointer` };
  let decoded;
  try { decoded = ethers.AbiCoder.defaultAbiCoder().decode(["uint256", "address", "uint256"], raw); }
  catch { return { ok: false, reason: "its trustset pointer is not readable" }; }
  /* positionally. a Result is an array first, so a named field can collide
     with Array.prototype and quietly become undefined. */
  const [onChain, switchAddr, agentId] = [Number(decoded[0]), decoded[1], Number(decoded[2])];
  if (onChain !== chainId) return { ok: false, reason: `its switch is on chain ${onChain}, not ${chainId}` };
  if (switchAddr.toLowerCase() !== c.address.toLowerCase()) {
    return { ok: false, reason: `it points at a different switch, ${switchAddr}` };
  }
  return { ok: true, tokenId: Number(tokenId), agentId, killSwitch: switchAddr, chainId: onChain };
}
