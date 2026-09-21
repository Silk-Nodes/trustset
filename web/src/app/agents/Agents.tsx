"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { ethers } from "ethers";
import { registerPasskey } from "@/lib/webauthn";
import AgentRow from "@/components/agents/AgentRow";
import AgentPanel from "@/components/agents/AgentPanel";
import HumanProof from "@/components/agents/HumanProof";
import Footer from "@/components/Footer";
import Shell from "@/components/agents/Shell";
import Replay from "@/components/agents/Replay";
import { useWallet } from "@/components/WalletProvider";
import RegisterDialog from "@/components/agents/RegisterDialog";
import PanelActions from "@/components/agents/PanelActions";
import TxLink, { addrUrl } from "@/components/agents/TxLink";
import Term from "@/components/Term";
import { adoptParked, fallbackName, getLabel, parkLabel, setLabel, type Label } from "@/lib/labels";
import { READ, agentIdForKey, cachedAgents, coldKeyDelay, consentMessage, explain, settled, labelOnChain, loadAgents, loadGuarded, loadHistory, ownerTx, registerOnChain, short, statusWord, trusted, type Agent, type Conn, type Guarded } from "@/lib/chain";

type StampInfo = { block?: number; txHash?: string; human?: boolean };
const msg = (e: unknown) => explain(e);
/* seconds, said the way a person would: 3 days, 10 minutes, 4h 12m */
const span = (sec: number) => sec >= 172800 ? `${Math.round(sec / 86400)} days` : sec >= 3600 ? `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m` : `${Math.max(1, Math.round(sec / 60))} minutes`;

/* the product. your agents, their status, one control per row.
 *
 * on Monad testnet nothing here can act until a wallet is connected, because
 * this page holds no key: the cold key is the reader's. the local anvil demo
 * is the one exception, and it carries anvil's published default key so the
 * thing can be run with no wallet installed at all. */
