"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useMotionPrefs } from "@/lib/motion";
import { ZapIcon } from "@/components/icons/zap";
import { IdCardIcon } from "@/components/icons/id-card";
import { RefreshCWIcon } from "@/components/icons/refresh-cw";
import { LayersIcon } from "@/components/icons/layers";
import { HandCoinsIcon } from "@/components/icons/hand-coins";
import { TagIcon } from "@/components/icons/tag";
import { FingerprintIcon } from "@/components/icons/fingerprint";
import { UndoIcon } from "@/components/icons/undo";
import { TripVisual, PanicVisual, GuardianVisual, LimitsVisual, WhenVisual, IdentityVisual, HumanVisual, RefundVisual } from "@/components/landing/Story";

/* one day, eight hours.
 *
 * the eight layers used to be tabs. eight tabs in two rows read as a form,
 * the active one was a two pixel line under one of eight identical pills, and
 * on a phone the tab you pressed and the thing that changed sat a whole
 * screen apart. so there are no tabs. the intro already promised "the hour
 * you would need it", and this takes it literally: the layers are the hours
 * of one day in an agent's life, in clock order from the 3am leak to the
 * midnight vote. the reader scrolls, which they were doing anyway, the
 * product's window stays put and shows the hour they are on, and an index
 * beside it names all eight at once so nobody has to hunt for the seventh.
 *
 * the visuals are the ones the tabs played; only the trigger changed, from a
 * click to the block reaching the middle of the screen. */

const EASE = [0.23, 1, 0.32, 1] as const;
const NAV = 64;

const HOURS = [
  { at: "03:00", k: "The switch", Icon: ZapIcon, lit: "It is 3am and the key has leaked.", dim: "One transaction. Off from the next block.", accent: "next block", body: "Your wallet pauses or stops it, and every app that checks refuses that key.", Visual: TripVisual },
  { at: "03:40", k: "Human proof", Icon: FingerprintIcon, lit: "A transfer just went out.", dim: "Was it you, or the agent?", accent: "you, or the agent", body: "A passkey signs that exact action, so anyone can later ask whether a person was there.", Visual: HumanVisual },
  { at: "07:00", k: "Limits", Icon: RefreshCWIcon, lit: "You forgot the agent was still running.", dim: "Trust that ends by itself.", accent: "by itself", body: "An end date, or a heartbeat it has to keep. Miss either and trust lapses on its own.", Visual: LimitsVisual },
  { at: "08:10", k: "Identity", Icon: TagIcon, lit: "A venue meets a key it has never seen.", dim: "It can still ask whose agent that is.", accent: "whose agent", body: "Its ERC-8004 identity points back at the switch, so any app can ask whether it was stopped.", Visual: IdentityVisual },
  { at: "14:35", k: "Past signatures", Icon: HandCoinsIcon, lit: "An order arrives, signed before the stop.", dim: "Judged by when it was signed.", accent: "when it was signed", body: "A stop at 14:32 voids the 14:35 order and honours the 14:30 one.", Visual: WhenVisual },
  { at: "19:40", k: "Panic button", Icon: IdCardIcon, lit: "You need it stopped, not signed.", dim: "A fingerprint is enough.", accent: "fingerprint", body: "A passkey on your phone pauses it, and can do nothing else.", Visual: PanicVisual },
  { at: "21:15", k: "Refunds", Icon: UndoIcon, lit: "It was mid-payment when you stopped it.", dim: "The money comes back.", accent: "comes back", body: "A payment still unsettled when its window closes goes back to the payer, and anyone may send it.", Visual: RefundVisual },
  { at: "23:50", k: "Guardians", Icon: LayersIcon, lit: "You are asleep and something is going wrong.", dim: "The people you chose can stop it.", accent: "people you chose", body: "Guardians pause it by vote. They can never spend from it, and your wallet overrules them.", Visual: GuardianVisual },
];

function Dim({ text, accent }: { text: string; accent: string }) {
  const i = text.indexOf(accent);
  if (i < 0) return <span style={{ color: "var(--dim)" }}>{text}</span>;
  return (
    <span style={{ color: "var(--dim)" }}>
      {text.slice(0, i)}<span style={{ color: "var(--text-dark)" }}>{accent}</span>{text.slice(i + accent.length)}
    </span>
  );
}

