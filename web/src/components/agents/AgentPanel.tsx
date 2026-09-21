"use client";
import { motion } from "motion/react";
import { useMotionPrefs, DUR } from "@/lib/motion";
import StatusDot from "./StatusDot";
import Stamp from "./Stamp";
import { type Agent, short, statusWord, trusted } from "@/lib/chain";
import Term from "@/components/Term";
/* the detail panel: keys, guardians, the history, the stop record. facts only. */
export default function AgentPanel({ agent, label, onPublishLabel, stamp, proof, onClose, actions, explorer }: { agent: Agent; label: { name: string; purpose?: string; where: "chain" | "local" | "none" }; onPublishLabel: () => void; stamp?: { block?: number; txHash?: string; human?: boolean }; proof?: React.ReactNode; onClose: () => void; actions?: React.ReactNode; explorer?: string }) {
  const a = (addr: string) => explorer ? <a href={`${explorer}/address/${addr}`} target="_blank" rel="noreferrer" className="hover:underline">{short(addr)}</a> : short(addr);
  const m = useMotionPrefs();
  const t = (ts: number) => new Date(ts * 1000).toISOString().slice(11, 19) + " UTC";
  return (
    <motion.aside initial={m.reduced ? false : { opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }} transition={m.t(DUR.base)}
      className="drawn-box p-5 flex flex-col gap-4 min-w-0 flex-1">
      <div className="flex items-center gap-3">
        {/* the row beside this panel already says Expired when the end date has
            passed. the panel used to say active, in green, about the same
            agent, because it printed the raw status. both read the chain now. */}
        <StatusDot status={agent.status} size={12} live={trusted(agent)} />
        <div className="min-w-0"><div className="font-semibold truncate">{label.name}</div><div className="eyebrow">agent {agent.id.toString()} · {statusWord(agent)}</div></div>
        <button type="button" onClick={onClose} aria-label="close" className="ml-auto w-8 h-8 rounded-full hover:bg-ink/5 text-ink/70">×</button>
      </div>
      {/* the owner's words about the agent, marked as theirs. the chain has
          no opinion on what an agent is, and the panel must not pretend. */}
      <div className="text-xs" style={{ color: "var(--text-medium)" }}>
        {label.purpose && <div className="text-ink/80 mb-1">{label.purpose}</div>}
        {label.where === "chain" && "Named on chain by the cold key. Any console can read it."}
        {label.where === "local" && <>Named in this browser only. <button type="button" onClick={onPublishLabel} className="underline" style={{ color: "var(--orange-text)" }}>Put it on chain</button> <Term tip="One transaction from your wallet that writes this name and purpose to the labels contract. A browser-only name is gone on any other machine; on chain, anyone reading the switch can see it. It also replaces the name if you change it later.">?</Term></>}
        {label.where === "none" && "Unnamed. The chain knows it by its id only."}
      </div>
      {stamp && <Stamp block={stamp.block} href={explorer && stamp.txHash ? `${explorer}/tx/${stamp.txHash}` : null} />}
      {proof}
      <dl className="grid grid-cols-[92px_1fr] gap-y-2 text-sm">
        <dt className="text-ink/70"><Term k="agent key">Agent key</Term></dt><dd className="mono text-xs truncate">{a(agent.key)}</dd>
        <dt className="text-ink/70"><Term k="cold key">Cold key</Term></dt><dd className="mono text-xs truncate">{a(agent.coldKey)}</dd>
        <dt className="text-ink/70"><Term k="guardians">Guardians</Term></dt>
        <dd className="mono text-xs min-w-0">{agent.guardians.length ? <>{agent.threshold} of {agent.guardians.length} to pause{agent.guardians.map(g => <div key={g} className="truncate text-ink/70">{short(g)}</div>)}</> : "None"}</dd>
        {agent.successor > 0n && <><dt className="text-ink/70">Successor</dt><dd className="mono text-xs">Agent {agent.successor.toString()}</dd></>}
      </dl>
      {actions}
      <div>
        <div className="eyebrow mb-2">history</div>
        <ol className="flex flex-col gap-1.5">
          {[...agent.history].reverse().map((h, i) => (
            <li key={i} className="grid grid-cols-[10px_1fr_auto] items-center gap-2 text-xs">
              {/* history is what was, not what is: nothing in it breathes. */}
              <StatusDot status={h.status} size={7} live={false} /><span>{h.status}</span><span className="mono text-ink/70 tabular">{t(h.at)}</span>
            </li>
          ))}
        </ol>
      </div>
    </motion.aside>
  );
}
