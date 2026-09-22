"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useWallet } from "@/components/WalletProvider";
import { READ, loadAgents, type Agent } from "@/lib/chain";
import type { Extra, PulseEvent } from "@/lib/layers";
import Module from "@/components/agents/Module";

/* ?owner=0x… picks whose agents to draw. nothing here can sign. */
type Pulse = { events: PulseEvent[]; indexed: boolean | null };

export default function Preview() {
  const w = useWallet();
  const params = useSearchParams();
  const owner = params.get("owner") ?? "";
  /* ?index=https://… reads the pulse from another deployment's index, for a
     machine that has none of its own. a query parameter, never a default. */
  const index = params.get("index") ?? "";
  const [agents, setAgents] = useState<Agent[]>([]);
  const [extra, setExtra] = useState<Record<string, Extra>>({});
  const [pulse, setPulse] = useState<Record<string, Pulse>>({});
  const [note, setNote] = useState<string>("");
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => { const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000); return () => clearInterval(t); }, []);

  useEffect(() => {
    const c = w.conn; if (!c || !owner) return;
    let alive = true;
    (async () => {
      try {
        const list = await loadAgents(c, owner);
        if (!alive) return;
        setAgents(list);
        /* the reads a module needs beyond the record: passkey, human proof,
           refunds, identity. done here in the open, the way the console will. */
        const refunds = await fetch("/api/refunds").then(r => r.json()).catch(() => ({ rows: [] })) as { rows?: { payer: string; service: string }[] };
        const ex: Record<string, Extra> = {};
        for (const a of list) {
          const k = (await c.ks.stopKeyOf(a.id, READ)) as [bigint, bigint, string, bigint, boolean];
          let human = 0;
          try { if (c.touch) human = Number(await c.touch.humanCount(a.coldKey, READ)); } catch { /* no touch contract here */ }
          const rf = (refunds.rows ?? []).filter(r => r.payer.toLowerCase() === a.key.toLowerCase() || r.service.toLowerCase() === a.key.toLowerCase()).length;
          ex[a.id.toString()] = { stopKey: k[4], humanCount: human, refunds: rf };
        }
        if (alive) setExtra(ex);
        for (const a of list) {
          const j = await fetch(`${index}/api/explorer?q=${a.id}&limit=200`, { cache: "no-store" }).then(r => r.json()).catch(() => null) as { indexed?: boolean; events?: { kind: string; at: string; actor?: string | null; data?: Record<string, unknown> }[] } | null;
          if (!alive) return;
          const events = (j?.events ?? []).map(e => ({ kind: e.kind, at: Math.floor(Date.parse(e.at) / 1000), actor: e.actor ?? null, data: e.data ?? {} }));
          const linked = events.find(e => e.kind === "Linked8004");
          setPulse(p => ({ ...p, [a.id.toString()]: { events, indexed: j ? !!j.indexed : false } }));
          if (linked) setExtra(p => ({ ...p, [a.id.toString()]: { ...p[a.id.toString()], erc8004: Number((linked.data as { erc8004Id?: unknown }).erc8004Id ?? 0) || null } }));
        }
      } catch (e) { if (alive) setNote(String(e)); }
    })();
    return () => { alive = false; };
  }, [w.conn, owner, index]);

  if (!owner) return <p className="text-sm" style={{ color: "var(--text-medium)" }}>Add ?owner=0x… to draw that wallet&apos;s agents.</p>;
  return (
    <>
      <div className="mb-5 flex items-baseline justify-between gap-4 flex-wrap">
        <h1 className="text-[22px] font-semibold tracking-tight">Module bench</h1>
        <span className="mono text-[11px]" style={{ color: "var(--text-medium)" }}>{agents.length} agents · nothing here signs</span>
      </div>
      {note && <p className="text-xs mb-4" style={{ color: "var(--orange-text)" }}>{note}</p>}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3 items-start">
        {agents.map(a => (
          <Module key={a.id.toString()} agent={a} name={a.label?.name || `Agent ${a.id}`} now={now}
            events={pulse[a.id.toString()]?.events ?? []} indexed={pulse[a.id.toString()]?.indexed ?? null}
            extra={extra[a.id.toString()] ?? {}} explorer={w.conn?.cfg.explorer}
            onToggle={() => setNote(`would ${a.status === "paused" ? "resume" : "pause"} agent ${a.id}`)}
            onStop={() => setNote(`would stop agent ${a.id} for good`)}
            onLayer={k => setNote(`would open the ${k} layer of agent ${a.id}`)}
            onOpen={() => setNote(`would open agent ${a.id}'s profile`)} />
        ))}
      </div>
    </>
  );
}
