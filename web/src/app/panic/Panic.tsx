"use client";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { assertAny, platformAvailable } from "@/lib/webauthn";
import { useMotionPrefs } from "@/lib/motion";

/* the panic button.
 *
 * the case this exists for: something is wrong, and the wallet is on a laptop in
 * another room or on a hardware device in a drawer. a phone and a fingerprint
 * pause the agent instead, in the next block.
 *
 * the phone signs; it never holds a key that can spend, and it cannot do
 * anything but pause. a server carries the assertion to the chain and pays the
 * gas, which is safe because the assertion is the authority and a relayer can
 * forge none of it. */
type Info = { challenge: string; set: boolean; nonce: number; explorer: string; error?: string };
type Done = { ok: boolean; hash: string; block: number | null; explorer: string };

export default function Panic({ initialId }: { initialId?: string }) {
  const m = useMotionPrefs();
  const [id, setId] = useState(initialId ?? "");
  const [info, setInfo] = useState<Info | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [canPasskey, setCanPasskey] = useState(true);

  useEffect(() => { platformAvailable().then(setCanPasskey); }, []);

  /* the challenge changes every time one is spent, so it is read when the agent
     is named and again after a pause lands. */
  useEffect(() => {
    if (!/^\d+$/.test(id)) { setInfo(null); return; }
    let alive = true;
    fetch(`/api/panic?id=${id}`, { cache: "no-store" })
      .then(r => r.json()).then(j => { if (alive) setInfo(j); })
      .catch(() => { if (alive) setInfo(null); });
    return () => { alive = false; };
  }, [id, done]);

  async function pause() {
    if (!info?.challenge) return;
    setBusy(true); setNote(null);
    try {
      const a = await assertAny(info.challenge);
      const r = await fetch("/api/panic", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentId: Number(id), authenticatorData: a.authenticatorData, clientDataJSON: a.clientDataJSON, r: a.r.toString(), s: a.s.toString() }),
      });
      const j = await r.json();
      if (j.error) { setNote(j.error); return; }
      setDone(j);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setNote(/NotAllowed/i.test(msg) ? "The passkey prompt was dismissed." : msg);
    } finally { setBusy(false); }
  }

  const ready = !!info?.set && !!info.challenge && !done;

  return (
    <div className="mx-auto w-full max-w-[420px]">
      <label className="block">
        <span className="text-[11px] mono uppercase tracking-[0.12em]" style={{ color: "var(--text-medium)" }}>Agent</span>
        <input value={id} onChange={e => { setId(e.target.value.replace(/\D/g, "")); setDone(null); setNote(null); }}
          inputMode="numeric" placeholder="7"
          className="mono text-2xl w-full rounded-2xl px-4 py-3.5 mt-1.5 outline-none tabular"
          style={{ background: "var(--bg-base)", border: "1px solid var(--hairline)", color: "var(--text-dark)" }} />
      </label>

      <div className="min-h-[22px] mt-2 text-[12.5px]" style={{ color: "var(--text-medium)" }}>
        {!id ? "The id of the agent to pause." :
         !info ? "Reading the switch…" :
         info.error ? info.error :
         info.set ? `Ready. This passkey has been used ${info.nonce} time${info.nonce === 1 ? "" : "s"} on this agent.` :
         "No passkey is nominated for this agent. Its owner sets one from the console."}
      </div>

      <motion.button type="button" onClick={pause} disabled={!ready || busy}
        whileTap={m.reduced || !ready ? undefined : { scale: 0.97 }}
        className="w-full mt-4 rounded-2xl px-6 font-semibold"
        style={{
          height: 132, fontSize: "1.35rem",
          background: ready ? "var(--orange)" : "color-mix(in srgb, var(--text-dark) 6%, transparent)",
          color: ready ? "var(--mark-on-orange, #1a1205)" : "var(--text-medium)",
          border: "1px solid " + (ready ? "transparent" : "var(--hairline)"),
          transition: "background .2s, color .2s",
        }}>
        {busy ? "Waiting for your passkey…" : done ? "Paused" : "Pause this agent"}
      </motion.button>

      {!canPasskey && <p className="mt-3 text-[12.5px]" style={{ color: "var(--orange-text)" }}>This device has no passkey reader. Open this page on your phone.</p>}
      {note && <div className="sheet px-4 py-3 mt-3 text-[12.5px]">{note}</div>}

      {done && (
        <motion.div initial={m.reduced ? { opacity: 0 } : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
          className="sheet px-4 py-4 mt-4">
          <div className="text-sm font-semibold">Agent {id} is paused.</div>
          <div className="text-[12.5px] mt-1" style={{ color: "var(--text-medium)" }}>
            Landed in block {done.block}. Every app that checks the switch refuses it from the next one.
          </div>
          {done.explorer && (
            <a href={`${done.explorer}/tx/${done.hash}`} target="_blank" rel="noreferrer"
              className="inline-block mt-2 text-[12.5px] underline" style={{ color: "var(--orange-text)" }}>View the transaction</a>
          )}
          <div className="text-[12px] mt-3" style={{ color: "var(--text-medium)" }}>
            Bringing it back needs the cold key. A passkey can pause and nothing else.
          </div>
        </motion.div>
      )}
    </div>
  );
}
