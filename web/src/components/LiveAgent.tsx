"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { useMotionPrefs } from "@/lib/motion";

/* the live agent, saying what it is doing.
 *
 * the rest of the site reads the chain. this reads the agent: a process on our
 * server that asks the switch every minute and writes down the answer. switch
 * it off and within a minute it says so itself and stops spending, which is the
 * half of enforcement that never appears in a block: an agent choosing to obey.
 *
 * it is the agent's own claim about itself, so the card says whose claim it is,
 * and puts the chain's answer beside it. */
type State = {
  agentId: string; key: string; explorer: string;
  said: { why: string; at: string; balance: string } | null;
  coldKey: string; holdsColdKey: boolean; handoverAt: number; erc8004: number | null;
  chain: { trusted: boolean; expired: boolean; lapsed: boolean; status: number };
  error?: string;
};
const SAYS: Record<string, string> = {
  trusted: "Trusted. Working.",
  paused: "Not acting: the switch says paused.",
  stopped: "Not acting: stopped for good.",
  expired: "Not acting: its end date passed.",
  silent: "Not acting: it went quiet and lapsed.",
};

export default function LiveAgent() {
  const m = useMotionPrefs();
  const [s, setS] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [tx, setTx] = useState<{ hash: string; block: number | null } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [asking, setAsking] = useState(false);

  const pull = useCallback(async () => {
    try {
      const r = await fetch("/api/live-agent", { cache: "no-store" });
      const j = (await r.json()) as State;
      if (!j.error) setS(j);
    } catch { /* the card simply does not update */ }
  }, []);

  /* every fifteen seconds, because the agent itself only looks once a minute
     and the point is to watch it notice. */
  useEffect(() => { pull(); const t = setInterval(pull, 15_000); return () => clearInterval(t); }, [pull]);

  /* the control is the operator's, not the reader's. the token lives in this
     browser only and rides as a header; the server compares it and refuses
     when it is missing, so a stranger who loads the page sees the state and
     cannot change it. */
  async function flip(action: "pause" | "resume") {
    const tok = token || (typeof localStorage !== "undefined" ? localStorage.getItem("trustset.operator") || "" : "");
    if (!tok) { setAsking(true); return; }
    setBusy(true); setNote(null);
    try {
      const r = await fetch("/api/live-agent", { method: "POST", headers: { "content-type": "application/json", "x-trustset-operator": tok }, body: JSON.stringify({ action }) });
      const j = await r.json();
      if (j.error) { setNote(j.error); if (r.status === 401) setAsking(true); return; }
      try { localStorage.setItem("trustset.operator", tok); } catch { /* private window */ }
      setAsking(false);
      setTx({ hash: j.hash, block: j.block });
      await pull();
    } catch (e) { setNote(String(e)); }
    finally { setBusy(false); }
  }

  /* paused is the only not-trusted state a resume fixes. */
  const off = !!s && !s.chain.trusted;
  const paused = s?.chain.status === 2;
  const says = s?.said ? (SAYS[s.said.why] ?? s.said.why) : "Reading the agent…";
  const heard = s?.said ? Math.max(0, Math.round((Date.now() - new Date(s.said.at).getTime()) / 1000)) : null;

  return (
    <div className="sheet p-5 sm:p-7">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="relative inline-flex w-2.5 h-2.5">
          {!off && !m.reduced && <motion.span className="absolute inset-0 rounded-full" style={{ background: "var(--sage)" }}
            animate={{ scale: [1, 2.2], opacity: [0.5, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }} />}
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: off ? "var(--orange)" : "var(--sage)" }} />
        </span>
        <h2 className="text-lg font-semibold">A real agent, running now</h2>
        <span className="ml-auto flex items-center gap-2">
          {s?.erc8004 ? (
            <span className="rounded-full px-2.5 py-1 mono text-[10.5px] whitespace-nowrap" title="This agent also has an ERC-8004 identity, and its owner published a pointer from that registry to this switch."
              style={{ background: "color-mix(in srgb, var(--text-dark) 6%, transparent)", color: "var(--text-medium)" }}>ERC-8004 · {s.erc8004}</span>
          ) : null}
          {s && <Link href={`/explorer/${s.agentId}`} className="text-[12px] underline" style={{ color: "var(--text-medium)" }}>agent {s.agentId}</Link>}
        </span>
      </div>

      <p className="text-sm mt-2 max-w-[62ch]" style={{ color: "var(--text-medium)" }}>
        A process on our server with its own key. It asks the switch every minute, and trades on the demo venue
        every hour while the answer is yes. Checking costs nothing, so a stopped agent costs nothing.
      </p>

      {/* what the agent says about itself, next to what the chain says */}
      <div className="grid sm:grid-cols-2 gap-3 mt-5">
        <div className="rounded-xl px-4 py-3.5" style={{ border: "1px solid var(--hairline)" }}>
          <div className="text-[10.5px] mono uppercase tracking-[0.12em]" style={{ color: "var(--text-medium)" }}>The agent says</div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={says} initial={m.reduced ? false : { opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.25 }}
              className="text-sm font-semibold mt-1" style={{ color: off ? "var(--orange-text)" : "var(--text-dark)" }}>{says}</motion.div>
          </AnimatePresence>
          <div className="text-[11.5px] mt-1" style={{ color: "var(--text-medium)" }}>
            {heard === null ? "no word yet" : `heard ${heard}s ago`}{s?.said ? ` · ${Number(s.said.balance).toFixed(2)} MON left` : ""}
          </div>
        </div>
        <div className="rounded-xl px-4 py-3.5" style={{ border: "1px solid var(--hairline)" }}>
          <div className="text-[10.5px] mono uppercase tracking-[0.12em]" style={{ color: "var(--text-medium)" }}>The chain says</div>
          <div className="text-sm font-semibold mt-1" style={{ color: off ? "var(--orange-text)" : "var(--text-dark)" }}>
            {!s ? "…" : s.chain.trusted ? "isTrusted → true" : "isTrusted → false"}
          </div>
          <div className="text-[11.5px] mt-1" style={{ color: "var(--text-medium)" }}>
            {!s ? "" : s.chain.expired ? "its end date passed" : s.chain.lapsed ? "it missed its heartbeat" : s.chain.status === 2 ? "paused by its cold key" : s.chain.status === 3 ? "stopped for good" : "active, inside its dates, keeping its heartbeat"}
          </div>
        </div>
      </div>

      {/* the control exists only when this server can actually sign. a button
          that explains why it does nothing is worse than no button. */}
      {s?.holdsColdKey ? (
        <div className="flex flex-wrap items-center gap-2 mt-4">
          {/* off covers three reasons and a resume only answers one of them.
              an expired or lapsed agent is still Active in the contract, so
              setStatus(Active) on it would cost a transaction and change
              nothing. the button offers a resume only when it was paused. */}
          <button type="button" className={`drawn-btn ${paused ? "btn-gold" : "btn-orange"}`} style={{ padding: "9px 16px", fontSize: "0.85rem", opacity: busy || (off && !paused) ? 0.6 : 1 }}
            disabled={busy || (off && !paused)} onClick={() => flip(paused ? "resume" : "pause")}>
            {busy ? "Signing…" : paused ? "Bring it back" : "Switch it off"}
          </button>
          <span className="text-[12px]" style={{ color: "var(--text-medium)" }}>
            {off && !paused
              ? "Its trust ran out on a limit, not a switch, so bringing it back means clearing that limit from the console."
              : paused ? "It will notice within a minute and start again." : "It will notice within a minute and stop spending."}
          </span>
          {asking && (
            <input type="password" autoComplete="off" placeholder="operator token" value={token} onChange={e => setToken(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && token) flip(off ? "resume" : "pause"); }}
              className="mono text-[12px] rounded-lg px-3 py-2 w-full sm:w-64"
              style={{ border: "1px solid var(--hairline)", background: "transparent", color: "var(--text-dark)" }} />
          )}
        </div>
      ) : s ? (
        <div className="rounded-xl px-4 py-3 mt-4 text-[12.5px]" style={{ border: "1px solid var(--hairline)", color: "var(--text-medium)" }}>
          <span className="font-semibold" style={{ color: "var(--text-dark)" }}>This server cannot switch off the agent it runs.</span>{" "}
          It does not hold the cold key, which is the point of a cold key.
          {s.handoverAt ? <> The key is being handed to it under the contract&apos;s one day delay, and lands {new Date(s.handoverAt * 1000).toLocaleString()}, after which a control appears here.</> : null}
        </div>
      ) : null}

      {tx && s?.explorer && (
        <div className="text-[12px] mt-3">
          Landed in block {tx.block}. <a href={`${s.explorer}/tx/${tx.hash}`} target="_blank" rel="noreferrer" className="underline" style={{ color: "var(--orange-text)" }}>View the transaction</a>
        </div>
      )}
      {note && <div className="text-[12px] mt-3" style={{ color: "var(--orange-text)" }}>{note}</div>}

      <p className="text-[11.5px] mt-4" style={{ color: "var(--text-medium)" }}>
        The left box is the agent&apos;s own account of itself, read from the file it writes each minute, not from the chain.
        An agent that had been taken over could say anything there. The right box is the chain, which it cannot.
      </p>
    </div>
  );
}
