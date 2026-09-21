"use client";
import { useCallback, useEffect, useState } from "react";
import { ethers } from "ethers";
import { registerPasskey, platformAvailable } from "@/lib/webauthn";
import { useWallet } from "@/components/WalletProvider";
import { explain, ownerTx, settled, STATUS } from "@/lib/chain";

/* nominating the passkey that may pause an agent.
 *
 * two halves, and the order matters. the device makes the key first, which is
 * the only step that cannot be undone or delegated: the private half is born
 * inside the authenticator and never comes out. then the cold key writes the
 * public half to the switch.
 *
 * the page shows the point it is about to write, because nominating a key
 * nobody holds quietly disarms the panic button and nothing on chain would
 * look wrong afterwards. */
type Info = {
  agentId: string; set: boolean; x: string; y: string; rpIdHash: string;
  nonce: number; status: number; holdsColdKey: boolean; explorer: string; error?: string;
  /* who the chain says may nominate, so a connected wallet can be compared
     against it rather than the page assuming the server is the only signer. */
  coldKey?: string;
};
type Made = { credentialId: string; x: bigint; y: bigint; rpIdHash: string; rpId: string };
type Done = { ok: boolean; hash: string; block: number | null; explorer: string };

/* the words this page uses, built from the one list in chain.ts rather than
   retyped beside it. a second hand-written table is a table that drifts: the
   indexes have to line up with the contract's enum for ever, and nothing would
   tell us the day they stopped. only the wording differs here. */
const SOFTER: Record<string, string> = { none: "unknown", revoked: "stopped for good" };
const statusName = (n: number) => { const s = STATUS[n]; return s ? (SOFTER[s] ?? s) : "not active"; };
const short = (v: string) => v.length > 18 ? `${v.slice(0, 10)}…${v.slice(-8)}` : v;

