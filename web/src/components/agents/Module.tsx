"use client";
import { useEffect, useRef, useState } from "react";
import { type Agent, short, trusted } from "@/lib/chain";
import { type Extra, type LayerKey, type PulseEvent, layersOf, lastActivity, livenessWord, nextClock, switchState, span } from "@/lib/layers";
import { useMotionPrefs } from "@/lib/motion";
import Pulse from "./Pulse";
import Stack from "./Stack";
import Switch from "./Switch";
import Tip from "@/components/Tip";

/* one agent, as a module on a switchboard.
 *
 * the console used to be a table row: a dot, a name, "Registered", a time,
 * two buttons. this is what the row was hiding. the switch as a switch, the
 * last day of the agent's life as ticks, the eight layers as bars you can
 * count, and the nearest clock. four things a reader opens the page for,
 * answered before anything is pressed.
 *
 * stopping for good is a held press, not a click. it is the one permanent
 * thing on the page, and it uses the same gesture as the panic page's "hold
 * your finger on it", so the product has one language for things that cannot
 * be undone. pausing stays a single motion, because it can. */
const HOLD_MS = 1500;

export type ModuleProps = {
  agent: Agent; name: string; events: PulseEvent[]; extra: Extra; now: number;
  busy?: { pause?: boolean; stop?: boolean };
  onToggle: () => void; onStop: () => void; onLayer?: (k: LayerKey) => void; onOpen?: () => void;
  explorer?: string;
  /* the index the pulse came from, and whether it answered at all */
  indexed?: boolean | null;
  /* drawn without its own frame, for a place that already has one */
  bare?: boolean;
  /* without the stack, for a screen that draws the layers as tiles below */
  slim?: boolean;
  /* without its own name, for a panel whose header already says it */
  headless?: boolean;
};

