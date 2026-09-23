"use client";
import { ethers } from "ethers";

/* the browser half of touch. a passkey is registered once per account, then
   every action can carry a proof that a human was physically present.
 *
 * the contract checks three things we have to get exactly right here: the
 * relying party hash, the user-verified flag, and the challenge embedded in
 * clientDataJSON. the challenge is the contract's own, so an assertion made
 * for one action can never be replayed for another. */

export const CURVE_N = BigInt("0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551");

export function supported() {
  return typeof window !== "undefined" && !!window.PublicKeyCredential && !!navigator.credentials;
}
export async function platformAvailable() {
  try { return supported() && await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); }
  catch { return false; }
}

const b64url = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
/* copy into a plain ArrayBuffer: webauthn wants BufferSource, and a Uint8Array
   that could be backed by a SharedArrayBuffer does not satisfy it. */
const buf = (u: Uint8Array): ArrayBuffer => { const a = new ArrayBuffer(u.length); new Uint8Array(a).set(u); return a; };
const hex = (b: ArrayBuffer) => "0x" + [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");

/* the challenge the contract will recompute: keccak(touch, account, action). */
export function challengeFor(touch: string, chainId: bigint, account: string, actionHash: string) {
  return ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256", "address", "bytes32"], [touch, chainId, account, actionHash]));
}

/* a webauthn assertion signs over sha256(authData || sha256(clientData)), and
   returns the signature DER encoded. the contract wants raw r and s, with s
   normalised low, because a high s is a second valid signature for the same
   message and the contract rejects it. */
function derToRS(der: Uint8Array): { r: bigint; s: bigint } {
  if (der[0] !== 0x30) throw new Error("not a DER sequence");
  let i = 2;
  if (der[1] & 0x80) i = 2 + (der[1] & 0x7f);
  if (der[i] !== 0x02) throw new Error("no r");
  const rLen = der[i + 1];
  const r = BigInt("0x" + [...der.slice(i + 2, i + 2 + rLen)].map(x => x.toString(16).padStart(2, "0")).join(""));
  let j = i + 2 + rLen;
  if (der[j] !== 0x02) throw new Error("no s");
  const sLen = der[j + 1];
  let s = BigInt("0x" + [...der.slice(j + 2, j + 2 + sLen)].map(x => x.toString(16).padStart(2, "0")).join(""));
  if (s > CURVE_N / 2n) s = CURVE_N - s;
  return { r, s };
}

/* the public key comes back as SPKI DER. for P-256 the last 65 bytes are the
   uncompressed point, 0x04 then x then y. parsing the full ASN.1 to find the
   same 64 bytes would be more code and no more correct. */
function spkiToXY(spki: ArrayBuffer): { x: bigint; y: bigint } {
  const b = new Uint8Array(spki);
  const p = b.slice(b.length - 65);
  if (p[0] !== 0x04) throw new Error("public key is not an uncompressed point");
  const n = (a: Uint8Array) => BigInt("0x" + [...a].map(v => v.toString(16).padStart(2, "0")).join(""));
  return { x: n(p.slice(1, 33)), y: n(p.slice(33, 65)) };
}

export async function registerPasskey(accountLabel: string) {
  const rpId = location.hostname;
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: buf(crypto.getRandomValues(new Uint8Array(32))),
      rp: { name: "trustset", id: rpId },
      user: { id: buf(crypto.getRandomValues(new Uint8Array(16))), name: accountLabel, displayName: accountLabel },
      /* -7 is ES256, the only algorithm the p256 precompile can verify. */
      pubKeyCredParams: [{ type: "public-key", alg: -7 }],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "preferred" },
      /* ask for PRF at creation, so the same passkey that can stop the agent can
         also derive the key its sealed runbook is encrypted with. platform
         passkeys answer PRF anyway; security keys only if it is asked for here. */
      extensions: { prf: {} } as AuthenticationExtensionsClientInputs,
      timeout: 60000,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("no credential returned");
  const res = cred.response as AuthenticatorAttestationResponse;
  const spki = res.getPublicKey?.();
  if (!spki) throw new Error("this browser did not expose the public key");
  const { x, y } = spkiToXY(spki);
  const rpIdHash = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rpId)));
  return { credentialId: b64url(cred.rawId), x, y, rpIdHash, rpId };
}

export interface Assertion { authenticatorData: string; clientDataJSON: string; r: bigint; s: bigint; flags: number }

export async function assertHuman(credentialId: string, challengeHex: string): Promise<Assertion> {
  const raw = Uint8Array.from(atob(credentialId.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
  const cred = (await navigator.credentials.get({
    publicKey: {
      challenge: buf(ethers.getBytes(challengeHex)),
      allowCredentials: [{ type: "public-key", id: buf(raw) }],
      userVerification: "required",
      timeout: 60000,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("no assertion returned");
  const res = cred.response as AuthenticatorAssertionResponse;
  const { r, s } = derToRS(new Uint8Array(res.signature));
  const flags = new Uint8Array(res.authenticatorData)[32];
  return { authenticatorData: hex(res.authenticatorData), clientDataJSON: hex(res.clientDataJSON), r, s, flags };
}

/* the panic button's assertion.
 *
 * no credential id: the phone offers whatever passkey it holds for this site and
 * the person picks. that is the point, because the panic page is opened on a
 * device that has never seen this agent's console and has nothing stored for it.
 * the contract knows which key it will accept, so an assertion from the wrong
 * passkey simply fails to verify. */
export async function assertAny(challengeHex: string): Promise<Assertion> {
  const cred = (await navigator.credentials.get({
    publicKey: { challenge: buf(ethers.getBytes(challengeHex)), userVerification: "required", timeout: 60000 },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("no assertion returned");
  const res = cred.response as AuthenticatorAssertionResponse;
  const { r, s } = derToRS(new Uint8Array(res.signature));
  const flags = new Uint8Array(res.authenticatorData)[32];
  return { authenticatorData: hex(res.authenticatorData), clientDataJSON: hex(res.clientDataJSON), r, s, flags };
}

export const FLAG_UP = 0x01;
export const FLAG_UV = 0x04;
