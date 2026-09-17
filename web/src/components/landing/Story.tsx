"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useArrived } from "@/hooks/useArrived";
import { useMotionPrefs, DUR } from "@/lib/motion";
import { ZapIcon } from "@/components/icons/zap";
import { IdCardIcon } from "@/components/icons/id-card";
import { RefreshCWIcon } from "@/components/icons/refresh-cw";
import { LayersIcon } from "@/components/icons/layers";
import type { IconHandle } from "@/hooks/useIconHover";

/* the features, as slides.
 *
 * three screens in a row used to each take a viewport: one headline, one
 * paragraph, one visual. it read as three separate pitches. now there is one
 * frame, the product's own window, and the three features are slides in it,
 * with a rail to move between them. one section, one object, three views.
 * the visuals below are unchanged; they are what plays inside the frame. */

const EASE = [0.23, 1, 0.32, 1] as const;

/* why: the problem, struck through, and the answer after it.
 *
 * this used to be one paragraph lighting up word by word, which is the effect
 * every launch page has now and which, on four lines, amounts to words fading
 * in. the sentence is really a setup and a list of three, and the list is the
 * page's spine: each "nothing" is one of the features below.
 *
 * the first cut swapped each problem for its answer in place, and the end
 * state read "now one transaction does" with nothing left on screen for it to
 * answer. so the problem stays: as a line crosses the middle of the screen a
 * strike draws through it, it dims, and the answer arrives after it on the
 * same line. before and after, both readable, at rest.
 *
 * one way: a line that has turned stays turned. */
const SETUP = "An agent with a key can trade, pay and sign for as long as it runs.";
const TURNS = [
  { was: "Nothing could stop it.", now: "one transaction does." },
  { was: "Nothing could stop it while you slept.", now: "your guardians can. Or a date you set." },
  { was: "Nothing could reach it without a wallet.", now: "a fingerprint can." },
];
function Turn({ was, now, turned, reduced }: { was: string; now: string; turned: boolean; reduced: boolean }) {
  const t = reduced ? { duration: 0 } : { duration: 0.45, ease: EASE };
  return (
    <span className="block">
      {/* the problem stays. it dims and a line draws through it, so the answer
          that follows has something on screen to answer. */}
      <span className="relative inline" style={{ color: turned ? "var(--text-medium)" : "var(--text-dark)", transition: reduced ? "none" : "color .45s" }}>
        {was}
        <motion.span aria-hidden className="absolute left-0 top-[0.56em] h-[0.075em] w-full origin-left rounded-full" style={{ background: "var(--orange)" }}
          initial={false} animate={{ scaleX: turned ? 1 : 0 }} transition={t} />
      </span>
      {" "}
      <motion.span className="inline-block" initial={false} animate={{ opacity: turned ? 1 : 0, x: turned ? 0 : -8 }} transition={{ ...t, delay: reduced || !turned ? 0 : 0.25 }} aria-hidden={!turned}>
        <span style={{ color: "var(--orange-text)" }}>Now</span> {now}
      </motion.span>
    </span>
  );
}
export function Why() {
  const m = useMotionPrefs();
  const refs = useRef<(HTMLElement | null)[]>([]);
  const [turned, setTurned] = useState(0);
  /* a line turns when it crosses the middle of the screen, read straight from
     its own rectangle in the scroll handler. the count only goes up. */
  useEffect(() => {
    if (m.reduced) { setTurned(TURNS.length); return; }
    const on = () => {
      const line = document.documentElement.clientHeight * 0.55;
      let n = 0;
      refs.current.forEach((el, k) => { if (el && el.getBoundingClientRect().top <= line) n = k + 1; });
      setTurned(prev => Math.max(prev, n));
    };
    on();
    window.addEventListener("scroll", on, { passive: true }); window.addEventListener("resize", on);
    return () => { window.removeEventListener("scroll", on); window.removeEventListener("resize", on); };
  }, [m.reduced]);
  return (
    <section className="mt-24 sm:mt-36 max-w-5xl">
      <p className="text-[30px] sm:text-[44px] lg:text-[54px] font-semibold tracking-[-0.03em] leading-[1.12]">{SETUP}</p>
      <ol className="mt-6 sm:mt-8 grid gap-2 sm:gap-3 text-[26px] sm:text-[36px] lg:text-[44px] font-semibold tracking-[-0.03em] leading-[1.14]">
        {TURNS.map((t, k) => (
          <li key={t.was} ref={el => { refs.current[k] = el; }} data-turned={turned > k}>
            <Turn was={t.was} now={t.now} turned={turned > k} reduced={m.reduced} />
          </li>
        ))}
      </ol>
    </section>
  );
}

