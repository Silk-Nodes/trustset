/* the judging-week watchdog.
 *
 * one agent is named in the readme, on the docs page and in the cli's own
 * help text, and every judge who tries this project will run
 * `npx @trustset/check <that id>` against it. if it is not trusted when they
 * do, the headline command reads as broken.
 *
 * the failure that matters is not a pause, it is a lapse. the agent keeps its
 * own heartbeat: it beats inside the same cycle it trades in, roughly every
 * hour against a two hour window. if the agent process dies, nothing beats,
 * and about an hour later the agent lapses.
 *
 * a lapse is not self healing. beat() reverts once the window has passed:
 *
 *     if (block.timestamp > lastBeat + heartbeatWindow) revert Lapsed();
 *
 * so a lapsed agent stays lapsed until somebody sends a cold key transaction.
 * that is the whole reason this exists: there is an hour to notice, and after
 * it the fix needs a human and a key.
 *
 * this does NOT beat on the agent's behalf, though it easily could: the key is
 * on the same box. the heartbeat's entire meaning is that the agent is alive,
 * and a watchdog beating for a dead agent would make the liveness feature a
 * lie on the one week anybody is checking. it restarts the agent instead, and
 * the agent beats because it is running again.
 *
 * run it from a timer. it exits non-zero when something is still wrong after
 * it has tried, so the timer's own state records the failure.
 */
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.TRUSTSET_ROOT || join(HERE, "..");

/* nothing here falls back to a plausible value. a watchdog that invents the
   thing it is watching is worse than no watchdog, because it reports green. */
const need = (name) => {
  const v = process.env[name];
  if (!v) { console.error(`${name} is not set. This watchdog will not guess it.`); process.exit(2); }
  return v;
};
const AGENT_ID = need("WATCH_AGENT_ID");
const SITE = need("WATCH_SITE");
const RPC = process.env.MONAD_RPC || "https://testnet-rpc.monad.xyz";
const AGENT_STATE = process.env.AGENT_STATE;            // optional, proves the loop is turning
const UNIT = process.env.WATCH_AGENT_UNIT || "trustset-agent";
const WEBHOOK = process.env.WATCH_WEBHOOK;              // optional
const PKG = process.env.WATCH_PACKAGE;                  // optional, e.g. @trustset/check

/* restart when there is still time for the restarted agent to beat before the
   window closes. the agent beats when it is within an hour of lapsing, so a
   margin under 45 minutes means it has already missed at least one chance. */
const RESTART_UNDER_MIN = Number(process.env.WATCH_RESTART_UNDER_MIN || 45);
const STATE_STALE_MIN = Number(process.env.WATCH_STATE_STALE_MIN || 15);

const KS = [
  "function liveness(uint256) view returns (bool trusted, bool expired, bool lapsed, uint64 expiresAt, uint64 nextBeatBy)",
  "function why(uint256) view returns (string)",
];

const log = (...a) => console.log(new Date().toISOString(), ...a);
const problems = [];
const fail = (msg) => { problems.push(msg); log("PROBLEM:", msg); };

async function chain() {
  const d = JSON.parse(await readFile(join(ROOT, "deployments", "monad-testnet.json"), "utf8"));
  const p = new ethers.JsonRpcProvider(RPC, undefined, { staticNetwork: true });
  const ks = new ethers.Contract(d.killSwitch, KS, p);
  const l = await ks.liveness(AGENT_ID);
  const now = Math.floor(Date.now() / 1000);
  const next = Number(l.nextBeatBy);
  const marginMin = next ? Math.round((next - now) / 60) : Infinity;
  /* the contract's own word for the state, rather than one inferred from three
     booleans. an id that was never registered reads exactly like a paused one
     through liveness alone, and calling that "somebody paused it" sends a
     person hunting for a pause that never happened. */
  const why = l.trusted ? "trusted" : await ks.why(AGENT_ID).catch(() => "unreadable");
  return { trusted: l.trusted, lapsed: l.lapsed, expired: l.expired, marginMin, next, why };
}

