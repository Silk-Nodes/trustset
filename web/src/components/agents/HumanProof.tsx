"use client";
import { useEffect, useState } from "react";
import { ethers } from "ethers";
import { motion } from "motion/react";
import { useMotionPrefs, DUR } from "@/lib/motion";
import { assertHuman, challengeFor, platformAvailable, registerPasskey, FLAG_UV } from "@/lib/webauthn";
import type { Conn } from "@/lib/chain";

/* touch, where it earns its place: a stop is the one action where "was this a
   person or another bot" actually matters. the assertion is made over the stop
   transaction's own hash, so the proof belongs to that stop and no other. */
type Cred = { credentialId: string; rpId: string };
const KEY = "ts-passkey";

export default function HumanProof({ conn, signer, account, txHash, onProved }: {
  conn: Conn; signer: ethers.Signer; account: string; txHash: string | null; onProved: (ok: boolean) => void;
}) {
  const m = useMotionPrefs();
  const [cred, setCred] = useState<Cred | null>(null);
  const [onChain, setOnChain] = useState<boolean | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [state, setState] = useState<"idle" | "busy" | "proved" | "failed">("idle");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    platformAvailable().then(setAvailable);
    try { const raw = localStorage.getItem(KEY); if (raw) setCred(JSON.parse(raw)); } catch {}
  }, []);
  useEffect(() => {
    if (!conn.touch) { setOnChain(false); return; }
    conn.touch.passkeyOf(account).then((k: { x: bigint }) => setOnChain(k.x !== 0n)).catch(() => setOnChain(false));
  }, [conn, account, state]);

  async function register() {
    if (!conn.touch) return; setState("busy"); setMsg(null);
    try {
      const k = await registerPasskey(account);
      localStorage.setItem(KEY, JSON.stringify({ credentialId: k.credentialId, rpId: k.rpId }));
      setCred({ credentialId: k.credentialId, rpId: k.rpId });
      const rc = await (await (conn.touch.connect(signer) as ethers.Contract).registerPasskey(k.x, k.y, k.rpIdHash)).wait(2);
      setMsg(`Passkey registered for this account. ${conn.cfg.explorer}/tx/${rc.hash}`);
      setState("idle");
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message.slice(0, 160) : String(e)); setState("failed"); }
  }

  async function prove() {
    if (!conn.touch || !cred || !txHash) return; setState("busy"); setMsg(null);
    try {
      const challenge = challengeFor(conn.cfg.humanTouch, BigInt(conn.cfg.chainIdHex), account, txHash);
      const a = await assertHuman(cred.credentialId, challenge);
      if ((a.flags & FLAG_UV) === 0) throw new Error("The authenticator did not verify a user. Biometric or PIN is required.");
      const rc2 = await (await (conn.touch.connect(signer) as ethers.Contract).attestHuman(account, txHash, {
        authenticatorData: a.authenticatorData, clientDataJSON: a.clientDataJSON, r: a.r, s: a.s,
      })).wait(2);
      setState("proved"); onProved(true);
      setMsg(`Human proof on chain, bound to that stop. ${conn.cfg.explorer}/tx/${rc2.hash}`);
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message.slice(0, 160) : String(e)); setState("failed"); }
  }

  if (!conn.touch) return null;
  if (available === false) return <p className="text-xs text-ink/70">This browser has no platform authenticator, so a human proof cannot be made here. Safari or Chrome with Touch ID can.</p>;

  return (
    <div className="flex flex-col gap-2">
      {state === "proved" ? (
        <motion.div initial={m.reduced ? false : { opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={m.t(DUR.base)}
          className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs self-start border" style={{ borderColor: "var(--sage)", color: "var(--text-dark)", background: "color-mix(in srgb, var(--sage) 10%, transparent)" }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--sage)" }} />
          <span>A human pressed Stop, verified on chain</span>
        </motion.div>
      ) : !onChain || !cred ? (
        <button type="button" onClick={register} disabled={state === "busy"} className="drawn-btn btn-gold self-start" style={{ padding: "7px 13px", fontSize: "0.78rem" }}>
          {state === "busy" ? "Waiting for the passkey" : "Register a passkey"}
        </button>
      ) : txHash ? (
        <button type="button" onClick={prove} disabled={state === "busy"} className="drawn-btn btn-gold self-start" style={{ padding: "7px 13px", fontSize: "0.78rem" }}>
          {state === "busy" ? "Waiting for the passkey" : "Prove a human pressed Stop"}
        </button>
      ) : null}
      {msg && <p className="text-[11px] text-ink/70 break-words">{msg.includes("/tx/") ? <>{msg.slice(0, msg.indexOf("http")).trim()} <a href={msg.slice(msg.indexOf("http"))} target="_blank" rel="noreferrer" className="underline" style={{ color: "var(--orange-text)" }}>View transaction</a></> : <span className="mono">{msg}</span>}</p>}
    </div>
  );
}
