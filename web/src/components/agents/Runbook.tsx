"use client";
import { useCallback, useEffect, useState } from "react";
import type { ethers } from "ethers";
import type { Conn } from "@/lib/chain";
import { type Kind, type Sealed, explainSeal, openNote, readNotes, sealNote } from "@/lib/sealed";

/* the runbook: what an operator needs to know about an agent at three in the
 * morning, and why it was stopped, readable only with the owner's passkey.
 *
 * everything on chain here is ciphertext. opening a note is a passkey prompt
 * and nothing else: no wallet, no server, no stored key. the same passkey on
 * another device opens the same notes, which is the whole point of deriving
 * the key rather than keeping it. */
const sm = { padding: "6px 12px", fontSize: "0.76rem" } as const;
const quiet = { color: "var(--text-medium)" } as const;
const field = { background: "var(--bg-base)", border: "1px solid var(--hairline)", color: "var(--text-dark)" } as const;
const WORD: Record<Kind, string> = { runbook: "runbook", stop: "stop reason" };

/* readOnly is the public explorer's view: the notes and "open with passkey",
   no composer. opening needs the passkey and nothing else, so a phone with no
   wallet at all can read what the owner sealed on a laptop. */
export default function Runbook({ conn, signer, id, sample, readOnly }: { conn: Conn; signer: ethers.Signer | null; id: bigint; sample: boolean; readOnly?: boolean }) {
  const [notes, setNotes] = useState<Sealed[] | null>(null);
  const [opened, setOpened] = useState<Record<number, string>>({});
  const [kind, setKind] = useState<Kind>("runbook");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    if (sample) { setNotes([]); return; }
    readNotes(conn, id).then(setNotes).catch(() => setNotes([]));
  }, [conn, id, sample]);
  useEffect(() => { setOpened({}); setNotes(null); load(); }, [load]);

  if (!conn.cfg.notes) return readOnly ? null : <p className="text-xs" style={quiet}>This chain has no sealed notes contract.</p>;
  /* the explorer shows the section only when there is something sealed */
  if (readOnly && (!notes || notes.length === 0)) return null;

  const open = async (n: Sealed) => {
    if (!n.vault) return;
    setBusy("open" + n.index); setErr(null);
    try { const t = await openNote(n.vault); setOpened(o => ({ ...o, [n.index]: t })); }
    catch (e) { setErr(explainSeal(e)); }
    finally { setBusy(null); }
  };
  const seal = async () => {
    if (!signer || !text.trim()) return;
    setBusy("seal"); setErr(null);
    try { await sealNote(conn, signer, id, kind, text.trim()); setText(""); load(); }
    catch (e) { setErr(explainSeal(e)); }
    finally { setBusy(null); }
  };

  /* newest first. the runbook that counts is the latest one; older ones stay,
     because the chain keeps everything and a page pretending otherwise would
     be the only thing on it that lies. */
  const shown = [...(notes ?? [])].reverse();
  const latestRunbook = shown.find(n => n.kind === "runbook")?.index;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11.5px]" style={quiet}>
        {readOnly
          ? "Stored on chain as ciphertext. Only the owner's passkey opens them, on any device it syncs to, with no wallet."
          : "Sealed with your passkey in this browser, stored on chain as ciphertext. Any device your passkey syncs to can open it; nobody else can."}
      </p>

      {notes === null && <p className="text-xs" style={quiet}>Reading the chain…</p>}
      {notes && notes.length === 0 && <p className="text-xs" style={quiet}>Nothing sealed yet.</p>}
      {shown.length > 0 && (
        <ul className="flex flex-col gap-2">
          {shown.map(n => (
            <li key={n.index} className="rounded-lg px-2.5 py-2" style={{ border: "1px solid var(--hairline)" }}>
              <div className="flex items-center gap-2">
                <span className="mono text-[10px] uppercase tracking-[0.1em]" style={{ color: n.kind === "stop" ? "var(--orange-text)" : "var(--text-dark)" }}>{WORD[n.kind]}</span>
                {n.index === latestRunbook && <span className="mono text-[10px]" style={quiet}>current</span>}
                <span className="ml-auto mono text-[10.5px]" style={quiet}>{new Date(n.at * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>
              </div>
              {opened[n.index] !== undefined
                ? <p className="text-[12.5px] mt-1.5 whitespace-pre-wrap break-words" style={{ color: "var(--text-dark)" }}>{opened[n.index]}</p>
                : n.vault
                  ? <button type="button" className="drawn-btn btn-gold mt-1.5" style={sm} disabled={!!busy} onClick={() => open(n)}>{busy === "open" + n.index ? "Touch your passkey…" : "Open with passkey"}</button>
                  : <p className="text-xs mt-1.5" style={quiet}>Stored in a format this page cannot read.</p>}
            </li>
          ))}
        </ul>
      )}

      {readOnly ? null : sample ? (
        <p className="text-xs" style={quiet}>Sample agents cannot hold notes. Connect the cold key of a real agent to seal one.</p>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex gap-1">
            {(["runbook", "stop"] as Kind[]).map(k => (
              <button key={k} type="button" onClick={() => setKind(k)} className="rounded-full px-2.5 h-7 text-[12px] font-medium"
                style={{ background: kind === k ? "var(--pill-accent-bg)" : "transparent", color: kind === k ? "var(--pill-accent-text)" : "var(--text-medium)", border: `1px solid ${kind === k ? "var(--pill-accent-bg)" : "var(--hairline)"}` }}>{WORD[k]}</button>
            ))}
          </div>
          <textarea value={text} onChange={e => setText(e.target.value)} rows={4} maxLength={2000}
            placeholder={kind === "runbook" ? "Where it runs, how to restart it, which keys it uses" : "Why you stopped it"}
            className="text-[13px] w-full rounded-lg px-2.5 py-1.5 outline-none focus-visible:ring-2 resize-y" style={field} />
          <div className="flex items-center gap-2">
            <button type="button" className="drawn-btn btn-orange" style={sm} disabled={!signer || !text.trim() || !!busy} onClick={seal}>{busy === "seal" ? "Sealing…" : "Seal with passkey"}</button>
            <span className="text-[11px]" style={quiet}>{!signer ? "connect the cold key" : "passkey, then one transaction"}</span>
          </div>
        </div>
      )}
      {err && <p className="text-xs" style={{ color: "var(--orange-text)" }}>{err}</p>}
    </div>
  );
}
