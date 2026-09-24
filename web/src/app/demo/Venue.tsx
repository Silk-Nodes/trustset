"use client";
import Tip, { InfoTip } from "@/components/Tip";
import { useCallback, useEffect, useRef, useState } from "react";
import { ethers } from "ethers";
import { motion, AnimatePresence } from "motion/react";
import { useWallet } from "@/components/WalletProvider";
import TxLink, { addrUrl } from "@/components/agents/TxLink";
import Term from "@/components/Term";
import { explain, settled } from "@/lib/chain";
import { useMotionPrefs } from "@/lib/motion";

/* the walkthrough.
 *
 * this page used to be three buttons and a log, which demonstrated the switch
 * and taught nothing. the product is not one feature, it is what you get for
 * registering an agent you already run: a switch, people who can pull it when
 * you cannot, an end date, a record. so the page is a sequence, each step
 * saying what problem it solves before it does anything, and each step a real
 * transaction on testnet rather than an animation.
 *
 * the second cut of it was seven identical cards with a button each, and the
 * only thing on screen that reacted to any of them was a nine pixel dot. the
 * premise is "your agent is already running" and nothing on the page was the
 * agent. so now something is: a card that breathes while the agent is trusted,
 * says which block it last checked the switch at, and goes cold when it is
 * switched off, with the refused trade landing on it. the reader is walked
 * through one step at a time rather than handed the list, and the switch
 * itself, which is the whole point, is the one moment the page makes a fuss of.
 *
 * nothing here is invented. the agent only trades when the reader presses the
 * button, so there is no activity feed pretending otherwise; every number on
 * the card is read from the chain, and the block it shows is the block the
 * page actually read it at.
 *
 * the agent is real and shared while nobody is connected: everyone who arrives
 * without a wallet acts on the same one, which is stated rather than hidden. */
type State = {
  agentId: string; agentKey: string; coldKey: string; guardian: string; owned: boolean;
  status: number; trades: number; venue: string; trusted: boolean; expired: boolean; lapsed: boolean; expiresAt: number;
  readAt: number; error?: string;
  /* present when the chain disagrees that this agent is the connected
     wallet's. the page stops offering the owner's controls rather than
     letting them revert. */
  mismatch?: { storedFor: string; actualColdKey: string };
};
type Line = { id: number; kind: Kind; hash?: string; block?: number | null };
type Kind = "accepted" | "refused" | "paused" | "resumed" | "guardian" | "limits" | "cleared";
type Act = "runs" | "switch" | "back" | "guardians" | "limits" | "human" | "record";

const SAID: Record<Kind, string> = {
  accepted: "Trade accepted", refused: "Trade refused, this transaction fails on purpose", paused: "Agent switched off",
  resumed: "Agent active again", guardian: "Guardian voted, agent paused", limits: "End date set",
  cleared: "End date cleared",
};
const ORDER: Act[] = ["runs", "switch", "back", "guardians", "limits", "human", "record"];
const EASE = [0.23, 1, 0.32, 1] as const;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
let seq = 0;

