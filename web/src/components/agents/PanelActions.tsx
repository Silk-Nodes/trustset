"use client";
import { useState } from "react";
import { ethers } from "ethers";
import Term from "@/components/Term";
import { short, expired, lapsed, type Agent } from "@/lib/chain";

/* the owner's other controls, the ones the contract had and the panel did not:
 * rename, limits, change the cold key, rotate to a successor. one open at a
 * time, each a small form that ends in one transaction. */
type Which = "rename" | "limits" | "panic" | "key" | "rotate" | null;

const DAY = 86400;
/* windows an operator actually picks, rather than a free number field that
   invites a units mistake nobody can see until the agent goes dark. */
const WINDOWS: [string, number][] = [["Off", 0], ["10 minutes", 600], ["1 hour", 3600], ["6 hours", 21600], ["1 day", DAY]];
const ENDS: [string, number][] = [["Never", 0], ["1 day", DAY], ["7 days", 7 * DAY], ["30 days", 30 * DAY], ["90 days", 90 * DAY]];

/* module scope, on purpose. declared inside the component it became a new
   component type on every render, so React remounted it on each keystroke
   and the inputs lost what was typed. */
function Row({ id, open, setOpen, title, hint, children }: { id: Exclude<Which, null>; open: Which; setOpen: (w: Which) => void; title: React.ReactNode; hint: string; children: React.ReactNode }) {
  return (
    <div className="rule-top">
      <button type="button" onClick={() => setOpen(open === id ? null : id)} aria-expanded={open === id} className="w-full flex items-center gap-3 py-2.5 text-left">
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-[11px] ml-auto" style={{ color: "var(--text-medium)" }}>{hint}</span>
        <span className="text-ink/70 text-xs">{open === id ? "close" : "+"}</span>
      </button>
      {open === id && <div className="pb-4">{children}</div>}
    </div>
  );
}

