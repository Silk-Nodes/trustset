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
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { ethers } from "ethers";

/* DYNAMIC_WALLET_FILE holds the wallet's metadata as createWalletAccount
   returned it. the SDK is stateless and Dynamic has no endpoint that gives the
   key-share backup pointer back later, so this file is the only way to sign
   with the wallet again. it is not secret (Dynamic calls it non-sensitive
   identity and backup-pointer info); the key material stays with Dynamic,
   encrypted under the password. lose the file and the wallet cannot sign. */
const VARS = ["DYNAMIC_ENVIRONMENT_ID", "DYNAMIC_API_TOKEN", "DYNAMIC_AGENT_ADDRESS", "DYNAMIC_WALLET_PASSWORD", "DYNAMIC_WALLET_FILE"];
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
  /* enableMPCAccelerator off: it uses AWS Nitro Enclave attestation, and
     Dynamic's quickstart warns that anywhere else wallet creation dies with
     "Attestation verification failed". our box is not a Nitro enclave. */
  const client = new DynamicEvmWalletClient({ environmentId: process.env.DYNAMIC_ENVIRONMENT_ID, enableMPCAccelerator: false });
  await client.authenticateApiToken(process.env.DYNAMIC_API_TOKEN);
  return client;
}

/* the saved metadata, checked against the address the env names, so a file
   copied from another wallet can never sign as this agent */
export function walletMeta(address) {
  const f = process.env.DYNAMIC_WALLET_FILE;
  if (!f || !existsSync(f)) throw new Error(`DYNAMIC_WALLET_FILE ${f || "(unset)"} does not exist. run: node dynamic-setup.mjs create`);
  const m = JSON.parse(readFileSync(f, "utf8"));
  if (m.accountAddress?.toLowerCase() !== address.toLowerCase()) throw new Error(`${f} is for ${m.accountAddress}, not ${address}`);
  if (!m.externalServerKeySharesBackupInfo) throw new Error(`${f} has no key-share backup pointer; this wallet cannot sign`);
  return m;
}

export function saveWalletMeta(meta) {
  const f = process.env.DYNAMIC_WALLET_FILE;
  if (existsSync(f)) throw new Error(`${f} already exists. refusing to overwrite a wallet that may be in use`);
  writeFileSync(f, JSON.stringify(meta, null, 2), { mode: 0o600 });
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
  const walletMetadata = walletMeta(address);
  const wc = await client.getWalletClient({ walletMetadata, password: process.env.DYNAMIC_WALLET_PASSWORD, chainId: MONAD_TESTNET, rpcUrl });
  return new DynamicSigner(wc, address, provider);
}
