"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ethers } from "ethers";
import { motion, AnimatePresence } from "motion/react";
import { useMotionPrefs, DUR } from "@/lib/motion";
import type { Label } from "@/lib/labels";
import { consentMessage, consentValid, type Conn } from "@/lib/chain";
import Term from "@/components/Term";

/* register an agent that already exists, or make a key for one and treat that
 * key the way a wallet treats a seed phrase.
 *
 * the first version of this was one input and one button, and a generated
 * private key went out as a line of text in a notice that could be dismissed
 * with a click. that is not how a key is handed to a person. so this is a
 * ceremony now, in the shape of a wallet's: the key is hidden until revealed,
 * copied deliberately, acknowledged three times, and then proven saved by
 * typing its tail back, before anything is sent to the chain.
 *
 * the other half is what the agent is. the chain cannot say, trustset cannot
 * see, and the console used to invent names. the owner names it here, and the
 * console says the name is theirs. */

type Step = "about" | "key" | "save" | "verify" | "guardians" | "review";
type Mode = "paste" | "generate";

const EASE = [0.23, 1, 0.32, 1] as const;
const TAIL = 6;

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="eyebrow mb-1.5">{label}</div>
      {children}
      {hint && <div className="text-[11px] mt-1.5" style={{ color: "var(--text-medium)" }}>{hint}</div>}
    </div>
  );
}

const inputStyle = (bad?: boolean): React.CSSProperties => ({
  background: "var(--bg-base)", border: `1px solid ${bad ? "var(--orange)" : "var(--hairline)"}`, color: "var(--text-dark)",
});

function Check({ on, set, children }: { on: boolean; set: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex items-start gap-3 py-2.5 text-sm cursor-pointer select-none rule-top">
      <input type="checkbox" checked={on} onChange={e => set(e.target.checked)} className="mt-1 accent-[var(--orange)]" />
      <span className="text-ink/80">{children}</span>
    </label>
  );
}