export default function Module({ agent, name, events, extra, now, busy, onToggle, onStop, onLayer, onOpen, explorer, indexed, bare, slim, headless }: ModuleProps) {
  const m = useMotionPrefs();
  const live = trusted(agent, now);
  const sw = switchState(agent, events);
  const ended = sw === "ended";
  const word = livenessWord(agent, now);
  const layers = layersOf(agent, extra, now);
  const clock = nextClock(agent, now);
  const last = lastActivity(events, agent);
  const tone = live ? "var(--sage)" : ended ? "var(--text-light)" : sw === "tripped" ? "var(--orange)" : "var(--terra)";
  const wordColor = live ? "var(--sage-text)" : ended ? "var(--text-medium)" : sw === "tripped" ? "var(--orange-text)" : "var(--text-dark)";

  /* the held press. a timer runs from pointer down; a fill crosses the
     button on the same clock so the hand can see how far it has got; letting
     go before the end resets both. the keyboard holds space the same way. */
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const begin = () => {
    if (ended || busy?.stop) return;
    setHolding(true);
    timer.current = setTimeout(() => { timer.current = null; setHolding(false); onStop(); }, HOLD_MS);
  };
  const end = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    setHolding(false);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  /* what the word means, on the word. it used to be a line under the switch
     that said the state a second time. */
  const caption = ended ? (agent.status === "revoked" ? "Stopped for good. Nothing can bring it back." : "Rotated. Trust moved to its successor.")
    : sw === "tripped" ? "A guardian paused it. Your cold key brings it back."
    : sw === "off" ? "You paused it. The switch brings it back."
    : live ? "Every app that checks will serve it."
    : `The switch is on, but it is ${word.toLowerCase()}. Clear its limits to be trusted again.`;
  const wordTip = <Tip text={caption}><span className="mono text-[11px] uppercase tracking-[0.12em] whitespace-nowrap" style={{ color: wordColor }}>{word}</span></Tip>;

  return (
    <article className={`${bare ? "" : "sheet p-5"} min-w-0 flex flex-col gap-4 relative`} style={{ borderColor: !bare && sw === "tripped" ? "var(--orange)" : undefined }}>
      {/* head: who, and the one word that matters. a panel names the agent
          in its own header, so there it is left out. */}
      {!headless && (
      <header className="flex items-start gap-3 min-w-0">
        <span className="relative inline-flex w-3 h-3 shrink-0 mt-[5px]">
          {live && !m.reduced && <span className="absolute inset-0 rounded-full animate-ping" style={{ background: tone, opacity: 0.35 }} />}
          <span className="relative w-3 h-3 rounded-full" style={{ background: tone }} />
        </span>
        <div className="min-w-0 flex-1">
          {onOpen
            ? <button type="button" onClick={onOpen} className="text-left min-w-0 max-w-full outline-none focus-visible:ring-2 rounded"><div className="text-[17px] font-semibold tracking-[-0.01em] leading-tight truncate">{name}</div></button>
            : <div className="text-[17px] font-semibold tracking-[-0.01em] leading-tight truncate">{name}</div>}
          <div className="mono text-[11px] mt-0.5 truncate" style={{ color: "var(--text-medium)" }}>
            agent {agent.id.toString()} · {explorer ? <a href={`${explorer}/address/${agent.key}`} target="_blank" rel="noreferrer" className="hover:underline">{short(agent.key)}</a> : short(agent.key)}
          </div>
        </div>
        <div className="pt-1">{wordTip}</div>
      </header>
      )}

      {/* the switch, and the held press beside it */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 min-w-0">
        <Switch size="lg" caption="none" state={sw} live={live} busy={busy?.pause} onToggle={onToggle} label={sw === "on" ? `pause ${name}` : `bring ${name} back`} />
        {headless && wordTip}
        <button type="button" disabled={ended || !!busy?.stop}
          onPointerDown={e => { e.preventDefault(); begin(); }} onPointerUp={end} onPointerLeave={end} onPointerCancel={end}
          onKeyDown={e => { if (e.key === " " && !e.repeat) { e.preventDefault(); begin(); } }} onKeyUp={e => { if (e.key === " ") end(); }}
          aria-label={ended ? "already stopped" : `hold for ${span(HOLD_MS / 1000)} to stop ${name} for good`}
          className="relative overflow-hidden rounded-full mono text-[11px] tracking-[0.08em] px-3.5 py-2 select-none outline-none focus-visible:ring-2 disabled:cursor-default ml-auto"
          style={{ border: `1.5px solid ${ended ? "var(--hairline)" : "var(--orange)"}`, color: ended ? "var(--text-medium)" : "var(--orange-text)", touchAction: "none" }}>
          {/* the fill. a clip-path reveal on the hold clock, snapped back on release. */}
          <span aria-hidden className="absolute inset-0" style={{
            background: "var(--orange)",
            clipPath: holding ? "inset(0 0 0 0)" : "inset(0 100% 0 0)",
            transition: holding ? `clip-path ${HOLD_MS}ms linear` : "clip-path 180ms cubic-bezier(0.23, 1, 0.32, 1)",
          }} />
          <span className="relative" style={{ color: holding ? "#160A06" : undefined, transition: "color .15s" }}>
            {ended ? "stopped" : busy?.stop ? "stopping…" : holding ? "keep holding" : "hold to stop"}
          </span>
        </button>
      </div>

      {/* the pulse */}
      <div className="min-w-0">
        <Pulse events={events} now={now} />
        <div className="mt-1.5 flex items-baseline justify-between gap-3 text-[12px]" style={{ color: "var(--text-medium)" }}>
          <span className="truncate">
            {indexed === false ? <Tip text="The index is not reachable, so the last day cannot be drawn.">index away</Tip>
              : <Tip text={`Last: ${last.text}.`}>seen {span(Math.max(0, now - last.at))} ago</Tip>}
          </span>
          <span className="mono text-[10.5px] whitespace-nowrap">24h</span>
        </div>
      </div>

      {/* the stack, unless the screen draws the layers itself */}
      {!slim && <Stack layers={layers} onLayer={onLayer} />}

      {/* the clock */}
      <footer className="text-[12px] pt-3 flex items-baseline gap-2" style={{ borderTop: "1px solid var(--hairline)", color: "var(--text-medium)" }}>
        <span style={{ color: clock && clock.at <= now ? "var(--orange-text)" : "var(--text-dark)" }}>{clock ? clock.text : "no clocks running"}</span>
      </footer>
    </article>
  );
}
