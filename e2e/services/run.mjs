/* the off-chain services against chains that misbehave on purpose.
 *
 * indexer: a mock chain serving the four logs that used to freeze it (an
 * 8004 id of 2^255, limits of 2^64-1, a label with a NUL byte, a label of
 * invalid utf-8), a link to another switch, and an agent that registers and
 * stakes in the same window. a throwaway postgres. it must index past all of
 * it, keep the stake, and come out the same after a replay.
 *
 * keeper: a mock rail with one refund that can never succeed and one that
 * can. it must never send the doomed one, and must send the good one.
 *
 * each runs the real file from the repo, copied beside a node_modules link so
 * it resolves its dependencies the same way. free ports only. */
import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, symlinkSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const MODULES = join(HERE, "..", "node_modules");
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.unref(); s.on("error", rej); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failed = 0;
const check = (ok, what) => { console.log(`  ${ok ? "✓" : "✘"} ${what}`); if (!ok) failed++; };
const has = cmd => { try { execFileSync("which", [cmd], { stdio: "ignore" }); return true; } catch { return false; } };

function sandbox(service, deployment) {
  const dir = mkdtempSync(join(tmpdir(), `trustset-${service}-`));
  mkdirSync(join(dir, service)); mkdirSync(join(dir, "deployments"));
  copyFileSync(join(ROOT, service, "index.mjs"), join(dir, service, "index.mjs"));
  if (service === "indexer") copyFileSync(join(ROOT, "indexer", "schema.sql"), join(dir, "indexer", "schema.sql"));
  symlinkSync(MODULES, join(dir, service, "node_modules"));
  writeFileSync(join(dir, "deployments", "monad-testnet.json"), JSON.stringify(deployment));
  return dir;
}

async function indexer() {
  console.log("indexer");
  if (!has("initdb") || !has("pg_ctl")) { console.log("  skipped: postgres (initdb, pg_ctl) is not installed"); return; }
  const dir = sandbox("indexer", { killSwitch: "0x1111111111111111111111111111111111111111", labels: "0x2222222222222222222222222222222222222222", venue: "0x3333333333333333333333333333333333333333", startBlock: 1000 });
  const rpcPort = await freePort(), pgPort = await freePort();
  const env = { ...process.env, LANG: "C", LC_ALL: "C" };
  execFileSync("initdb", ["-D", join(dir, "pg"), "-U", "ix", "--locale=C"], { env, stdio: "ignore" });
  execFileSync("pg_ctl", ["-D", join(dir, "pg"), "-o", `-p ${pgPort} -k '' -c listen_addresses=127.0.0.1`, "-l", join(dir, "pg.log"), "start", "-w"], { env, stdio: "ignore" });
  const mock = spawn("node", [join(HERE, "mock-indexer-rpc.mjs")], { env: { ...process.env, PORT: String(rpcPort) }, cwd: HERE, stdio: "ignore" });
  try {
    await sleep(800);
    const admin = new pg.Client({ host: "127.0.0.1", port: pgPort, user: "ix", database: "postgres" });
    await admin.connect(); await admin.query("CREATE DATABASE ix"); await admin.end();
    const url = `postgres://ix@127.0.0.1:${pgPort}/ix`;
    const run = () => execFileSync("node", [join(dir, "indexer", "index.mjs"), "--once"], { env: { ...process.env, DATABASE_URL: url, TRUSTSET_ROOT: dir, MONAD_RPC: `http://127.0.0.1:${rpcPort}` }, stdio: "ignore", timeout: 60_000 });
    const db = new pg.Client({ connectionString: url });
    run();
    await db.connect();
    const cursor = Number((await db.query("SELECT block FROM cursor")).rows[0]?.block ?? 0);
    check(cursor > 1100, `got past every poison log (cursor ${cursor})`);
    const a = (await db.query("SELECT expires_at, heartbeat_window, name, erc8004_id FROM agents WHERE id = 1")).rows[0];
    check(a && Number(a.expires_at) === Number.MAX_SAFE_INTEGER, "a uint64 end date is capped, not a crash");
    check(a && !a.name.includes("\u0000"), "a NUL byte is stripped from a label");
    check(a && Number(a.erc8004_id) === 9, "the link to this switch counts, the one to another switch and the 2^255 id do not");
    const staked = Number((await db.query("SELECT count(*) FROM events WHERE kind = 'Staked'")).rows[0].count);
    check(staked === 1, "a stake in the same window as the registration is kept");
    const before = JSON.stringify((await db.query("SELECT * FROM agents ORDER BY id")).rows);
    await db.query("UPDATE cursor SET block = 1000");
    run();
    check(JSON.stringify((await db.query("SELECT * FROM agents ORDER BY id")).rows) === before, "replaying the whole range leaves the state the same");
    await db.end();
  } finally {
    mock.kill();
    try { execFileSync("pg_ctl", ["-D", join(dir, "pg"), "stop", "-m", "fast"], { env, stdio: "ignore" }); } catch { /* already down */ }
  }
}

async function keeper() {
  console.log("keeper");
  const dir = sandbox("keeper", { refunds: "0x00000000000000000000000000000000000000aa" });
  const port = await freePort();
  let sent = [];
  const mock = spawn("node", [join(HERE, "mock-keeper-rpc.mjs")], { env: { ...process.env, PORT: String(port) }, cwd: HERE });
  mock.stdout.on("data", d => { const m = String(d).match(/SENT (\[.*\])/g); if (m) sent = JSON.parse(m[m.length - 1].slice(5)); });
  await sleep(800);
  /* a throwaway key: the mock chain accepts any signature */
  const k = spawn("node", [join(dir, "keeper", "index.mjs")], { env: { ...process.env, TRUSTSET_ROOT: dir, KEEPER_STATE: join(dir, "state.json"), KEEPER_KEY: "0x" + "1".repeat(64), MONAD_RPC: `http://127.0.0.1:${port}`, SWEEP_SECONDS: "2" }, stdio: "ignore" });
  await sleep(14_000);
  k.kill(); mock.kill();
  check(!sent.includes(1), `never sends the refund that cannot land (sent ${JSON.stringify(sent)})`);
  check(sent.includes(2), "sends the refund that can");
  const st = JSON.parse(readFileSync(join(dir, "state.json"), "utf8"));
  check((st.failing?.["1"]?.n ?? 0) >= 3, "the doomed refund is left alone after three failures");
}

await indexer();
await keeper();
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