export default function Venue() {
  const w = useWallet();
  const m = useMotionPrefs();
  const me = w.who?.address ?? null;
  const [s, setS] = useState<State | null>(null);
  const [log, setLog] = useState<Line[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [seen, setSeen] = useState<Set<Act>>(new Set());
  const [open, setOpen] = useState<Set<Act>>(new Set());
  /* set once the saved progress has been read, so the first paint does not
     write an empty set back over it. */
  const [restored, setRestored] = useState(false);
  /* the block a trade was last refused at. it stays on the agent card until the
     agent changes status again, because that is the fact the reader came for. */
  const [refusedAt, setRefusedAt] = useState<number | null>(null);
  /* incremented when a pause lands, which plays the sweep once. */
  const [sweep, setSweep] = useState(0);
  const done = useCallback((a: Act) => setSeen(p => new Set(p).add(a)), []);
  /* getting the shared practice agent ready. "resetting" while the server
     clears what the last visitor left; "busy" when the break is fresh, which
     means somebody else is using it right now and it is left alone. */
  const [prep, setPrep] = useState<"idle" | "resetting" | "busy">("idle");
  const triedReset = useRef(false);

  const pull = useCallback(async (owner: string | null) => {
    const r = await fetch(`/api/demo${owner ? `?owner=${owner}` : ""}`, { cache: "no-store" });
    const j = (await r.json()) as State;
    if (j.error) { setNote(j.error); return; }
    setS(j);
  }, []);

  useEffect(() => {
    setS(null); setLog([]); setSeen(new Set()); setOpen(new Set()); setRefusedAt(null); setRestored(false);
    triedReset.current = false; setPrep("idle");
    pull(me).catch(e => setNote(String(e)));
  }, [me, pull]);

  /* a visitor without a wallet who finds the practice agent broken gets it
     reset, once per visit, before step one asks them to do anything. the
     server decides whether the break is stale enough to undo; if it is fresh,
     another visitor is mid-walkthrough and the page says so instead. */
  useEffect(() => {
    if (!s || s.owned || s.trusted || triedReset.current) return;
    if (s.status === 3 || s.status === 4) return;
    triedReset.current = true;
    setPrep("resetting");
    fetch("/api/demo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "reset", owner: null }) })
      .then(r => r.json())
      .then(j => {
        if (j.error) { setPrep("idle"); return; }
        setS(v => (v ? { ...v, ...j } : v));
        setPrep(j.busy ? "busy" : "idle");
      })
      .catch(() => setPrep("idle"));
  }, [s]);

  /* how far the reader got, kept across a navigation.
   *
   * steps six and seven send you to another page, and the walkthrough lives in
   * component state, so coming back remounted it and dropped you at step one
   * with everything you had already done undone. it looked like the passkey
   * step had failed and thrown the whole thing away.
   *
   * sessionStorage rather than localStorage: within this tab the position is
   * held, and a fresh visit starts at the beginning, which is what a
   * walkthrough should do. it is a convenience, so every access is guarded and
   * the page is correct without it, in a private window or with site data
   * blocked. the key carries the agent id, because progress against a shared
   * agent is not progress against the one your wallet owns. */
  const progressKey = s ? `trustset.demo.${s.agentId}` : null;
  useEffect(() => {
    if (!progressKey || restored) return;
    try {
      const raw = sessionStorage.getItem(progressKey);
      if (raw) setSeen(new Set(JSON.parse(raw) as Act[]));
    } catch { /* no storage here, so the walkthrough simply starts at the top */ }
    setRestored(true);
  }, [progressKey, restored]);
  useEffect(() => {
    if (!progressKey || !restored) return;
    try { sessionStorage.setItem(progressKey, JSON.stringify([...seen])); } catch { /* nothing to do */ }
  }, [seen, progressKey, restored]);
  /* the card says which block it last checked the switch at, so it has to keep
     checking. every twelve seconds, quietly; a failed read leaves the last one. */
  useEffect(() => { const t = setInterval(() => pull(me).catch(() => {}), 12_000); return () => clearInterval(t); }, [me, pull]);
  /* a ticking clock, because an end date runs out while you watch and nothing
     is sent when it does. */
  useEffect(() => { const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000); return () => clearInterval(t); }, []);
  /* once an end date is live, the chain is re-read as it passes so the page
     agrees with isTrusted rather than only with its own clock. */
  const expiring = !!s?.expiresAt && s.expiresAt > now;
  useEffect(() => {
    if (!s?.expiresAt) return;
    const t = setTimeout(() => pull(me).catch(() => {}), Math.max(1200, (s.expiresAt - now + 2) * 1000));
    return () => clearTimeout(t);
  }, [s?.expiresAt, expiring, me, pull]); // eslint-disable-line react-hooks/exhaustive-deps

  function record(kind: Kind, hash?: string, block?: number | null) {
    setLog(l => [{ id: ++seq, kind, hash, block }, ...l].slice(0, 10));
    if (kind === "refused") setRefusedAt(block ?? null);
    if (kind === "paused" || kind === "guardian") { setRefusedAt(null); setSweep(n => n + 1); }
    if (kind === "resumed") setRefusedAt(null);
  }

  /* a refusal only belongs on the card while the agent really is off. the card
     showed "trusted" in green and "trade refused at block X" underneath it at
     the same time, which is the page calling itself a liar: that refusal came
     from a stale demo registration, not from the switch. it is cleared the
     moment the chain says the agent is trusted again. */
  useEffect(() => { if (s?.trusted) setRefusedAt(null); }, [s?.trusted]);

  async function post(action: string, kind: Kind, act?: Act) {
    setBusy(action); setNote(null);
    try {
      const r = await fetch("/api/demo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, owner: me }) });
      const j = await r.json();
      if (j.error) { setNote(j.error); return; }
      setS(v => (v ? { ...v, ...j } : v));
      record(action === "trade" ? (j.ok ? "accepted" : "refused") : kind, j.hash, j.block);
      if (act) done(act);
    } catch (e) { setNote(String(e)); }
    finally { setBusy(null); }
  }

  /* when the reader holds the owner, the switch is theirs to sign and the
     server is refused if it tries. same call the console makes. */
  async function flip(to: 1 | 2, act?: Act) {
    if (!s) return;
    /* the chain, not the store, decides whose agent this is. */
    if (s.mismatch) { setNote(`This agent's owner is ${short(s.mismatch.actualColdKey)}, not your wallet, so it cannot be switched from here.`); return; }
    if (!s.owned) return post(to === 2 ? "pause" : "resume", to === 2 ? "paused" : "resumed", act);
    const c = w.conn, signer = w.who?.signer;
    if (!c || !signer) { setNote("Connect your wallet first"); return; }
    setBusy("flip"); setNote(null);
    try {
      const tx = await (c.ks.connect(signer) as ethers.Contract).setStatus(s.agentId, to, ethers.id(to === 2 ? "demo pause" : "demo resume"));
      const rc = await tx.wait(1);
      record(to === 2 ? "paused" : "resumed", tx.hash, rc?.blockNumber);
      /* the status word does not decide trust: an agent resumed while its end
         date is in the past is Active and still not trusted. so only the
         status is assumed here, and trust waits for the chain a line below. */
      setS(v => (v ? { ...v, status: to, trusted: to === 1 && !v.expired && !v.lapsed } : v));
      if (act) done(act);
      await settled(c, rc?.blockNumber); await pull(me);
    } catch (e) { setNote(explain(e, c ?? undefined)); }
    finally { setBusy(null); }
  }

  /* an end date, set by whoever actually holds the owner.
   *
   * this used to be server only, so connecting a wallet disabled it: the page
   * owned the agent, the server could not sign for it, and the step pointed at
   * the console instead. that stranded a connected reader at step five with
   * nothing to press and steps six and seven still folded behind it, which is
   * the walkthrough refusing to finish for the people most likely to be
   * evaluating it.
   *
   * setLimits wants the owner and nothing else, exactly like the stop does,
   * so it takes the same road: the server signs for the shared agent, and the
   * reader signs for their own. same call either way. */
  async function limits(seconds: number, act?: Act) {
    if (!s) return;
    if (s.mismatch) { setNote(`This agent's owner is ${short(s.mismatch.actualColdKey)}, not your wallet, so its end date cannot be set from here.`); return; }
    const kind: Kind = seconds ? "limits" : "cleared";
    const action = seconds ? "limits" : "clearLimits";
    if (!s.owned) return post(action, kind, act);
    const c = w.conn, signer = w.who?.signer;
    if (!c || !signer) { setNote("Connect your wallet first"); return; }
    setBusy(action); setNote(null);
    try {
      const until = seconds ? Math.floor(Date.now() / 1000) + seconds : 0;
      const tx = await (c.ks.connect(signer) as ethers.Contract).setLimits(s.agentId, until, 0);
      const rc = await tx.wait(1);
      record(kind, tx.hash, rc?.blockNumber);
      setS(v => (v ? { ...v, expiresAt: until } : v));
      if (act) done(act);
      await settled(c, rc?.blockNumber); await pull(me);
    } catch (e) { setNote(explain(e, c ?? undefined)); }
    finally { setBusy(null); }
  }

  const cfg = w.conn?.cfg;
  const off = !!s && !s.trusted;
  /* off means the switch does not trust it, for any of three reasons. paused
     is the only one a resume fixes: an expired or lapsed agent is still Active
     in the contract, so setStatus(Active) on it costs a transaction, emits a
     status change and leaves the agent exactly as untrusted as before. the
     controls that resume key off this, not off `off`. */
  const paused = s?.status === 2;
  const left = s?.expiresAt ? s.expiresAt - now : 0;
  /* the step the reader is on: the first one not yet done. everything after it
     waits, everything before it folds. */
  const current = ORDER.find(a => !seen.has(a)) ?? null;
  const stage = (a: Act): Stage => seen.has(a) ? (open.has(a) ? "reopened" : "done") : a === current ? "current" : "ahead";
  const toggle = (a: Act) => setOpen(p => { const n = new Set(p); if (n.has(a)) n.delete(a); else n.add(a); return n; });

  /* run it again.
   *
   * the walkthrough remembers how far you got, which is what you want when a
   * step sends you to another page and back. it is not what you want when you
   * have finished, or when you are halfway through and would rather start
   * over: there was no way back to step one short of a new tab, because the
   * progress outlives a reload.
   *
   * it only forgets. the chain keeps whatever the last run left, and step one
   * already says so and offers the way back, so there is nothing to undo here
   * and no transaction to send. */
  const restart = () => {
    setSeen(new Set()); setOpen(new Set()); setLog([]); setRefusedAt(null); setNote(null);
    try { if (progressKey) sessionStorage.removeItem(progressKey); } catch { /* nothing kept, nothing to clear */ }
    window.scrollTo({ top: 0, behavior: m.reduced ? "auto" : "smooth" });
  };

  const agent = <AgentCard s={s} off={off} refusedAt={refusedAt} reduced={m.reduced} resetting={prep === "resetting"} />;
  const rail = (
    <>
      <Console log={log} cfg={cfg} reduced={m.reduced} />
      <details className="sheet px-5 py-4 group">
        <summary className="text-[11px] mono uppercase tracking-[0.12em] cursor-pointer list-none flex items-center" style={{ color: "var(--text-medium)" }}>
          The addresses
          <span aria-hidden className="ml-auto transition-transform group-open:rotate-90">›</span>
        </summary>
        <p className="text-[12.5px] mt-3" style={{ color: "var(--text-medium)" }}>
          {s?.owned
            ? <>Your wallet is this agent&apos;s <Term k="owner">owner</Term>, so every switch here is yours to sign.</>
            : <>A shared agent, ours while you are not connected. Connect a wallet and the page registers one whose <Term k="owner">owner</Term> is yours, which puts your address <Term k="on chain forever">on chain forever</Term>.</>}
        </p>
        <dl className="mt-4 grid gap-2.5 text-[12px]">
          <Key label="Agent address" v={s?.agentKey} cfg={cfg} note="Signs the trades. Held by this server, because a browser cannot sign as the agent." />
          <Key label="Guardian" v={s?.guardian} cfg={cfg} note="Can vote to pause. Never spends." />
          <Key label="Venue" v={s?.venue} cfg={cfg} note="Checks the switch inside its own call." />
        </dl>
      </details>
      {note && (
        <div className="sheet px-4 py-3 text-[12.5px] break-words min-w-0" style={{ color: "var(--orange-text)", overflowWrap: "anywhere" }}>
          {note}
          <button type="button" onClick={() => setNote(null)} className="block mt-2 text-[11px] mono underline" style={{ color: "var(--text-medium)" }}>dismiss</button>
        </div>
      )}
    </>
  );

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start">
      {/* the switch landing is the one moment the page makes a fuss of: one
          pass of orange across everything, then gone. */}
      <AnimatePresence>
        {sweep > 0 && !m.reduced && (
          <motion.div key={sweep} aria-hidden className="fixed inset-0 pointer-events-none z-40 origin-left"
            style={{ background: "var(--orange)" }}
            initial={{ scaleX: 0, opacity: 0.32 }} animate={{ scaleX: 1, opacity: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.75, ease: EASE }} />
        )}
      </AnimatePresence>

      {/* on a phone the agent comes first, because it is the thing the steps act on */}
      {/* on a phone the card sticks to the top of the viewport. measured before
          this: from step five onward it sat at -314, -383 and -451, so the one
          thing on the page that reacts to the buttons was above the fold
          exactly while you were pressing them. the header is position relative
          measures relative, but its ancestor is pinned: after scrolling 1200px
          it still reported top 0 and bottom 64. so the card sits below that
          rather than at the top of the viewport, and under it in the stack. */}
      {/* compact while it sticks: at full size it covered a third of a phone
          screen, above the very buttons it reacts to. */}
      <div className="lg:hidden sticky top-[72px] z-20"><AgentCard s={s} off={off} refusedAt={refusedAt} reduced={m.reduced} resetting={prep === "resetting"} compact /></div>

      {s?.mismatch && (
        <div className="sheet px-5 py-4 lg:col-span-2" style={{ borderColor: "var(--orange)" }}>
          <div className="text-[15px] font-semibold">This agent is not your wallet&apos;s.</div>
          <p className="text-[13px] mt-1.5" style={{ color: "var(--text-medium)" }}>
            The switch says agent {s.agentId}&apos;s owner is <span className="mono">{short(s.mismatch.actualColdKey)}</span>, and you are connected as <span className="mono">{short(s.mismatch.storedFor)}</span>. The steps that need the owner are off here, because pressing them would only revert.
          </p>
          {/* the way out, not just the instruction. disconnecting drops the
              page back to the shared agent, which every step can drive, and it
              only forgets the address here: nothing is revoked in the wallet
              and no prompt is opened. */}
          <div className="flex flex-wrap items-center gap-3 mt-4">
            <Do label="Disconnect and use the shared agent" onClick={() => w.disconnect()} />
            <span className="text-[12.5px]" style={{ color: "var(--text-medium)" }}>Or connect the wallet that owns agent {s.agentId}.</span>
          </div>
        </div>
      )}

      <div className="grid gap-3 min-w-0">
        <Step n={1} stage={stage("runs")} onToggle={() => toggle("runs")} title="Your agent is already running"
          why="It holds a key and it trades." more="You wrote it, or you will. trustset did not create it and cannot make it do anything: all it knows is that this key is agent number one of yours.">
          {/* the shared agent keeps whatever state the last visitor left it in,
              so somebody who switched it off and closed the tab hands the next
              reader an agent that is already off. step one used to invite a
              trade anyway and promise the venue would accept it, which meant
              the walkthrough opened on a revert and copy saying that could not
              happen. it says what is true and offers the way back instead. */}
          {prep === "resetting"
            ? null
            : !off
            ? <Do label="Send a trade" busy={busy === "trade"} disabled={!s} onClick={() => post("trade", "accepted", "runs")} />
            : s?.status === 2
              ? <Do label="Bring it back first" busy={busy === "resume" || busy === "flip"} disabled={!s || !!s.mismatch} onClick={() => flip(1)} />
              : s?.expired || s?.lapsed
                ? <Do label={s.expired ? "Clear the end date first" : "Clear the heartbeat first"} busy={busy === "clearLimits"} disabled={!s || !!s.mismatch} onClick={() => limits(0)} />
                : s?.status === 3 || s?.status === 4
                  ? <Do label="Use the shared agent instead" tone="quiet" onClick={() => w.disconnect()} />
                  : null}
          <Aside tone={off && prep !== "resetting" ? "off" : "plain"}>
            {prep === "resetting"
              ? "Getting the practice agent ready. The last visitor left it off, so it is being reset for you: a real transaction, a few seconds."
              : prep === "busy" && off
              ? "Another visitor is using the practice agent right now, so it is left as they have it. It resets itself a few minutes after they finish, or bring it back yourself."
              : !off
              ? <>The venue accepts it because the switch says the agent is active. {s ? `${s.trades} trades so far.` : ""}</>
              : s?.status === 2
                ? "This agent is shared, and whoever came before left it switched off. A trade sent now would be refused, which is step two. Bring it back to start from the beginning."
                : s?.expired
                  ? (s.owned
                      ? "The end date on this agent has run out, so no app will serve it and a trade sent now would be refused. Your wallet is the owner, so clearing it is yours to sign."
                      : "This agent is shared, and whoever came before gave it an end date that has since run out, which is step five. A trade sent now would be refused. Clear the date to start from the beginning.")
                  : s?.lapsed
                    ? "This agent was given a heartbeat to keep and has missed it, so trust lapsed on its own and a trade sent now would be refused. Clearing the heartbeat starts it again."
                    : s?.status === 3 || s?.status === 4
                      ? "This agent was stopped for good. That is permanent by design, so there is no way to bring this one back. The shared agent is a fresh one to walk through."
                      : "The switch does not trust this agent right now, so a trade sent now would be refused."}
          </Aside>
        </Step>

        <Step n={2} stage={stage("switch")} onToggle={() => toggle("switch")} title="Something goes wrong. You switch it off."
          why="One transaction, and every app that checks refuses it next block." more="A key leaks, a strategy misfires, or you simply want it to stop. Nothing already mined is undone.">
          {!off
            ? <Do label="Switch it off" busy={busy === "pause" || busy === "flip"} disabled={!s || !!s.mismatch} onClick={() => flip(2)} />
            : <Do label="Send the same trade" busy={busy === "trade"} disabled={!s} onClick={() => post("trade", "refused", "switch")} />}
          <Aside>
            {!off
              ? "The same switch as the real agent at the top of the page, here on the practice agent, so you can send the same trade again and watch the venue refuse it."
              : "The agent is off. Refused inside the venue's own call, so nothing upstream can skip it. The explorer marks this one failed, and that is the proof: a refusal that went through would not be a refusal."}
          </Aside>
        </Step>

        <Step n={3} stage={stage("back")} onToggle={() => toggle("back")} title="It is a breaker, not a fuse"
          why="Pause while you look into it, bring it back when you are done." more="A stop that cannot be undone is a fuse, and people hesitate to pull a fuse. Only ending it for good is permanent.">
          <Do label={paused ? "Bring it back" : "It is back"} busy={busy === "resume" || busy === "flip"} disabled={!s || !paused || !!s.mismatch} onClick={() => flip(1, "back")} />
        </Step>

        <Step n={4} stage={stage("guardians")} onToggle={() => toggle("guardians")} title="Who stops it when you cannot?"
          why="People you chose pause it by vote." more="For when you are asleep, or the wallet is in a drawer. Guardians can never spend from it and never end it outright, and you can undo anything they do.">
          {!paused
            ? <Do label="Have a guardian vote" busy={busy === "guardianVote"} disabled={!s} onClick={() => post("guardianVote", "guardian")} />
            : <Do label="Undo it, as the owner" busy={busy === "resume" || busy === "flip"} disabled={!s || !!s.mismatch} onClick={() => flip(1, "guardians")} />}
          <Aside>
            {!paused
              ? "This agent has one guardian and needs one vote. Yours would have as many as you name and the threshold you set."
              : "The guardian paused it. Your wallet overrules a guardian, which is why they can never lock you out."}
          </Aside>
        </Step>

        <Step n={5} stage={stage("limits")} onToggle={() => toggle("limits")} title="Trust that ends by itself"
          why="An end date, or a heartbeat it has to keep." more="When the date passes or a beat is missed it stops being trusted, with nobody sending anything and nobody needing to be awake.">
          {!s?.expiresAt && <Do label="Trust it for 90 seconds" busy={busy === "limits"} disabled={!s || !!s.mismatch} onClick={() => limits(90, "limits")} />}
          {!!s?.expiresAt && (
            <Aside tone={left > 0 ? "plain" : "off"}>
              {left > 0
                ? <>Runs out in <span className="mono tabular">{left}s</span>. Watch: nothing will be sent, and it will stop being trusted anyway.</>
                : <>It ran out. No transaction ended it, and no app will serve it now.</>}
            </Aside>
          )}
          {!!s?.expiresAt && <Do label="Clear the end date" busy={busy === "clearLimits"} tone="quiet" disabled={!s || !!s.mismatch} onClick={() => limits(0)} />}
          {s?.owned && <Aside>Your wallet is the owner, so this one is yours to sign.</Aside>}
        </Step>

        <Step n={6} stage={stage("human")} onToggle={() => toggle("human")} title="A switch you can reach without a wallet"
          why="A fingerprint on your phone can pause it." more="The emergency is exactly when the wallet is on another machine. The passkey is verified on chain by Monad's P256 precompile. It can pause and nothing else, so a lost phone costs you an interruption rather than an agent.">
          {/* a new tab, because the panic page is meant to be opened on a phone
              and because leaving this one mid walkthrough is how the reader
              lost their place. */}
          <a href={`/panic?id=${s?.agentId ?? ""}`} target="_blank" rel="noreferrer" className="drawn-btn btn-gold" style={{ padding: "9px 16px", fontSize: "0.85rem" }} onClick={() => done("human")}>Open the panic page</a>
          <Do label="I have no passkey, carry on" tone="quiet" onClick={() => done("human")} />
          <Aside>Needs a phone and an https address, so it will not work over a bare IP. Nominating a passkey needs the owner, so it lives in the console beside your own agents, not here. Or skip: the last step does not depend on it.</Aside>
        </Step>

        <Step n={7} stage={stage("record")} onToggle={() => toggle("record")} title="And it is all on the record" last
          why="Every line above happened on Monad." more="None of it can be edited afterwards, by us or by you. Anyone deciding whether to deal with this agent can read the same history.">
          <a href={`/explorer/${s?.agentId ?? ""}`} target="_blank" rel="noreferrer" className="drawn-btn btn-orange" style={{ padding: "9px 16px", fontSize: "0.85rem" }} onClick={() => done("record")}>See this agent&apos;s history</a>
        </Step>

        {/* offered as soon as anything is done, not only at the end: somebody
            stuck in the middle wants it more than somebody who finished. */}
        {seen.size > 0 && (
          <div className="flex flex-wrap items-center gap-3 px-1 pt-1">
            <Do label="Run it again" tone="quiet" onClick={restart} />
            <span className="text-[12.5px]" style={{ color: "var(--text-medium)" }}>
              Puts the steps back to the top. Nothing on chain is undone, and the record stays.
            </span>
          </div>
        )}
      </div>

      <div className="hidden lg:grid gap-4 lg:sticky lg:top-20">{agent}{rail}</div>
      <div className="lg:hidden grid gap-4">{rail}</div>
    </div>
  );
}

/* the agent, as a thing on the page rather than a row of addresses. */
function AgentCard({ s, off, refusedAt, reduced, resetting, compact = false }: { s: State | null; off: boolean; refusedAt: number | null; reduced: boolean; resetting?: boolean; compact?: boolean }) {
  const word = !s ? "reading the chain" : resetting ? "getting ready" : s.trusted ? "trusted" : s.expired ? "expired" : s.status === 2 ? "switched off" : "not trusted";
  const tone = off ? "var(--orange)" : "var(--sage)";
  return (
    <div className={`sheet ${compact ? "px-4 py-3" : "p-5"} relative overflow-hidden`} style={{
      background: off ? "color-mix(in srgb, var(--orange) 7%, var(--surface))" : "var(--surface)",
      transition: reduced ? "none" : "background .45s ease",
    }}>
      <div className="flex items-center gap-3">
        <span className="relative inline-flex w-3 h-3 shrink-0">
          {!off && s && !reduced && (
            <motion.span aria-hidden className="absolute inset-0 rounded-full" style={{ background: tone }}
              animate={{ scale: [1, 2.6], opacity: [0.45, 0] }} transition={{ duration: 1.9, repeat: Infinity, ease: "easeOut" }} />
          )}
          <span className="relative w-3 h-3 rounded-full" style={{ background: s ? tone : "var(--hairline)", transition: reduced ? "none" : "background .3s" }} />
        </span>
        <span className={`${compact ? "text-[18px]" : "text-[22px]"} font-semibold tracking-[-0.02em] leading-none`}>{word}</span>
        {compact && s && <span className="mono text-[11px] tabular" style={{ color: "var(--text-medium)" }}>{s.trades} trades</span>}
        <span className="ml-auto mono text-[11px]" style={{ color: "var(--text-medium)" }}>agent {s?.agentId ?? "…"}</span>
      </div>
      {/* what this agent is, in one line, because the page has two: the real
          one at the top and this one, which the steps act on */}
      {!compact && <p className="text-[12px] mt-2" style={{ color: "var(--text-medium)" }}>
        {!s ? "\u00a0" : s.owned ? "Your agent. Your wallet is its owner." : "Shared by visitors. Press anything."}
      </p>}

      {!compact && <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <div className="text-[10.5px] mono uppercase tracking-[0.12em]" style={{ color: "var(--text-medium)" }}>Trades</div>
          <div className="mono tabular text-[26px] leading-none mt-1">{s ? s.trades : "…"}</div>
        </div>
        <div>
          <div className="text-[10.5px] mono uppercase tracking-[0.12em]" style={{ color: "var(--text-medium)" }}>
            <span className="sm:hidden">Read at block</span><span className="hidden sm:inline">Checked the switch at</span>
          </div>
          <div className="mono tabular text-[26px] leading-none mt-1">{s ? s.readAt : "…"}</div>
        </div>
      </div>}

      <AnimatePresence initial={false}>
        {refusedAt !== null && off && (
          <motion.div key="refused" initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.28, ease: EASE }}
            className="mt-4 pt-3 text-[13px] font-semibold break-words" style={{ borderTop: "1px solid var(--hairline)", color: "var(--orange-text)" }}>
            <Tip text="The venue asked the switch and the switch said no, so the transaction failed. That is the point, not a fault.">Trade refused at block <span className="mono tabular">{refusedAt}</span>.</Tip>
          </motion.div>
        )}
      </AnimatePresence>
      {!compact && !(refusedAt !== null && off) && (
        <p className="mt-4 pt-3 text-[12px]" style={{ borderTop: "1px solid var(--hairline)", color: "var(--text-medium)" }}>
          {!s ? "" : <Tip text="The page re-reads the chain every twelve seconds.">{off ? "Every app that checks refuses this key." : "Every app that checks will serve this key."}</Tip>}
        </p>
      )}
    </div>
  );
}

