"use client";
import Tip from "@/components/Tip";
import { useState } from "react";
import Link from "next/link";
import { ethers } from "ethers";
import { type Agent, expired, lapsed, short } from "@/lib/chain";
import type { Extra, Layer, LayerKey } from "@/lib/layers";
import LayerIcon from "./LayerIcon";
import Term from "@/components/Term";

/* the inspector: the agent's settings, in the column beside it.
 *
 * eight rows, one per layer. each is a mark, a name and what is true now, on
 * one line. pressing a row opens its control under it, inside this column, so
 * the agent beside it never moves. under the eight, the keys and the two slow
 * ownership moves, which are read rarely and sit last for that reason. */
const DAY = 86400;
const WINDOWS: [string, number][] = [["Off", 0], ["10 minutes", 600], ["1 hour", 3600], ["6 hours", 21600], ["1 day", DAY]];
const ENDS: [string, number][] = [["Never", 0], ["1 day", DAY], ["7 days", 7 * DAY], ["30 days", 30 * DAY], ["90 days", 90 * DAY]];
const sm = { padding: "6px 12px", fontSize: "0.76rem" } as const;
const input = "text-[13px] w-full rounded-lg px-2.5 py-1.5 outline-none focus-visible:ring-2";
const field = { background: "var(--bg-base)", border: "1px solid var(--hairline)", color: "var(--text-dark)" } as const;
const quiet = { color: "var(--text-medium)" } as const;
const OPENS: LayerKey[] = ["panic", "guardians", "limits", "identity", "human", "refunds"];

export type InspectorProps = {
  agent: Agent; layers: Layer[]; now: number; busy: string | null; canSign: boolean; explorer?: string; delayDays: number;
  hasStopKey: boolean; stopKeyUses: number; extra: Extra;
  name: string; purpose?: string; labelWhere: "chain" | "local" | "none"; tag: string;
  others: { id: bigint; name: string }[];
  onRename: (name: string, purpose: string) => void; onPublishLabel: () => void; onTag: (t: string) => void;
  onLimits: (expiresAt: number, window: number) => void; onSetStopKey: () => void; onClearStopKey: () => void;
  onProposeKey: (addr: string) => void; onApplyKey: () => void; onRotate: (successor: bigint) => void;
  proof?: React.ReactNode;
  /* the passkey sealed runbook, built by the page because it needs the connection */
  runbook?: React.ReactNode;
  /* the row to arrive with open, when the fleet sent the reader here to fix something */
  initialOpen?: LayerKey;
  /* write the group into the on-chain purpose, so other browsers see it */
  onPublishGroup?: (group: string) => void;
};

