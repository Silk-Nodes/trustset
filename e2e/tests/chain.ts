/* direct reads and writes against the e2e chain, to check what the page
   claims against what the contract says */
import { ethers } from "ethers";
export const KS_ABI = [
  "function getAgent(uint256) view returns (tuple(address agentKey,address revocationKey,address pendingRevocationKey,uint64 revocationKeyChangeAt,uint8 guardianThreshold,uint8 status,uint64 statusSince,uint256 successorId,bytes32 reasonHash,uint64 expiresAt,uint64 heartbeatWindow,uint64 lastBeat,address[] guardians))",
  "function agentCount() view returns (uint256)",
  "function guardianPause(uint256)",
  "function guardianPaused(uint256) view returns (bool)",
];
export const STATUS = ["none", "active", "paused", "revoked", "rotated"] as const;
export const provider = () => new ethers.JsonRpcProvider(process.env.E2E_RPC, undefined, { staticNetwork: true });
export const ks = (runner?: ethers.ContractRunner) => new ethers.Contract(process.env.E2E_KILLSWITCH!, KS_ABI, runner ?? provider());
export async function agent(id: number | bigint) {
  const a = await ks().getAgent(id);
  return { status: STATUS[Number(a[5])], expiresAt: Number(a[9]), heartbeatWindow: Number(a[10]), guardians: [...a[12]] as string[], owner: a[1] as string };
}
/* the consent an agent gives to be registered under an owner, as the
   contract checks it */
export async function consent(agentWallet: ethers.Wallet, owner: string) {
  const inner = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "uint256", "string", "address", "address"], [process.env.E2E_KILLSWITCH, 31337n, "trustset:register", agentWallet.address, owner]));
  return agentWallet.signMessage(ethers.getBytes(inner));
}
