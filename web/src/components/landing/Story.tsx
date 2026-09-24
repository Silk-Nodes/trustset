"use client";
import Tip from "@/components/Tip";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useArrived } from "@/hooks/useArrived";
import { useMotionPrefs, DUR } from "@/lib/motion";
import { ZapIcon } from "@/components/icons/zap";
import { IdCardIcon } from "@/components/icons/id-card";
import { RefreshCWIcon } from "@/components/icons/refresh-cw";
import { LayersIcon } from "@/components/icons/layers";
import { HandCoinsIcon } from "@/components/icons/hand-coins";
import { TagIcon } from "@/components/icons/tag";
import { FingerprintIcon } from "@/components/icons/fingerprint";
import { UndoIcon } from "@/components/icons/undo";
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
 * answer. so the problem stays: a strike draws through it, it dims, and the
 * answer arrives under it. before and after, both readable, at rest.
 *
 * every turn is the same shape: the problem on its own line, small and muted,
 * the answer under it at full size. the first cut let the answer sit on the
 * same line as the problem, which fitted for the short turn and wrapped for
 * the other two, so the block read as five ragged lines instead of three
 * pairs. one accent per turn as well: the strike is a neutral rule now, so
 * "Now" is the only orange thing on the line.
 *
 * one way: a line that has turned stays turned. */
const SETUP = "An agent with a key can trade, pay and sign for as long as it runs.";
const TURNS = [
  { was: "Nothing could stop it.", now: "one transaction does." },
  { was: "Nothing could stop it while you slept.", now: "your guardians can. Or a date you set." },
  { was: "Nothing could stop it without a signature.", now: "a fingerprint can." },
];
function Turn({ was, now, turned, reduced }: { was: string; now: string; turned: boolean; reduced: boolean }) {
  const t = reduced ? { duration: 0 } : { duration: 0.32, ease: EASE };
  return (
    <span className="block">
      {/* it stays at --text-medium once struck. dimming it to --text-light put
          it at 3.01:1 on the light ground, and a sentence the reader still has
          to read cannot sit under 4.5. the strike and the smaller size retire
          it on their own. */}
      <span className="relative inline-block text-[0.62em] leading-[1.3]" style={{ color: "var(--text-medium)" }}>
        {was}
        <motion.span aria-hidden className="absolute left-0 top-[0.58em] h-[0.08em] w-full origin-left rounded-full" style={{ background: "currentColor" }}
          initial={false} animate={{ scaleX: turned ? 1 : 0 }} transition={t} />
      </span>
      <motion.span className="block" initial={false} animate={{ opacity: turned ? 1 : 0, y: turned ? 0 : -6 }} transition={{ ...t, delay: reduced || !turned ? 0 : 0.22 }} aria-hidden={!turned}>
        <span style={{ color: "var(--orange-text)" }}>Now</span> {now}
      </motion.span>
    </span>
  );
}