export default function Inspector(p: InspectorProps) {
  const { agent, now, busy } = p;
  const [open, setOpen] = useState<LayerKey | "keys" | "owner" | "runbook" | null>(p.initialOpen ?? null);
  const [n, setN] = useState(p.name === `Agent ${agent.id}` ? "" : p.name);
  const [pu, setPu] = useState(p.purpose ?? "");
  const [tg, setTg] = useState(p.tag);
  const [ends, setEnds] = useState(0);
  const [win, setWin] = useState(agent.heartbeatWindow);
  const [addr, setAddr] = useState("");
  const [succ, setSucc] = useState<string>(p.others[0]?.id.toString() ?? "");
  const terminal = agent.status === "revoked" || agent.status === "rotated";
  const nameOk = n.trim().length >= 2 && n.trim().length <= 40;
  const pending = !!agent.pendingColdKey && agent.pendingColdKey !== ethers.ZeroAddress;
  const applyAt = agent.coldKeyChangeAt ?? 0;
  const canApply = pending && now >= applyAt;
  const left = Math.max(0, applyAt - now);
  const addrOk = ethers.isAddress(addr.trim()) && addr.trim().toLowerCase() !== agent.coldKey.toLowerCase();
  const a = (x: string) => p.explorer ? <a href={`${p.explorer}/address/${x}`} target="_blank" rel="noreferrer" className="hover:underline">{short(x)}</a> : short(x);
  const canOpen = (k: LayerKey) => OPENS.includes(k) && (k !== "human" || !!p.proof || agent.status === "revoked");
  const toggle = (k: LayerKey | "keys" | "owner" | "runbook") => setOpen(o => o === k ? null : k);

  const row = (k: LayerKey | "keys" | "owner" | "runbook", icon: React.ReactNode, name: string, value: React.ReactNode, set: boolean, can: boolean, body?: React.ReactNode) => {
    const is = open === k;
    const head = (
      <div className="grid grid-cols-[20px_minmax(0,1fr)_auto_12px] items-center gap-2.5 h-10 px-2">
        <span className="inline-flex items-center justify-center" style={{ color: set ? "var(--text-dark)" : "var(--text-light)" }}>{icon}</span>
        <span className="text-[13px] font-medium truncate" style={{ color: "var(--text-dark)" }}>{name}</span>
        <span className="text-[12px] truncate max-w-[130px] text-right" style={{ color: "var(--text-medium)", fontStyle: set ? "normal" : "italic" }}>{value}</span>
        <span className="mono text-[11px] text-right" style={{ color: "var(--text-light)" }}>{can ? (is ? "×" : "›") : ""}</span>
      </div>
    );
    return (
      <li key={k} style={{ borderBottom: "1px solid var(--hairline)", background: is ? "color-mix(in srgb, var(--text-dark) 3%, transparent)" : "transparent" }}>
        {can ? <button type="button" onClick={() => toggle(k)} aria-expanded={is} className="w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-inset rounded">{head}</button> : head}
        {is && body && <div className="px-2 pb-3 pt-1">{body}</div>}
      </li>
    );
  };

  return (
    <aside className="flex flex-col min-h-0 min-w-0" aria-label="Settings">
      <div className="eyebrow px-2 pb-2 shrink-0 flex items-baseline" style={{ borderBottom: "1px solid var(--hairline)" }}>settings<span className="ml-auto mono tabular">{p.layers.filter(l => l.set).length} of 8 set</span></div>
      <ul className="flex-1 min-h-0 overflow-y-auto">
        {p.layers.map(l => row(l.key, <LayerIcon k={l.key} size={15} />, l.name, l.value, l.set, canOpen(l.key),
          l.key === "panic" ? (terminal ? <p className="text-xs" style={quiet}>Already {agent.status}.</p> : (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                <Tip tap={false} focusable={false} text="Your phone asks for the passkey first, then your wallet signs to nominate it. It can pause this agent and nothing else."><button type="button" className="drawn-btn btn-orange" style={sm} disabled={!p.canSign || busy === "panic"} onClick={p.onSetStopKey}>{busy === "panic" ? "Waiting…" : p.hasStopKey ? "Replace the passkey" : "Add a passkey"}</button></Tip>
                {p.hasStopKey && <button type="button" className="drawn-btn btn-gold" style={sm} disabled={!p.canSign || busy === "panic"} onClick={p.onClearStopKey}>Remove</button>}
              </div>
              {p.hasStopKey && <span className="text-[11.5px]" style={quiet}>open <span className="mono">/panic?id={agent.id.toString()}</span> on that phone · used {p.stopKeyUses}×</span>}
            </div>
          ))
          : l.key === "guardians" ? (agent.guardians.length
            ? <ul className="mono text-xs flex flex-col gap-1">{agent.guardians.map(g => <li key={g}>{a(g)}</li>)}<li style={quiet}>{agent.threshold} of {agent.guardians.length} to pause</li></ul>
            : <p className="text-xs" style={quiet}><Tip text="Guardians are named when an agent is registered.">None.</Tip></p>)
          : l.key === "limits" ? (terminal ? <p className="text-xs" style={quiet}>Already {agent.status}.</p> : (
            <div className="flex flex-col gap-2.5">
              <label className="block">
                <span className="eyebrow">Trusted until</span>
                <select value={ends} onChange={e => setEnds(Number(e.target.value))} className={`${input} mt-1`} style={field}>{ENDS.map(([w, v]) => <option key={v} value={v}>{v === 0 ? w : `${w} from now`}</option>)}</select>
                <span className="block text-[11px] mt-1 truncate" style={quiet}>{agent.expiresAt ? (expired(agent, now) ? "ran out" : `now ${new Date(agent.expiresAt * 1000).toLocaleString()}`) : "none today"}</span>
              </label>
              <label className="block">
                <span className="eyebrow">Must report every</span>
                <select value={win} onChange={e => setWin(Number(e.target.value))} className={`${input} mt-1`} style={field}>{WINDOWS.map(([w, v]) => <option key={v} value={v}>{w}</option>)}</select>
                <span className="block text-[11px] mt-1 truncate" style={quiet}>{agent.heartbeatWindow ? (lapsed(agent, now) ? "gone quiet" : `next by ${new Date((agent.lastBeat + agent.heartbeatWindow) * 1000).toLocaleTimeString()}`) : "silence is fine"}</span>
              </label>
              <button type="button" className="drawn-btn btn-orange self-start" style={sm} disabled={!p.canSign || busy === "limits"} onClick={() => p.onLimits(ends === 0 ? 0 : Math.floor(Date.now() / 1000) + ends, win)}>{busy === "limits" ? "Writing…" : "Set both"}</button>
            </div>
          ))
          : l.key === "identity" ? (
            <div className="flex flex-col gap-2">
              <input value={n} onChange={e => setN(e.target.value)} maxLength={40} placeholder="Name" className={input} style={field} />
              <input value={pu} onChange={e => setPu(e.target.value)} maxLength={200} placeholder="What it does, optional" className={input} style={field} />
              <div className="flex flex-wrap gap-2">
                <button type="button" className="drawn-btn btn-orange" style={sm} disabled={!p.canSign || !nameOk || busy === "rename"} onClick={() => p.onRename(n.trim(), pu.trim())}>{busy === "rename" ? "Writing…" : "Write on chain"}</button>
                {p.labelWhere === "local" && <button type="button" className="drawn-btn btn-gold" style={sm} disabled={!p.canSign} onClick={p.onPublishLabel}>Publish browser name</button>}
              </div>
              <label className="block mt-1">
                <span className="eyebrow">Group <span className="normal-case tracking-normal" style={quiet}>· this browser only</span></span>
                <div className="flex gap-2 mt-1">
                  <input value={tg} onChange={e => setTg(e.target.value.replace(/[^\w-]/g, ""))} onBlur={() => p.onTag(tg.trim())} maxLength={24} placeholder="trading, ops, research" className={input} style={field} />
                  {p.onPublishGroup && <button type="button" className="drawn-btn btn-gold shrink-0" style={sm} disabled={!p.canSign || !tg.trim() || busy === "rename"} onClick={() => { p.onTag(tg.trim()); p.onPublishGroup!(tg.trim()); }} title="Writes the group into the on-chain purpose, so every browser reads it">On chain</button>}
                </div>
              </label>
              {p.extra.erc8004 ? <span className="text-[11px]" style={quiet}>claimed by ERC-8004 agent {p.extra.erc8004}</span> : null}
            </div>
          )
          : l.key === "human" ? (p.proof ?? <p className="text-xs" style={quiet}>Connect the owner wallet to prove you were the one who stopped it.</p>)
          : l.key === "refunds" ? <Link href="/agents/refunds" className="drawn-btn btn-gold" style={sm}>Open the refunds page</Link>
          : undefined))}

        {p.runbook && <>
          <li className="eyebrow px-2 pt-4 pb-1.5">sealed</li>
          {row("runbook", <LockMark />, "Runbook", "passkey only", true, true, p.runbook)}
        </>}
        <li className="eyebrow px-2 pt-4 pb-1.5">keys</li>
        {row("keys", <KeyMark />, "Keys", agent.guardians.length ? `${agent.guardians.length} guardians` : "agent, cold", true, true,
          <dl className="grid grid-cols-[72px_1fr] gap-y-1.5 text-xs">
            <dt style={quiet}><Term k="agent address">Agent address</Term></dt><dd className="mono truncate">{a(agent.key)}</dd>
            <dt style={quiet}><Term k="owner">Owner</Term></dt><dd className="mono truncate">{a(agent.coldKey)}</dd>
            <dt style={quiet}>Guardians</dt><dd className="mono min-w-0">{agent.guardians.length ? agent.guardians.map(g => <div key={g} className="truncate">{a(g)}</div>) : "none"}</dd>
            {agent.successor > 0n && <><dt style={quiet}>Successor</dt><dd className="mono">agent {agent.successor.toString()}</dd></>}
          </dl>)}
        {row("owner", <OwnerMark />, "Ownership", pending ? (canApply ? "change ready" : `change in ${Math.floor(left / 3600)}h`) : terminal ? "closed" : "owner, successor", !terminal, true,
          terminal ? <p className="text-xs" style={quiet}>Closed.</p> : (
            <div className="flex flex-col gap-3">
              <div>
                <div className="text-[12px] font-semibold">Change the owner <span className="font-normal" style={quiet}>· {p.delayDays} day delay</span></div>
                {pending && <div className="text-xs mt-1" style={quiet}>proposed <span className="mono">{short(agent.pendingColdKey!)}</span> · {canApply ? "ready" : `lands in ${Math.floor(left / 3600)}h ${Math.floor((left % 3600) / 60)}m`}{canApply && <button type="button" className="drawn-btn btn-orange ml-2" style={sm} disabled={!p.canSign || busy === "key"} onClick={p.onApplyKey}>{busy === "key" ? "Applying…" : "Apply"}</button>}</div>}
                <div className="flex gap-2 mt-1.5">
                  <input value={addr} onChange={e => setAddr(e.target.value)} placeholder="New owner 0x…" spellCheck={false} className={`${input} mono`} style={{ ...field, borderColor: addr.trim() && !addrOk ? "var(--orange)" : "var(--hairline)" }} />
                  <button type="button" className="drawn-btn btn-gold shrink-0" style={sm} disabled={!p.canSign || !addrOk || busy === "key"} onClick={() => p.onProposeKey(ethers.getAddress(addr.trim()))}>{busy === "key" ? "…" : "Propose"}</button>
                </div>
              </div>
              <div>
                <div className="text-[12px] font-semibold">Rotate to a successor <span className="font-normal" style={quiet}>· permanent</span></div>
                {p.others.length === 0 ? <p className="text-xs mt-1" style={quiet}>Needs another trusted agent under this wallet.</p> : (
                  <div className="flex gap-2 mt-1.5">
                    <select value={succ} onChange={e => setSucc(e.target.value)} className={input} style={field}>{p.others.map(o => <option key={o.id.toString()} value={o.id.toString()}>{o.name} · agent {o.id.toString()}</option>)}</select>
                    <button type="button" className="drawn-btn btn-orange shrink-0" style={sm} disabled={!p.canSign || !succ || busy === "rotate"} onClick={() => p.onRotate(BigInt(succ))}>{busy === "rotate" ? "…" : "Rotate"}</button>
                  </div>
                )}
              </div>
            </div>
          ))}
      </ul>
    </aside>
  );
}

const LockMark = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>;
const KeyMark = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="8" cy="12" r="4.5" /><path d="M12.5 12H21M18 12v3M15 12v2.5" /></svg>;
const OwnerMark = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 17l6-6 4 4 6-6" /><path d="M14 9h6v6" /></svg>;