/* trip: apps flip from allowed to refused after the stop, one per beat. */
const APPS = ["Kuru · swap", "Perpl · open position", "Aave · borrow", "nad.fun · buy", "Governance · vote"];
export function TripVisual() {
  const m = useMotionPrefs();
  const [step, setStep] = useState(-1);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const run = (s: number) => { setStep(s); t = setTimeout(() => run(s >= APPS.length ? -1 : s + 1), s === -1 ? 1800 : s === APPS.length ? 2600 : 600); };
    run(-1); return () => clearTimeout(t);
  }, []);
  return (
    <>
      <div className="drawn-box overflow-clip">
        <div className="px-4 sm:px-5 py-3 flex items-center gap-3 text-sm" style={{ borderBottom: "1px solid var(--hairline)", background: step >= 0 ? "color-mix(in srgb, var(--orange) 8%, transparent)" : undefined, transition: "background .3s" }}>
          <span className="mono text-[11px] text-ink/70 tabular">block {step >= 0 ? "276" : "275"}</span>
          <span className="mono text-xs">{step >= 0 ? "setStatus(agent 14, revoked)" : "Agent 14 · active"}</span>
          <span className="ml-auto mono text-[11px]" style={{ color: step >= 0 ? "var(--orange-text)" : "var(--sage-text)" }}>{step >= 0 ? "Stopped by owner" : "Trading"}</span>
        </div>
        {APPS.map((a, i) => {
          const refused = step >= i + 1;
          return (
            <div key={a} className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 sm:px-5 py-3.5 text-sm" style={{ borderBottom: i < APPS.length - 1 ? "1px solid var(--hairline)" : undefined }}>
              <span className="mono text-xs">{a}</span>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span key={refused ? "r" : "a"} initial={m.reduced ? false : { opacity: 0, y: 4, filter: "blur(2px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -4, filter: "blur(2px)" }} transition={m.t(DUR.fast)}
                  className="mono text-[11px] tabular" style={{ color: refused ? "var(--orange-text)" : "var(--text-light)" }}>{refused ? "Refused · block 277" : "Allowed"}</motion.span>
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* how it works: one drawing, three states, and the steps scroll past it.
 *
 * the first cut of this drew the mechanism as a row of boxes and then said the
 * same three sentences again as cards underneath. this is the pattern the pages
 * people copy use instead: the drawing stays pinned, the steps scroll beside
 * it, and as each step arrives the drawing does what the sentence says. the
 * reader never looks at two things at once.
 *
 * it fits because the mechanism really is three states of one object: a key
 * signing on its own, the key wired to a switch, apps asking the switch. the
 * third state also plays the refusal, so the thing the reader came to see
 * happens without a fourth step.
 *
 * on a phone the drawing pins under the header and the steps scroll beneath
 * it. with reduced motion nothing pins and the drawing rests on its last state. */
const STEPS = [
  { n: "1", t: "Your agent already has a wallet.", d: "It signs with a key. That key is the agent, as far as the chain is concerned." },
  { n: "2", t: "You put that key on the switch.", d: "One transaction. From then on your wallet is the only thing that can turn it off." },
  { n: "3", t: "Apps ask the switch before they act.", d: "One line inside their own call. Off means refused, from the next block." },
];
const NEVER = [
  ["Never runs your agent.", "It lives wherever you run it."],
  ["Never holds your money.", "The switch stores a status, not a balance."],
  ["Never sees a private key.", "Not the agent's, not yours."],
];
const VENUES = ["Kuru · swap", "Perpl · open", "Aave · borrow"];

function Box({ lit, ours, children }: { lit: boolean; ours?: boolean; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl px-3 py-3 min-w-0" style={{
      background: ours && lit ? "color-mix(in srgb, var(--orange) 12%, transparent)" : "var(--surface)",
      border: `1px solid ${ours && lit ? "var(--orange)" : "var(--hairline)"}`,
      opacity: lit ? 1 : 0.28, transition: "opacity .4s, background .4s, border-color .4s" }}>
      {children}
    </div>
  );
}
function Wire({ lit }: { lit: boolean }) {
  return <span aria-hidden className="justify-self-center self-center w-px h-[14px] sm:w-full sm:h-px" style={{ background: lit ? "var(--text-light)" : "var(--hairline)", opacity: lit ? 1 : 0.5, transition: "background .4s" }} />;
}

/* the drawing. a fixed height, so the pinned panel never changes size. */
function Scene({ step, reduced }: { step: number; reduced: boolean }) {
  const [on, setOn] = useState(true);
  /* on the third step the switch flips every couple of seconds so the refusal
     is seen. reduced motion rests on the refusal, which is the point of it. */
  useEffect(() => {
    if (step < 2) { setOn(true); return; }
    if (reduced) { setOn(false); return; }
    const t = setInterval(() => setOn(v => !v), 2400);
    return () => clearInterval(t);
  }, [step, reduced]);
  const wired = step >= 1, asking = step >= 2;
  const caption = step === 0 ? "the key signs on its own. nothing can stop it."
    : step === 1 ? "register(agentKey, yourWallet) · one transaction"
    : on ? "isTrusted(agent) → true · every app allowed" : "isTrusted(agent) → false · every app refused";
  return (
    <div className="relative h-[340px] sm:h-[336px] px-4 sm:px-5 pt-4 pb-3 sm:pb-4 flex flex-col">
      {/* the wallet, and the only wire into the switch */}
      <div className="relative h-[58px]">
        <div className="absolute left-1/2 -translate-x-1/2 top-0 flex flex-col items-center" style={{ opacity: wired ? 1 : 0, transition: "opacity .4s" }}>
          <span className="rounded-full px-2.5 py-1 mono text-[11px] font-medium" style={{ background: "var(--surface)", border: "1px solid var(--hairline)" }}>Your wallet</span>
          <motion.span aria-hidden className="w-px h-[18px] mt-1" style={{ background: "var(--text-light)" }}
            animate={reduced ? {} : { opacity: asking ? [1, 0.2, 1] : 1 }} transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_16px_minmax(0,1fr)_16px_minmax(0,1.25fr)] gap-0 sm:gap-1.5 items-stretch">
        <Box lit>
          <div className="flex items-center gap-2 sm:block">
           <span className="flex items-center gap-2">
            <span className="relative inline-flex w-2 h-2">
              {!reduced && <motion.span className="absolute inset-0 rounded-full" style={{ background: "var(--sage)" }} animate={{ scale: [1, 2.2], opacity: [0.5, 0] }} transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }} />}
              <span className="w-2 h-2 rounded-full" style={{ background: "var(--sage)" }} />
            </span>
            <span className="text-sm font-semibold">Your agent</span>
           </span>
           <span className="mono text-[11px] ml-auto sm:ml-0 sm:block sm:mt-1.5" style={{ color: "var(--text-medium)" }}>0x90f7…b906 signing</span>
          </div>
        </Box>
        <Wire lit={wired} />
        <Box lit={wired} ours>
          <div className="flex items-center justify-between sm:block">
          <div className="text-sm font-semibold">The switch</div>
          <div className="sm:mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 mono text-[11px]" style={{ background: "var(--surface)", border: "1px solid var(--hairline)" }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: !wired ? "var(--hairline)" : on ? "var(--sage)" : "var(--orange)", transition: "background .3s" }} />
            {!wired ? "unset" : on ? "on" : "off"}
          </div>
          </div>
        </Box>
        <Wire lit={asking} />
        <Box lit={asking}>
          <div className="text-sm font-semibold mb-1">Every app</div>
          {VENUES.map(v => (
            <div key={v} className="flex items-center justify-between gap-2 mono text-[11px] leading-[18px]">
              <span className="truncate" style={{ color: "var(--text-medium)" }}>{v}</span>
              {/* "allowed" in the medium ink, not the light one: the light ink
                  measured 3.32 on this surface in the light theme. the refusal
                  is the accent, so the allowed state should be the quiet one. */}
              <span className="tabular shrink-0" style={{ color: !asking ? "transparent" : on ? "var(--text-medium)" : "var(--orange-text)", transition: "color .3s" }}>{on ? "allowed" : "refused"}</span>
            </div>
          ))}
        </Box>
      </div>

      <div className="mt-auto pt-3 mono text-[11px] truncate" style={{ color: step === 2 && !on ? "var(--orange-text)" : "var(--text-medium)", transition: "color .3s" }}>{caption}</div>
    </div>
  );
}

/* the screen is pinned for the height of the section; scrolling through the
   section is what advances it. progress thirds map to the three steps. the
   steps accumulate rather than replace each other, so at the end all three
   sentences sit beside the drawing in its final state, on one screen. */
export function HowItWorks() {
  const m = useMotionPrefs();
  const ref = useRef<HTMLElement>(null);
  const [step, setStep] = useState(m.reduced ? 2 : 0);
  /* progress is read from the section's own rectangle inside the scroll
     handler, not from a frame loop. a frame-driven value stalls in a throttled
     tab, and the state here must be right the moment the page settles. 0 is
     the section's top at the top of the screen, 1 its bottom at the bottom;
     the thirds are the three steps. */
  useEffect(() => {
    if (m.reduced) { setStep(2); return; }
    const on = () => {
      const el = ref.current; if (!el) return;
      const r = el.getBoundingClientRect();
      const vh = document.documentElement.clientHeight;
      const v = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - vh)));
      /* one way. a step that has appeared stays: scrolling back up to reread
         must not take the later steps away again, and the drawing is a record
         of what has been explained, not a scrubber. a reload starts over. */
      setStep(prev => Math.max(prev, v < 0.3 ? 0 : v < 0.62 ? 1 : 2));
    };
    on();
    window.addEventListener("scroll", on, { passive: true }); window.addEventListener("resize", on);
    return () => { window.removeEventListener("scroll", on); window.removeEventListener("resize", on); };
  }, [m.reduced]);
  const pinned = !m.reduced;
  return (
    <section ref={ref} className={`mt-24 sm:mt-36 ${pinned ? "h-[260vh] sm:h-[240vh]" : ""}`}>
      <div className={pinned ? "sticky top-16 h-[calc(100svh-64px)] flex flex-col justify-center" : ""}>
        <div className="max-w-5xl">
          <h2 className="text-[24px] sm:text-[40px] lg:text-[48px] font-semibold tracking-[-0.03em] leading-[1.04]">
            <span>Three steps.</span>{" "}<span style={{ color: "var(--dim)" }}>Then it is done.</span>
          </h2>
        </div>

        <div className="mt-4 sm:mt-8 grid grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-4 lg:gap-14 items-center">
          {/* the drawing, left. */}
          <div className="rounded-[28px] p-2" style={{ background: "color-mix(in srgb, var(--text-dark) 5%, transparent)", border: "1px solid var(--hairline)" }}>
            {/* the browser chrome is decoration a phone cannot afford: the whole
                screen has to fit under the header, and this row is 34px of it. */}
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-2">
              {[0, 1, 2].map(d => <span key={d} className="w-2 h-2 rounded-full" style={{ background: "var(--hairline)" }} />)}
              <span className="ml-3 mono text-[11px]" style={{ color: "var(--text-medium)" }}>trustset.silknodes.io</span>
            </div>
            <div className="drawn-box overflow-clip"><Scene step={step} reduced={m.reduced} /></div>
          </div>

          {/* the steps, right, each arriving under the last and staying. the list
              holds the height of all three from the start, so nothing below it
              moves as they appear. */}
          <ol className="min-w-0 grid gap-3 sm:gap-4">
            {STEPS.map((st, k) => {
              const shown = m.reduced || step >= k;
              return (
                <motion.li key={st.n} initial={false}
                  animate={{ opacity: shown ? 1 : 0, y: shown ? 0 : 14 }}
                  transition={m.reduced ? { duration: 0 } : { duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  className="grid grid-cols-[32px_minmax(0,1fr)] gap-3 items-start" aria-hidden={!shown}>
                  <span className="mono text-[22px] sm:text-[26px] font-semibold leading-none pt-0.5" style={{ color: "var(--orange-text)" }}>{st.n}</span>
                  <div className="min-w-0">
                    <h3 className="text-[16px] sm:text-[20px] font-semibold tracking-tight leading-tight">{st.t}</h3>
                    <p className="text-[13.5px] sm:text-[15px] mt-1 sm:mt-1.5 max-w-[42ch]" style={{ color: "var(--text-medium)" }}>{st.d}</p>
                  </div>
                </motion.li>
              );
            })}
          </ol>
        </div>

        {/* what it never does. a strip, not cards: cards would read as three more
            features, and this is the fine print you are meant to see. */}
        <ul className="rule-top mt-5 sm:mt-10 pt-3.5 sm:pt-6 grid grid-cols-1 sm:grid-cols-3 gap-1.5 sm:gap-6 max-w-4xl">
          {NEVER.map(([lit, dim]) => (
            <li key={lit} className="flex gap-2.5 text-[13.5px] sm:text-[15px] leading-snug">
              <span aria-hidden className="mono font-semibold shrink-0" style={{ color: "var(--orange-text)" }}>×</span>
              <span><span className="font-semibold">{lit}</span> <span style={{ color: "var(--text-medium)" }}>{dim}</span></span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* guardians: the vote, the pause, the wait, and only then the stop. the clock
   runs fast here; the contract's delay is three days. */
const GSTEPS = [
  { t: "Agent 14 is trading", d: "Two guardians, and two votes are needed to pause it.", who: "", state: "active" as const },
  { t: "A guardian votes to pause", d: "Nothing happens yet. One of two.", who: "0x61c4…9a02", state: "active" as const },
  { t: "The second vote lands", d: "Paused. The owner can undo this at any moment.", who: "0x62f1…40be", state: "paused" as const },
  { t: "The owner does nothing", d: "Three days go by. The escalation window opens.", who: "", state: "paused" as const },
  { t: "A guardian ends it", d: "Only after the delay, and only from a pause the guardians made.", who: "0x61c4…9a02", state: "revoked" as const },
];
export function GuardianVisual() {
  const m = useMotionPrefs();
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI(x => (x + 1) % GSTEPS.length), 2300); return () => clearInterval(t); }, []);
  const g = GSTEPS[i];
  const col = g.state === "active" ? "var(--sage)" : g.state === "paused" ? "var(--terra)" : "var(--orange)";
  return (
    <div className="drawn-box overflow-clip">
      <div className="px-4 sm:px-5 py-3 flex items-center gap-3 text-sm" style={{ borderBottom: "1px solid var(--hairline)" }}>
        <span className="w-2 h-2 rounded-full" style={{ background: col, transition: "background .3s" }} />
        <span className="mono text-xs">Treasury agent · {g.state}</span>
        <span className="ml-auto mono text-[11px] tabular" style={{ color: "var(--text-medium)" }}>{i < 3 ? "day 0" : i === 3 ? "day 3" : "day 3, later"}</span>
      </div>
      <div className="px-4 sm:px-5 py-4 grid grid-cols-[minmax(0,1fr)] sm:grid-cols-[minmax(0,1fr)_150px] gap-4 items-start">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={i} initial={m.reduced ? false : { opacity: 0, y: 6, filter: "blur(2px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -6, filter: "blur(2px)" }} transition={m.t(DUR.fast)} className="min-w-0">
            <div className="text-[22px] sm:text-[26px] font-semibold tracking-tight leading-tight" style={{ color: g.state === "revoked" ? "var(--orange-text)" : "var(--text-dark)" }}>{g.t}</div>
            <div className="text-sm text-ink/70 mt-1.5">{g.d}</div>
            {g.who && <div className="mono text-[11px] mt-2" style={{ color: "var(--text-medium)" }}>signed by guardian {g.who}</div>}
          </motion.div>
        </AnimatePresence>
        <ol className="flex sm:flex-col gap-2 sm:gap-1.5 flex-wrap">
          {GSTEPS.map((st, k) => (
            <li key={st.t} className="flex items-center gap-2 text-[11px] mono" style={{ color: k === i ? "var(--text-dark)" : "var(--text-medium)", opacity: k === i ? 1 : 0.6 }}>
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: k <= i ? col : "var(--hairline)", transition: "background .3s" }} />
              <span className="hidden sm:inline">{["trading", "one vote", "paused", "waiting", "stopped"][k]}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="px-4 sm:px-5 py-2.5 text-[11px]" style={{ borderTop: "1px solid var(--hairline)", color: "var(--text-medium)" }}>Guardians can pause, never spend, and never stop instantly. Three days is the contract&apos;s delay; the clock here runs fast.</div>
    </div>
  );
}

/* limits: a clock running down, and trust ending when it reaches zero with
   nobody sending anything. the whole feature is that the last frame needs no
   transaction, so the strip below counts the transactions and stays at one. */
const LIMIT_SPAN = 12;
export function LimitsVisual() {
  const m = useMotionPrefs();
  const [left, setLeft] = useState(LIMIT_SPAN);
  useEffect(() => {
    const t = setInterval(() => setLeft(v => (v <= -3 ? LIMIT_SPAN : v - 1)), 700);
    return () => clearInterval(t);
  }, []);
  const out = left <= 0;
  const pct = Math.max(0, Math.min(1, left / LIMIT_SPAN));
  return (
    <div className="drawn-box overflow-clip">
      <div className="px-4 sm:px-5 py-3 flex items-center gap-3 text-sm" style={{ borderBottom: "1px solid var(--hairline)" }}>
        <span className="w-2 h-2 rounded-full" style={{ background: out ? "var(--orange)" : "var(--sage)", transition: "background .3s" }} />
        <span className="mono text-xs">Agent 14 · {out ? "not trusted" : "trusted"}</span>
        <span className="ml-auto mono text-[11px] tabular" style={{ color: "var(--text-medium)" }}>status: active</span>
      </div>
      <div className="px-4 sm:px-5 py-5">
        <div className="flex items-end gap-3">
          <span className="text-[44px] sm:text-[56px] font-semibold tabular leading-none tracking-[-0.03em]"
            style={{ color: out ? "var(--orange-text)" : "var(--text-dark)", transition: "color .3s" }}>
            {out ? "0" : left}
          </span>
          <span className="text-sm mb-2" style={{ color: "var(--text-medium)" }}>{out ? "the date passed" : "seconds of trust left"}</span>
        </div>
        <div className="h-[6px] rounded-full mt-4 overflow-clip" style={{ background: "var(--hairline)" }}>
          <motion.div className="h-full rounded-full" animate={{ width: `${pct * 100}%` }} transition={m.reduced ? { duration: 0 } : { duration: 0.65, ease: "linear" }}
            style={{ background: out ? "var(--orange)" : "var(--sage)" }} />
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.p key={out ? "out" : "in"} initial={m.reduced ? false : { opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={m.t(DUR.fast)}
            className="text-sm mt-4">
            {out
              ? <><span className="font-semibold">isTrusted answers false.</span> <span style={{ color: "var(--text-medium)" }}>Nobody sent anything. Nobody had to be awake.</span></>
              : <span style={{ color: "var(--text-medium)" }}>One transaction set the end date. That is the only one there will be.</span>}
          </motion.p>
        </AnimatePresence>
      </div>
      <div className="px-4 sm:px-5 py-2.5 text-[11px] mono" style={{ borderTop: "1px solid var(--hairline)", color: "var(--text-medium)" }}>
        transactions sent: 1
      </div>
    </div>
  );
}

/* panic: a phone, a touch, and the agent paused. the three beats are the ones
   that matter, no wallet anywhere in them. */
const PANIC = [
  { k: "ask", head: "Pause agent 14", sub: "Touch to confirm", tone: "plain" as const },
  { k: "sign", head: "Signed by your passkey", sub: "Verified on chain by Monad's P256 precompile", tone: "plain" as const },
  { k: "done", head: "Paused", sub: "Block 41,204. No wallet was involved.", tone: "off" as const },
];
export function PanicVisual() {
  const m = useMotionPrefs();
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI(x => (x + 1) % PANIC.length), 2200); return () => clearInterval(t); }, []);
  const p = PANIC[i];
  const lit = i > 0;
  return (
    <div className="drawn-box p-4 sm:p-5 grid sm:grid-cols-[168px_1fr] gap-4 items-center">
      {/* the phone */}
      <div className="mx-auto rounded-[26px] p-3 w-[150px]" style={{ background: "var(--surface)", border: "1px solid var(--hairline)" }}>
        <div className="rounded-[18px] px-3 py-4 flex flex-col items-center gap-3 text-center" style={{ background: "var(--bg-base)" }}>
          <span className="eyebrow">trustset</span>
          <motion.div className="w-14 h-14 rounded-full flex items-center justify-center"
            animate={m.reduced ? {} : { scale: i === 1 ? [1, 0.92, 1] : 1 }} transition={{ duration: 0.45 }}
            style={{ background: lit ? "color-mix(in srgb, var(--orange) 16%, transparent)" : "var(--hairline)", transition: "background .3s" }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={lit ? "var(--orange)" : "var(--text-light)"} strokeWidth="1.7" strokeLinecap="round">
              <path d="M12 4c-3.3 0-6 2.7-6 6v1.5" /><path d="M12 4c3.3 0 6 2.7 6 6v4" />
              <path d="M9 11a3 3 0 0 1 6 0v5" /><path d="M12 11v6" /><path d="M6 15v2" /><path d="M18 17v2" />
            </svg>
          </motion.div>
          <span className="text-[12px] font-semibold leading-tight">{i === 2 ? "Agent paused" : "Pause agent 14"}</span>
        </div>
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={p.k} initial={m.reduced ? false : { opacity: 0, y: 6, filter: "blur(2px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -6, filter: "blur(2px)" }} transition={m.t(DUR.fast)}>
          <div className="text-[22px] sm:text-[26px] font-semibold tracking-tight leading-tight"
            style={{ color: p.tone === "off" ? "var(--orange-text)" : "var(--text-dark)" }}>{p.head}</div>
          <div className="text-sm mt-1.5" style={{ color: "var(--text-medium)" }}>{p.sub}</div>
          <div className="mono text-[11px] mt-3" style={{ color: "var(--text-medium)" }}>a passkey can pause, and nothing else</div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ---------- the slides ---------- */
const FEATURES = [
  { k: "The switch", Icon: ZapIcon, lit: "One transaction.", dim: "Every app sees it next block.", body: "A cold key that can pause, stop and bring an agent back, and can never spend. Apps check it inside their own call, so there is nothing to sync.", Visual: TripVisual },
  { k: "Guardians", Icon: LayersIcon, lit: "Who stops it if you cannot?", dim: "The people you chose.", body: "Guardians can pause your agent by vote. If you then do nothing for three days, they can stop it. They can never spend.", Visual: GuardianVisual },
  { k: "Limits", Icon: RefreshCWIcon, lit: "Trust that ends by itself.", dim: "Nobody has to be awake.", body: "Give an agent an end date, or a heartbeat it has to keep. When either runs out it stops being trusted, with no transaction and nobody watching.", Visual: LimitsVisual },
  { k: "Panic button", Icon: IdCardIcon, lit: "No wallet in the room.", dim: "A fingerprint is enough.", body: "A passkey on your phone can pause the agent, checked on chain by Monad's own P256 precompile. It can pause and nothing else, so a lost phone costs an interruption.", Visual: PanicVisual },
] as const;
const DWELL = 7000;

export function Features() {
  const m = useMotionPrefs();
  const [i, setI] = useState(0);
  const [hold, setHold] = useState(false);
  const { ref, arrived } = useArrived("-80px 0px");
  const icon = useRef<IconHandle>(null);
  /* auto-advance while on screen and not held. a slide is not a carousel
     that spins on its own while nobody looks: it waits to be seen. */
  useEffect(() => {
    if (!arrived || hold || m.reduced) return;
    const t = setTimeout(() => setI(x => (x + 1) % FEATURES.length), DWELL);
    return () => clearTimeout(t);
  }, [i, arrived, hold, m.reduced]);
  useEffect(() => { const t = setTimeout(() => icon.current?.startAnimation(), 300); return () => clearTimeout(t); }, [i]);
  const f = FEATURES[i];
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") setI(x => (x + 1) % FEATURES.length);
    if (e.key === "ArrowLeft") setI(x => (x + FEATURES.length - 1) % FEATURES.length);
  };
  return (
    <section ref={ref} className="mt-24 sm:mt-36" onMouseEnter={() => setHold(true)} onMouseLeave={() => setHold(false)} onFocus={() => setHold(true)} onBlur={() => setHold(false)} onKeyDown={onKey}>
      {/* the setup. the tabs below are the features, but a first-time reader has
          no way to know that from four words in pills. this says what they are
          and whose problem they solve: you did the hard part, this is the part
          you would otherwise build yourself, and it is already built. it lives in
          this section rather than above it so the gap to the tabs is the page's
          own rhythm and not a seam between two unrelated things. */}
      <div className="max-w-5xl">
        <h2 className="text-[34px] sm:text-[46px] lg:text-[54px] font-semibold tracking-[-0.03em] leading-[1.04]">
          <span>You built the agent.</span>{" "}<span style={{ color: "var(--dim)" }}>Here is everything around it.</span>
        </h2>
        <p className="text-[17px] sm:text-[19px] text-ink/70 mt-4 max-w-[52ch]">
          Four things it should have had from day one. None of them need you to change a line of the agent.
        </p>
      </div>
      {/* the rail. each tab carries its own progress line while it is the one showing. */}
      <div role="tablist" aria-label="Features" className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mt-8 sm:mt-10 mb-8 sm:mb-10 max-w-4xl">
        {FEATURES.map((t, k) => {
          const on = k === i;
          return (
            <button key={t.k} role="tab" aria-selected={on} type="button" onClick={() => setI(k)}
              className="text-left rounded-xl px-3 py-3 sm:px-4 transition-colors outline-none focus-visible:ring-2"
              style={{ background: on ? "color-mix(in srgb, var(--text-dark) 6%, transparent)" : "transparent" }}>
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: on ? "color-mix(in srgb, var(--orange) 16%, transparent)" : "var(--hairline)", color: on ? "var(--orange-text)" : "var(--text-light)" }}>
                  {on ? <t.Icon ref={icon} size={15} /> : <t.Icon size={15} />}
                </span>
                <span className="text-[13px] sm:text-[14px] font-semibold tracking-tight truncate" style={{ color: on ? "var(--text-dark)" : "var(--text-medium)" }}>{t.k}</span>
              </div>
              <div className="mt-2.5 h-[2px] rounded-full overflow-hidden" style={{ background: "var(--hairline)" }}>
                {on && !m.reduced && (
                  <motion.div key={i + (hold ? "h" : "r")} className="h-full rounded-full" style={{ background: "var(--orange)" }}
                    initial={{ width: hold ? "100%" : "0%" }} animate={{ width: "100%" }} transition={{ duration: hold ? 0 : DWELL / 1000, ease: "linear" }} />
                )}
                {on && m.reduced && <div className="h-full w-full" style={{ background: "var(--orange)" }} />}
              </div>
            </button>
          );
        })}
      </div>

      {/* the frame: headline on the left, the product's window on the right. */}
      <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-8 lg:gap-14 items-center">
        {/* the four bodies are not the same length, so without a floor the column
            changes height as the rail advances and everything under it moves.
            measured at the tallest: 393 wants the most, because the copy wraps
            hardest there and the frame sits below rather than beside it. */}
        <div className="min-w-0 min-h-[236px] sm:min-h-[210px] lg:min-h-[268px]">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={f.k} initial={m.reduced ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={m.reduced ? { opacity: 0 } : { opacity: 0, y: -8 }} transition={m.reduced ? { duration: 0.1 } : { duration: 0.35, ease: EASE }}>
              <h2 className="text-[34px] sm:text-[44px] lg:text-[52px] font-semibold tracking-[-0.03em] leading-[1.04]">
                <span>{f.lit}</span><br /><span style={{ color: "var(--dim)" }}>{f.dim}</span>
              </h2>
              <p className="text-[17px] sm:text-[18px] text-ink/70 mt-5 max-w-[36ch]">{f.body}</p>
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="min-w-0 rounded-[28px] p-2" style={{ background: "color-mix(in srgb, var(--text-dark) 5%, transparent)", border: "1px solid var(--hairline)" }}>
          <div className="flex items-center gap-1.5 px-3 py-2">
            {[0, 1, 2].map(d => <span key={d} className="w-2 h-2 rounded-full" style={{ background: "var(--hairline)" }} />)}
            <span className="ml-3 mono text-[11px]" style={{ color: "var(--text-medium)" }}>trustset.silknodes.io</span>
          </div>
          {/* the four slides are not the same height to the pixel, and without a
              floor the whole page below shifts every time one advances. the
              frame holds the tallest and each visual fills it. */}
          <div className="min-h-[300px] sm:min-h-[292px]">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={f.k} className="h-full" initial={m.reduced ? false : { opacity: 0, scale: 0.985 }} animate={{ opacity: 1, scale: 1 }} exit={m.reduced ? { opacity: 0 } : { opacity: 0, scale: 0.99 }} transition={m.reduced ? { duration: 0.1 } : { duration: 0.3, ease: EASE }}>
                <f.Visual />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