export function Why() {
  const m = useMotionPrefs();
  const { ref, arrived } = useArrived("-120px 0px");
  const [turned, setTurned] = useState(0);
  /* a rhythm, not a race.
   *
   * these three lines sit sixty and a hundred pixels apart, so when each one
   * turned as it crossed the middle of the screen they all turned within a
   * fraction of a second of each other: three strikes and three answers at
   * once, which reads as a flurry rather than as three thoughts. now the
   * section turns them in order once the reader has arrived, a beat apart, at
   * a pace that does not depend on how fast anybody scrolls.
   *
   * one way, as before: it plays once and stays played. */
  useEffect(() => {
    if (m.reduced) { setTurned(TURNS.length); return; }
    if (!arrived) return;
    const timers = TURNS.map((_, i) => setTimeout(() => setTurned(n => Math.max(n, i + 1)), 350 + i * 800));
    return () => timers.forEach(clearTimeout);
  }, [arrived, m.reduced]);

  return (
    <section ref={ref as React.RefObject<HTMLElement>} className="mt-24 sm:mt-36 max-w-5xl">
      <p className="text-[30px] sm:text-[44px] lg:text-[54px] font-semibold tracking-[-0.03em] leading-[1.12]">{SETUP}</p>
      <ol className="mt-6 sm:mt-8 grid gap-6 sm:gap-8 text-[26px] sm:text-[36px] lg:text-[44px] font-semibold tracking-[-0.03em] leading-[1.14]">
        {TURNS.map((t, k) => (
          <li key={t.was} data-turned={turned > k}>
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
                  className="mono text-[11px] tabular" style={{ color: refused ? "var(--orange-text)" : "var(--text-medium)" }}>{refused ? "Refused · block 277" : "Allowed"}</motion.span>
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
    /* an inactive box is receded with colour and weight, never by fading.
       at 0.28 its labels measured 1.56:1 on the light ground and 1.86:1 on
       the dark one, and opacity has now been the cause of this four times in
       this codebase: the walkthrough's later steps, the passkey's second
       card, the check tiles' counts, and here. a faded thing is not a quieter
       thing, it is an unreadable one. */
    <div className="rounded-2xl px-3 py-3 min-w-0" style={{
      background: ours && lit ? "color-mix(in srgb, var(--orange) 12%, transparent)" : "var(--surface)",
      border: `1px solid ${ours && lit ? "var(--orange)" : "var(--hairline)"}`,
      color: lit ? "var(--text-dark)" : "var(--text-medium)",
      boxShadow: lit ? "0 1px 2px color-mix(in srgb, var(--text-dark) 8%, transparent)" : "none",
      transition: "color .4s, background .4s, border-color .4s, box-shadow .4s" }}>
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
              {/* transparent, not absent, so the row keeps its width and does
                  not jump when the verdict arrives at the third step. hidden
                  from assistive tech while it is invisible, because a reader
                  who cannot see it should not be told the app is "allowed"
                  before the drawing has said anything. */}
              <span aria-hidden={!asking} className="tabular shrink-0" style={{ color: !asking ? "transparent" : on ? "var(--text-medium)" : "var(--orange-text)", transition: "color .3s" }}>{on ? "allowed" : "refused"}</span>
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
              <Tip text={dim}><span className="font-semibold">{lit}</span></Tip>
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

/* when: two orders and a stop, judged by the clock rather than by now.
   the venue asks isTrustedAt(id, signedAt), so the order from before the stop
   is honoured and the one from after is refused, and the point of the window
   is that both verdicts land AFTER the stop and still come out differently. */
const WHEN = [
  { k: "a", t: "14:30", what: "Order signed", verdict: "honoured", tone: "live" as const },
  { k: "stop", t: "14:32", what: "Switched off", verdict: null, tone: "off" as const },
  { k: "b", t: "14:35", what: "Order signed", verdict: "refused", tone: "off" as const },
];
export function WhenVisual() {
  const m = useMotionPrefs();
  const [step, setStep] = useState(0);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const run = (n: number) => { setStep(n); t = setTimeout(() => run(n >= 4 ? 0 : n + 1), n === 0 ? 1200 : n === 4 ? 2800 : 900); };
    run(0); return () => clearTimeout(t);
  }, []);
  /* 0 nothing, 1 first order, 2 the stop, 3 second order, 4 both verdicts */
  const shown = (i: number) => step >= i + 1;
  const judged = step >= 4;
  return (
    <div className="drawn-box overflow-clip">
      <div className="px-4 sm:px-5 py-3 flex items-center gap-3 text-sm" style={{ borderBottom: "1px solid var(--hairline)" }}>
        <span className="w-2 h-2 rounded-full" style={{ background: step >= 2 ? "var(--orange)" : "var(--sage)", transition: "background .3s" }} />
        <span className="mono text-xs">Agent 14 · {step >= 2 ? "paused at 14:32" : "trusted"}</span>
        <span className="ml-auto mono text-[11px]" style={{ color: "var(--text-medium)" }}>venue settles at 14:40</span>
      </div>
      <div className="px-4 sm:px-5 py-4">
        <ol className="relative grid gap-2.5">
          <span aria-hidden className="absolute left-[27px] top-3 bottom-3 w-px" style={{ background: "var(--hairline)" }} />
          {WHEN.map((w, i) => (
            <motion.li key={w.k} initial={false} animate={{ opacity: shown(i) ? 1 : 0.18, x: shown(i) ? 0 : -4 }} transition={m.t(DUR.base)}
              className="grid grid-cols-[56px_10px_minmax(0,1fr)_auto] items-center gap-2.5 text-sm">
              <span className="mono text-[12px] tabular" style={{ color: "var(--text-medium)" }}>{w.t}</span>
              <span className="w-[10px] h-[10px] rounded-full justify-self-center z-10" style={{ background: w.k === "stop" ? "var(--orange)" : "var(--surface)", border: `2px solid ${w.k === "stop" ? "var(--orange)" : "var(--text-medium)"}` }} />
              <span className={w.k === "stop" ? "font-semibold" : ""} style={{ color: w.k === "stop" ? "var(--orange-text)" : "var(--text-dark)" }}>{w.what}</span>
              <AnimatePresence initial={false}>
                {w.verdict && judged && (
                  <motion.span key="v" initial={m.reduced ? false : { opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={m.t(DUR.fast)}
                    className="mono text-[11px] rounded-full px-2 py-0.5"
                    style={{ color: w.tone === "live" ? "var(--sage-text)" : "var(--orange-text)", background: `color-mix(in srgb, ${w.tone === "live" ? "var(--sage)" : "var(--orange)"} 12%, transparent)` }}>
                    {w.verdict}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.li>
          ))}
        </ol>
        <AnimatePresence mode="wait" initial={false}>
          <motion.p key={judged ? "j" : "w"} initial={m.reduced ? false : { opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={m.t(DUR.fast)} className="text-sm mt-4">
            {judged
              ? <><span className="font-semibold">isTrustedAt(14, signedAt).</span> <span style={{ color: "var(--text-medium)" }}>Both settle after the stop. Only one was signed before it.</span></>
              : <span style={{ color: "var(--text-medium)" }}>The venue does not ask what is true now. It asks what was true then.</span>}
          </motion.p>
        </AnimatePresence>
      </div>
      <div className="px-4 sm:px-5 py-2.5 text-[11px] mono" style={{ borderTop: "1px solid var(--hairline)", color: "var(--text-medium)" }}>
        one view call per order · no service in the path
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

/* identity: a registration filling in, then the pointer from the erc-8004
   registry resolving back to it. the point is the last row: an app that only
   knows the identity token can still find the switch and ask it. */
const IDENT = [
  { k: "id", label: "agent", value: "14" },
  { k: "name", label: "label", value: "Treasury sweeper" },
  { k: "cold", label: "owner", value: "0x3cad…96C5" },
  { k: "8004", label: "erc-8004", value: "#1873 → agent 14" },
];
export function IdentityVisual() {
  const m = useMotionPrefs();
  const [step, setStep] = useState(0);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const run = (n: number) => { setStep(n); t = setTimeout(() => run(n >= IDENT.length + 1 ? 0 : n + 1), n === 0 ? 900 : n > IDENT.length ? 2800 : 700); };
    run(0); return () => clearTimeout(t);
  }, []);
  const shown = (i: number) => step >= i + 1;
  const linked = step > IDENT.length;
  return (
    <div className="drawn-box overflow-clip">
      <div className="px-4 sm:px-5 py-3 flex items-center gap-3 text-sm" style={{ borderBottom: "1px solid var(--hairline)" }}>
        <span className="w-2 h-2 rounded-full" style={{ background: linked ? "var(--sage)" : "var(--hairline)", transition: "background .3s" }} />
        <span className="mono text-xs">Agent 14 · {linked ? "identity linked" : "registering"}</span>
        <span className="ml-auto mono text-[11px]" style={{ color: "var(--text-medium)" }}>two public registries</span>
      </div>
      <div className="px-4 sm:px-5 py-4">
        <dl className="grid gap-2.5">
          {IDENT.map((r, i) => (
            <motion.div key={r.k} initial={false} animate={{ opacity: shown(i) ? 1 : 0.18, x: shown(i) ? 0 : -4 }} transition={m.t(DUR.base)}
              className="grid grid-cols-[84px_minmax(0,1fr)] items-baseline gap-3 text-sm">
              <dt className="mono text-[12px]" style={{ color: "var(--text-medium)" }}>{r.label}</dt>
              <dd className={r.k === "8004" ? "mono text-[13px]" : "font-semibold"} style={{ color: r.k === "8004" && linked ? "var(--sage-text)" : "var(--text-dark)", transition: "color .3s" }}>{r.value}</dd>
            </motion.div>
          ))}
        </dl>
        <AnimatePresence mode="wait" initial={false}>
          <motion.p key={linked ? "l" : "w"} initial={m.reduced ? false : { opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={m.t(DUR.fast)} className="text-sm mt-4">
            {linked
              ? <><span className="font-semibold">from8004(1873) → agent 14.</span> <span style={{ color: "var(--text-medium)" }}>Two view calls. The pointer is checked, not believed.</span></>
              : <span style={{ color: "var(--text-medium)" }}>An app that only knows the identity token can still ask the switch.</span>}
          </motion.p>
        </AnimatePresence>
      </div>
      <div className="px-4 sm:px-5 py-2.5 text-[11px] mono" style={{ borderTop: "1px solid var(--hairline)", color: "var(--text-medium)" }}>
        registered once · read from anywhere
      </div>
    </div>
  );
}

/* human proof: two actions, one with a person behind it and one without,
   and a view call that tells them apart afterwards. the agent cannot make the
   first kind, because the assertion comes from a passkey it does not hold. */
const TOUCH = [
  { k: "a", t: "03:12", what: "Transfer 250 USDC", human: true },
  { k: "b", t: "03:40", what: "Rebalance 3 pools", human: false },
];
export function HumanVisual() {
  const m = useMotionPrefs();
  const [step, setStep] = useState(0);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const run = (n: number) => { setStep(n); t = setTimeout(() => run(n >= 3 ? 0 : n + 1), n === 0 ? 1100 : n === 3 ? 2800 : 900); };
    run(0); return () => clearTimeout(t);
  }, []);
  const shown = (i: number) => step >= i + 1;
  const judged = step >= 3;
  return (
    <div className="drawn-box overflow-clip">
      <div className="px-4 sm:px-5 py-3 flex items-center gap-3 text-sm" style={{ borderBottom: "1px solid var(--hairline)" }}>
        <span className="w-2 h-2 rounded-full" style={{ background: judged ? "var(--sage)" : "var(--hairline)", transition: "background .3s" }} />
        <span className="mono text-xs">Agent 14 · {judged ? "two actions, judged" : "acting overnight"}</span>
        <span className="ml-auto mono text-[11px]" style={{ color: "var(--text-medium)" }}>HumanTouch</span>
      </div>
      <div className="px-4 sm:px-5 py-4">
        <ol className="relative grid gap-2.5">
          <span aria-hidden className="absolute left-[27px] top-3 bottom-3 w-px" style={{ background: "var(--hairline)" }} />
          {TOUCH.map((w, i) => (
            <motion.li key={w.k} initial={false} animate={{ opacity: shown(i) ? 1 : 0.18, x: shown(i) ? 0 : -4 }} transition={m.t(DUR.base)}
              className="grid grid-cols-[56px_10px_minmax(0,1fr)_auto] items-center gap-2.5 text-sm">
              <span className="mono text-[12px] tabular" style={{ color: "var(--text-medium)" }}>{w.t}</span>
              <span className="w-[10px] h-[10px] rounded-full justify-self-center z-10" style={{ background: "var(--surface)", border: "2px solid var(--text-medium)" }} />
              <span style={{ color: "var(--text-dark)" }}>{w.what}</span>
              <AnimatePresence initial={false}>
                {judged && (
                  <motion.span key="v" initial={m.reduced ? false : { opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={m.t(DUR.fast)}
                    className="mono text-[11px] rounded-full px-2 py-0.5"
                    style={{ color: w.human ? "var(--sage-text)" : "var(--text-medium)", background: w.human ? "color-mix(in srgb, var(--sage) 12%, transparent)" : "var(--hairline)" }}>
                    {w.human ? "a person was present" : "the agent alone"}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.li>
          ))}
        </ol>
        <AnimatePresence mode="wait" initial={false}>
          <motion.p key={judged ? "j" : "w"} initial={m.reduced ? false : { opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={m.t(DUR.fast)} className="text-sm mt-4">
            {judged
              ? <><span className="font-semibold">wasHuman(action) is a view call.</span> <span style={{ color: "var(--text-medium)" }}>Verified by the P256 precompile. The agent cannot forge a person.</span></>
              : <span style={{ color: "var(--text-medium)" }}>Any action can carry a proof of who was there when it happened.</span>}
          </motion.p>
        </AnimatePresence>
      </div>
      <div className="px-4 sm:px-5 py-2.5 text-[11px] mono" style={{ borderTop: "1px solid var(--hairline)", color: "var(--text-medium)" }}>
        attested by a passkey · asked by anyone
      </div>
    </div>
  );
}

/* refunds: a payment, a stop in the middle of it, and the money coming back
   once the window closes. the last row is the one that matters: anybody may
   send it, and it pays the payer named in storage whoever sent it. */
const RAIL = [
  { k: "pay", t: "12:00", what: "Paid 25 USDC into the rail", tone: "plain" as const },
  { k: "stop", t: "12:03", what: "Agent switched off", tone: "off" as const },
  { k: "close", t: "12:30", what: "Window closed, unsettled", tone: "plain" as const },
  { k: "back", t: "12:31", what: "25 USDC back to the payer", tone: "live" as const },
];
export function RefundVisual() {
  const m = useMotionPrefs();
  const [step, setStep] = useState(0);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const run = (n: number) => { setStep(n); t = setTimeout(() => run(n >= RAIL.length ? 0 : n + 1), n === 0 ? 900 : n === RAIL.length ? 2800 : 850); };
    run(0); return () => clearTimeout(t);
  }, []);
  const shown = (i: number) => step >= i + 1;
  const stopped = step >= 2, done = step >= RAIL.length;
  return (
    <div className="drawn-box overflow-clip">
      <div className="px-4 sm:px-5 py-3 flex items-center gap-3 text-sm" style={{ borderBottom: "1px solid var(--hairline)" }}>
        <span className="w-2 h-2 rounded-full" style={{ background: stopped ? "var(--orange)" : "var(--sage)", transition: "background .3s" }} />
        <span className="mono text-xs">Agent 14 · {stopped ? "paused at 12:03" : "paying for work"}</span>
        <span className="ml-auto mono text-[11px]" style={{ color: "var(--text-medium)" }}>refund rail</span>
      </div>
      <div className="px-4 sm:px-5 py-4">
        <ol className="relative grid gap-2.5">
          <span aria-hidden className="absolute left-[27px] top-3 bottom-3 w-px" style={{ background: "var(--hairline)" }} />
          {RAIL.map((w, i) => {
            const c = w.tone === "off" ? "var(--orange)" : w.tone === "live" ? "var(--sage)" : "var(--text-medium)";
            const ink = w.tone === "off" ? "var(--orange-text)" : w.tone === "live" ? "var(--sage-text)" : "var(--text-dark)";
            return (
              <motion.li key={w.k} initial={false} animate={{ opacity: shown(i) ? 1 : 0.18, x: shown(i) ? 0 : -4 }} transition={m.t(DUR.base)}
                className="grid grid-cols-[56px_10px_minmax(0,1fr)] items-center gap-2.5 text-sm">
                <span className="mono text-[12px] tabular" style={{ color: "var(--text-medium)" }}>{w.t}</span>
                <span className="w-[10px] h-[10px] rounded-full justify-self-center z-10" style={{ background: w.tone === "plain" ? "var(--surface)" : c, border: `2px solid ${c}` }} />
                <span className={w.tone === "plain" ? "" : "font-semibold"} style={{ color: ink }}>{w.what}</span>
              </motion.li>
            );
          })}
        </ol>
        <AnimatePresence mode="wait" initial={false}>
          <motion.p key={done ? "d" : "w"} initial={m.reduced ? false : { opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={m.t(DUR.fast)} className="text-sm mt-4">
            {done
              ? <><span className="font-semibold">refund(id) pays the payer named in storage.</span> <span style={{ color: "var(--text-medium)" }}>Anyone may call it. Nobody can redirect it.</span></>
              : <span style={{ color: "var(--text-medium)" }}>A deadline moves no money by itself. Somebody sends the refund, and it can be anybody.</span>}
          </motion.p>
        </AnimatePresence>
      </div>
      <div className="px-4 sm:px-5 py-2.5 text-[11px] mono" style={{ borderTop: "1px solid var(--hairline)", color: "var(--text-medium)" }}>
        permissionless refund · a keeper only adds promptness
      </div>
    </div>
  );
}

/* ---------- the slides ---------- */
/* the tab is the feature's name and the headline is the hour you would need
   it. both, on purpose. the names are how somebody scanning for capabilities
   finds them, and a page with no "guardians" or "limits" on it anywhere has
   hidden its own features. the moments are how somebody decides: they are not
   asking what it has, they are asking whether the thing they dread is on the
   list. the window on the right shows it happening. the fifth is new: an order
   signed before the stop, which is the one integrators ask about first and the
   one no other switch answers. the last three are the layers the contracts
   always had and the page never named: identity, human proof and refunds. */
const FEATURES = [
  { k: "The switch", Icon: ZapIcon, lit: "It is 3am and the key has leaked.", dim: "One transaction. Off from the next block.", accent: "next block", body: "Your wallet pauses or stops it, and every app that checks refuses that key from the next block. Nothing already mined is undone, because nothing can be.", Visual: TripVisual },
  { k: "Panic button", Icon: IdCardIcon, lit: "You need it stopped, not signed.", dim: "A fingerprint is enough.", accent: "fingerprint", body: "A passkey on your phone pauses it, checked on chain by Monad's own P256 precompile. It can pause and nothing else, so a lost phone costs you an interruption.", Visual: PanicVisual },
  { k: "Guardians", Icon: LayersIcon, lit: "You are asleep and something is going wrong.", dim: "The people you chose can stop it.", accent: "people you chose", body: "Guardians pause your agent by vote. They can never spend from it or hand it to anyone, and your wallet overrules whatever they do.", Visual: GuardianVisual },
  { k: "Limits", Icon: RefreshCWIcon, lit: "You forgot the agent was still running.", dim: "Trust that ends by itself.", accent: "by itself", body: "Give it an end date, or a heartbeat it has to keep. When either lapses it stops being trusted, with no transaction and nobody awake.", Visual: LimitsVisual },
  { k: "Past signatures", Icon: HandCoinsIcon, lit: "An order arrives, signed before the stop.", dim: "Judged by when it was signed.", accent: "when it was signed", body: "The switch keeps every change with its timestamp. A venue asks what was true at the moment of signing, so a stop at 14:32 voids the 14:35 order and honours the 14:30 one.", Visual: WhenVisual },
  { k: "Identity", Icon: TagIcon, lit: "A venue meets a key it has never seen.", dim: "It can still ask whose agent that is.", accent: "whose agent", body: "Every agent has an id, a label and its owner on chain, and its ERC-8004 identity points back at the switch. An app that knows the agent only by that identity can ask whether it has been stopped, without knowing trustset exists.", Visual: IdentityVisual },
  { k: "Human proof", Icon: FingerprintIcon, lit: "A transfer went out at 3am.", dim: "Was it you, or the agent?", accent: "you, or the agent", body: "HumanTouch records a passkey assertion against that exact action, verified on chain by the P256 precompile. Afterwards anyone can ask whether a person was present for it, and the agent cannot forge the answer.", Visual: HumanVisual },
  { k: "Refunds", Icon: UndoIcon, lit: "It was mid-payment when you stopped it.", dim: "The money comes back.", accent: "comes back", body: "Payments run through a rail with a window. Once it closes unsettled, refund(id) pays the payer named in storage, and anybody may call it, so money in flight returns without needing you awake.", Visual: RefundVisual },
] as const;

/* the dim line carries one phrase at full strength: the surprising part, which
   is the actual claim. a line that is uniformly quiet asks the reader to find
   the point themselves, and most will not look. */
function Dim({ text, accent }: { text: string; accent: string }) {
  const at = text.indexOf(accent);
  if (at < 0) return <span style={{ color: "var(--dim)" }}>{text}</span>;
  return (
    <span style={{ color: "var(--dim)" }}>
      {text.slice(0, at)}
      <span style={{ color: "var(--text-dark)" }}>{accent}</span>
      {text.slice(at + accent.length)}
    </span>
  );
}

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
          The trust stack: eight things it should have had from day one, each shown at the hour you would need it. None of them need you to change a line of the agent.
        </p>
      </div>
      {/* the rail. each tab carries its own progress line while it is the one showing. */}
      <div role="tablist" aria-label="Features" className="grid grid-cols-2 md:grid-cols-4 gap-2 lg:gap-3 mt-8 sm:mt-10 mb-8 sm:mb-10 max-w-5xl">
        {FEATURES.map((t, k) => {
          const on = k === i;
          return (
            <button key={t.k} role="tab" aria-selected={on} type="button" onClick={() => setI(k)}
              className="text-left rounded-xl px-3 py-3 lg:px-4 transition-colors outline-none focus-visible:ring-2"
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
      <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-8 lg:gap-14">
        {/* the eight bodies are not the same length, so without a floor the column
            changes height as the rail advances and everything under it moves.
            floors are the tallest body measured at each width, 289 at 393,
            265 at 768 and 398 at 1400, plus a little. the column is a flex box so
            the copy sits centred inside its floor, level with the frame beside it. */}
        <div className="min-w-0 min-h-[296px] sm:min-h-[272px] lg:min-h-[404px] flex items-center">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={f.k} className="w-full" initial={m.reduced ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={m.reduced ? { opacity: 0 } : { opacity: 0, y: -8 }} transition={m.reduced ? { duration: 0.1 } : { duration: 0.35, ease: EASE }}>
              <h2 className="text-[34px] sm:text-[44px] lg:text-[52px] font-semibold tracking-[-0.03em] leading-[1.04]">
                <span>{f.lit}</span><br /><Dim text={f.dim} accent={f.accent} />
              </h2>
              <p className="text-[17px] sm:text-[18px] text-ink/70 mt-5 max-w-[36ch]">{f.body}</p>
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="min-w-0 rounded-[28px] p-2 flex flex-col" style={{ background: "color-mix(in srgb, var(--text-dark) 5%, transparent)", border: "1px solid var(--hairline)" }}>
          <div className="flex items-center gap-1.5 px-3 py-2">
            {[0, 1, 2].map(d => <span key={d} className="w-2 h-2 rounded-full" style={{ background: "var(--hairline)" }} />)}
            <span className="ml-3 mono text-[11px]" style={{ color: "var(--text-medium)" }}>trustset.silknodes.io</span>
          </div>
          {/* the eight slides are not the same height to the pixel, and without a
              floor the whole page below shifts every time one advances. the
              floor is the tallest visual measured, 301 at 393, and flex-1 lets
              the frame grow to the row when the copy beside it is taller, so the
              two columns always share a top and a bottom. the visual centres. */}
          <div className="min-h-[304px] sm:min-h-[292px] flex-1 flex items-center">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={f.k} className="w-full" initial={m.reduced ? false : { opacity: 0, scale: 0.985 }} animate={{ opacity: 1, scale: 1 }} exit={m.reduced ? { opacity: 0 } : { opacity: 0, scale: 0.99 }} transition={m.reduced ? { duration: 0.1 } : { duration: 0.3, ease: EASE }}>
                <f.Visual />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
