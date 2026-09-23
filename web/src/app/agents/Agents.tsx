"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ethers } from "ethers";
import { registerPasskey } from "@/lib/webauthn";
import Fleet from "@/components/agents/Fleet";
import AgentPage from "@/components/agents/AgentPage";
import HumanProof from "@/components/agents/HumanProof";
import Footer from "@/components/Footer";
import Shell from "@/components/agents/Shell";
import { useWallet } from "@/components/WalletProvider";
import RegisterDialog from "@/components/agents/RegisterDialog";
import TxLink, { addrUrl } from "@/components/agents/TxLink";
import Term from "@/components/Term";
import { adoptParked, fallbackName, getLabel, parkLabel, setLabel, type Label } from "@/lib/labels";
import { READ, agentIdForKey, cachedAgents, coldKeyDelay, consentMessage, explain, settled, labelOnChain, loadAgents, loadGuarded, loadHistory, ownerTx, registerOnChain, short, statusWord, trusted, type Agent, type Conn, type Guarded } from "@/lib/chain";
import { type Extra, type PulseEvent, layersOf } from "@/lib/layers";
import { type Row, fakeAgents, groupFromPurpose, loadTags, purposeWithGroup, rowsOf, saveTags } from "@/lib/fleet";
import { isSample, sampleAgents, sampleExtras, sampleGroups, sampleGuarded, samplePulses } from "@/lib/sample";
import type { LayerKey } from "@/lib/layers";

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
  const { conn, who, connectNow } = useWallet();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [guarded, setGuarded] = useState<Guarded[]>([]);
  const [delayDays, setDelayDays] = useState(1);
  const [act, setAct] = useState<string | null>(null);
  useEffect(() => { if (conn) coldKeyDelay(conn).then(d => setDelayDays(Math.max(1, Math.round(d / 86400)))).catch(() => {}); }, [conn]);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => { const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000); return () => clearInterval(t); }, []);
  /* nothing is "empty" until the chain has actually answered once. */
  const [loaded, setLoaded] = useState(false);
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

  /* ?as=0x… draws any owner's console read only, and ?index=https://… reads
     the pulse from another deployment's index. development builds only: the
     console renders agents only behind a wallet and a headless browser has
     none. nothing here can sign, so every control says to connect. */
  const [asOwner, setAsOwner] = useState<string | null>(null);
  /* ?fake=N pads the list with invented agents, so the hundred-agent fleet
     can be measured. development only, like the rest of this block. */
  const [fake, setFake] = useState(0);
  const [indexAt, setIndexAt] = useState("");
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    try {
      const q = new URLSearchParams(location.search);
      const v = q.get("as"); if (v && ethers.isAddress(v)) setAsOwner(ethers.getAddress(v));
      const i = q.get("index"); if (i && /^https:\/\/[a-z0-9.-]+$/i.test(i)) setIndexAt(i);
      const n = Number(q.get("fake") ?? 0); if (n > 0 && n <= 2000) setFake(n);
    } catch { /* no window */ }
  }, []);
  const ownerAddr = (c: Conn) => who?.address ?? c.owner?.address ?? asOwner;
  /* the list the page draws.
     with no wallet it is the written-out sample, so a visitor sees the console
     working instead of an empty card. pinned to one moment so the rows do not
     reshuffle every second. in development ?fake=N pads the real list too. */
  const pinned = useRef(Math.floor(Date.now() / 1000));
  const sample = useMemo(() => sampleAgents(pinned.current), []);
  const sampleOn = !!(conn && !who && !conn.owner && !asOwner);
  const all = useMemo(() => sampleOn ? sample
    : fake && process.env.NODE_ENV !== "production" ? [...agents, ...fakeAgents(fake, pinned.current).filter(f => !agents.some(a => a.id === f.id))]
    : agents, [sampleOn, sample, agents, fake]);
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
  }, [conn, who, asOwner]);

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
      await settled(conn, rc.blockNumber); await refresh(conn);
    } catch (e) { setNote(msg(e)); }
    finally { setBusy(b => { const n = new Set(b); n.delete(k); return n; }); }
  }

  /* the extras for the whole fleet in one request: each agent's passkey, its
     latest event, its last day, and its ERC-8004 link. see /api/fleet. the
     human count and the refund rows are one read each and stay here. */
  const [extras, setExtras] = useState<Record<string, Extra>>({});
  const [pulses, setPulses] = useState<Record<string, { events: PulseEvent[]; indexed: boolean | null }>>({});
  const idsKey = all.map(a => a.id.toString()).join(",");
  useEffect(() => {
    if (sampleOn) { setExtras(sampleExtras()); setPulses(samplePulses(pinned.current)); return; }
    if (!conn || !all.length) return;
    let alive = true;
    const c = conn;
    const pull = async () => {
      const [fleet, refunds, human] = await Promise.all([
        fetch(`${indexAt}/api/fleet?ids=${idsKey}`, { cache: "no-store" }).then(r => r.json()).catch(() => null) as Promise<null | { stopKeys?: Record<string, { set: boolean; nonce: number }>; indexed?: boolean; last?: Record<string, PulseEvent>; events24?: Record<string, PulseEvent[]>; erc8004?: Record<string, number> }>,
        fetch("/api/refunds").then(r => r.json()).catch(() => ({ rows: [] })) as Promise<{ rows?: { payer: string; service: string }[] }>,
        (async () => { try { return c.touch ? Number(await c.touch.humanCount(all[0].coldKey, READ)) : 0; } catch { return 0; } })(),
      ]);
      if (!alive) return;
      const ex: Record<string, Extra> = {}; const pl: Record<string, { events: PulseEvent[]; indexed: boolean | null }> = {};
      const sk: Record<string, { set: boolean; nonce: number }> = {};
      for (const a of all) {
        const id = a.id.toString();
        const k = fleet?.stopKeys?.[id];
        const rf = (refunds.rows ?? []).filter(r => r.payer.toLowerCase() === a.key.toLowerCase() || r.service.toLowerCase() === a.key.toLowerCase()).length;
        ex[id] = { stopKey: k?.set ?? false, humanCount: human, refunds: rf, erc8004: fleet?.erc8004?.[id] ?? null };
        if (k) sk[id] = k;
        /* the last day for the pulse, with the latest event first even when it is older than a day */
        const day = fleet?.events24?.[id] ?? [];
        const latest = fleet?.last?.[id];
        pl[id] = { events: latest && !day.some(e => e.at === latest.at && e.kind === latest.kind) ? [...day, latest] : day, indexed: fleet ? !!fleet.indexed : false };
      }
      setExtras(ex); setPulses(pl); setStopKeys(p => ({ ...p, ...sk }));
    };
    pull();
    const t = setInterval(pull, 30_000);
    return () => { alive = false; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conn, idsKey, indexAt, act, sampleOn]);

  /* the url is the navigation. /agents is the fleet, /agents/12 is one agent. */
  const params = useParams<{ id?: string[] }>();
  const router = useRouter();
  const routeId = params?.id?.[0] && /^\d+$/.test(params.id[0]) ? BigInt(params.id[0]) : null;
  const guardingRoute = params?.id?.[0] === "guarding";
  const go = (path: string) => router.push(path + (typeof location !== "undefined" ? location.search : ""));

  /* groups are the reader's, kept in this browser, keyed by chain and id */
  const [tags, setTags] = useState<Record<string, string>>({});
  useEffect(() => { if (conn) setTags(loadTags(conn.cfg.chainIdHex)); }, [conn]);
  const setTag = (id: bigint, t: string) => { if (!conn) return; const n = { ...tags }; if (t) n[id.toString()] = t; else delete n[id.toString()]; setTags(n); saveTags(conn.cfg.chainIdHex, n); };

  const [histories, setHistories] = useState<Record<string, Agent["history"]>>({});
  const selectedRaw = routeId !== null ? all.find(a => a.id === routeId) ?? null : null;
  const selKey = selectedRaw ? `${selectedRaw.id}:${selectedRaw.status}:${selectedRaw.since}` : null;
  useEffect(() => {
    if (!conn || !selectedRaw || fake || sampleOn) return;
    let alive = true;
    loadHistory(conn, selectedRaw.id).then(h => { if (alive) setHistories(x => ({ ...x, [selectedRaw.id.toString()]: h })); }).catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conn, selKey]);
  const cur = selectedRaw ? { ...selectedRaw, history: histories[selectedRaw.id.toString()] ?? selectedRaw.history } : null;
  const names = useMemo(() => Object.fromEntries(all.map(a => [a.id.toString(), labelFor(a).name])), [all]); // eslint-disable-line react-hooks/exhaustive-deps
  const purposes = useMemo(() => Object.fromEntries(all.map(a => [a.id.toString(), labelFor(a).purpose ?? ""])), [all]); // eslint-disable-line react-hooks/exhaustive-deps
  const groups = useMemo(() => {
    if (sampleOn) return sampleGroups();
    const g: Record<string, string> = {};
    for (const a of all) { const id = a.id.toString(); const t = tags[id] || groupFromPurpose(a.label?.purpose); if (t) g[id] = t; }
    return g;
  }, [sampleOn, all, tags]);
  const rows = useMemo(() => rowsOf(all, names, extras, pulses, groups, now), [all, names, extras, pulses, groups, now]);
  /* ?open=limits lands on the agent with that settings row open */
  const [openRow, setOpenRow] = useState<LayerKey | undefined>(undefined);
  useEffect(() => { try { const o = new URLSearchParams(location.search).get("open"); setOpenRow(o && ["panic", "guardians", "limits", "identity", "human", "refunds"].includes(o) ? o as LayerKey : undefined); } catch { /* no window */ } }, [routeId]);
  const goAgentList = () => { const q = new URLSearchParams(typeof location !== "undefined" ? location.search : ""); q.delete("open"); const qs = q.toString(); router.push(`/agents${qs ? "?" + qs : ""}`); };
  const goAgent = (id: bigint, open?: LayerKey) => { const q = new URLSearchParams(typeof location !== "undefined" ? location.search : ""); if (open) q.set("open", open); else q.delete("open"); const qs = q.toString(); router.push(`/agents/${id}${qs ? "?" + qs : ""}`); };
  const guardedShown = useMemo(() => sampleOn ? sampleGuarded(pinned.current) : guarded, [sampleOn, guarded]);
  /* the guarding tab's count: agents waiting on this wallet's vote or escalation */
  const waiting = guardedShown.filter(g => (g.status === "active" && !g.voted) || (g.status === "paused" && now >= g.escalateAt)).length;

  /* the agent page's history: the index's record for this agent, a hundred
     at a time, oldest pages fetched on request. */
  const [hist, setHist] = useState<{ id: string; events: PulseEvent[]; total: number; loading: boolean }>({ id: "", events: [], total: 0, loading: false });
  const histPage = async (id: string, offset: number) => {
    setHist(h => ({ ...(h.id === id ? h : { id, events: [], total: 0 }), id, loading: true }));
    const j = await fetch(`${indexAt}/api/explorer?q=${id}&limit=100&offset=${offset}`, { cache: "no-store" }).then(r => r.json()).catch(() => null) as { indexed?: boolean; total?: number; events?: { kind: string; at: string; actor?: string | null; tx_hash?: string; data?: Record<string, unknown> }[] } | null;
    const evs: PulseEvent[] = (j?.events ?? []).map(e => ({ kind: e.kind, at: Math.floor(Date.parse(e.at) / 1000), actor: e.actor ?? null, data: { ...(e.data ?? {}), tx: e.tx_hash } }));
    setHist(h => h.id !== id ? h : { id, events: offset === 0 ? evs : [...h.events, ...evs], total: j?.total ?? 0, loading: false });
  };
  useEffect(() => { if (routeId !== null && !isSample(routeId)) histPage(routeId.toString(), 0); }, [routeId, act, indexAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const signedIn = !!(conn && ownerAddr(conn));
  /* a sample agent is on no chain, so it gets no explorer links */
  const explorer = sampleOn ? undefined : conn?.cfg.explorer;
  const canSign = !!(conn && ownerSigner(conn));
  /* previous and next, in the fleet's own order */
  const order = rows.map(r => r.a.id);
  const at = cur ? order.findIndex(id => id === cur.id) : -1;

  /* one transaction per agent, in sequence, so the wallet asks once each and
     a refusal stops the run where it happened rather than half way through. */
  async function bulk(kind: "pause" | "resume" | "stop" | "limits", list: Row[], lim?: { expiresAt: number; window: number }) {
    if (!conn) return; const s = ownerSigner(conn); if (!s) { setNote("Connect your wallet first"); return; }
    const ks = conn.ks.connect(s) as ethers.Contract;
    let done = 0;
    for (const r of list) {
      const k = kind === "stop" ? r.id : "p" + r.id;
      setBusy(b => new Set(b).add(k));
      try {
        if (kind === "limits") await ownerTx(async () => (await ks.setLimits(r.a.id, lim!.expiresAt, lim!.window)).wait(2));
        else {
          const to = kind === "pause" ? 2 : kind === "resume" ? 1 : 3;
          await ownerTx(async () => (await ks.setStatus(r.a.id, to, ethers.id(kind === "pause" ? "owner paused" : kind === "resume" ? "owner resumed" : "owner pressed stop"))).wait(2));
        }
        done++;
        setNote(`${kind === "pause" ? "Paused" : kind === "resume" ? "Brought back" : kind === "limits" ? "Limits set on" : "Stopped"} ${done} of ${list.length}…`);
      } catch (e) { setNote(`${explain(e, conn)}. ${done} of ${list.length} done, stopped at ${r.name}.`); setBusy(b => { const n = new Set(b); n.delete(k); return n; }); return; }
      finally { setBusy(b => { const n = new Set(b); n.delete(k); return n; }); }
    }
    setNote(`${kind === "pause" ? "Paused" : kind === "resume" ? "Brought back" : kind === "limits" ? "Limits set on" : "Stopped"} ${done} agent${done === 1 ? "" : "s"}.`);
    await refresh(conn);
  }

  const guardingPanel = (
    <section>
      <p className="text-[12.5px] mb-3" style={{ color: "var(--text-medium)" }}>Their owners chose you to stop them if the owner cannot. Pause by vote; if the owner does nothing for the delay, stop it.</p>
      <div className="sheet overflow-clip">
        {guardedShown.map(g => {
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
  );

  /* the page's one solid button. it used to be disabled until a wallet was
     connected, which drew the main action of the console in grey. now it asks
     for the wallet first and opens the dialog once there is one. */
  const register = <button type="button" className="drawn-btn btn-orange" style={{ padding: "6px 14px", fontSize: "0.78rem" }} title="Tell the switch about an agent you already run. Nothing is created."
    onClick={() => { if (signedIn) setRegOpen(true); else connectNow().then(() => setRegOpen(true)).catch(() => {}); }}>Register agent</button>;

  return (
    <>
      {/* one agent is a canvas: one window tall, its history and settings
          scrolling inside themselves. the fleet and guarding are ordinary
          pages; the fleet's table caps its own height and windows its rows. */}
      <Shell frame={!guardingRoute && routeId !== null} wide={guardingRoute || routeId === null} title={cur ? labelFor(cur).name : guardingRoute ? "Guarding" : "Your agents"} note={conn ? <>{conn.cfg.chain}{asOf && signedIn ? ` · as of ${asOf}` : ""}</> : undefined}
        actions={register} badges={waiting ? { "/agents/guarding": waiting } : undefined}>

        {/* a notice is a toast at the corner, never a bar that moves the table */}
        {note && (
          <div role="status" className="fixed z-[70] bottom-4 right-4 left-4 sm:left-auto sm:max-w-md sheet px-4 py-3 text-xs flex items-start gap-3" style={{ boxShadow: "0 12px 32px rgba(0,0,0,0.14)" }}>
            <span className="break-words min-w-0" style={{ color: "var(--text-dark)" }}>{note}</span>
            <button type="button" onClick={() => setNote(null)} className="ml-auto shrink-0" style={{ color: "var(--text-medium)" }} aria-label="Dismiss">×</button>
          </div>
        )}
        {conn === undefined && <div className="sheet p-6 text-sm text-ink/70">Connecting…</div>}
        {conn === null && <div className="sheet p-6 text-sm text-ink/70">No chain configured.</div>}
        {/* no wallet: the console itself, drawn from the sample, under one line
            saying so. an empty card with the word connect showed a visitor
            nothing about what any of this does. */}
        {sampleOn && (
          <p className="shrink-0 mb-3 text-[12.5px] flex flex-wrap items-center gap-x-2 gap-y-1" style={{ color: "var(--text-medium)" }}>
            <span className="mono text-[10px] uppercase tracking-[0.12em] rounded-full px-2 py-0.5" style={{ border: "1px solid var(--hairline)", color: "var(--text-dark)" }}>sample</span>
            {guardingRoute ? `${guardedShown.length} agents somebody else owns, to show what a guardian does.` : `${all.length} made-up agents, to show the console working.`}
            <span>Connect the wallet that is your agents&apos; <Term k="cold key">cold key</Term> to see yours.</span>
          </p>
        )}
        {conn && signedIn && !guardingRoute && !loaded && all.length === 0 && <div className="sheet px-5 py-8 text-sm" style={{ color: "var(--text-medium)" }}>Reading your agents from {conn.cfg.chain}…</div>}
        {conn && signedIn && !guardingRoute && loaded && all.length === 0 && <div className="sheet px-5 py-8 text-sm text-ink/70">Nothing under {short(ownerAddr(conn)!)} yet. <Term k="register">Register</Term> the <Term k="agent key">agent key</Term> of an agent you already run, and this wallet becomes the one that can stop it. <span className="ml-2">{register}</span></div>}
        {conn && (signedIn || sampleOn) && guardingRoute && (
          <div className="min-w-0">{guardedShown.length ? guardingPanel : <div className="sheet px-5 py-8 text-sm" style={{ color: "var(--text-medium)" }}>Nobody has named this wallet as a guardian yet.</div>}</div>
        )}
        {/* the fleet, only when the url is not naming one agent. without the
            routeId test an unknown id drew the error under a full table. */}
        {conn && (signedIn || sampleOn) && !guardingRoute && routeId === null && all.length > 0 && (
          <Fleet agents={all} rows={rows} purposes={purposes} now={now} pulses={pulses} busy={busy} canSign={canSign}
            onOpen={goAgent} onToggle={a => pause(a)} onStop={a => stop(a)} onBulk={bulk} />
        )}
        {conn && (signedIn || sampleOn) && routeId !== null && !cur && (loaded || sampleOn) && <div className="sheet px-5 py-8 text-sm" style={{ color: "var(--text-medium)" }}>No agent {routeId.toString()} under this wallet. <button type="button" onClick={() => go("/agents")} className="underline">Back to the fleet</button></div>}
        {conn && (signedIn || sampleOn) && cur && (
          <AgentPage agent={cur} name={labelFor(cur).name} now={now} explorer={explorer}
            events={pulses[cur.id.toString()]?.events ?? []} indexed={pulses[cur.id.toString()]?.indexed ?? null} extra={extras[cur.id.toString()] ?? {}}
            busy={{ pause: busy.has("p" + cur.id.toString()), stop: busy.has(cur.id.toString()) }}
            onToggle={() => pause(cur)} onStop={() => stop(cur)}
            onBack={() => goAgentList()} position={at >= 0 ? `${at + 1} of ${order.length}` : ""}
            onPrev={at > 0 ? () => goAgent(order[at - 1]) : undefined} onNext={at >= 0 && at < order.length - 1 ? () => goAgent(order[at + 1]) : undefined}
            history={sampleOn
              ? { events: pulses[cur.id.toString()]?.events ?? [], total: pulses[cur.id.toString()]?.events.length }
              : { events: hist.id === cur.id.toString() ? hist.events : [], total: hist.id === cur.id.toString() ? hist.total : undefined, loading: hist.loading, more: () => histPage(cur.id.toString(), hist.events.length) }}
            inspector={{
              initialOpen: openRow, onPublishGroup: g => rename(cur, labelFor(cur).name, purposeWithGroup(labelFor(cur).purpose ?? "", g)),
              layers: layersOf(cur, extras[cur.id.toString()] ?? {}, now), busy: act, canSign, delayDays,
              hasStopKey: !!stopKeys[cur.id.toString()]?.set, stopKeyUses: stopKeys[cur.id.toString()]?.nonce ?? 0,
              purpose: labelFor(cur).purpose, labelWhere: labelFor(cur).where, tag: tags[cur.id.toString()] ?? "",
              others: all.filter(o => o.id !== cur.id && trusted(o, now)).map(o => ({ id: o.id, name: labelFor(o).name })),
              onRename: (n, pu) => rename(cur, n, pu), onPublishLabel: () => publishLabel(cur), onTag: t => setTag(cur.id, t),
              onLimits: (e, w) => limits(cur, e, w), onSetStopKey: () => setStopKey(cur), onClearStopKey: () => clearStopKey(cur),
              onProposeKey: addr => proposeKey(cur, addr), onApplyKey: () => applyKey(cur), onRotate: id => rotate(cur, id),
              proof: cur.status === "revoked" && ownerSigner(conn) ? (
                <HumanProof conn={conn} signer={ownerSigner(conn)!} account={ownerAddr(conn)!} txHash={stamps[cur.id.toString()]?.txHash ?? null}
                  onProved={() => setStamps(st => ({ ...st, [cur.id.toString()]: { ...st[cur.id.toString()], human: true } }))} />
              ) : null,
            }} />
        )}
        {conn && signedIn && (
          <RegisterDialog open={regOpen} onClose={() => setRegOpen(false)} coldKey={ownerAddr(conn)!}
            conn={conn}
            onRegister={(k, label, guardians, threshold, sig) => registerAgent(conn, k, label, guardians, threshold, sig)}
            checkKey={async k => { const id = await agentIdForKey(conn, k); return id === 0n ? null : id; }} />
        )}
      </Shell>
      {/* every page ends in the footer. the list is an ordinary page now that
          its table ends at its last row; the agent page keeps its one window
          canvas and the footer sits one scroll below it. */}
      <Footer />
    </>
  );
}
