"use client";
import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import Term from "@/components/Term";
import { say, ago, every, short, dayOf, type Ev, type Tone } from "../words";

/* one agent's whole life.
 *
 * the page you open to answer "is this agent still good", which is the question
 * the switch exists for. identity first, because that is what an app checks,
 * then everything that ever happened to it. */
type Row = {
  id: number; agent_key: string; cold_key: string; guardians: string[]; threshold: number;
  status: string; status_at: string; registered_at: string; registered_tx: string;
  successor_id: number | null; expires_at: string; heartbeat_window: string; last_beat: string;
  name: string | null; purpose: string | null; erc8004_id: string | null;
};
const ERC8004_REGISTRY = "0x8004A818BFB912233c491871b3d84c89A494BD9e";
const TONE: Record<Tone, string> = { live: "var(--sage)", off: "var(--orange)", quiet: "var(--terra)", plain: "var(--text-light)" };

export default function Agent({ id, explorer }: { id: number; explorer: string }) {
  const [a, setA] = useState<Row | null>(null);
  const [events, setEvents] = useState<Ev[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "none" | "missing">("loading");

  useEffect(() => {
    let alive = true;
    const pull = async () => {
      const r = await fetch(`/api/explorer/agent?id=${id}`, { cache: "no-store" });
      const j = await r.json();
      if (!alive) return;
      if (!j.indexed) return setState("none");
      if (!j.agent) return setState("missing");
      setA(j.agent); setEvents(j.events); setState("ready");
    };
    pull().catch(() => setState("none"));
    const t = setInterval(() => pull().catch(() => {}), 12_000);
    return () => { alive = false; clearInterval(t); };
  }, [id]);

  if (state === "loading") return <p className="text-sm" style={{ color: "var(--text-medium)" }}>Reading the index…</p>;
  if (state === "none") return <p className="text-sm" style={{ color: "var(--text-medium)" }}>This machine has no index. The explorer runs beside the site on the server.</p>;
  if (state === "missing" || !a) return (
    <p className="text-sm" style={{ color: "var(--text-medium)" }}>No agent {id} in the index. <Link href="/explorer" className="underline">Back to the feed</Link>.</p>
  );

  const now = Math.floor(Date.now() / 1000);
  const ex = Number(a.expires_at), hb = Number(a.heartbeat_window), lb = Number(a.last_beat);
  const expired = ex > 0 && now >= ex;
  const lapsed = hb > 0 && now > lb + hb;
  const live = a.status === "active" && !expired && !lapsed;

  return (
    <div className="grid lg:grid-cols-[380px_minmax(0,1fr)] gap-4 items-stretch">
      <div className="sheet p-5 sm:p-7">
        <div className="flex items-center gap-2">
          <span className="w-[9px] h-[9px] rounded-full" style={{ background: live ? "var(--sage)" : a.status === "active" ? "var(--terra)" : "var(--orange)" }} />
          <span className="text-[11px] mono uppercase tracking-[0.12em]" style={{ color: "var(--text-medium)" }}>
            {live ? "Trusted" : expired ? "Expired" : lapsed ? "Gone quiet" : a.status}
          </span>
        </div>
        <h2 className="text-2xl font-semibold mt-2">{a.name || `Agent ${a.id}`}</h2>
        {a.purpose && <p className="text-sm mt-1" style={{ color: "var(--text-medium)" }}>{a.purpose}</p>}

        <dl className="mt-5 grid gap-3.5 text-sm">
          <Field k="Agent id" v={String(a.id)} />
          <Field k="Agent key" v={a.agent_key} explorer={explorer} addr />
          <Field k="Cold key" v={a.cold_key} explorer={explorer} addr
            note={<>The only key that can pause or stop it. <Term k="public keys">Why is this public?</Term></>} />
          <Field k="Guardians" v={a.guardians?.length ? `${a.guardians.length}, ${a.threshold} needed to pause` : "None"} />
          <Field k="End date" v={ex ? new Date(ex * 1000).toLocaleString() : "None"} note={expired ? "Ran out. No transaction was needed." : undefined} />
          <Field k="Heartbeat" v={hb ? `every ${every(hb)}` : "None"} note={lapsed ? "Went quiet. Only the cold key can start a new window." : hb ? `Last beat ${ago(new Date(lb * 1000).toISOString())}` : undefined} />
          {a.erc8004_id ? (
            <Field k="ERC-8004 identity" v={`Agent ${a.erc8004_id}`}
              note="Its owner published a pointer from that registry to this switch. The identity says who the agent is; the switch says whether it may act." />
          ) : null}
          {a.successor_id ? <Field k="Trust moved to" v={`Agent ${a.successor_id}`} /> : null}
          <Field k="Registered" v={new Date(a.registered_at).toLocaleString()} />
        </dl>
      </div>

      <History events={events} explorer={explorer} />
    </div>
  );
}

/* what happened, without three screens of scrolling.
 *
 * the first cut drew every event as a three line block in a vertical timeline:
 * the sentence, then block and time and actor, then a transaction link on its
 * own row. thirty one events came to two thousand six hundred pixels, nearly
 * three screens, to answer a question people ask in a glance.
 *
 * three things fixed that. one line per event instead of three. events that
 * share a transaction merged, because a guardian vote that crosses the
 * threshold emits the vote AND the pause it caused, which the page drew as two
 * separate things happening at the same block. and the list opens on the most
 * recent handful, with the rest a click away, which is the same bargain the
 * feed already makes.
 *
 * the filters are the ones the feed uses, applied here to events already in
 * hand, so no request is made and the counts can sit on the chips. the counts
 * are the point as much as the filtering is: they say what kind of life this
 * agent has had before you read a single row. */
const GROUPS: [string, string, string[]][] = [
  ["", "Everything", []],
  ["stopped", "Switch", ["StatusChanged", "GuardianVoted", "AgentRegistered"]],
  ["limits", "Limits", ["LimitsSet", "Beat"]],
  ["work", "Work", ["TradeAccepted"]],
  ["keys", "Keys", ["RevocationKeyChangeProposed", "RevocationKeyChanged", "Rotated"]],
  ["labels", "Identity", ["Labelled", "Linked8004"]],
];
const FIRST = 12;

/* one entry per transaction. the loudest line leads and the rest sit under it. */
type Entry = { id: number; block: number; tx: string; at: string; actor: string | null; kinds: string[]; head: { text: string; tone: Tone }; also: string[] };

function merge(events: Ev[]): Entry[] {
  const RANK: Record<Tone, number> = { off: 0, live: 1, quiet: 2, plain: 3 };
  const byTx = new Map<string, Ev[]>();
  for (const e of events) {
    const k = e.tx_hash || `id-${e.id}`;
    const at = byTx.get(k);
    if (at) at.push(e); else byTx.set(k, [e]);
  }
  return [...byTx.values()].map(group => {
    const said = group.map(e => ({ e, ...say(e) }));
    /* the consequence leads, not whatever the log happened to emit first: a
       guardian vote reads as "paused", with "guardians reached 1 of 1" as the
       reason under it. */
    const sorted = [...said].sort((a, b) => RANK[a.tone] - RANK[b.tone]);
    const head = sorted[0];
    return {
      id: head.e.id, block: head.e.block, tx: head.e.tx_hash, at: head.e.at,
      actor: group.find(e => e.actor)?.actor ?? null,
      kinds: group.map(e => e.kind),
      head: { text: head.text, tone: head.tone },
      also: sorted.slice(1).map(x => x.text),
    };
  }).sort((a, b) => b.block - a.block || b.id - a.id);
}

function History({ events, explorer }: { events: Ev[]; explorer: string }) {
  const [filter, setFilter] = useState("");
  const [all, setAll] = useState(false);
  const entries = useMemo(() => merge(events), [events]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { "": entries.length };
    for (const [k, , kinds] of GROUPS) {
      if (!k) continue;
      c[k] = entries.filter(e => e.kinds.some(x => kinds.includes(x))).length;
    }
    return c;
  }, [entries]);

  const kinds = GROUPS.find(g => g[0] === filter)?.[2] ?? [];
  const shown = filter ? entries.filter(e => e.kinds.some(x => kinds.includes(x))) : entries;
  const visible = all ? shown : shown.slice(0, FIRST);

  /* a heading per day, so a long life has somewhere to rest the eye. */
  const days: { day: string; rows: Entry[] }[] = [];
  for (const e of visible) {
    const d = dayOf(e.at);
    if (days.at(-1)?.day !== d) days.push({ day: d, rows: [] });
    days.at(-1)!.rows.push(e);
  }

  return (
    <div className="sheet p-5 sm:p-7 min-w-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-lg font-semibold">Everything that happened</h2>
        <span className="mono text-[11px] tabular" style={{ color: "var(--text-medium)" }}>
          {entries.length} transaction{entries.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="flex flex-wrap gap-1 rounded-full p-1 mt-3 w-fit max-w-full" style={{ background: "color-mix(in srgb, var(--text-dark) 5%, transparent)" }}>
        {GROUPS.filter(([k]) => !k || counts[k]).map(([k, label]) => (
          <button key={k} type="button" onClick={() => { setFilter(k); setAll(false); }}
            className="rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors whitespace-nowrap"
            style={{ background: filter === k ? "var(--pill-accent-bg)" : "transparent", color: filter === k ? "var(--pill-accent-text)" : "var(--text-medium)" }}>
            {/* no opacity on the count: at 70% it measured 2.52:1 on the dark
                pill and 3.72:1 on the light one. the tabular figures and the
                space are enough to separate it from the word. */}
            {label} <span className="tabular">{counts[k] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 min-w-0">
        {days.map(({ day, rows }) => (
          <div key={day} className="min-w-0">
            <div className="text-[11px] mono uppercase tracking-[0.12em] py-2" style={{ color: "var(--text-medium)", borderBottom: "1px solid var(--hairline)" }}>{day}</div>
            {rows.map(e => (
              <div key={e.id} className="grid grid-cols-[9px_minmax(0,1fr)_auto] items-baseline gap-x-3 py-2 min-w-0"
                style={{ borderBottom: "1px solid var(--hairline)" }}>
                <span className="w-[7px] h-[7px] rounded-full shrink-0 translate-y-[3px]" style={{ background: TONE[e.head.tone] }} />
                <div className="min-w-0">
                  <span className="text-sm">{e.head.text}</span>
                  {e.also.length > 0 && (
                    <span className="text-[12px] ml-2" style={{ color: "var(--text-medium)" }}>{e.also.join(" · ")}</span>
                  )}
                  {e.actor && <span className="mono text-[11px] ml-2" style={{ color: "var(--text-medium)" }}>by {short(e.actor)}</span>}
                </div>
                <a href={`${explorer}/tx/${e.tx}`} target="_blank" rel="noreferrer"
                  className="mono text-[11px] tabular whitespace-nowrap hover:underline" style={{ color: "var(--text-medium)" }}
                  title={`${ago(e.at)} · open on the block explorer`}>
                  {e.block}
                </a>
              </div>
            ))}
          </div>
        ))}
        {shown.length === 0 && <p className="text-sm py-6" style={{ color: "var(--text-medium)" }}>Nothing of that kind has happened to this agent.</p>}
      </div>

      {shown.length > FIRST && (
        <button type="button" onClick={() => setAll(v => !v)} className="drawn-btn btn-gold mt-4" style={{ padding: "8px 16px", fontSize: "0.82rem" }}>
          {all ? "Show fewer" : `Show all ${shown.length}`}
        </button>
      )}
    </div>
  );
}

function Field({ k, v, note, explorer, addr }: { k: string; v: string; note?: React.ReactNode; explorer?: string; addr?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] mono uppercase tracking-[0.12em]" style={{ color: "var(--text-medium)" }}>{k}</dt>
      <dd className={`${addr ? "mono text-[12.5px] break-all" : "text-sm"} mt-0.5`}>
        {addr && explorer ? <a href={`${explorer}/address/${v}`} target="_blank" rel="noreferrer" className="hover:underline">{v}</a> : v}
      </dd>
      {note && <dd className="text-[12px] mt-0.5" style={{ color: "var(--text-medium)" }}>{note}</dd>}
    </div>
  );
}