/* what happened, as a tail rather than a list. */
function Console({ log, cfg, reduced }: { log: Line[]; cfg?: Parameters<typeof TxLink>[0]["cfg"]; reduced: boolean }) {
  return (
    <div className="sheet p-5">
      <div className="text-[11px] mono uppercase tracking-[0.12em] mb-2.5" style={{ color: "var(--text-medium)" }}>On chain</div>
      {log.length === 0 && <p className="text-[12.5px]" style={{ color: "var(--text-medium)" }}>Nothing sent yet.</p>}
      <ul className="grid">
        <AnimatePresence initial={false}>
          {log.map(l => {
            const warm = l.kind === "refused" || l.kind === "paused" || l.kind === "guardian";
            return (
              <motion.li key={l.id} layout={!reduced}
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: -6, backgroundColor: "rgba(232,85,43,0.16)" }}
                animate={{ opacity: 1, y: 0, backgroundColor: "rgba(232,85,43,0)" }} exit={{ opacity: 0 }}
                transition={{ duration: 0.24, ease: EASE, backgroundColor: { duration: 1.4 } }}
                className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 text-[12.5px] py-1 -mx-1.5 px-1.5 rounded-md">
                <span className="mono tabular text-[11px]" style={{ color: warm ? "var(--orange-text)" : "var(--text-medium)" }}>{l.block ?? "…"}</span>
                <span className="truncate">{SAID[l.kind]}</span>
                <TxLink cfg={cfg} hash={l.hash} label="tx" />
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </div>
  );
}

type Stage = "done" | "reopened" | "current" | "ahead";

/* one step. the reader is on exactly one of these at a time; the ones behind
   fold to a line, the ones ahead wait without offering anything to press,
   because a button that cannot be pressed yet reads as a broken button. */
function Step({ n, stage, onToggle, title, why, more, children, last }: {
  n: number; stage: Stage; onToggle: () => void; title: string; why: string;
  /* the rest of the reasoning, on the title's tip: one sentence stays in view */
  more?: string; children: React.ReactNode; last?: boolean;
}) {
  const isDone = stage === "done" || stage === "reopened";
  const showBody = stage === "current" || stage === "reopened";
  /* a step ahead is receded with colour, never with opacity.
     
     the first cut faded the whole step to 55%, which blends the text AND the
     card it sits on toward the page behind: body copy measured 2.73:1 on the
     light ground and 3.55:1 on the dark one, both under the 4.5 a person has
     to be able to read. it also showed the full explanation of a step the
     reader has not reached, which is the opposite of walking them through one
     at a time. so a step ahead now shows its title and nothing else, at a
     colour that is quiet and still legible. */
  return (
    <div className="grid grid-cols-[32px_minmax(0,1fr)] gap-3 sm:gap-4">
      <div className="relative flex flex-col items-center">
        <span className="w-8 h-8 rounded-full grid place-items-center text-[12px] font-semibold mono shrink-0"
          style={{
            background: isDone ? "var(--sage)" : stage === "current" ? "var(--pill-accent-bg)" : "transparent",
            color: isDone ? "var(--bg-base)" : stage === "current" ? "var(--pill-accent-text)" : "var(--text-medium)",
            border: stage === "ahead" ? "1px solid var(--hairline)" : "1px solid transparent",
            transition: "background .3s, color .3s",
          }}>
          {isDone ? "✓" : n}
        </span>
        {!last && <span className="w-px flex-1 mt-1" style={{ background: "var(--hairline)" }} />}
      </div>

      {/* the step you are on is ringed, not tagged down one edge. the inset bar
          read as a decoration stuck to the side of a card rather than as the
          card being the live one; a border the whole way round says it without
          ornament. it replaces the hairline rather than adding to it, so
          nothing shifts by a pixel when a step becomes current. */}
      <div className="sheet min-w-0" style={{
        borderColor: stage === "current" ? "var(--orange)" : "var(--hairline)",
        transition: "border-color .3s",
      }}>
        {isDone ? (
          <button type="button" onClick={onToggle} className="w-full text-left px-5 sm:px-6 py-3.5 flex items-center gap-3">
            <h2 className="text-[15px] font-semibold tracking-tight truncate">{title}</h2>
            <span className="ml-auto text-[11px] mono shrink-0" style={{ color: "var(--text-medium)" }}>{showBody ? "fold" : "show"}</span>
          </button>
        ) : stage === "ahead" ? (
          <div className="px-5 sm:px-6 py-4 flex items-center gap-3">
            <h2 className="text-[15px] font-semibold tracking-tight truncate" style={{ color: "var(--text-medium)" }}>{title}</h2>
          </div>
        ) : (
          <div className="px-5 sm:px-6 pt-5 sm:pt-6">
            <h2 className="text-lg sm:text-xl font-semibold tracking-tight">{title}{more && <InfoTip text={more} />}</h2>
            <p className="text-sm mt-2 max-w-[62ch]" style={{ color: "var(--text-medium)" }}>{why}</p>
          </div>
        )}
        {showBody && (
          <div className={`px-5 sm:px-6 pb-5 sm:pb-6 ${isDone ? "pt-1" : "pt-4"}`}>
            {isDone && <p className="text-sm mb-4 max-w-[62ch]" style={{ color: "var(--text-medium)" }}>{why}</p>}
            <div className="flex flex-wrap items-center gap-2">{children}</div>
          </div>
        )}

      </div>
    </div>
  );
}

function Do({ label, onClick, busy, disabled, tone }: { label: string; onClick: () => void; busy?: boolean; disabled?: boolean; tone?: "quiet" }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled || busy}
      className={`drawn-btn ${tone === "quiet" ? "btn-gold" : "btn-orange"}`}
      style={{ padding: "9px 16px", fontSize: "0.85rem", opacity: disabled || busy ? 0.55 : 1 }}>
      {busy ? "Sending…" : label}
    </button>
  );
}

function Aside({ children, tone }: { children: React.ReactNode; tone?: "plain" | "off" }) {
  return <p className="basis-full text-[12.5px] mt-0.5" style={{ color: tone === "off" ? "var(--orange-text)" : "var(--text-medium)" }}>{children}</p>;
}

function Key({ label, v, note, cfg }: { label: string; v?: string; note: string; cfg?: { explorer?: string } }) {
  const url = v ? addrUrl(cfg as never, v) : null;
  return (
    <div>
      <dt className="text-[10.5px] mono uppercase tracking-[0.12em]" style={{ color: "var(--text-medium)" }}>{label}</dt>
      <dd className="mono text-[11.5px] break-all">{v ? (url ? <a href={url} target="_blank" rel="noreferrer" className="hover:underline">{v}</a> : v) : "…"}</dd>
      <dd style={{ color: "var(--text-medium)" }}>{note}</dd>
    </div>
  );
}
