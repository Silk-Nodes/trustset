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
  killSwitch: "0x38b6Cc9b8721B83e2eE1ae0d64d2BfE98A5A8099",
};

const ABI = [
  "function isTrusted(uint256) view returns (bool)",
  "function liveness(uint256) view returns (bool trusted, bool expired, bool lapsed, uint64 expiresAt, uint64 nextBeatBy)",
  "function getAgent(uint256) view returns (tuple(address agentKey,address revocationKey,address pendingRevocationKey,uint64 revocationKeyChangeAt,uint8 guardianThreshold,uint8 status,uint64 statusSince,uint256 successorId,bytes32 reasonHash,uint64 expiresAt,uint64 heartbeatWindow,uint64 lastBeat,address[] guardians))",
  "function agentIdByKey(address) view returns (uint256)",
  "function beat(uint256)",
];

const STATUS = ["none", "active", "paused", "revoked", "rotated"];

export function client({ rpc = MONAD_TESTNET.rpc, killSwitch = MONAD_TESTNET.killSwitch, provider } = {}) {
  const p = provider ?? new ethers.JsonRpcProvider(rpc, undefined, { staticNetwork: true });
  const ks = new ethers.Contract(killSwitch, ABI, p);

  return {
    provider: p,
    address: killSwitch,

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

    /** Say the agent is alive. Only the agent key can, and only inside its window.
     *  Overrides are passed through because Monad charges the whole gas limit,
     *  so a caller that knows the cost should be able to set it. */
    beat: (agentId, signer, overrides = {}) => ks.connect(signer).beat(agentId, overrides),
  };
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
