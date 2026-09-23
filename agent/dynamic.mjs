/* the live agent's key, held by Dynamic instead of by a file on our server.
 *
 * a Dynamic server wallet is two-of-two MPC: the key is split between Dynamic
 * and us, and neither half can sign alone. our half is backed up to Dynamic,
 * encrypted under a password only this server knows, so nothing on the box is
 * a private key. what the box holds is an API token and that password, both in
 * .env, both revocable.
 *
 * the rest of the agent is unchanged: it talks to an ethers signer. this is
 * that signer, with every signature done by Dynamic.
 *
 * configuration is all or nothing. with none of the four set the agent keeps
 * its file key and says so; with some but not all it refuses to start and
 * names what is missing, rather than quietly signing with the wrong key. */
import { ethers } from "ethers";

const VARS = ["DYNAMIC_ENVIRONMENT_ID", "DYNAMIC_API_TOKEN", "DYNAMIC_AGENT_ADDRESS", "DYNAMIC_WALLET_PASSWORD"];
const MONAD_TESTNET = 10143;

export function dynamicConfigured() {
  const set = VARS.filter(v => process.env[v]);
  if (set.length === 0) return false;
  if (set.length < VARS.length) throw new Error(`Dynamic is half configured. Missing: ${VARS.filter(v => !process.env[v]).join(", ")}`);
  return true;
}

/* a signed-in Dynamic client and the metadata of one wallet on it */
export async function dynamicClient() {
  const { DynamicEvmWalletClient } = await import("@dynamic-labs-wallet/node-evm");
  const client = new DynamicEvmWalletClient({ environmentId: process.env.DYNAMIC_ENVIRONMENT_ID });
  await client.authenticateApiToken(process.env.DYNAMIC_API_TOKEN);
  return client;
}

export async function walletMeta(client, address) {
  const all = await client.getEvmWallets();
  const w = all.find(x => x.accountAddress.toLowerCase() === address.toLowerCase());
  if (!w) throw new Error(`no Dynamic wallet ${address} in environment ${process.env.DYNAMIC_ENVIRONMENT_ID}`);
  return w;
}

/* an ethers signer whose signatures all come from Dynamic */
export class DynamicSigner extends ethers.AbstractSigner {
  #wc; #address;
  constructor(walletClient, address, provider) {
    super(provider);
    this.#wc = walletClient;
    this.#address = ethers.getAddress(address);
  }
  async getAddress() { return this.#address; }
  connect(provider) { return new DynamicSigner(this.#wc, this.#address, provider); }

  async signMessage(message) {
    const raw = typeof message === "string" ? ethers.hexlify(ethers.toUtf8Bytes(message)) : ethers.hexlify(message);
    return this.#wc.signMessage({ account: this.#wc.account, message: { raw } });
  }
  async signTransaction() { throw new Error("DynamicSigner sends transactions itself; it does not hand out signed ones"); }
  async signTypedData(domain, types, value) {
    const primaryType = Object.keys(types).find(k => k !== "EIP712Domain");
    return this.#wc.signTypedData({ account: this.#wc.account, domain, types, primaryType, message: value });
  }

  /* ethers fills in the nonce, the gas and the fees against our own provider,
     so monad's whole-limit gas charge is sized by the same estimate as before.
     Dynamic signs and broadcasts; the hash comes back and ethers takes over. */
  async sendTransaction(tx) {
    const t = await this.populateTransaction(tx);
    const hash = await this.#wc.sendTransaction({
      account: this.#wc.account, chain: this.#wc.chain,
      to: t.to, data: t.data ?? undefined, value: t.value != null ? BigInt(t.value) : undefined,
      gas: t.gasLimit != null ? BigInt(t.gasLimit) : undefined, nonce: t.nonce != null ? Number(t.nonce) : undefined,
      maxFeePerGas: t.maxFeePerGas != null ? BigInt(t.maxFeePerGas) : undefined,
      maxPriorityFeePerGas: t.maxPriorityFeePerGas != null ? BigInt(t.maxPriorityFeePerGas) : undefined,
    });
    for (let i = 0; i < 30; i++) {
      const r = await this.provider.getTransaction(hash);
      if (r) return r;
      await new Promise(res => setTimeout(res, 1000));
    }
    throw new Error(`sent ${hash} through Dynamic, but the RPC has not seen it after 30s`);
  }
}

export async function dynamicSigner(provider, rpcUrl) {
  const client = await dynamicClient();
  const address = process.env.DYNAMIC_AGENT_ADDRESS;
  const walletMetadata = await walletMeta(client, address);
  const wc = await client.getWalletClient({ walletMetadata, password: process.env.DYNAMIC_WALLET_PASSWORD, chainId: MONAD_TESTNET, rpcUrl });
  return new DynamicSigner(wc, address, provider);
}