export default function PanelActions({ agent, name, purpose, others, now, delayDays, busy, hasStopKey, stopKeyUses, onRename, onLimits, onSetStopKey, onClearStopKey, onProposeKey, onApplyKey, onRotate }: {
  agent: Agent; name: string; purpose?: string;
  /* this owner's other active agents, the only valid successors */
  others: { id: bigint; name: string }[];
  now: number; delayDays: number; busy: string | null;
  hasStopKey: boolean; stopKeyUses: number;
  onRename: (name: string, purpose: string) => void;
  /* both limits in one call: an absolute end date and a silence window, each in
     seconds, each zero to turn it off. */
  onLimits: (expiresAt: number, window: number) => void;
  /* the panic button: make a passkey on this device, then name it on chain */
  onSetStopKey: () => void;
  onClearStopKey: () => void;
  onProposeKey: (addr: string) => void;
  onApplyKey: () => void;
  onRotate: (successor: bigint) => void;
}) {
  const [open, setOpen] = useState<Which>(null);
  const [n, setN] = useState(name === `Agent ${agent.id}` ? "" : name);
  const [p, setP] = useState(purpose ?? "");
  const [addr, setAddr] = useState("");
  const [succ, setSucc] = useState<string>(others[0]?.id.toString() ?? "");
  const [ends, setEnds] = useState(0);
  const [win, setWin] = useState(agent.heartbeatWindow);
  const terminal = agent.status === "revoked" || agent.status === "rotated";
  const pending = agent.pendingColdKey && agent.pendingColdKey !== ethers.ZeroAddress;
  const applyAt = agent.coldKeyChangeAt ?? 0;
  const canApply = pending && now >= applyAt;
  const left = Math.max(0, applyAt - now);
  const addrOk = ethers.isAddress(addr.trim()) && addr.trim().toLowerCase() !== agent.coldKey.toLowerCase();
  const nameOk = n.trim().length >= 2 && n.trim().length <= 40;

  const input = "text-sm w-full rounded-xl px-3 py-2 outline-none";
  const style = { background: "var(--bg-base)", border: "1px solid var(--hairline)", color: "var(--text-dark)" } as const;

  return (
    <div>
      <div className="eyebrow mb-1">Owner controls</div>
      <Row id="rename" open={open} setOpen={setOpen} title="Rename" hint="one transaction">
        <input value={n} onChange={e => setN(e.target.value)} maxLength={40} placeholder="Name" className={input} style={style} />
        <input value={p} onChange={e => setP(e.target.value)} maxLength={200} placeholder="What it does, optional" className={`${input} mt-2`} style={style} />
        <div className="flex items-center gap-2 mt-2.5">
          <button type="button" className="drawn-btn btn-orange" style={{ padding: "6px 12px", fontSize: "0.78rem" }} disabled={!nameOk || busy === "rename"} onClick={() => onRename(n.trim(), p.trim())}>{busy === "rename" ? "Writing…" : "Write the name on chain"}</button>
          <span className="text-[11px]" style={{ color: "var(--text-medium)" }}>Replaces the old one.</span>
        </div>
      </Row>

      <Row id="limits" open={open} setOpen={setOpen} title="End date and heartbeat" hint={terminal ? "closed" : "one transaction"}>
        {terminal ? <p className="text-xs text-ink/70">Already {agent.status}. Limits are for an agent that still runs.</p> : (
          <>
            <p className="text-xs text-ink/70 mb-3">Two ways for trust to end without anyone sending a transaction. An end date runs out on its own. A heartbeat needs the agent to say it is alive every so often, and silence has the same effect as a stop.</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="eyebrow">Trusted until</span>
                <select value={ends} onChange={e => setEnds(Number(e.target.value))} className={`${input} mt-1`} style={style}>
                  {ENDS.map(([l, v]) => <option key={v} value={v}>{v === 0 ? l : `${l} from now`}</option>)}
                </select>
                <span className="block text-[11px] mt-1" style={{ color: "var(--text-medium)" }}>
                  {agent.expiresAt ? (expired(agent, now) ? "Ran out. Pick a new one to bring it back." : `Now: ${new Date(agent.expiresAt * 1000).toLocaleString()}`) : "No end date today."}
                </span>
              </label>
              <label className="block">
                <span className="eyebrow">Must report every</span>
                <select value={win} onChange={e => setWin(Number(e.target.value))} className={`${input} mt-1`} style={style}>
                  {WINDOWS.map(([l, v]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <span className="block text-[11px] mt-1" style={{ color: "var(--text-medium)" }}>
                  {agent.heartbeatWindow ? (lapsed(agent, now) ? "Gone quiet. Only you can start a new window." : `Next by ${new Date((agent.lastBeat + agent.heartbeatWindow) * 1000).toLocaleTimeString()}`) : "Silence is fine today."}
                </span>
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <button type="button" className="drawn-btn btn-orange" style={{ padding: "6px 12px", fontSize: "0.78rem" }} disabled={busy === "limits"}
                onClick={() => onLimits(ends === 0 ? 0 : Math.floor(Date.now() / 1000) + ends, win)}>{busy === "limits" ? "Writing…" : "Set both"}</button>
              <span className="text-[11px]" style={{ color: "var(--text-medium)" }}>Writing this starts a fresh heartbeat window.</span>
            </div>
          </>
        )}
      </Row>

      <Row id="panic" open={open} setOpen={setOpen} title="Panic button" hint={terminal ? "closed" : hasStopKey ? "set" : "one transaction"}>
        {terminal ? <p className="text-xs text-ink/70">Already {agent.status}.</p> : (
          <>
            <p className="text-xs text-ink/70 mb-2.5">
              A passkey on your phone that can pause this agent without a wallet. It can do nothing else: bringing the agent
              back, ending it, changing its keys all still need this wallet. So a lost phone costs you an interruption, not an agent.
            </p>
            {hasStopKey && (
              <div className="sheet px-3 py-2.5 mb-2.5 text-xs">
                <div>A passkey is nominated. Open <span className="mono">/panic?id={agent.id.toString()}</span> on that phone.</div>
                <div style={{ color: "var(--text-medium)" }}>Used {stopKeyUses} time{stopKeyUses === 1 ? "" : "s"}.</div>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="drawn-btn btn-orange" style={{ padding: "6px 12px", fontSize: "0.78rem" }}
                disabled={busy === "panic"} onClick={onSetStopKey}>
                {busy === "panic" ? "Waiting…" : hasStopKey ? "Replace the passkey" : "Add a passkey"}
              </button>
              {hasStopKey && (
                <button type="button" className="drawn-btn btn-gold" style={{ padding: "6px 12px", fontSize: "0.78rem" }}
                  disabled={busy === "panic"} onClick={onClearStopKey}>Remove it</button>
              )}
              <span className="text-[11px]" style={{ color: "var(--text-medium)" }}>Your device asks first, then your wallet signs.</span>
            </div>
          </>
        )}
      </Row>

      <Row id="key" open={open} setOpen={setOpen} title={<>Change the <Term k="cold key">cold key</Term></>} hint={terminal ? "closed" : `${delayDays} day delay`}>
        {terminal ? <p className="text-xs text-ink/70">A stopped agent keeps its keys as they were.</p> : (
          <>
            <p className="text-xs text-ink/70 mb-2.5">Hand this agent to another wallet. It takes {delayDays} day{delayDays === 1 ? "" : "s"} to land, so a stolen cold key cannot pass the agent on quietly, and you can stop the agent in the meantime. After it lands, this agent leaves your list.</p>
            {pending && (
              <div className="sheet px-3 py-2.5 mb-2.5 text-xs">
                <div>Proposed: <span className="mono">{short(agent.pendingColdKey!)}</span></div>
                <div style={{ color: "var(--text-medium)" }}>{canApply ? "The delay has passed. Apply to hand it over." : `Lands in ${Math.floor(left / 3600)}h ${Math.floor((left % 3600) / 60)}m. Proposing another address replaces this one.`}</div>
                {canApply && <button type="button" className="drawn-btn btn-orange mt-2" style={{ padding: "6px 12px", fontSize: "0.78rem" }} disabled={busy === "key"} onClick={onApplyKey}>{busy === "key" ? "Applying…" : "Apply the change"}</button>}
              </div>
            )}
            <input value={addr} onChange={e => setAddr(e.target.value)} placeholder="New cold key 0x…" spellCheck={false} className={`${input} mono`} style={{ ...style, borderColor: addr.trim() && !addrOk ? "var(--orange)" : "var(--hairline)" }} />
            <div className="flex items-center gap-2 mt-2.5">
              <button type="button" className="drawn-btn btn-gold" style={{ padding: "6px 12px", fontSize: "0.78rem" }} disabled={!addrOk || busy === "key"} onClick={() => onProposeKey(ethers.getAddress(addr.trim()))}>{busy === "key" ? "Proposing…" : pending ? "Propose a different one" : "Propose"}</button>
              <span className="text-[11px]" style={{ color: "var(--orange-text)" }}>{addr.trim() && !addrOk ? "Not an address, or already the cold key." : ""}</span>
            </div>
          </>
        )}
      </Row>

      <Row id="rotate" open={open} setOpen={setOpen} title="Rotate to a successor" hint={terminal ? "closed" : "permanent"}>
        {terminal ? <p className="text-xs text-ink/70">Already {agent.status}.</p> : others.length === 0 ? (
          <p className="text-xs text-ink/70">Register the successor first. It has to be another agent under this wallet that the switch still trusts, so one whose end date and heartbeat are both clear.</p>
        ) : (
          <>
            <p className="text-xs text-ink/70 mb-2.5">Retire this agent in favour of one you already run. Anyone who trusted this id can read where trust moved. This id is closed for good afterwards.</p>
            <select value={succ} onChange={e => setSucc(e.target.value)} className={input} style={style}>
              {others.map(o => <option key={o.id.toString()} value={o.id.toString()}>{o.name} · agent {o.id.toString()}</option>)}
            </select>
            <div className="mt-2.5">
              <button type="button" className="drawn-btn btn-orange" style={{ padding: "6px 12px", fontSize: "0.78rem" }} disabled={!succ || busy === "rotate"} onClick={() => onRotate(BigInt(succ))}>{busy === "rotate" ? "Rotating…" : "Rotate, for good"}</button>
            </div>
          </>
        )}
      </Row>
    </div>
  );
}