export default function Agents() {
  const { conn, who } = useWallet();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [guarded, setGuarded] = useState<Guarded[]>([]);
  const [delayDays, setDelayDays] = useState(1);
  const [act, setAct] = useState<string | null>(null);
  useEffect(() => { if (conn) coldKeyDelay(conn).then(d => setDelayDays(Math.max(1, Math.round(d / 86400)))).catch(() => {}); }, [conn]);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => { const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000); return () => clearInterval(t); }, []);
  /* nothing is "empty" until the chain has actually answered once. */
  const [loaded, setLoaded] = useState(false);
  const [sel, setSel] = useState<bigint | null>(null);
  /* the passkey nominated for an agent, read when its panel opens rather than
     for the whole list: one more call per row would cost the page its speed. */
  const [stopKeys, setStopKeys] = useState<Record<string, { set: boolean; nonce: number }>>({});
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [stamps, setStamps] = useState<Record<string, StampInfo>>({});
  const [last, setLast] = useState<Record<string, string>>({});
  const [asOf, setAsOf] = useState("");
  const [note, setNote] = useState<React.ReactNode>(null);
  /* a notice with the transaction beside it */
  const said = (text: string, hash?: string) => setNote(<>{text} <TxLink cfg={conn?.cfg} hash={hash} /></>);
  const tickBusy = useRef(false);
  const [regOpen, setRegOpen] = useState(false);

  const ownerAddr = (c: Conn) => who?.address ?? c.owner?.address ?? null;
  const ownerSigner = (c: Conn): ethers.Signer | null => who?.signer ?? c.owner ?? null;

  async function refresh(c: Conn) {
    const me = ownerAddr(c);
    const list = me ? await loadAgents(c, me) : [];
    /* a label parked at registration time moves onto its id once the agent
       is in the list. */
    adoptParked(c.cfg.chainIdHex, list);
    setAgents(list); setLoaded(true); setAsOf(new Date().toISOString().slice(11, 19) + " UTC");
    if (me) loadGuarded(c, me).then(setGuarded).catch(() => {});
    return list;
  }
  /* the name is the owner's. from the chain when the cold key wrote it there,
     from this browser while it is still on its way, and the id when there is
     nothing, because the id is the truth. */
  const labelFor = (a: Agent): { name: string; purpose?: string; where: "chain" | "local" | "none" } => {
    if (a.label) return { name: a.label.name, purpose: a.label.purpose || undefined, where: "chain" };
    const l = conn ? getLabel(conn.cfg.chainIdHex, a.id) : null;
    return l ? { ...l, where: "local" } : { name: fallbackName(a.id), where: "none" };
  };

  /* poll, keyed on who is signing.
   *
   * this used to live in the mount effect, which meant the interval closed
   * over `who` as null forever: connecting a wallet loaded its agents once and
   * then the next tick, four seconds later, quietly replaced them with an
   * empty list. the owner has to be a dependency, not a closed-over value. */
  /* keyed on the address, not the signer object. the provider hands out a
     new signer on every wallet event, address unchanged, and keying on it
     emptied the list and put "Reading" back on screen each time. */
  const me = conn ? ownerAddr(conn) : null;
  useEffect(() => {
    if (!conn) return;
    let alive = true;
    /* never two refreshes at once. a refresh is two dozen reads and the public
       RPC answers each in a second or two, so a four second poll stacked
       them and the RPC began refusing. one in flight, the next waits. */
    let inFlight = false;
    const run = () => {
      if (!alive || inFlight) return; inFlight = true;
      refresh(conn).then(() => setNote(n => (typeof n === "string" && n.endsWith("Trying again.")) ? null : n))
        .catch(e => { if (alive) setNote(`${explain(e, conn)}. Trying again.`); })
        .finally(() => { inFlight = false; });
    };
    setSel(null);
    /* show the last list this browser saw at once, then refresh behind it */
    const cached = me ? cachedAgents(conn, me) : null;
    if (cached) { setAgents(cached); setLoaded(true); } else { setAgents([]); setLoaded(false); }
    run();
    const t = setInterval(run, 8000);
    return () => { alive = false; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conn, me]);

  /* the local demo seeds itself so it is never empty, and its agent trades on
     the venue so the list has a pulse and the refusal after a stop is visible.
     testnet does neither: an agent there is a real registration that somebody
     paid for. */
  useEffect(() => {
    if (!conn?.owner || who) return;
    let alive = true;
    const c = conn;
    (async () => {
      const list = await loadAgents(c, c.owner!.address);
      if (!alive) return;
      if (!list.some(a => a.status === "active")) await seedDemo(c).catch(e => setNote(msg(e)));
    })();
    if (!c.cfg.agentPrivKey) return () => { alive = false; };
    const t = setInterval(async () => {
      if (tickBusy.current || !alive) return; tickBusy.current = true;
      try {
        const cur = await loadAgents(c, c.owner!.address);
        const a = cur.find(x => x.status === "active"); if (!a) return;
        const w = new ethers.Wallet(c.cfg.agentPrivKey!, c.p);
        if (w.address.toLowerCase() !== a.key.toLowerCase()) { setLast(l => ({ ...l, [a.id.toString()]: "Registered, idle" })); return; }
        const rc = await (await (c.venue.connect(w) as ethers.Contract).trade(a.id)).wait();
        setLast(l => ({ ...l, [a.id.toString()]: `Traded on venue · block ${rc.blockNumber}` }));
      } catch { /* refused trades are the point once stopped */ }
      finally { tickBusy.current = false; }
    }, 3000);
    return () => { alive = false; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conn, who]);

  /* register an agent key under this wallet as the cold key. the key is an
     address the caller already has, or one generated here for evaluation. */
  /* register, then label. two writes from the same cold key.
   *
   * the id comes from the receipt, never from a rescan. and once the register
   * transaction is mined this function does not throw: a label that fails or
   * is declined is a note and a "put it on chain" link in the panel, because
   * the registration is already a fact and a thrown error here made the
   * reader press Register a second time into AgentKeyInUse. */
  async function registerAgent(c: Conn, agentKey: string, label: Label, guardians: string[] = [], threshold = 0, agentSig = "0x") {
    const s = ownerSigner(c); const me = ownerAddr(c);
    if (!s || !me) throw new Error("Connect your wallet first");
    const taken = await agentIdForKey(c, agentKey);
    if (taken !== 0n) throw new Error(`That key is already registered as agent ${taken}`);
    parkLabel(c.cfg.chainIdHex, agentKey, label);
    const { id, hash: regHash } = await ownerTx(async () => {
      if (c.owner && !who) {
        /* pinned nonces: the demo funds the generated key and registers it in
           the same breath, and a strict-mode double mount raced them. */
        const nonce = await c.owner.getNonce("pending");
        await (await c.owner.sendTransaction({ to: agentKey, value: ethers.parseEther("0.5"), nonce })).wait();
        return registerOnChain(c, c.owner, agentKey, me, { nonce: nonce + 1 }, guardians, threshold, agentSig);
      }
      return registerOnChain(c, s, agentKey, me, {}, guardians, threshold, agentSig);
    });
    /* nothing about a key is ever printed here. the dialog handled the key,
       and once it closes the console holds nothing. */
    setLabel(c.cfg.chainIdHex, id, label);
    if (c.labels) {
      try { const lrc = await ownerTx(() => labelOnChain(c, s, id, label.name, label.purpose ?? "")); setNote(<>{label.name} registered as agent {id.toString()} <TxLink cfg={c.cfg} hash={regHash} label="registration" />, and named on chain <TxLink cfg={c.cfg} hash={lrc?.hash} label="label" />.</>); }
      catch (e) { setNote(<>{label.name} registered as agent {id.toString()} <TxLink cfg={c.cfg} hash={regHash} />. {explain(e, c)}. Its name is only in this browser until you put it on chain from its panel.</>); }
    } else {
      said(`${label.name} registered as agent ${id} under your wallet as its cold key.`, regHash);
    }
    /* the registration and the label are both behind the executed block by now;
       wait for it rather than showing a list without the new agent */
    const rcpt = await c.p.getTransactionReceipt(regHash).catch(() => null);
    await settled(c, rcpt?.blockNumber);
    refresh(c).catch(() => {});
  }

  /* put a browser-only label on chain, from the panel. */
  async function publishLabel(a: Agent) {
    if (!conn) return; const s = ownerSigner(conn); if (!s) return;
    const l = getLabel(conn.cfg.chainIdHex, a.id); if (!l) return;
    try { const rc = await ownerTx(() => labelOnChain(conn, s, a.id, l.name, l.purpose ?? "")); await refresh(conn); said(`${l.name} is now named on chain.`, rc?.hash); }
    catch (e) { setNote(msg(e)); }
  }

  /* the local demo seeds one agent so the page is never empty. */
  const seedDemo = async (c: Conn) => {
    const w = ethers.Wallet.createRandom();
    const sig = await w.signMessage(consentMessage(c, w.address, c.owner!.address));
    return registerAgent(c, w.address, { name: "Demo agent", purpose: "Trades on the demo venue every few seconds" }, [], 0, sig);
  };

  /* pause is the reversible one: active to paused, paused back to active. */
  async function pause(a: Agent) {
    if (!conn) return;
    const s = ownerSigner(conn); if (!s) { setNote("Connect your wallet first"); return; }
    const k = "p" + a.id.toString();
    setBusy(b => new Set(b).add(k));
    try {
      const to = a.status === "paused" ? 1 : 2;
      const rc = await ownerTx(async () => (await (conn.ks.connect(s) as ethers.Contract).setStatus(a.id, to, ethers.id(to === 2 ? "owner paused" : "owner resumed"))).wait(2));
      setLast(l => ({ ...l, [a.id.toString()]: `${to === 2 ? "Paused" : "Resumed"} by owner · block ${rc.blockNumber}` }));
      said(`Agent ${a.id} ${to === 2 ? "paused" : "resumed"} at block ${rc.blockNumber}.`, rc.hash);
      await settled(conn, rc.blockNumber); await refresh(conn);
    } catch (e) { setNote(explain(e, conn)); }
    finally { setBusy(b => { const n = new Set(b); n.delete(k); return n; }); }
  }

  /* guardian actions, for agents this wallet guards but does not own. */
  async function guardianAct(g: Guarded, what: "pause" | "escalate") {
    if (!conn) return;
    const s = ownerSigner(conn); if (!s) return;
    const k = "g" + g.id.toString();
    setBusy(b => new Set(b).add(k));
    try {
      const ks = conn.ks.connect(s) as ethers.Contract;
      const rc = await ownerTx(async () => (await (what === "pause" ? ks.guardianPause(g.id) : ks.guardianEscalate(g.id))).wait(2));
      said(what === "pause" ? `Your vote to pause agent ${g.id} is on chain.` : `Agent ${g.id} revoked by guardian escalation.`, rc?.hash);
      await settled(conn, rc?.blockNumber); await refresh(conn);
    } catch (e) { setNote(explain(e, conn)); }
    finally { setBusy(b => { const n = new Set(b); n.delete(k); return n; }); }
  }

  /* the three owner controls the panel now carries. each one transaction. */
  async function withAct<T>(k: string, fn: () => Promise<T>, done: string) {
    if (!conn) return; const s = ownerSigner(conn); if (!s) return;
    setAct(k);
    try { const rc = await ownerTx(fn) as { hash?: string; blockNumber?: number } | undefined; said(done, rc?.hash); await settled(conn, rc?.blockNumber); await refresh(conn); }
    catch (e) { setNote(explain(e, conn)); }
    finally { setAct(null); }
  }
  const rename = (a: Agent, name: string, purpose: string) => withAct("rename", async () => { await labelOnChain(conn!, ownerSigner(conn!)!, a.id, name, purpose); setLabel(conn!.cfg.chainIdHex, a.id, { name, purpose: purpose || undefined }); }, `Agent ${a.id} is now named ${name} on chain.`);
  /* both limits land in one call, so an owner never sits between two states
     where one is set and the other is not. */
  const limits = (a: Agent, expiresAt: number, window: number) => withAct("limits", async () => (await (conn!.ks.connect(ownerSigner(conn!)!) as ethers.Contract).setLimits(a.id, expiresAt, window)).wait(2),
    expiresAt || window ? `Agent ${a.id}: ${expiresAt ? `trusted until ${new Date(expiresAt * 1000).toLocaleString()}` : "no end date"}, ${window ? `must report every ${Math.round(window / 60)} minutes` : "no heartbeat"}.` : `Agent ${a.id} has no limits now.`);
  /* the panic button. the device makes the passkey, the wallet names it on
     chain. the credential id is not stored anywhere: the phone offers whatever
     passkey it holds for this site when the panic page asks. */
  const setStopKey = (a: Agent) => withAct("panic", async () => {
    const k = await registerPasskey(`trustset agent ${a.id}`);
    return (await (conn!.ks.connect(ownerSigner(conn!)!) as ethers.Contract).setStopKey(a.id, k.x, k.y, k.rpIdHash)).wait(2);
  }, `Agent ${a.id} can now be paused with that passkey. Open /panic?id=${a.id} on the phone that holds it.`);
  const clearStopKey = (a: Agent) => withAct("panic", async () =>
    (await (conn!.ks.connect(ownerSigner(conn!)!) as ethers.Contract).setStopKey(a.id, 0, 0, ethers.ZeroHash)).wait(2),
    `Agent ${a.id} has no passkey now.`);
  const proposeKey = (a: Agent, addr: string) => withAct("key", async () => (await (conn!.ks.connect(ownerSigner(conn!)!) as ethers.Contract).proposeRevocationKey(a.id, addr)).wait(2), `Cold key change proposed for agent ${a.id}. It lands after the delay.`);
  const applyKey = (a: Agent) => withAct("key", async () => (await (conn!.ks.connect(ownerSigner(conn!)!) as ethers.Contract).applyRevocationKey(a.id)).wait(2), `Agent ${a.id} now belongs to its new cold key, and has left this list.`);
  const rotate = (a: Agent, succ: bigint) => withAct("rotate", async () => (await (conn!.ks.connect(ownerSigner(conn!)!) as ethers.Contract).rotate(a.id, succ, ethers.id("owner rotated"))).wait(2), `Agent ${a.id} rotated to agent ${succ}.`);

  async function stop(a: Agent) {
    if (!conn) return;
    const s = ownerSigner(conn); if (!s) { setNote("Connect your wallet first"); return; }
    const k = a.id.toString();
    setBusy(b => new Set(b).add(k));
    try {
      const rc = await ownerTx(async () => (await (conn.ks.connect(s) as ethers.Contract).setStatus(a.id, 3, ethers.id("owner pressed stop"))).wait());
      setLast(l => ({ ...l, [k]: `Revoked by owner · block ${rc.blockNumber}` }));
      setStamps(st => ({ ...st, [k]: { block: rc.blockNumber, txHash: rc.hash } }));
      said(`Agent ${a.id} stopped at block ${rc.blockNumber}. From the next block every app that checks refuses it.`, rc.hash);
      await settled(conn, rc.blockNumber); await refresh(conn); setSel(a.id);
    } catch (e) { setNote(msg(e)); }
    finally { setBusy(b => { const n = new Set(b); n.delete(k); return n; }); }
  }

  const [histories, setHistories] = useState<Record<string, Agent["history"]>>({});
  /* the panel's history, read when an agent is opened and when its status changes */
  useEffect(() => {
    if (!conn || sel === null) return;
    let alive = true;
    (conn.ks.stopKeyOf(sel, READ) as Promise<[bigint, bigint, string, bigint, boolean]>)
      .then(k => { if (alive) setStopKeys(p => ({ ...p, [sel.toString()]: { set: k[4], nonce: Number(k[3]) } })); })
      .catch(() => {});
    return () => { alive = false; };
  }, [conn, sel, act]);

  const selectedRaw = agents.find(a => a.id === sel) ?? null;
  const selKey = selectedRaw ? `${selectedRaw.id}:${selectedRaw.status}:${selectedRaw.since}` : null;
  useEffect(() => {
    if (!conn || !selectedRaw) return;
    let alive = true;
    loadHistory(conn, selectedRaw.id).then(h => { if (alive) setHistories(x => ({ ...x, [selectedRaw.id.toString()]: h })); }).catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conn, selKey]);
  const selected = selectedRaw ? { ...selectedRaw, history: histories[selectedRaw.id.toString()] ?? [] } : null;
  const signedIn = !!(conn && ownerAddr(conn));

  return (
    <>
      <Shell title="Your agents" note={conn ? <>{conn.cfg.chain}{asOf && signedIn ? ` · as of ${asOf}` : ""}</> : undefined}
        actions={<button type="button" className="drawn-btn btn-gold" style={{ padding: "8px 14px", fontSize: "0.8rem" }} disabled={!signedIn} title="Tell the switch about an agent you already run. Nothing is created."
          onClick={() => setRegOpen(true)}>Register agent</button>}>

        {note && <div className="sheet px-4 py-3 mb-3 text-xs flex items-start gap-3"><span className="break-words text-ink/80">{note}</span><button type="button" onClick={() => setNote(null)} className="ml-auto text-ink/70" aria-label="Dismiss">×</button></div>}
        {conn === undefined && <div className="sheet p-6 text-sm text-ink/70">Connecting…</div>}
        {conn === null && <div className="sheet p-6 text-sm text-ink/70">No chain configured.</div>}
        {conn && !signedIn && (
          /* no wallet yet: the replay plays in the list's place, marked as a
             sample, and the connect card takes the panel's place. same row,
             same top and bottom, as when the real list is here. */
          <div className="grid gap-3 sm:gap-4 lg:grid-cols-[minmax(0,1fr)_360px] items-stretch">
            <div className="min-w-0 lg:min-h-[420px]"><Replay sample /></div>
            <div className="sheet p-6 sm:p-8 flex flex-col justify-center text-center gap-3 min-w-0">
              <div className="text-lg font-semibold tracking-tight">These rows are a sample</div>
              <p className="text-sm text-ink/70">Connect the wallet you registered your agents with, top right, and yours take their place, read from {conn.cfg.chain}. That wallet is the <Term k="cold key">cold key</Term>: it can stop them and never spend from them.</p>
            </div>
          </div>
        )}
        {conn && signedIn && (
          /* two columns, always. the right one is the panel or a quiet
             placeholder. adding the column only on selection made the list
             jump and the panel flash at the top before it settled. */
          <div className="grid gap-3 sm:gap-4 lg:grid-cols-[minmax(0,1fr)_360px] items-stretch">
            <div className="drawn-box overflow-clip min-w-0 lg:min-h-[420px] flex flex-col">
              <div className="hidden sm:grid grid-cols-[18px_180px_1fr_110px_auto] gap-4 px-5 py-2.5" style={{ borderBottom: "1px solid var(--hairline)" }}>
                <span /><span className="eyebrow">agent</span><span className="eyebrow">last</span><span className="eyebrow text-right">since</span><span className="eyebrow">control</span>
              </div>
              {!loaded && agents.length === 0 && <div className="px-5 py-8 text-sm" style={{ color: "var(--text-medium)" }}>Reading your agents from {conn.cfg.chain}…</div>}
              {loaded && agents.length === 0 && <div className="px-5 py-8 text-sm text-ink/70">Nothing under {short(ownerAddr(conn)!)} yet. <Term k="register">Register</Term> the <Term k="agent key">agent key</Term> of an agent you already run, and this wallet becomes the one that can stop it.</div>}
              {agents.map(a => (
                <AgentRow key={a.id.toString()} agent={a} name={labelFor(a).name} last={last[a.id.toString()] ?? (a.status === "revoked" ? "Revoked" : a.status === "rotated" ? "Rotated to a successor" : "Registered")}
                  selected={sel === a.id} stopState={busy.has(a.id.toString()) ? "busy" : "ready"} onSelect={() => setSel(sel === a.id ? null : a.id)} onStop={() => stop(a)}
                  onPause={() => pause(a)} pausing={busy.has("p" + a.id.toString())} />
              ))}
            </div>
            {/* same top, same bottom as the list: the column stretches with the
                row and its content fills the column. measured, see below. */}
            <div className="min-w-0 flex flex-col">
              <AnimatePresence mode="wait" initial={false}>
                {selected ? (
                  <AgentPanel key={selected.id.toString()} agent={selected} label={labelFor(selected)} onPublishLabel={() => publishLabel(selected)} stamp={stamps[selected.id.toString()]} explorer={conn.cfg.explorer} onClose={() => setSel(null)}
                    actions={<PanelActions agent={selected} name={labelFor(selected).name} purpose={labelFor(selected).purpose} now={now} delayDays={delayDays} busy={act}
                      /* the contract only refuses a successor that is not Active,
                         so an expired one is accepted and trust lands on an agent
                         nothing will serve. this offers the ones truly trusted. */
                      others={agents.filter(o => o.id !== selected.id && trusted(o, now)).map(o => ({ id: o.id, name: labelFor(o).name }))}
                      onRename={(n, p) => rename(selected, n, p)} onLimits={(e, w) => limits(selected, e, w)}
                      hasStopKey={!!stopKeys[selected.id.toString()]?.set} stopKeyUses={stopKeys[selected.id.toString()]?.nonce ?? 0}
                      onSetStopKey={() => setStopKey(selected)} onClearStopKey={() => clearStopKey(selected)} onProposeKey={addr => proposeKey(selected, addr)} onApplyKey={() => applyKey(selected)} onRotate={id => rotate(selected, id)} />}
                    proof={selected.status === "revoked" && ownerSigner(conn) ? (
                      <HumanProof conn={conn} signer={ownerSigner(conn)!} account={ownerAddr(conn)!} txHash={stamps[selected.id.toString()]?.txHash ?? null}
                        onProved={() => setStamps(st => ({ ...st, [selected.id.toString()]: { ...st[selected.id.toString()], human: true } }))} />
                    ) : null} />
                ) : (
                  <div key="none" className="hidden lg:flex sheet p-6 flex-1 flex-col justify-center text-center">
                    <div className="text-sm font-semibold">Nothing selected</div>
                    <div className="text-xs mt-1" style={{ color: "var(--text-medium)" }}>Pick an agent for its keys, its history and its stop record.</div>
                  </div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}
        {conn && signedIn && guarded.length > 0 && (
          <section className="mt-8">
            <div className="sec-head"><h2 className="font-semibold text-[20px]">Agents you guard</h2><span className="note">Their owners chose you to stop them if the owner cannot. You can pause by vote. If the owner then does nothing for the delay, you can stop it.</span></div>
            <div className="drawn-box overflow-clip">
              {guarded.map(g => {
                const k = "g" + g.id.toString(); const b = busy.has(k);
                const canEscalate = g.status === "paused" && now >= g.escalateAt;
                const wait = g.status === "paused" ? Math.max(0, g.escalateAt - now) : 0;
                /* a guardian is the person who acts on this row, so it must not
                   call an agent Active when its end date has passed or it has
                   gone quiet. the contract still says Active; isTrusted does
                   not, and the guardian is told what isTrusted says. */
                const live = trusted(g, now);
                const why = live ? "Active" : statusWord(g, now) === "expired" ? "Its end date has passed" : "It has gone quiet";
                const dot = live ? "var(--sage)" : (g.status === "active" || g.status === "paused") ? "var(--terra)" : "var(--orange)";
                return (
                  <div key={k} className="grid grid-cols-[1fr_auto] sm:grid-cols-[18px_250px_1fr_auto] items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3.5 text-sm" style={{ borderBottom: "1px solid var(--hairline)" }}>
                    <span className="hidden sm:block w-2 h-2 rounded-full" style={{ background: dot }} />
                    <div className="min-w-0"><div className="font-semibold truncate">{g.label?.name || `Agent ${g.id}`}</div><div className="mono text-[11px] text-ink/70 whitespace-nowrap truncate">agent {g.id.toString()} · owner {short(g.coldKey)}</div></div>
                    <div className="hidden sm:block text-ink/70 min-w-0">
                      {g.status === "active" && (g.voted ? `Your vote to pause is in. ${g.votes} of ${g.threshold} needed.` : `${why}. ${g.votes} of ${g.threshold} votes to pause so far.`)}
                      {g.status === "paused" && (canEscalate ? `Paused, and its owner has done nothing for ${span(g.delay)}. You may stop it for good.` : `Paused. If its owner does nothing for ${span(g.delay)}, you may stop it. ${span(wait)} left.`)}
                      {(g.status === "revoked" || g.status === "rotated") && "Stopped"}
                    </div>
                    <div className="flex gap-1.5 justify-end">
                      {g.status === "active" && !g.voted && <button type="button" className="drawn-btn btn-gold" style={{ padding: "6px 12px", fontSize: "0.78rem" }} disabled={b} onClick={() => guardianAct(g, "pause")}>{b ? "…" : "Vote to pause"}</button>}
                      {g.status === "active" && g.voted && <span className="mono text-[11px] uppercase tracking-[0.12em]" style={{ color: "var(--text-medium)" }}>Voted</span>}
                      {g.status === "paused" && <button type="button" className="drawn-btn btn-orange" style={{ padding: "6px 12px", fontSize: "0.78rem" }} disabled={b || !canEscalate} onClick={() => guardianAct(g, "escalate")} title={canEscalate ? "Revoke for good" : "Opens when the delay has passed"}>{b ? "…" : "Revoke"}</button>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
        {conn && signedIn && (
          <RegisterDialog open={regOpen} onClose={() => setRegOpen(false)} coldKey={ownerAddr(conn)!}
            conn={conn}
            onRegister={(k, label, guardians, threshold, sig) => registerAgent(conn, k, label, guardians, threshold, sig)}
            checkKey={async k => { const id = await agentIdForKey(conn, k); return id === 0n ? null : id; }} />
        )}
      </Shell>
      <Footer />
    </>
  );
}
