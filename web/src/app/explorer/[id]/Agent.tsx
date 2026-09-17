"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Term from "@/components/Term";
import { say, ago, every, short, type Ev, type Tone } from "../words";

/* one agent's whole life.
 *
 * the page you open to answer "is this agent still good", which is the question
 * the switch exists for. identity first, because that is what an app checks,
 * then everything that ever happened to it. */
type Row = {
  id: number; agent_key: string; cold_key: string; guardians: string[]; threshold: number;
  status: string; status_at: string; registered_at: string; registered_tx: string;
  successor_id: number | null; expires_at: string; heartbeat_window: string; last_beat: string;
  name: string | null; purpose: string | null;
};
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
          {a.successor_id ? <Field k="Trust moved to" v={`Agent ${a.successor_id}`} /> : null}
          <Field k="Registered" v={new Date(a.registered_at).toLocaleString()} />
        </dl>
      </div>

      <div className="sheet p-5 sm:p-7">
        <h2 className="text-lg font-semibold">Everything that happened</h2>
        <ol className="mt-4">
          {events.map((e, i) => {
            const { text, tone } = say(e);
            return (
              <li key={e.id} className="grid grid-cols-[14px_minmax(0,1fr)_auto] gap-3 items-start">
                <span className="relative flex justify-center h-full pt-1.5">
                  <span className="w-[7px] h-[7px] rounded-full shrink-0 z-10" style={{ background: TONE[tone] }} />
                  {i < events.length - 1 && <span className="absolute top-3 bottom-0 w-px" style={{ background: "var(--hairline)" }} />}
                </span>
                <div className="pb-5 min-w-0">
                  <div className="text-sm">{text}</div>
                  <div className="mono text-[11px] mt-0.5" style={{ color: "var(--text-medium)" }}>
                    block {e.block} · {ago(e.at)}{e.actor ? ` · by ${short(e.actor)}` : ""}
                  </div>
                </div>
                <a href={`${explorer}/tx/${e.tx_hash}`} target="_blank" rel="noreferrer" className="text-[11px] underline whitespace-nowrap" style={{ color: "var(--orange-text)" }}>Transaction</a>
              </li>
            );
          })}
        </ol>
      </div>
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
