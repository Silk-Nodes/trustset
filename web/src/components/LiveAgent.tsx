"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { useMotionPrefs } from "@/lib/motion";
import Term from "@/components/Term";

/* every word that explained this box rather than being it.
 *
 * the box was 555px and 123 words at the top of the explorer, which is 69% of
 * a laptop viewport before a visitor saw a single agent, and 104 of those
 * words were explanation wrapped around 14 words of actual demonstration. the
 * demonstration stays on the page; the explanation moved in here. it is a Term
 * rather than a title attribute or a hover card because Term opens on tap and
 * on focus too, and hiding the best argument on the site somewhere a phone
 * cannot reach it would be a poor trade for the pixels. */
const WHAT_IS_THIS = "A process on our server with its own key. It asks the switch every minute and trades on the demo venue every hour while the answer is yes, so a stopped agent costs nothing. The left value is the agent's own account of itself, read from a file it writes, not from the chain: an agent that had been taken over could say anything there. The right value is the chain, which it cannot.";

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
  /* false when this deployment names no live agent. the card draws nothing
     rather than picking one, because "a real agent, running now" is a claim
     and there is no id to make it about. */
  configured?: boolean;
};
const SAYS: Record<string, string> = {
  trusted: "Trusted. Working.",
  paused: "Not acting: the switch says paused.",
  stopped: "Not acting: stopped for good.",
  expired: "Not acting: its end date passed.",
  silent: "Not acting: it went quiet and lapsed.",
};

/* compact: no card of its own, one line, and the custody note folded into the
   explanation. the explorer is a tool and this is a demonstration sitting on
   top of it, so on that page it earns a line in the toolbar rather than a box
   above it. the landing page keeps the card, where it IS the argument. */
export default function LiveAgent({ compact = false }: { compact?: boolean } = {}) {
  const m = useMotionPrefs();
  const [s, setS] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [tx, setTx] = useState<{ hash: string; block: number | null } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [asking, setAsking] = useState(false);
  const [unconfigured, setUnconfigured] = useState(false);

  const pull = useCallback(async () => {
    try {
      const r = await fetch("/api/live-agent", { cache: "no-store" });
      const j = (await r.json()) as State;
      if (j.configured === false) { setUnconfigured(true); return; }
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

  /* nothing to show, and nothing invented to fill the space with. */
  if (unconfigured) return null;

  /* paused is the only not-trusted state a resume fixes. */
  const off = !!s && !s.chain.trusted;
  const paused = s?.chain.status === 2;
  const says = s?.said ? (SAYS[s.said.why] ?? s.said.why) : "Reading the agent…";
  /* the headline is a claim about the chain, so it follows the chain. it said
     "running now" over an agent its own line called paused and gone quiet. */
  const headline = !s || s.chain.trusted ? "A real agent, running now"
    : s.chain.status === 2 ? "A real agent, switched off"
    : s.chain.status === 3 || s.chain.status === 4 ? "A real agent, stopped"
    : "A real agent, not trusted right now";
  const heard = s?.said ? Math.max(0, Math.round((Date.now() - new Date(s.said.at).getTime()) / 1000)) : null;

  return (
    <div className={compact ? "min-w-0 mb-3 pb-3" : "sheet px-4 py-3.5 sm:px-5 sm:py-4"}
      style={compact ? { borderBottom: "1px solid var(--hairline)" } : undefined}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 min-w-0">
        <span className="relative inline-flex w-2.5 h-2.5 shrink-0">
          {!off && !m.reduced && <motion.span className="absolute inset-0 rounded-full" style={{ background: "var(--sage)" }}
            animate={{ scale: [1, 2.2], opacity: [0.5, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }} />}
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: off ? "var(--orange)" : "var(--sage)" }} />
        </span>
        <h2 className={`${compact ? "text-[13px]" : "text-[15px]"} font-semibold whitespace-nowrap`}>{headline}</h2>
        <span className="text-[12px]"><Term tip={compact && s && !s.holdsColdKey ? `${WHAT_IS_THIS} This server does not hold the cold key and cannot switch off the agent it runs, which is the point of a cold key.` : WHAT_IS_THIS}>what is this?</Term></span>

        <span className="hidden lg:block w-px h-4 shrink-0" style={{ background: "var(--hairline)" }} />

        {/* the demonstration, and the only part that was ever the point: what
            the agent claims, beside what the chain answers. */}
        <span className="text-[13px] min-w-0 truncate" style={{ color: "var(--text-medium)" }}>
          it says{" "}
          <AnimatePresence mode="wait" initial={false}>
            <motion.b key={says} initial={m.reduced ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.25 }}
              className="font-semibold" style={{ color: off ? "var(--orange-text)" : "var(--text-dark)" }}>{says}</motion.b>
          </AnimatePresence>
          {heard !== null && <span className="mono text-[11px]"> {heard}s ago</span>}
        </span>
        <span className="hidden sm:inline text-[13px]" style={{ color: "var(--text-light)" }}>·</span>
        <span className="text-[13px] min-w-0 truncate" style={{ color: "var(--text-medium)" }}>
          the chain says{" "}
          <b className="mono font-semibold" style={{ color: off ? "var(--orange-text)" : "var(--sage-text)" }}>
            {!s ? "…" : s.chain.trusted ? "isTrusted → true" : "isTrusted → false"}
          </b>
          {s && <span>, {s.chain.status === 0 ? "no agent with that id on this switch"
            : s.chain.status === 3 ? "stopped for good by its cold key"
            : s.chain.status === 4 ? "retired in favour of a successor"
            : s.chain.status === 2 ? `paused by its cold key${s.chain.lapsed ? " and gone quiet" : ""}`
            : s.chain.expired ? "its end date passed"
            : s.chain.lapsed ? "it missed its heartbeat"
            : "active, inside its dates, keeping its heartbeat"}</span>}
        </span>

        <span className="ml-auto flex items-center gap-2 shrink-0">
          {s?.erc8004 ? (
            <span className="rounded-full px-2 py-0.5 mono text-[10.5px] whitespace-nowrap" title="This agent also has an ERC-8004 identity, and its owner published a pointer from that registry to this switch."
              style={{ background: "color-mix(in srgb, var(--text-dark) 6%, transparent)", color: "var(--text-medium)" }}>8004 · {s.erc8004}</span>
          ) : null}
          {/* a bare "agent 14" at the far right of a sentence reads as a
              stray label rather than a way in. it says what it opens. */}
          {s && <Link href={`/explorer/${s.agentId}`} className="text-[12px] hover:underline whitespace-nowrap" style={{ color: "var(--text-medium)" }}>open agent {s.agentId} ↗</Link>}
        </span>
      </div>

      {/* the control exists only when this server can actually sign. a button
          that explains why it does nothing is worse than no button. */}
      {s?.holdsColdKey ? (
        <div className="flex flex-wrap items-center gap-2 mt-3">
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
        <div className="mt-2.5 text-[12px]" style={{ color: "var(--text-medium)", display: compact ? "none" : undefined }}>
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

      {/* the footnote that used to live here is inside WHAT_IS_THIS now. it
          also said "the left box" and "the right box", which stopped being
          true the moment the two boxes became two values on one line. */}
    </div>
  );
}