export default function RegisterDialog({ open, onClose, onRegister, checkKey, coldKey, conn }: {
  open: boolean; onClose: () => void; coldKey: string; conn: Conn;
  onRegister: (agentKey: string, label: Label, guardians: string[], threshold: number, agentSig: string) => Promise<void>;
  /* is this key already an agent? resolves to its id, or null when free. */
  checkKey: (agentKey: string) => Promise<bigint | null>;
}) {
  const m = useMotionPrefs();
  /* the first screen is the first entry in `steps`, which is the key
     question now. leaving this at "about" opened the dialog three quarters of
     the way along its own progress bar. */
  const [step, setStep] = useState<Step>("key");
  const [mode, setMode] = useState<Mode>("paste");
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [pasted, setPasted] = useState("");
  const [wallet, setWallet] = useState<ethers.HDNodeWallet | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [ack, setAck] = useState([false, false, false]);
  /* registering with no guardians is permanent, so it is a decision taken
     rather than a step walked past. */
  const [noGuardiansAck, setNoGuardiansAck] = useState(false);
  const [tail, setTail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [taken, setTaken] = useState<bigint | null | "checking">(null);
  /* optional. extra wallets that can vote to pause, and after the delay,
     revoke. they can never spend and can never stop instantly. */
  const [guardians, setGuardians] = useState<string[]>([]);
  const [gInput, setGInput] = useState("");
  const [threshold, setThreshold] = useState(1);
  /* the agent key's consent. a generated key signs it here; a pasted key's
     owner has to bring it, because only the agent can sign as the agent. */
  const [consent, setConsent] = useState("");
  const [copiedMsg, setCopiedMsg] = useState(false);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    /* "key" is the first entry in `steps`. this reset also said "about", which
       is why reordering the flow was not enough on its own: the dialog opened
       on the fourth screen of its own progress bar, showing 2 of 4 and a Back
       button with nothing behind it. */
    setStep("key"); setMode("paste"); setName(""); setPurpose(""); setPasted("");
    setWallet(null); setRevealed(false); setCopied(false); setAck([false, false, false]); setNoGuardiansAck(false); setTail(""); setErr(null); setTaken(null); setGuardians([]); setGInput(""); setThreshold(1); setConsent(""); setCopiedMsg(false);
    setTimeout(() => first.current?.focus(), 60);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  const nameOk = name.trim().length >= 2 && name.trim().length <= 40;
  const pastedTrim = pasted.trim();
  const pastedValid = ethers.isAddress(pastedTrim);
  /* the key that stops the agent must not be the key that signs for it */
  const pastedSelf = pastedValid && pastedTrim.toLowerCase() === coldKey.toLowerCase();
  const agentKey = mode === "generate" ? wallet?.address ?? "" : pastedValid ? ethers.getAddress(pastedTrim) : "";
  const allAck = ack.every(Boolean);
  const tailOk = !!wallet && tail.trim().toLowerCase() === wallet.privateKey.slice(-TAIL).toLowerCase();

  const generate = () => { setWallet(ethers.Wallet.createRandom()); setRevealed(false); setCopied(false); setAck([false, false, false]); setTail(""); };

  async function copyKey() {
    if (!wallet) return;
    try { await navigator.clipboard.writeText(wallet.privateKey); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { setErr("Could not reach the clipboard. Reveal the key and copy it by hand."); }
  }

  async function submit() {
    setBusy(true); setErr(null);
    try {
      /* consent: the generated key signs in this dialog and the signature goes
         out with the registration; a pasted key's signature was pasted. */
      const sig = wallet ? await wallet.signMessage(consentMessage(conn, agentKey, coldKey)) : consent.trim();
      await onRegister(agentKey, { name: name.trim(), purpose: purpose.trim() || undefined }, guardians, guardians.length ? threshold : 0, sig);
      /* the generated key lives only in this dialog's state, and this is the
         end of the dialog. nothing about it is written anywhere. */
      setWallet(null);
      onClose();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  /* the key question leads.
   *
   * the name used to be first, and it is the cheapest thing here: a label,
   * written by its own transaction, changeable whenever you like. the question
   * that actually decides the shape of this dialog is whether the agent already
   * has a key, because answering "not yet" inserts a private key ceremony and
   * turns four screens into six. asking it first means the count on screen is
   * true from the moment it is knowable, and the ceremony is chosen rather than
   * stumbled into on screen three. */
  const steps: Step[] = mode === "generate" ? ["key", "save", "verify", "about", "guardians", "review"] : ["key", "about", "guardians", "review"];
  const at = steps.indexOf(step);
  const back = () => setStep(steps[Math.max(0, at - 1)]);
  const next = () => {
    const to = steps[Math.min(steps.length - 1, at + 1)];
    setStep(to);
    /* entering review: ask the chain whether this key is already somebody's
       agent, so the answer is on screen before the wallet is ever opened. */
    if (to === "review" && agentKey) {
      setTaken("checking");
      checkKey(agentKey).then(setTaken).catch(() => setTaken(null));
    }
  };

  const canNext =
    step === "about" ? nameOk :
    step === "key" ? (mode === "paste" ? pastedValid && !pastedSelf && consentValid(conn, ethers.getAddress(pastedTrim), coldKey, consent.trim()) : !!wallet) :
    step === "save" ? allAck && revealed :
    step === "verify" ? tailOk :
    step === "guardians" ? (guardians.length === 0 ? noGuardiansAck : (threshold >= 1 && threshold <= guardians.length)) : true;

  /* a textarea does not size itself to its content, so it is measured: reset
     the height, read what the content needs, apply that. done on input and
     once on mount, because a value restored from a previous step would
     otherwise open collapsed. */
  const fit = (el: HTMLTextAreaElement) => { el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; };
  const grow = useCallback((el: HTMLTextAreaElement | null) => { if (el) fit(el); }, []);

  const body = () => {
    switch (step) {
      case "about": return (
        <>
          {/* one line. the switch cannot see what an agent does, and the two
              field hints below already say what each box is for; two
              paragraphs on top of them were the same thing three times. */}
          <p className="text-sm text-ink/70 mb-4">The switch cannot see what this agent does, so name it in your words. The name goes on chain, signed by your wallet.</p>
          <Field label="Name" hint="Something you will recognise in a list at 3am. Two to forty characters.">
            <input ref={first} value={name} onChange={e => setName(e.target.value)} maxLength={40} placeholder="Treasury sweeper" autoComplete="off"
              className="text-sm w-full rounded-xl px-3 py-2.5 outline-none" style={inputStyle(name.length > 0 && !nameOk)} />
          </Field>
          <Field label="What it does" hint="Optional. What you would want to remember when deciding whether to stop it.">
            {/* one line at rest, like the name above it, and it grows as you
                type. rows={2} made this box half again as tall as the field it
                sits under while both were empty, which reads as two different
                kinds of thing rather than two answers to the same question.
                rows={1} would have been the wrong fix: two hundred characters
                would then scroll inside a single line. */}
            <textarea value={purpose} onChange={e => setPurpose(e.target.value)} maxLength={200} rows={1} placeholder="Moves idle USDC from the hot wallet to the treasury every hour"
              ref={grow} onInput={e => fit(e.currentTarget)}
              className="text-sm w-full rounded-xl px-3 py-2.5 outline-none resize-none overflow-hidden" style={inputStyle()} />
          </Field>
        </>
      );
      case "key": return (
        <>
          {/* the mechanics live in the two dotted terms, one tap away. the one
              thing that is not in a tooltip, that the wallet you are holding
              right now is about to be named on chain, is one line, not a box. */}
          <p className="text-sm text-ink/70 mb-1">An agent signs from an <Term k="agent address">address</Term> of its own. Your wallet becomes its <Term k="owner">owner</Term>.</p>
          <p className="text-[12.5px] mb-4" style={{ color: "var(--text-medium)" }}>That names this wallet <Term k="on chain forever">on chain</Term>. Use one that holds nothing; it only ever needs gas.</p>
          <div role="radiogroup" aria-label="The agent's key" className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
            {(["paste", "generate"] as Mode[]).map(k => (
              /* a choice, drawn as one: top aligned so both titles share a line
                 (a button centres its content, which left the shorter card's
                 text floating lower), a radio mark that fills when chosen, and
                 one line under each title */
              <button key={k} type="button" role="radio" aria-checked={mode === k} onClick={() => setMode(k)}
                className="rounded-[12px] px-3.5 py-3 text-left text-sm flex flex-col items-stretch justify-start gap-1 outline-none focus-visible:ring-2 transition-colors active:scale-[0.99]"
                style={{ border: `1px solid ${mode === k ? "var(--orange)" : "var(--hairline)"}`, background: mode === k ? "color-mix(in srgb, var(--orange) 8%, transparent)" : "transparent" }}>
                <span className="flex items-center gap-2">
                  <span className="font-semibold leading-snug flex-1 min-w-0">{k === "paste" ? "It already has one" : "I do not have one yet"}</span>
                  <span aria-hidden className="w-4 h-4 rounded-full shrink-0 inline-flex items-center justify-center" style={{ border: `1.5px solid ${mode === k ? "var(--orange)" : "var(--hairline)"}` }}>
                    {mode === k && <span className="w-2 h-2 rounded-full" style={{ background: "var(--orange)" }} />}
                  </span>
                </span>
                <span className="text-[12px] leading-snug" style={{ color: "var(--text-medium)" }}>{k === "paste" ? "Paste the address it signs with" : "Make a new key for it"}</span>
              </button>
            ))}
          </div>
          {mode === "paste" ? (<>
            <Field label="Agent address">
              <input value={pasted} onChange={e => setPasted(e.target.value)} placeholder="0x…" spellCheck={false} autoComplete="off"
                className="mono text-sm w-full rounded-xl px-3 py-2.5 outline-none" style={inputStyle(!!pastedTrim && (!pastedValid || pastedSelf))} />
              <div className="text-[11px] mt-1.5 min-h-[16px]" style={{ color: "var(--orange-text)" }}>
                {pastedTrim && !pastedValid ? "That is not an address." : pastedSelf ? "That is your own wallet. An agent needs a key of its own." : ""}
              </div>
            </Field>
            {pastedValid && !pastedSelf && (
              <Field label="The agent's consent" hint="Only the agent can sign as the agent. Without this, anyone who knew an agent's address could register it under their own wallet.">
                <p className="text-xs text-ink/70 mb-2">Have your agent sign this message with its key (personal_sign over these 32 bytes) and paste the signature.</p>
                <div className="flex gap-2 mb-2">
                  <code className="mono text-[11px] break-all flex-1 rounded-xl px-3 py-2" style={inputStyle()}>{ethers.hexlify(consentMessage(conn, ethers.getAddress(pastedTrim), coldKey))}</code>
                  <button type="button" className="drawn-btn btn-gold" style={{ padding: "6px 12px", fontSize: "0.75rem" }} onClick={async () => { try { await navigator.clipboard.writeText(ethers.hexlify(consentMessage(conn, ethers.getAddress(pastedTrim), coldKey))); setCopiedMsg(true); setTimeout(() => setCopiedMsg(false), 1400); } catch { /* the field is selectable */ } }}>{copiedMsg ? "Copied" : "Copy"}</button>
                </div>
                <input value={consent} onChange={e => setConsent(e.target.value)} placeholder="0x… signature, 65 bytes" spellCheck={false} autoComplete="off"
                  className="mono text-sm w-full rounded-xl px-3 py-2.5 outline-none" style={inputStyle(!!consent.trim() && !consentValid(conn, ethers.getAddress(pastedTrim), coldKey, consent.trim()))} />
                <div className="text-[11px] mt-1.5 min-h-[16px]" style={{ color: consent.trim() && consentValid(conn, ethers.getAddress(pastedTrim), coldKey, consent.trim()) ? "var(--sage-text)" : "var(--orange-text)" }}>
                  {consent.trim() ? (consentValid(conn, ethers.getAddress(pastedTrim), coldKey, consent.trim()) ? "Signed by that agent, for this owner." : "That signature is not from this agent address for this owner.") : ""}
                </div>
              </Field>
            )}
          </>) : (
            <div className="sheet p-4">
              {wallet ? (
                <>
                  <div className="eyebrow mb-1">Agent address</div>
                  <div className="mono text-sm break-all">{wallet.address}</div>
                  <div className="text-[11px] mt-2" style={{ color: "var(--text-medium)" }}>Made just now. Its private key comes next.</div>
                </>
              ) : (
                <>
                  <p className="text-sm text-ink/80 mb-3">A key only: there is no agent until you run software with it. Made in this browser, never sent anywhere, and the next screen shows its private key once.</p>
                  <button type="button" className="drawn-btn btn-gold" onClick={generate}>Make the key</button>
                </>
              )}
            </div>
          )}
        </>
      );
      case "save": return (
        <>
          <p className="text-sm text-ink/70 mb-3">Shown once, here, and nowhere else.</p>
          <div className="sheet p-4 mb-3">
            <div className="flex items-center justify-between gap-3 mb-2">
              <span className="eyebrow">Private key</span>
              <div className="flex gap-1.5">
                <button type="button" className="rounded-full px-3 py-1 text-xs" style={{ border: "1px solid var(--hairline)" }} onClick={() => setRevealed(v => !v)}>{revealed ? "Hide" : "Reveal"}</button>
                <button type="button" className="rounded-full px-3 py-1 text-xs" style={{ border: "1px solid var(--hairline)" }} onClick={copyKey} disabled={!revealed}>{copied ? "Copied" : "Copy"}</button>
              </div>
            </div>
            <div className="mono text-[13px] break-all leading-relaxed select-all" style={{ filter: revealed ? "none" : "blur(6px)", userSelect: revealed ? "all" : "none", transition: "filter .2s" }} aria-hidden={!revealed}>
              {wallet?.privateKey}
            </div>
          </div>
          <div>
            <Check on={ack[0]} set={v => setAck([v, ack[1], ack[2]])}>Anyone with this key can act as the agent, and stopping the agent does not recover what the key has already sent.</Check>
            <Check on={ack[1]} set={v => setAck([ack[0], v, ack[2]])}>It will not be shown again. Trustset does not store it and will never ask for it.</Check>
            <Check on={ack[2]} set={v => setAck([ack[0], ack[1], v])}>I have saved it somewhere that is not this browser tab.</Check>
          </div>
        </>
      );
      case "verify": return (
        <>
          <p className="text-sm text-ink/70 mb-4">Prove it is saved. Type the last {TAIL} characters of the private key from wherever you put it, not from the previous screen.</p>
          <Field label={`Last ${TAIL} characters`}>
            <input value={tail} onChange={e => setTail(e.target.value)} maxLength={TAIL} spellCheck={false} autoComplete="off" autoFocus
              className="mono text-sm w-full rounded-xl px-3 py-2.5 outline-none tracking-widest" style={inputStyle(tail.length === TAIL && !tailOk)} />
            <div className="text-[11px] mt-1.5 min-h-[16px]" style={{ color: tail.length === TAIL && !tailOk ? "var(--orange-text)" : "var(--sage-text)" }}>
              {tail.length === TAIL ? (tailOk ? "That matches." : "That does not match. Go back and save the key again if you are not sure.") : ""}
            </div>
          </Field>
        </>
      );
      case "guardians": {
        const gTrim = gInput.trim(); const gValid = ethers.isAddress(gTrim);
        const gDup = gValid && (guardians.some(g => g.toLowerCase() === gTrim.toLowerCase()) || gTrim.toLowerCase() === coldKey.toLowerCase() || gTrim.toLowerCase() === agentKey.toLowerCase());
        const add = () => { if (gValid && !gDup && guardians.length < 5) { setGuardians([...guardians, ethers.getAddress(gTrim)]); setGInput(""); setNoGuardiansAck(false); } };
        return (
          <>
            {/* one sentence. the mechanics, pause by vote, the delay, never
                spend, are in the Guardians tooltip a tap away; this screen used
                to print the tooltip, then a box saying it was permanent, then
                a checkbox saying both again. the permanence is stated once
                here and the consequence once in the checkbox. the contract has
                no setGuardians, addGuardian or removeGuardian, so once is the
                truth. */}
            <p className="text-sm text-ink/70 mb-4"><Term k="guardians">Guardians</Term> can pause this agent if you cannot. They are chosen now, and the switch cannot add or remove one later.</p>
            <Field label="Add a guardian wallet" hint={guardians.length >= 5 ? "Five is the most." : "Up to five. Not your own wallet, not the agent's key."}>
              <div className="flex gap-2">
                <input value={gInput} onChange={e => setGInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }} placeholder="0x…" spellCheck={false} autoComplete="off" disabled={guardians.length >= 5}
                  className="mono text-sm flex-1 min-w-0 rounded-xl px-3 py-2.5 outline-none" style={inputStyle(!!gTrim && (!gValid || gDup))} />
                <button type="button" className="drawn-btn btn-gold" disabled={!gValid || gDup || guardians.length >= 5} onClick={add}>Add</button>
              </div>
              <div className="text-[11px] mt-1.5 min-h-[16px]" style={{ color: "var(--orange-text)" }}>{gTrim && !gValid ? "That is not an address." : gDup ? "Already listed, or it is the owner or the agent address." : ""}</div>
            </Field>
            {guardians.length === 0 && (
              <div className="mb-4">
                <Check on={noGuardiansAck} set={setNoGuardiansAck}>
                  Register with none. This agent can never have guardians, and if I lose this wallet nobody can stop it.
                </Check>
              </div>
            )}
            {guardians.length > 0 && (
              <div className="sheet px-3 py-1 mb-4">
                {guardians.map((g, i) => (
                  <div key={g} className={`flex items-center gap-3 py-2 ${i ? "rule-top" : ""}`}>
                    <span className="mono text-xs break-all flex-1">{g}</span>
                    <button type="button" className="text-xs underline" style={{ color: "var(--text-medium)" }} onClick={() => { const next = guardians.filter(x => x !== g); setGuardians(next); setThreshold(t => Math.min(t, Math.max(1, next.length))); }}>Remove</button>
                  </div>
                ))}
              </div>
            )}
            {guardians.length > 0 && (
              <Field label="Votes needed to pause" hint={`${threshold} of ${guardians.length} guardians must vote before the agent pauses.`}>
                <div className="flex gap-1.5">
                  {guardians.map((_, i) => (
                    <button key={i} type="button" onClick={() => setThreshold(i + 1)} className="rounded-full w-9 h-9 text-sm font-semibold"
                      style={{ background: threshold === i + 1 ? "var(--pill-accent-bg)" : "transparent", color: threshold === i + 1 ? "var(--pill-accent-text)" : "var(--text-medium)", border: "1px solid var(--hairline)" }}>{i + 1}</button>
                  ))}
                </div>
              </Field>
            )}
          </>
        );
      }
      case "review": return (
        <>
          <p className="text-sm text-ink/70 mb-2">After this, the only thing that key can be is active, paused or stopped, and only your wallet decides which.</p>
          <p className="text-[12px] mb-4" style={{ color: "var(--text-medium)" }}>
            Both addresses below become public when this lands, and stay public. That is what lets anyone check who can stop the agent.
          </p>
          <dl className="sheet px-4 py-1 text-sm">
            {([
              ["Name", name.trim()],
              purpose.trim() ? ["What it does", purpose.trim()] : null,
              ["Agent address", agentKey],
              ["Owner", coldKey],
              ["Consent", wallet ? "Signed here by the generated key" : "Signed by the agent, verified"],
              ["Guardians", guardians.length ? `${threshold} of ${guardians.length}: ${guardians.map(g => g.slice(0, 6) + "…" + g.slice(-4)).join(", ")}` : "None"],
            ] as ([string, string] | null)[]).filter(Boolean).map(r => r as [string, string]).map(([k, v], i) => (
              <div key={k} className={`grid grid-cols-[110px_1fr] gap-3 py-2.5 ${i ? "rule-top" : ""}`}>
                <dt style={{ color: "var(--text-medium)" }}>{k === "Agent address" ? <Term k="agent address">{k}</Term> : k === "Owner" ? <Term k="owner">{k}</Term> : k === "Guardians" ? <Term k="guardians">{k}</Term> : k}</dt>
                <dd className={`${k.includes("key") ? "mono text-xs" : ""} break-all min-w-0`}>{v}</dd>
              </div>
            ))}
          </dl>
          {taken === "checking" && <p className="text-[11px] mt-3" style={{ color: "var(--text-medium)" }}>Checking the chain for this key…</p>}
          {typeof taken === "bigint" && <p className="text-sm mt-3" style={{ color: "var(--orange-text)" }}>This key is already registered as agent {taken.toString()}. Nothing to do.</p>}
          {taken === null && <p className="text-[11px] mt-3" style={{ color: "var(--text-medium)" }}>Two prompts from your wallet: one registers, one writes the name on chain.</p>}
        </>
      );
    }
  };

  const title: Record<Step, string> = { about: "What is this agent?", key: "Which address does your agent sign with?", save: "Save the private key", verify: "Confirm you saved it", guardians: "Who else can pause it, for good?", review: "Register on chain" };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-50" style={{ background: "rgba(0,0,0,0.45)" }}
            initial={m.reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={m.t(DUR.fast)} onClick={busy ? undefined : onClose} aria-hidden />
          <motion.div role="dialog" aria-modal="true" aria-label="Register an agent"
            className="fixed z-50 left-1/2 top-1/2 w-[calc(100vw-2rem)] max-w-[520px]"
            initial={m.reduced ? { opacity: 0, x: "-50%", y: "-50%" } : { opacity: 0, scale: 0.96, x: "-50%", y: "-50%" }}
            animate={{ opacity: 1, scale: 1, x: "-50%", y: "-50%" }}
            exit={m.reduced ? { opacity: 0, x: "-50%", y: "-50%" } : { opacity: 0, scale: 0.97, x: "-50%", y: "-50%" }}
            transition={m.t(DUR.base)}>
            <div className="drawn-box p-5 sm:p-6 max-h-[calc(100vh-4rem)] overflow-y-auto" style={{ background: "var(--surface)", backdropFilter: "none" }}>
              {/* progress: one dot per step, the current one lit */}
              <div className="flex items-center gap-1.5 mb-4" aria-hidden>
                {steps.map((s, i) => <span key={s} title={title[s]} className="h-1 rounded-full transition-all" style={{ width: i === at ? 22 : 8, background: i <= at ? "var(--orange)" : "var(--hairline)" }} />)}
                <span className="ml-auto text-[11px] tabular" style={{ color: "var(--text-medium)" }}>{at + 1} of {steps.length}</span>
              </div>
              <h2 className="text-lg font-semibold tracking-tight">{title[step]}</h2>

              {/* what you are building, filled in as you answer. six screens of
                  inputs with the first sight of the whole thing on the last one
                  asks the reader to hold it all in their head; this way the
                  agent takes shape where they can see it. it shows only what is
                  already decided, so it never promises anything. */}
              {(name.trim() || agentKey || guardians.length > 0) && (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2 mb-3 text-[11.5px]" style={{ color: "var(--text-medium)" }}>
                  {name.trim() && <span className="font-semibold" style={{ color: "var(--text-dark)" }}>{name.trim()}</span>}
                  {agentKey && <span className="mono">{agentKey.slice(0, 6)}…{agentKey.slice(-4)}</span>}
                  {guardians.length > 0 && <span>{guardians.length} guardian{guardians.length === 1 ? "" : "s"}, {threshold} to pause</span>}
                  {step === "guardians" && guardians.length === 0 && noGuardiansAck && <span>no guardians</span>}
                </div>
              )}

              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={step} initial={m.reduced ? false : { opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={m.reduced ? { opacity: 0 } : { opacity: 0, x: -8 }} transition={m.reduced ? { duration: 0.1 } : { duration: 0.22, ease: EASE }}>
                  {body()}
                </motion.div>
              </AnimatePresence>

              {err && <div className="sheet px-3 py-2 mt-3 mono text-[11px] break-all" style={{ color: "var(--orange-text)" }}>{err}</div>}

              <div className="flex gap-2 mt-5">
                {at > 0 && <button type="button" className="drawn-btn btn-gold" disabled={busy} onClick={back}>Back</button>}
                <button type="button" className="drawn-btn btn-gold ml-auto" disabled={busy} onClick={onClose}>Cancel</button>
                {step === "review"
                  ? <button type="button" className="drawn-btn btn-orange" disabled={busy || taken !== null} onClick={submit}>{busy ? "Waiting for your wallet…" : "Register"}</button>
                  : <button type="button" className="drawn-btn btn-orange" disabled={!canNext} onClick={next}>Continue</button>}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