export default function Passkey({ initialId }: { initialId?: string }) {
  const w = useWallet();
  const [id, setId] = useState(initialId ?? "");
  const [info, setInfo] = useState<Info | null>(null);
  const [made, setMade] = useState<Made | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState<"" | "make" | "send">("");
  const [note, setNote] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [canPasskey, setCanPasskey] = useState(true);
  const [host, setHost] = useState("");

  useEffect(() => { platformAvailable().then(setCanPasskey); setHost(location.hostname); }, []);
  useEffect(() => { try { setToken(localStorage.getItem("trustset.operator") || ""); } catch { /* private window */ } }, []);

  const pull = useCallback(() => {
    if (!/^\d+$/.test(id)) { setInfo(null); return; }
    fetch(`/api/stop-key?id=${id}`, { cache: "no-store" })
      .then(r => r.json()).then(setInfo).catch(() => setInfo(null));
  }, [id]);
  useEffect(() => { pull(); }, [pull, done]);

  async function make() {
    setBusy("make"); setNote(null);
    try {
      setMade(await registerPasskey(`trustset agent ${id}`));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setNote(/NotAllowed/i.test(msg) ? "The passkey prompt was dismissed." : msg);
    } finally { setBusy(""); }
  }

  /* whoever actually holds the cold key does the writing.
   *
   * this page only ever asked the server, so a reader whose own wallet was the
   * cold key made a passkey on their phone and then met a disabled button
   * saying the server could not finish. the key was burned for nothing and the
   * only way on was knowing the console had its own control. setStopKey wants
   * the cold key and nothing else, so a connected owner signs it here, exactly
   * as the console does. */
  const mine = !!w.who && !!info?.coldKey && w.who.address.toLowerCase() === info.coldKey.toLowerCase();

  async function nominateAsOwner() {
    if (!made || !w.conn || !w.who) return;
    setBusy("send"); setNote(null);
    try {
      const ks = w.conn.ks.connect(w.who.signer) as ethers.Contract;
      const rc = await ownerTx(async () => {
        const tx = await ks.setStopKey(Number(id), made.x, made.y, made.rpIdHash);
        return tx.wait(1);
      });
      await settled(w.conn, rc?.blockNumber);
      setDone({ ok: true, hash: rc?.hash ?? "", block: rc?.blockNumber ?? null, explorer: info?.explorer ?? "" });
    } catch (e) { setNote(explain(e, w.conn ?? undefined)); }
    finally { setBusy(""); }
  }

  async function nominate() {
    if (!made) return;
    if (mine) return nominateAsOwner();
    setBusy("send"); setNote(null);
    try {
      const r = await fetch("/api/stop-key", {
        method: "POST",
        headers: { "content-type": "application/json", "x-trustset-operator": token },
        body: JSON.stringify({ agentId: Number(id), x: made.x.toString(), y: made.y.toString(), rpIdHash: made.rpIdHash }),
      });
      const j = await r.json();
      if (j.error) { setNote(j.error); return; }
      try { localStorage.setItem("trustset.operator", token); } catch { /* private window */ }
      setDone(j);
    } catch (e) { setNote(String(e)); }
    finally { setBusy(""); }
  }

  /* a passkey is bound to the site that made it, so one registered on an ip or
     on localhost can never answer on the domain the panic page is served from.
     saying so here is cheaper than finding out during a demo. */
  const localOnly = !!host && (host === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(host));
  const already = info?.set && made && "0x" + made.x.toString(16).padStart(64, "0") === ethers.toBeHex(BigInt(info.x), 32);

  return (
    <div className="mx-auto w-full max-w-[560px]">
      <label className="block">
        <span className="text-[11px] mono uppercase tracking-[0.12em]" style={{ color: "var(--text-medium)" }}>Agent</span>
        <input value={id} onChange={e => { setId(e.target.value.replace(/\D/g, "")); setMade(null); setDone(null); setNote(null); }}
          inputMode="numeric" placeholder="7"
          className="mono text-2xl w-full rounded-2xl px-4 py-3.5 mt-1.5 outline-none tabular"
          style={{ background: "var(--bg-base)", border: "1px solid var(--hairline)", color: "var(--text-dark)" }} />
      </label>

      <div className="min-h-[22px] mt-2 text-[12.5px]" style={{ color: "var(--text-medium)" }}>
        {!id ? "The id of the agent to nominate a passkey for." :
         !info ? "Reading the switch…" :
         info.error ? info.error :
         info.set ? `A passkey is already nominated, used ${info.nonce} time${info.nonce === 1 ? "" : "s"}. Nominating another replaces it.` :
         "No passkey is nominated for this agent yet."}
      </div>

      {/* the old copy said the server could not finish and stopped there, which
          for a reader holding the cold key was both true and useless. it names
          the key the switch is waiting for and offers the way to it. */}
      {info && !info.error && !info.holdsColdKey && !mine && (
        <div className="sheet px-4 py-3 mt-3 text-[12.5px]" style={{ color: "var(--text-medium)" }}>
          <span className="font-semibold" style={{ color: "var(--text-dark)" }}>Only agent {id}&apos;s cold key can nominate a passkey.</span>{" "}
          {info.coldKey && <>The switch says that key is <span className="mono">{short(info.coldKey)}</span>. </>}
          {w.who
            ? <>This browser is connected as <span className="mono">{short(w.who.address)}</span>, so this agent is not yours to nominate for.</>
            : <>Connect that wallet and you can sign it here. <button type="button" onClick={() => { w.connectNow().catch(() => {}); }} className="underline" style={{ color: "var(--orange-text)" }}>Connect a wallet</button></>}
        </div>
      )}

      {/* step one: the device makes the key. */}
      <div className="sheet px-4 py-4 mt-4">
        <div className="text-sm font-semibold">1. Make the passkey on this device</div>
        <p className="text-[12.5px] mt-1" style={{ color: "var(--text-medium)" }}>
          The private half is created inside this device and never leaves it. What travels is the public
          point and the name of this site, {host || "this site"}, which the passkey is bound to for good.
        </p>
        <button type="button" onClick={make} disabled={!id || busy !== "" || !canPasskey}
          className="drawn-btn btn-gold mt-3" style={{ padding: "9px 16px", fontSize: "0.85rem", opacity: !id || busy !== "" || !canPasskey ? 0.55 : 1 }}>
          {busy === "make" ? "Waiting for your passkey…" : made ? "Make another" : "Create a passkey"}
        </button>
        {!canPasskey && <p className="mt-2 text-[12.5px]" style={{ color: "var(--orange-text)" }}>This device has no passkey reader.</p>}
        {localOnly && <p className="mt-2 text-[12.5px]" style={{ color: "var(--orange-text)" }}>
          This page is on {host}. A passkey made here is bound to {host} and will never answer on the public domain. Open this page on the domain instead.
        </p>}
        {made && (
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 mono text-[11.5px]" style={{ color: "var(--text-medium)" }}>
            <dt>x</dt><dd style={{ color: "var(--text-dark)" }}>{short(ethers.toBeHex(made.x, 32))}</dd>
            <dt>y</dt><dd style={{ color: "var(--text-dark)" }}>{short(ethers.toBeHex(made.y, 32))}</dd>
            <dt>site</dt><dd style={{ color: "var(--text-dark)" }}>{made.rpId}</dd>
          </dl>
        )}
      </div>

      {/* step two: the cold key writes it to the switch. */}
      {/* receded with colour, never with opacity. at 0.5 this card's own
          explanation measured 3.31:1, and it is text somebody reads BEFORE
          they have done step one, which is exactly when it is dimmed. */}
      <div className="sheet px-4 py-4 mt-3">
        <div className="text-sm font-semibold" style={{ color: made ? "var(--text-dark)" : "var(--text-medium)" }}>2. Nominate it on the switch</div>
        <p className="text-[12.5px] mt-1" style={{ color: "var(--text-medium)" }}>
          Signed by the agent&apos;s cold key. From then on that passkey can pause this agent and do nothing
          else: it cannot resume it, end it, move its limits or touch its keys.
          {mine && " Your wallet holds that key, so this one is yours to sign."}
        </p>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          {/* the token is how the operator authorises the SERVER to sign. a
              reader signing with their own wallet is authorised by holding the
              key, so asking them for a token would be asking for nothing. */}
          {!mine && (
            <input type="password" autoComplete="off" placeholder="operator token" value={token} onChange={e => setToken(e.target.value)}
              className="mono text-[12px] rounded-lg px-3 py-2 w-full sm:w-56"
              style={{ border: "1px solid var(--hairline)", background: "transparent", color: "var(--text-dark)" }} />
          )}
          {(() => {
            const blocked = !made || busy !== "" || (mine ? false : (!token || !info?.holdsColdKey));
            return (
              <button type="button" onClick={nominate} disabled={blocked}
                className="drawn-btn btn-orange" style={{ padding: "9px 16px", fontSize: "0.85rem", opacity: blocked ? 0.55 : 1 }}>
                {busy === "send" ? "Signing…" : mine ? "Sign it with your wallet" : "Nominate this passkey"}
              </button>
            );
          })()}
        </div>
        {already && <p className="mt-2 text-[12.5px]" style={{ color: "var(--text-medium)" }}>This is already the nominated key.</p>}
      </div>

      {note && <div className="sheet px-4 py-3 mt-3 text-[12.5px]" style={{ color: "var(--orange-text)" }}>{note}</div>}

      {done && (
        <div className="sheet px-4 py-4 mt-3">
          <div className="text-sm font-semibold">Agent {id} now has a panic button.</div>
          <div className="text-[12.5px] mt-1" style={{ color: "var(--text-medium)" }}>
            Landed in block {done.block}.{" "}
            {info && info.status !== 1 ? `The agent is ${statusName(info.status)} right now, and a passkey can only pause an active agent, so bring it back before trying this.` : "Open the panic page on your phone and hold your finger on it."}
          </div>
          <div className="flex flex-wrap gap-3 mt-2 text-[12.5px]">
            <a href={`${done.explorer}/tx/${done.hash}`} target="_blank" rel="noreferrer" className="underline" style={{ color: "var(--orange-text)" }}>View the transaction</a>
            <a href={`/panic?id=${id}`} className="underline" style={{ color: "var(--orange-text)" }}>Open the panic page</a>
          </div>
        </div>
      )}
    </div>
  );
}
