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
  #wc; #address; #renew;
  /* renew: signs in to Dynamic again and returns a fresh wallet client. the
     session from authenticateApiToken expires; the first run of this agent
     signed in once at start and, about four hours later, every signature came
     back 403. no trade, so no heartbeat, so the window lapsed and the switch
     stopped trusting it, which was the product working and the integration
     failing. now a 403 signs in again and tries once more. */
  constructor(walletClient, address, provider, renew = null) {
    super(provider);
    this.#wc = walletClient;
    this.#address = ethers.getAddress(address);
    this.#renew = renew;
  }
  async getAddress() { return this.#address; }
  connect(provider) { return new DynamicSigner(this.#wc, this.#address, provider, this.#renew); }

  async #withSession(fn) {
    try { return await fn(this.#wc); }
    catch (e) {
      const status = e?.status ?? e?.response?.status ?? e?.cause?.status;
      const expired = status === 401 || status === 403 || /status code 40[13]/.test(String(e?.message ?? e?.details ?? ""));
      if (!expired || !this.#renew) throw e;
      console.log(new Date().toISOString(), "Dynamic session expired, signing in again");
      this.#wc = await this.#renew();
      return fn(this.#wc);
    }
  }

  async signMessage(message) {
    const raw = typeof message === "string" ? ethers.hexlify(ethers.toUtf8Bytes(message)) : ethers.hexlify(message);
    return this.#withSession(wc => wc.signMessage({ account: wc.account, message: { raw } }));
  }
  async signTransaction() { throw new Error("DynamicSigner sends transactions itself; it does not hand out signed ones"); }
  async signTypedData(domain, types, value) {
    const primaryType = Object.keys(types).find(k => k !== "EIP712Domain");
    return this.#withSession(wc => wc.signTypedData({ account: wc.account, domain, types, primaryType, message: value }));
  }

  /* ethers fills in the nonce, the gas and the fees against our own provider,
     so monad's whole-limit gas charge is sized by the same estimate as before.
     Dynamic signs and broadcasts; the hash comes back and ethers takes over. */
  async sendTransaction(tx) {
    const t = await this.populateTransaction(tx);
    const hash = await this.#withSession(wc => wc.sendTransaction({
      account: wc.account, chain: wc.chain,
      to: t.to, data: t.data ?? undefined, value: t.value != null ? BigInt(t.value) : undefined,
      gas: t.gasLimit != null ? BigInt(t.gasLimit) : undefined, nonce: t.nonce != null ? Number(t.nonce) : undefined,
      maxFeePerGas: t.maxFeePerGas != null ? BigInt(t.maxFeePerGas) : undefined,
      maxPriorityFeePerGas: t.maxPriorityFeePerGas != null ? BigInt(t.maxPriorityFeePerGas) : undefined,
    }));
    for (let i = 0; i < 30; i++) {
      const r = await this.provider.getTransaction(hash);
      if (r) return r;
      await new Promise(res => setTimeout(res, 1000));
    }
    throw new Error(`sent ${hash} through Dynamic, but the RPC has not seen it after 30s`);
  }
}

export async function dynamicSigner(provider, rpcUrl) {
  const address = process.env.DYNAMIC_AGENT_ADDRESS;
  const walletMetadata = walletMeta(address);
  /* a fresh sign-in and a fresh wallet client, used at start and whenever the
     session has expired */
  const open = async () => {
    const client = await dynamicClient();
    return client.getWalletClient({ walletMetadata, password: process.env.DYNAMIC_WALLET_PASSWORD, chainId: MONAD_TESTNET, rpcUrl });
  };
  return new DynamicSigner(await open(), address, provider, open);
}