/* the agent rewrites this file every cycle. a fresh file proves the loop is
   turning, which the chain cannot tell us: an agent that is up but wedged
   looks identical to a healthy one until the beat it will never send. */
async function loopTurning() {
  if (!AGENT_STATE) return null;
  try {
    const s = JSON.parse(await readFile(AGENT_STATE, "utf8"));
    return Math.round((Date.now() - new Date(s.at).getTime()) / 60000);
  } catch { return Infinity; }
}

async function restartAgent() {
  try {
    await run("sudo", ["-n", "systemctl", "restart", UNIT]);
    log(`restarted ${UNIT}`);
    return true;
  } catch (e) {
    fail(`could not restart ${UNIT}: ${(e.stderr || e.message || "").toString().trim().slice(0, 120)}`);
    return false;
  }
}

async function http(path) {
  try {
    const r = await fetch(SITE + path, { signal: AbortSignal.timeout(20000) });
    return r.status;
  } catch { return 0; }
}

async function main() {
  /* the agent, first, because it is the only failure with a deadline on it */
  let c;
  try { c = await chain(); }
  catch (e) { fail(`could not read the switch: ${e.shortMessage ?? e.message}`); c = null; }

  if (c) {
    const staleMin = await loopTurning();
    log(`agent ${AGENT_ID}: trusted=${c.trusted} lapsed=${c.lapsed} margin=${c.marginMin}min` +
        (staleMin === null ? " state=not configured" : ` state=${staleMin === Infinity ? "unreadable" : staleMin + "min old"}`));

    if (c.lapsed) {
      /* past saving from here. say exactly what fixes it rather than just
         that something is wrong. */
      fail(`agent ${AGENT_ID} HAS LAPSED. beat() reverts now, so restarting the agent will not fix it. ` +
           `the cold key must call setLimits to open a new window.`);
    } else if (!c.trusted) {
      fail(`agent ${AGENT_ID} is not trusted. the switch says: ${c.why}`);
    } else {
      const wedged = staleMin !== null && staleMin > STATE_STALE_MIN;
      if (c.marginMin < RESTART_UNDER_MIN || wedged) {
        const because = wedged ? `its state file is ${staleMin === Infinity ? "unreadable" : staleMin + "min old"}` : `the margin is down to ${c.marginMin}min`;
        log(`restarting the agent so it beats: ${because}`);
        if (await restartAgent()) {
          await new Promise(r => setTimeout(r, 45000));
          const after = await chain();
          if (after.marginMin > c.marginMin) log(`recovered, margin now ${after.marginMin}min`);
          else fail(`restarted ${UNIT} but the margin did not move, still ${after.marginMin}min`);
        }
      }
    }
  }

  /* the rest of what a judge touches. a 200 here is not proof the page is
     right, only that it answers, which is the failure worth paging about. */
  for (const p of ["/", "/demo", "/how", "/og.png"]) {
    const s = await http(p);
    if (s !== 200) fail(`${SITE}${p} answered ${s || "nothing"}`);
  }

  if (PKG) {
    try {
      const r = await fetch(`https://registry.npmjs.org/${PKG}/latest`, { signal: AbortSignal.timeout(20000) });
      if (!r.ok) fail(`npm ${PKG} answered ${r.status}, so the npx command in the docs is broken`);
    } catch { fail(`could not reach npm for ${PKG}`); }
  }

  if (problems.length === 0) { log("all clear"); return; }

  if (WEBHOOK) {
    /* a plain json body, which slack, discord and most webhook receivers all
       accept as "content" or "text". failing to alert is itself worth logging
       rather than swallowing. */
    const text = `trustset watchdog: ${problems.length} problem(s)\n` + problems.map(p => "- " + p).join("\n");
    try {
      await fetch(WEBHOOK, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, content: text }),
        signal: AbortSignal.timeout(15000),
      });
    } catch (e) { log("could not deliver the webhook:", e.message); }
  }
  process.exit(1);
}

main().catch(e => { log("fatal:", e?.message || e); process.exit(2); });
