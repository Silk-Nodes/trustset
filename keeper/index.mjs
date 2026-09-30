/* the refund keeper.
 *
 * the rail is permissionless: once a payment's window closes, refund(id) may be
 * called by anybody, and the money goes to the payer rather than to whoever
 * called it. that makes it safe for a stranger to press, and it also means
 * nothing happens until a stranger does. a deadline passing moves no money on
 * its own. permissionless is not self executing, and a payer who has closed the
 * tab is a payer whose refund is sitting there waiting for a transaction nobody
 * has sent.
 *
 * so this sends it. it watches for payments whose window has closed while they
 * are still open, and calls refund. it is a convenience and not an authority:
 * the payer can always call refund themselves, every payment it touches would
 * have been refundable without it, and if this process is off the only thing
 * lost is promptness.
 *
 * on the key it holds. refund() takes no argument but an id and pays the payer
 * named in storage, so this key cannot direct money anywhere, cannot settle,
 * cannot pay, and cannot touch a payment whose window is still open. the worst
 * a stolen keeper key can do is return other people's money on time and pay the
 * gas for it. that is the whole reason a keeper is an acceptable thing to run:
 * not because we are trusted, but because the contract never asks anyone to
 * trust us.
 */
import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.TRUSTSET_ROOT || join(HERE, "..");
const STATE = process.env.KEEPER_STATE || join(ROOT, ".keeper-state.json");
const SWEEP_MS = Number(process.env.SWEEP_SECONDS || 60) * 1000;
/* monad charges the whole gas limit rather than the gas used, so the limit is
   estimated per call. this is only the fallback for when an estimate cannot be
   had, and it is deliberately close to the real cost. */
const REFUND_GAS = 120000n;
/* a refund whose transaction never shows up must not hold the sweep */
const WAIT_MS = 120_000;
/* the public rpc allows about fifteen reads a second; the sweep keeps well under */
const READ_GAP_MS = 150;
/* a refund that fails this many sweeps in a row, for a reason other than the
   window, is left alone. monad charges the whole gas limit even on a revert,
   so a payer that refuses the money used to cost a full refund every minute,
   forever. it is logged once and retried after a day in case it was the rpc. */
const GIVE_UP = 3;
const RETRY_AFTER_MS = 24 * 3600_000;

const RAIL = [
  "function count() view returns (uint256)",
  "function get(uint256) view returns (tuple(address payer,address service,address token,uint256 amount,uint64 deadline,bytes32 requestHash,uint8 state))",
  "function refundable(uint256) view returns (bool)",
  "function refund(uint256)",
  "error NotOpen()", "error NotYet()",
];
const OPEN = 1;