export function Day() {
  const m = useMotionPrefs();
  const [i, setI] = useState(0);
  const blocks = useRef<(HTMLDivElement | null)[]>([]);
  const frame = useRef<HTMLDivElement>(null);

  /* which hour is the reader on. the active block is the last one whose top
     has crossed the line: the middle of the screen with the frame beside the
     copy, or just under the frame when the frame is pinned above it. read on
     scroll and resize through one rAF, never through an observer, so a jump
     into the page lands on the right hour too. */
  useEffect(() => {
    let raf = 0;
    const read = () => {
      raf = 0;
      const wide = window.matchMedia("(min-width: 1024px)").matches;
      const line = wide ? window.innerHeight * 0.5 : (frame.current?.getBoundingClientRect().bottom ?? NAV) + 8;
      let on = 0;
      blocks.current.forEach((b, k) => { if (b && b.getBoundingClientRect().top <= line) on = k; });
      setI(on);
    };
    const ask = () => { if (!raf) raf = requestAnimationFrame(read); };
    read();
    window.addEventListener("scroll", ask, { passive: true });
    window.addEventListener("resize", ask);
    return () => { window.removeEventListener("scroll", ask); window.removeEventListener("resize", ask); if (raf) cancelAnimationFrame(raf); };
  }, []);

  const go = (k: number) => {
    const b = blocks.current[k]; if (!b) return;
    const wide = window.matchMedia("(min-width: 1024px)").matches;
    const line = wide ? window.innerHeight * 0.5 : (frame.current?.getBoundingClientRect().bottom ?? NAV) + 8;
    const top = window.scrollY + b.getBoundingClientRect().top - line + 8;
    window.scrollTo({ top, behavior: m.reduced ? "auto" : "smooth" });
  };

  const h = HOURS[i];

  return (
    <section className="mt-24 sm:mt-36">
      <div className="max-w-5xl">
        <h2 className="text-[34px] sm:text-[46px] lg:text-[54px] font-semibold tracking-[-0.03em] leading-[1.04]">
          <span>You built the agent.</span>{" "}<span style={{ color: "var(--dim)" }}>Here is everything around it.</span>
        </h2>
        <p className="text-[17px] sm:text-[19px] text-ink/70 mt-4 max-w-[52ch]">
          The trust stack: eight things it should have had from day one, each at the hour you would need it. One day, in clock order. None of them need you to change a line of the agent.
        </p>
      </div>

      <div className="mt-10 sm:mt-14 grid grid-cols-1 lg:grid-cols-[172px_minmax(0,1fr)_minmax(0,1.15fr)] gap-x-10 xl:gap-x-14 items-start">
        {/* the index. every hour named at once, the one on screen lit. on a
            phone it folds into the frame's title bar as eight ticks. */}
        <nav aria-label="Hours" className="hidden lg:block sticky lg:top-[max(72px,calc(50vh-172px))]">
          <ol className="grid gap-0.5">
            {HOURS.map((t, k) => {
              const on = k === i;
              return (
                <li key={t.k}>
                  <button type="button" onClick={() => go(k)} aria-current={on ? "step" : undefined}
                    className="w-full text-left rounded-lg px-2 py-1.5 grid grid-cols-[38px_1fr] items-baseline gap-2 transition-colors outline-none focus-visible:ring-2"
                    style={{ background: on ? "color-mix(in srgb, var(--text-dark) 6%, transparent)" : "transparent" }}>
                    <span className="mono text-[11px] tabular" style={{ color: on ? "var(--orange-text)" : "var(--text-medium)" }}>{t.at}</span>
                    <span className="text-[13px] font-semibold tracking-tight truncate" style={{ color: on ? "var(--text-dark)" : "var(--text-medium)" }}>{t.k}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        {/* the frame. pinned beside the copy on a wide screen, pinned under the
            nav above it on a narrow one, where the copy scrolls beneath it. it
            comes first in the DOM so it is the sticky thing on a phone; the
            grid puts it in the third column on a wide screen. on the phone the
            sticky thing is a full-bleed strip carrying the nav's own scrim,
            reaching up behind the nav's fade, so the copy passing under the
            frame's corners and under the nav blurs out instead of showing
            through the gap between them. */}
        <div ref={frame} className="sticky z-10 lg:col-start-3 lg:row-start-1 top-16 lg:top-[max(72px,calc(50vh-172px))] -mx-3 px-3 pt-2 pb-3 sm:-mx-4 sm:px-4 lg:mx-0 lg:p-0">
          <div aria-hidden className="absolute inset-x-0 -top-16 bottom-0 pointer-events-none lg:hidden" style={{
            background: "color-mix(in srgb, var(--bg-base) 82%, transparent)",
            backdropFilter: "blur(18px) saturate(160%)", WebkitBackdropFilter: "blur(18px) saturate(160%)",
            maskImage: "linear-gradient(to bottom, #000 calc(100% - 10px), transparent)", WebkitMaskImage: "linear-gradient(to bottom, #000 calc(100% - 10px), transparent)",
          }} />
          <div className="relative rounded-[28px] p-2 flex flex-col"
            style={{ background: "color-mix(in srgb, var(--text-dark) 5%, var(--bg-base))", border: "1px solid var(--hairline)", boxShadow: "0 12px 40px -24px rgba(0,0,0,0.35)" }}>
            <div className="flex items-center gap-1.5 px-3 py-2">
              {[0, 1, 2].map(d => <span key={d} className="w-2 h-2 rounded-full" style={{ background: "var(--hairline)" }} />)}
              <span className="ml-3 mono text-[11px] truncate" style={{ color: "var(--text-medium)" }}>trustset.silknodes.io</span>
              <span className="ml-auto mono text-[11px] tabular whitespace-nowrap"><span style={{ color: "var(--orange-text)" }}>{h.at}</span><span style={{ color: "var(--text-medium)" }}> · {h.k}</span></span>
            </div>
            <div className="lg:hidden flex gap-1 px-3 pb-2" role="list" aria-label="Hours">
              {HOURS.map((t, k) => (
                <button key={t.k} type="button" role="listitem" aria-label={`${t.at} ${t.k}`} aria-current={k === i ? "step" : undefined} onClick={() => go(k)}
                  className="flex-1 h-[3px] rounded-full transition-colors" style={{ background: k <= i ? "var(--orange)" : "var(--hairline)" }} />
              ))}
            </div>
            <div className="min-h-[304px] sm:min-h-[292px] flex-1 flex items-center">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={h.k} className="w-full" initial={m.reduced ? false : { opacity: 0, scale: 0.985 }} animate={{ opacity: 1, scale: 1 }} exit={m.reduced ? { opacity: 0 } : { opacity: 0, scale: 0.99 }} transition={m.reduced ? { duration: 0.1 } : { duration: 0.3, ease: EASE }}>
                  <h.Visual />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* the hours. on a wide screen each block is tall enough to hold the
            frame's attention on its own; on a phone it is just as tall as its
            copy, so the next hour arrives as this one's copy passes under the
            frame. the one showing has an orange hour; nothing dims, because
            dimmed body copy fell to 3:1 on the light ground and a reader half a
            screen ahead still has to read it. */}
        <div className="min-w-0 lg:col-start-2 lg:row-start-1 pt-8 lg:pt-0">
          {HOURS.map((t, k) => {
            const on = k === i;
            return (
              <div key={t.k} ref={el => { blocks.current[k] = el; }} className="lg:min-h-[72vh] flex items-center py-6 lg:py-10">
                <div className="w-full">
                  <p className="mono text-[12px] tabular transition-colors" style={{ color: on ? "var(--orange-text)" : "var(--text-medium)" }}>{t.at} · {t.k}</p>
                  <h3 className="mt-3 text-[34px] sm:text-[44px] lg:text-[48px] font-semibold tracking-[-0.03em] leading-[1.04]">
                    <span>{t.lit}</span><br /><Dim text={t.dim} accent={t.accent} />
                  </h3>
                  <p className="text-[17px] sm:text-[18px] text-ink/70 mt-5 max-w-[36ch]">{t.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
