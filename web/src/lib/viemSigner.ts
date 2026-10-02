"use client";
import { ethers } from "ethers";
import type { Account, Chain, Transport, WalletClient } from "viem";

/* an ethers signer over a viem wallet client.
 *
 * the console talks to one ethers signer whichever wallet is behind it. a
 * Dynamic embedded wallet hands back a viem client, so this is the adapter:
 * ethers fills in the nonce, the gas and the fees against our own provider,
 * which keeps monad's whole-limit gas sized by the same estimate the rest of
 * the console uses, and the viem client signs and broadcasts. */
/* the last nonce sent from each address, kept across signer objects (the
   wallet provider hands out a new one on every wallet event). the public rpc
   can still report the old transaction count a few seconds after a send, so
   a resume pressed right after a pause went out with the pause's nonce and
   the wallet refused it as "missing or invalid parameters". */
const lastNonce = new Map<string, number>();

export class ViemSigner extends ethers.AbstractSigner {
  #wc: WalletClient<Transport, Chain, Account>;
  constructor(wc: WalletClient<Transport, Chain, Account>, provider: ethers.Provider) {
    super(provider);
    this.#wc = wc;
  }
  async getAddress() { return ethers.getAddress(this.#wc.account.address); }
  connect(provider: ethers.Provider | null) { return new ViemSigner(this.#wc, provider as ethers.Provider); }

  async signMessage(message: string | Uint8Array) {
    const raw = typeof message === "string" ? ethers.hexlify(ethers.toUtf8Bytes(message)) : ethers.hexlify(message);
    return this.#wc.signMessage({ account: this.#wc.account, message: { raw: raw as `0x${string}` } });
  }
  async signTransaction(): Promise<string> { throw new Error("this wallet sends transactions itself"); }
  async signTypedData(domain: ethers.TypedDataDomain, types: Record<string, ethers.TypedDataField[]>, value: Record<string, unknown>) {
    /* the type nothing else refers to, as ethers works it out, not the first key */
    const { EIP712Domain: _omit, ...rest } = types as Record<string, ethers.TypedDataField[]>;
    void _omit;
    const primaryType = ethers.TypedDataEncoder.getPrimaryType(rest);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ethers and viem type the same EIP-712 shape differently
    return this.#wc.signTypedData({ account: this.#wc.account, domain: domain as any, types: types as any, primaryType, message: value });
  }

  async sendTransaction(tx: ethers.TransactionRequest) {
    const t = await this.populateTransaction(tx);
    const who = (await this.getAddress()).toLowerCase();
    const prev = lastNonce.get(who);
    if (t.nonce != null && prev != null && Number(t.nonce) <= prev) t.nonce = prev + 1;
    const big = (v: ethers.BigNumberish | null | undefined) => (v == null ? undefined : BigInt(v));
    const hash = await this.#wc.sendTransaction({
      account: this.#wc.account, chain: this.#wc.chain,
      to: (t.to ?? undefined) as `0x${string}` | undefined, data: (t.data ?? undefined) as `0x${string}` | undefined,
      value: big(t.value), gas: big(t.gasLimit), nonce: t.nonce == null ? undefined : Number(t.nonce),
      maxFeePerGas: big(t.maxFeePerGas), maxPriorityFeePerGas: big(t.maxPriorityFeePerGas),
    });
    if (t.nonce != null) lastNonce.set(who, Number(t.nonce));
    for (let i = 0; i < 30; i++) {
      const r = await this.provider!.getTransaction(hash);
      if (r) return r;
      await new Promise(res => setTimeout(res, 1000));
    }
    throw new Error(`sent ${hash}, but the RPC has not seen it after 30s`);
  }
}
