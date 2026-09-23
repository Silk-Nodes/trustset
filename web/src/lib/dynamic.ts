"use client";
import type { ethers } from "ethers";
import { ViemSigner } from "@/lib/viemSigner";

/* signing in with an email, through Dynamic.
 *
 * a Dynamic embedded wallet is created for the address the code was sent to,
 * and that wallet becomes the cold key: it registers agents and can stop them,
 * with no browser extension installed. it is the same role MetaMask plays for
 * a reader who has one, which is why the console never learns the difference.
 *
 * nothing here loads until somebody asks for it. the SDK is imported the first
 * time "continue with email" is pressed, or when a returning session is being
 * picked back up, so a page nobody signs in on never downloads it.
 *
 * the environment id is not in the bundle. it comes from /api/chain with the
 * contract addresses, read from the server's env at request time, so moving
 * environments is an env change and not a rebuild. */
type Client = typeof import("@dynamic-labs-sdk/client");
type Verification = Awaited<ReturnType<Client["sendEmailOTP"]>>;

const MONAD = {
  networkId: "10143", chain: "EVM", name: "Monad Testnet", displayName: "Monad Testnet", testnet: true,
  rpcUrls: { http: ["https://testnet-rpc.monad.xyz"] }, blockExplorerUrls: ["https://testnet.monadexplorer.com"],
  iconUrl: "", nativeCurrency: { decimals: 18, name: "Monad", symbol: "MON" },
} as const;

let ready: Promise<Client> | null = null;

export function loadDynamic(environmentId: string): Promise<Client> {
  if (!ready) ready = (async () => {
    const c = await import("@dynamic-labs-sdk/client");
    const { addWaasEvmExtension } = await import("@dynamic-labs-sdk/evm/waas");
    c.createDynamicClient({
      environmentId, autoInitialize: false,
      metadata: { name: "trustset", universalLink: location.origin },
      /* monad testnet only, and first, so a fresh embedded wallet starts on it.
         added here if the dashboard does not list it, rather than trusting a
         setting nobody can see from the code. */
      transformers: {
        networksData: (nets) => {
          const evm = nets.find(n => n.networkId === MONAD.networkId) ?? (MONAD as unknown as (typeof nets)[number]);
          return [evm, ...nets.filter(n => n.chain !== "EVM")];
        },
      },
    });
    addWaasEvmExtension();
    await c.initializeClient();
    return c;
  })().catch(e => { ready = null; throw e; });
  return ready;
}

export async function sendCode(environmentId: string, email: string): Promise<Verification> {
  const c = await loadDynamic(environmentId);
  return c.sendEmailOTP({ email });
}

/* verify, then make sure the embedded wallet exists. Dynamic's own guide:
   the wallet is not created by signing in, and a stale account list can read
   non-empty right after auth, so the missing chains are asked for, not
   inferred from the list. */
export async function verifyCode(environmentId: string, otpVerification: Verification, code: string) {
  const c = await loadDynamic(environmentId);
  await c.verifyOTP({ otpVerification, verificationToken: code.trim() });
  const w = await import("@dynamic-labs-sdk/client/waas");
  const missing = w.getChainsMissingWaasWalletAccounts();
  if (missing.length) await w.createWaasWalletAccounts({ chains: missing });
}

/* the signed-in user's embedded EVM wallet as an ethers signer, or null when
   nobody is signed in. refuses a wallet on any chain but monad testnet: a
   signature for the wrong chain is a transaction that goes somewhere else. */
export async function emailSigner(environmentId: string, provider: ethers.Provider): Promise<{ signer: ethers.Signer; address: string; email: string | null } | null> {
  const c = await loadDynamic(environmentId);
  const { isEvmWalletAccount } = await import("@dynamic-labs-sdk/evm");
  const { createWalletClientForWalletAccount } = await import("@dynamic-labs-sdk/evm/viem");
  const account = c.getWalletAccounts().find(isEvmWalletAccount);
  if (!account) return null;
  const wc = await createWalletClientForWalletAccount({ walletAccount: account });
  if (wc.chain.id !== Number(MONAD.networkId)) throw new Error(`the email wallet is on chain ${wc.chain.id}, not Monad testnet`);
  const signer = new ViemSigner(wc, provider);
  const user = c.getDefaultClient?.()?.user as { email?: string } | undefined;
  return { signer, address: await signer.getAddress(), email: user?.email ?? null };
}

export async function signOutEmail(environmentId: string) {
  const c = await loadDynamic(environmentId);
  await c.logout();
}
