"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
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
 * you cannot, an end date, a record. so the page is now a sequence, each step
 * saying what problem it solves before it does anything, and each step a real
 * transaction on testnet rather than an animation.
 *
 * the agent is real and shared while nobody is connected: everyone who arrives
 * without a wallet acts on the same one, which is stated rather than hidden. */
type State = {
  agentId: string; agentKey: string; coldKey: string; guardian: string; owned: boolean;
  status: number; trades: number; venue: string; trusted: boolean; expired: boolean; expiresAt: number;
  error?: string;
};
type Line = { id: number; kind: Kind; hash?: string; block?: number | null };
type Kind = "accepted" | "refused" | "paused" | "resumed" | "guardian" | "limits" | "cleared";
type Act = "runs" | "switch" | "back" | "guardians" | "limits" | "human" | "record";

const SAID: Record<Kind, string> = {
  accepted: "Trade accepted", refused: "Trade refused on chain", paused: "Agent switched off",
  resumed: "Agent active again", guardian: "Guardian voted, agent paused", limits: "End date set",
  cleared: "End date cleared",
};
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
  const done = useCallback((a: Act) => setSeen(p => new Set(p).add(a)), []);

  const pull = useCallback(async (owner: string | null) => {
    const r = await fetch(`/api/demo${owner ? `?owner=${owner}` : ""}`, { cache: "no-store" });
    const j = (await r.json()) as State;
    if (j.error) { setNote(j.error); return; }
    setS(j);
  }, []);

  useEffect(() => { setS(null); setLog([]); setSeen(new Set()); pull(me).catch(e => setNote(String(e))); }, [me, pull]);
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

  async function post(action: string, kind: Kind, act: Act) {
    setBusy(action); setNote(null);
    try {
      const r = await fetch("/api/demo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, owner: me }) });
      const j = await r.json();
      if (j.error) { setNote(j.error); return; }
      setS(v => (v ? { ...v, ...j } : v));
      const k: Kind = action === "trade" ? (j.ok ? "accepted" : "refused") : kind;
      setLog(l => [{ id: ++seq, kind: k, hash: j.hash, block: j.block }, ...l].slice(0, 10));
      done(act);
    } catch (e) { setNote(String(e)); }
    finally { setBusy(null); }
  }

  /* when the reader holds the cold key, the switch is theirs to sign and the
     server is refused if it tries. same call the console makes. */
  async function flip(to: 1 | 2, act: Act) {
    if (!s) return;
    if (!s.owned) return post(to === 2 ? "pause" : "resume", to === 2 ? "paused" : "resumed", act);
    const c = w.conn, signer = w.who?.signer;
    if (!c || !signer) { setNote("Connect your wallet first"); return; }
    setBusy("flip"); setNote(null);
    try {
      const tx = await (c.ks.connect(signer) as ethers.Contract).setStatus(s.agentId, to, ethers.id(to === 2 ? "demo pause" : "demo resume"));
      const rc = await tx.wait(1);
      const k: Kind = to === 2 ? "paused" : "resumed";
      setLog(l => [{ id: ++seq, kind: k, hash: tx.hash, block: rc?.blockNumber }, ...l].slice(0, 10));
      setS(v => (v ? { ...v, status: to, trusted: to === 1 } : v));
      done(act);
      await settled(c, rc?.blockNumber); await pull(me);
    } catch (e) { setNote(explain(e, c ?? undefined)); }
    finally { setBusy(null); }
  }

  const cfg = w.conn?.cfg;
  const off = !!s && !s.trusted;
  const left = s?.expiresAt ? s.expiresAt - now : 0;

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start">
      <div className="grid gap-4 min-w-0">
        <Step n={1} act="runs" seen={seen} title="Your agent is already running"
          why="You wrote it, or you will. It holds a key and it trades. trustset did not create it and cannot make it do anything: all it knows is that this key is agent number one of yours.">
          <Do label="Send a trade" busy={busy === "trade"} disabled={!s} onClick={() => post("trade", "accepted", "runs")} />
          <Aside>The venue accepts it because the switch says the agent is active. {s ? `${s.trades} trades so far.` : ""}</Aside>
        </Step>

        <Step n={2} act="switch" seen={seen} title="Something goes wrong. You switch it off."
          why="A key leaks, a strategy misfires, or you simply want it to stop. One transaction from your wallet, and from the next block every app that checks refuses that key. Nothing already mined is undone.">
          <Do label={off ? "Already off" : "Switch it off"} busy={busy === "pause" || busy === "flip"} disabled={!s || off} onClick={() => flip(2, "switch")} />
          <Do label="Send the same trade" busy={busy === "trade"} disabled={!s} tone="quiet" onClick={() => post("trade", "refused", "switch")} />
          <Aside>Refused inside the venue&apos;s own call, so nothing upstream can skip it. The refusal is a real transaction that reverted.</Aside>
        </Step>

        <Step n={3} act="back" seen={seen} title="It is a breaker, not a fuse"
          why="A stop that cannot be undone is a fuse, and people hesitate to pull a fuse. This one goes both ways: pause while you look into it, bring it back when you are satisfied. Only ending it for good is permanent.">
          <Do label="Bring it back" busy={busy === "resume" || busy === "flip"} disabled={!s || !off} onClick={() => flip(1, "back")} />
        </Step>

        <Step n={4} act="guardians" seen={seen} title="Who stops it when you cannot?"
          why="You are asleep, or the wallet is in a drawer. Guardians are people you chose who can pause your agent by vote. They can never spend from it and never end it outright, and you can undo anything they do.">
          <Do label="Have a guardian vote" busy={busy === "guardianVote"} disabled={!s || off} onClick={() => post("guardianVote", "guardian", "guardians")} />
          <Aside>This agent has one guardian and needs one vote. Yours would have as many as you name and the threshold you set.</Aside>
        </Step>

        <Step n={5} act="limits" seen={seen} title="Trust that ends by itself"
          why="Most agents should not be trusted forever. Give one an end date and it stops being trusted when the date passes, with nobody sending anything and nobody needing to be awake. A heartbeat does the same for silence: miss it and the trust lapses.">
          <Do label="Trust it for 90 seconds" busy={busy === "limits"} disabled={!s || s.owned} onClick={() => post("limits", "limits", "limits")} />
          {!!s?.expiresAt && (
            <Aside tone={left > 0 ? "plain" : "off"}>
              {left > 0
                ? <>Runs out in <span className="mono tabular">{left}s</span>. Watch: nothing will be sent, and it will stop being trusted anyway.</>
                : <>It ran out. No transaction ended it, and no app will serve it now.</>}
            </Aside>
          )}
          {!!s?.expiresAt && <Do label="Clear the end date" busy={busy === "clearLimits"} tone="quiet" disabled={!s} onClick={() => post("clearLimits", "cleared", "limits")} />}
          {s?.owned && <Aside>Your wallet holds the cold key here, so set this one from the console instead.</Aside>}
        </Step>

        <Step n={6} act="human" seen={seen} title="A switch you can reach without a wallet"
          why="The emergency is exactly when the wallet is on another machine. A passkey on your phone can pause the agent with a fingerprint, verified on chain by Monad's own P256 precompile. It can pause and nothing else, so a lost phone costs you an interruption rather than an agent.">
          <Link href={`/panic?id=${s?.agentId ?? ""}`} className="drawn-btn btn-gold" style={{ padding: "9px 16px", fontSize: "0.85rem" }} onClick={() => done("human")}>Open the panic page</Link>
          <Aside>Needs a phone and an https address, so it will not work over a bare IP.</Aside>
        </Step>

        <Step n={7} act="record" seen={seen} title="And it is all on the record"
          why="Every line above happened on Monad and none of it can be edited afterwards, by us or by you. Anyone deciding whether to deal with this agent can read the same history."
          last>
          <Link href={`/explorer/${s?.agentId ?? ""}`} className="drawn-btn btn-orange" style={{ padding: "9px 16px", fontSize: "0.85rem" }} onClick={() => done("record")}>See this agent&apos;s history</Link>
        </Step>
      </div>

      {/* the side rail: what the agent is, what happened, who holds what */}
      <div className="grid gap-4 lg:sticky lg:top-20">
        <div className="sheet p-5">
          <div className="flex items-center gap-2">
            <span className="w-[9px] h-[9px] rounded-full" style={{ background: off ? "var(--orange)" : "var(--sage)" }} />
            <span className="text-[11px] mono uppercase tracking-[0.12em]" style={{ color: "var(--text-medium)" }}>
              {!s ? "reading the chain" : s.trusted ? "trusted" : s.expired ? "expired" : "switched off"}
            </span>
            <span className="ml-auto mono text-[11px]" style={{ color: "var(--text-medium)" }}>agent {s?.agentId ?? "…"}</span>
          </div>
          <p className="text-[12.5px] mt-3" style={{ color: "var(--text-medium)" }}>
            {s?.owned
              ? <>Your wallet is this agent&apos;s <Term k="cold key">cold key</Term>, so every switch here is yours to sign.</>
              : <>A shared agent, ours while you are not connected. Connect a wallet and the page registers one whose <Term k="cold key">cold key</Term> is yours, which puts your address <Term k="on chain forever">on chain forever</Term>.</>}
          </p>
          <dl className="mt-4 grid gap-2.5 text-[12px]">
            <Key label="Agent key" v={s?.agentKey} cfg={cfg} note="Signs the trades. Held by this server, because a browser cannot sign as the agent." />
            <Key label="Guardian" v={s?.guardian} cfg={cfg} note="Can vote to pause. Never spends." />
            <Key label="Venue" v={s?.venue} cfg={cfg} note="Checks the switch inside its own call." />
          </dl>
        </div>

        <div className="sheet p-5">
          <div className="text-[11px] mono uppercase tracking-[0.12em] mb-2.5" style={{ color: "var(--text-medium)" }}>On chain</div>
          {log.length === 0 && <p className="text-[12.5px]" style={{ color: "var(--text-medium)" }}>Nothing sent yet.</p>}
          <ul className="grid gap-1.5">
            <AnimatePresence initial={false}>
              {log.map(l => (
                <motion.li key={l.id} layout={!m.reduced} initial={m.reduced ? { opacity: 0 } : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
                  className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px]">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: l.kind === "refused" || l.kind === "paused" || l.kind === "guardian" ? "var(--orange)" : "var(--sage)" }} />
                  <span>{SAID[l.kind]}</span>
                  <span className="mono ml-auto" style={{ color: "var(--text-medium)" }}>{l.block}</span>
                  <TxLink cfg={cfg} hash={l.hash} label="tx" />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </div>

        {note && <div className="sheet px-4 py-3 text-[12.5px]" style={{ color: "var(--orange-text)" }}>{note}</div>}
      </div>
    </div>
  );
}

function Step({ n, act, seen, title, why, children, last }: {
  n: number; act: Act; seen: Set<Act>; title: string; why: string; children: React.ReactNode; last?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isDone = seen.has(act);
  return (
    <div ref={ref} className="grid grid-cols-[32px_minmax(0,1fr)] gap-3 sm:gap-4">
      <div className="relative flex flex-col items-center">
        <span className="w-8 h-8 rounded-full grid place-items-center text-[12px] font-semibold mono shrink-0 transition-colors"
          style={{ background: isDone ? "var(--sage)" : "color-mix(in srgb, var(--text-dark) 6%, transparent)", color: isDone ? "var(--bg-base)" : "var(--text-medium)" }}>
          {isDone ? "✓" : n}
        </span>
        {!last && <span className="w-px flex-1 mt-1" style={{ background: "var(--hairline)" }} />}
      </div>
      <div className="sheet p-5 sm:p-6 mb-1 min-w-0">
        <h2 className="text-lg sm:text-xl font-semibold tracking-tight">{title}</h2>
        <p className="text-sm mt-2 max-w-[62ch]" style={{ color: "var(--text-medium)" }}>{why}</p>
        <div className="flex flex-wrap items-center gap-2 mt-4">{children}</div>
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