const log = (...a) => console.log(new Date().toISOString(), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* the lowest id that might still be open. every id below it is settled or
   refunded, and those are terminal, so they never need looking at again. without
   this the sweep is O(every payment ever) on every tick. */
async function loadState() {
  try { const s = JSON.parse(await readFile(STATE, "utf8")); return { from: Number(s.from) || 1, failing: s.failing ?? {} }; }
  catch { return { from: 1, failing: {} }; }
}
async function saveState(from, failing, extra = {}) {
  try { await writeFile(STATE, JSON.stringify({ from, failing, at: new Date().toISOString(), ...extra }, null, 1)); }
  catch (e) { log("could not write state:", e.message); }
}

async function main() {
  const d = JSON.parse(await readFile(join(ROOT, "deployments", "monad-testnet.json"), "utf8"));
  const key = process.env.KEEPER_KEY;
  if (!key) throw new Error("KEEPER_KEY is not set. It signs refund() and nothing else.");

  const provider = new ethers.JsonRpcProvider(process.env.MONAD_RPC || "https://testnet-rpc.monad.xyz", undefined, { staticNetwork: true });
  const wallet = new ethers.Wallet(key, provider);
  const rail = new ethers.Contract(d.refunds, RAIL, wallet);

  log(`keeper · ${wallet.address} · rail ${d.refunds} · sweeping every ${SWEEP_MS / 1000}s`);
  const bal = await provider.getBalance(wallet.address);
  if (bal === 0n) log("WARNING: this key holds no MON, so every refund will fail to send");

  let { from, failing } = await loadState();
  /* settled and refunded are for good. one thirty day payment holds the cursor
     low, and every later id used to be read again every sweep; the ones already
     finished are remembered and skipped */
  const finished = new Set();

  for (;;) {
    try {
      const count = Number(await rail.count());
      let lowestOpen = 0, due = 0, sent = 0;

      for (let id = from; id <= count; id++) {
        if (finished.has(id)) continue;
        let p;
        await sleep(READ_GAP_MS);
        try { p = await rail.get(id); }
        catch (e) { log(`id ${id}: could not read, ${e.shortMessage ?? e.message}`); lowestOpen ||= id; continue; }

        /* decoded positionally. ethers' Result is an array first, so a field
           named `state` or `deadline` can collide with Array.prototype and
           arrive as undefined. this has bitten this codebase three times. */
        const state = Number(p[6]);
        if (state !== OPEN) { finished.add(id); continue; }      // settled or refunded, terminal
        lowestOpen ||= id;                 // the first still-open id we saw

        const deadline = Number(p[4]);
        if (Math.floor(Date.now() / 1000) < deadline) continue;  // window still open
        due++;

        const f = failing[id];
        if (f && f.n >= GIVE_UP && Date.now() - f.at < RETRY_AFTER_MS) continue;
        const failed = (why) => {
          const n = (failing[id]?.n ?? 0) + 1;
          failing[id] = { n, at: Date.now(), why: String(why).slice(0, 120) };
          if (n === GIVE_UP) log(`id ${id}: failed ${n} times, leaving it for a day. last: ${failing[id].why}`);
        };

        try {
          /* ask first, for free. a refund the chain would revert is not sent:
             a revert still costs the whole gas limit here */
          try { await rail.refund.staticCall(id); }
          catch (e) {
            const m = e.shortMessage ?? e.message ?? String(e);
            if (/NotOpen/.test(m)) { log(`id ${id}: settled before we got there`); continue; }
            if (e.code === "CALL_EXCEPTION") { failed(m); log(`id ${id}: would revert, not sent: ${m.slice(0, 100)}`); continue; }
            throw e;
          }
          let gasLimit;
          /* the fallback is for a transport error only; a revert was caught above */
          try { gasLimit = ((await rail.refund.estimateGas(id)) * 12n) / 10n; }
          catch { gasLimit = REFUND_GAS; }
          const tx = await rail.refund(id, { gasLimit });
          /* waitForTransaction rather than tx.wait: a reverted receipt makes
             wait() throw, which loses the hash of the thing that failed. a
             timeout moves on to the next id; the next sweep sees the result. */
          const rc = await provider.waitForTransaction(tx.hash, 1, WAIT_MS).catch(() => null);
          if (rc?.status === 1) { sent++; delete failing[id]; log(`refunded ${id} to ${p[0]} · block ${rc.blockNumber} · ${tx.hash}`); }
          else if (rc) { failed("reverted"); log(`refund ${id} REVERTED · ${tx.hash}`); }
          else log(`refund ${id} sent, no receipt within ${WAIT_MS / 1000}s · ${tx.hash}`);
        } catch (e) {
          /* a race with settle() is the ordinary case, not a fault: the service
             produced a receipt between the read and the send, and the payment
             is no longer ours to refund. */
          const m = e.shortMessage ?? e.message ?? String(e);
          log(/NotOpen/.test(m) ? `id ${id}: settled before we got there` : `id ${id}: ${m.slice(0, 140)}`);
        }
      }

      /* nothing open at all means the next sweep can start after the last id. */
      const next = lowestOpen || count + 1;
      if (next !== from) { from = next; }
      /* ids that are no longer open have nothing left to fail */
      for (const k of Object.keys(failing)) if (Number(k) < from) delete failing[k];
      for (const k of finished) if (k < from) finished.delete(k);
      await saveState(from, failing, { count, due, sent });
      if (due || sent) log(`swept ${from}..${count} · ${due} due · ${sent} refunded`);
    } catch (e) {
      log("sweep failed:", e.shortMessage ?? e.message);
    }
    await sleep(SWEEP_MS);
  }
}

main().catch((e) => { log("fatal:", e.message); process.exit(1); });
