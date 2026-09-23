"use client";
import { ethers } from "ethers";
import {
  createSecretVaultWithExistingPasskey, decryptSecretVaultWithPasskey, isMeraError, parseSecretVault,
  type PasskeySecretVault,
} from "@category-labs/mera";
import type { Conn } from "@/lib/chain";

/* notes only the owner's passkey can read.
 *
 * the panic button already asks the owner's passkey for a signature, and the
 * contract checks it. this asks the same passkey for something else: the
 * WebAuthn PRF output, through Mera, which becomes an AES-256-GCM key inside
 * the browser and nowhere else. every note is sealed under a fresh 32-byte
 * salt, so no two notes share a key and none can be linked to another. the
 * key is never stored: the salt, the nonce and the ciphertext go on chain,
 * and any device the passkey syncs to recreates the key from the salt.
 *
 * the passkey is not named. the browser offers whichever trustset passkey the
 * owner has, which is normally the panic one, and Mera writes the credential
 * it used into the vault so opening it asks for that same passkey. */
export const NOTES_ABI = [
  "function seal(uint256 agentId, uint8 kind, bytes vault)",
  "function notesOf(uint256 agentId) view returns (tuple(uint8 kind, address by, uint64 at, bytes vault)[])",
];
export type Kind = "runbook" | "stop";
const KIND: Record<Kind, number> = { runbook: 0, stop: 1 };
export type Sealed = { kind: Kind; by: string; at: number; vault: PasskeySecretVault | null; index: number };

const enc = new TextEncoder(), dec = new TextDecoder();

/* a vault is stored as the JSON Mera produces, as utf-8 bytes. a vault that
   will not parse is kept as null rather than dropped, so the list still says a
   note exists and that it cannot be read. */
export async function readNotes(c: Conn, id: bigint): Promise<Sealed[]> {
  if (!c.cfg.notes) return [];
  const n = new ethers.Contract(c.cfg.notes, NOTES_ABI, c.p);
  const rows = await n.notesOf(id) as { kind: bigint; by: string; at: bigint; vault: string }[];
  return rows.map((r, index) => {
    let vault: PasskeySecretVault | null = null;
    try { vault = parseSecretVault(JSON.parse(dec.decode(ethers.getBytes(r.vault)))); } catch { /* unreadable, shown as such */ }
    return { kind: Number(r.kind) === 1 ? "stop" : "runbook", by: r.by, at: Number(r.at), vault, index };
  });
}

/* seal in the browser, then send only the sealed bytes. the plaintext never
   leaves this function and its buffer is zeroed by Mera once encrypted. */
export async function sealNote(c: Conn, signer: ethers.Signer, id: bigint, kind: Kind, text: string) {
  if (!c.cfg.notes) throw new Error("This chain has no sealed notes contract");
  const secret = enc.encode(text);
  const vault = await createSecretVaultWithExistingPasskey({ rpId: location.hostname, secret });
  const bytes = enc.encode(JSON.stringify(vault));
  const n = new ethers.Contract(c.cfg.notes, NOTES_ABI, signer);
  const tx = await n.seal(id, KIND[kind], bytes);
  return tx.wait(1);
}

export async function openNote(vault: PasskeySecretVault): Promise<string> {
  const out = await decryptSecretVaultWithPasskey({ rpId: location.hostname, vault });
  const text = dec.decode(out as Uint8Array);
  (out as Uint8Array).fill(0);
  return text;
}

/* what went wrong, in words the owner can act on. */
export function explainSeal(e: unknown): string {
  if (isMeraError(e)) {
    if (e.code === "PRF_UNAVAILABLE") return "This passkey cannot derive keys. iCloud Keychain and Google Password Manager passkeys can; some security keys cannot.";
    if (e.code === "DECRYPT_FAILED") return "That passkey is not the one this note was sealed with.";
    if (e.code === "PASSKEY_OPERATION_FAILED") return "The passkey prompt was closed, or there is no trustset passkey on this device yet.";
    return e.message;
  }
  return e instanceof Error ? e.message : String(e);
}
