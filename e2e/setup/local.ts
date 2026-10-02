/* the local stack for the owner and api tests: a fresh anvil on a free port,
 * the contracts deployed by script/Demo.s.sol, and a next dev server on
 * another free port pointed at it. nothing here touches testnet or the
 * developer's own dev server: its own ports, its own build directory, its own
 * deployment file in a temp directory.
 *
 * the keys are anvil's published test keys, the same ones Demo.s.sol uses. */
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const KEYS = {
  owner: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  auth1: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  auth2: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  agent: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
};

const freePort = () => new Promise<number>((res, rej) => {
  const s = createServer(); s.unref(); s.on("error", rej);
  s.listen(0, "127.0.0.1", () => { const a = s.address(); s.close(() => res(typeof a === "object" && a ? a.port : 0)); });
});
const until = async (what: string, ok: () => Promise<boolean>, ms: number) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await ok().catch(() => false)) return; await new Promise(r => setTimeout(r, 300)); }
  throw new Error(`e2e setup: ${what} did not come up within ${ms / 1000}s`);
};

const procs: ChildProcess[] = [];
export default async function setup() {
  if (process.env.E2E_SKIP_LOCAL) return;
  const anvilPort = await freePort(), webPort = await freePort();
  const rpc = `http://127.0.0.1:${anvilPort}`;
  /* finalized stays at 0 for two thousand blocks, so the console reads the
     latest block, which is right for a chain that mines on every send */
  procs.push(spawn("anvil", ["--hardfork", "prague", "--port", String(anvilPort), "--slots-in-an-epoch", "1000", "--silent"], { stdio: "ignore" }));
  await until("anvil", async () => (await fetch(rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }) })).ok, 15_000);

  execFileSync("forge", ["script", "script/Demo.s.sol:Demo", "--rpc-url", rpc, "--broadcast", "-q"], { cwd: ROOT, stdio: "ignore" });
  const a = JSON.parse(readFileSync(join(ROOT, "demo", "addresses.json"), "utf8"));
  const dir = mkdtempSync(join(tmpdir(), "trustset-e2e-"));
  const cfgPath = join(dir, "config.json");
  writeFileSync(cfgPath, JSON.stringify({ ...a, ownerKey: KEYS.owner, agentPrivKey: KEYS.agent, auth1Key: KEYS.auth1, auth2Key: KEYS.auth2 }, null, 1));

  const env = { ...process.env, NEXT_PUBLIC_CHAIN: "local", LOCAL_RPC: rpc, LOCAL_DEMO_CONFIG: cfgPath, NEXT_DIST_DIR: ".next-e2e", TRUSTSET_ROOT: ROOT, NEXT_TELEMETRY_DISABLED: "1" };
  procs.push(spawn("npx", ["next", "dev", "--port", String(webPort)], { cwd: join(ROOT, "web"), env, stdio: "ignore", detached: true }));
  /* localhost, not 127.0.0.1: next 16 refuses its dev scripts to any other
     origin, and the page then never hydrates */
  const base = `http://localhost:${webPort}`;
  await until("the site on the local chain", async () => {
    const r = await fetch(`${base}/api/chain`); if (!r.ok) return false;
    return (await r.json()).source === "anvil";
  }, 120_000);

  Object.assign(process.env, { E2E_BASE: base, E2E_RPC: rpc, E2E_KILLSWITCH: a.killSwitch, E2E_OWNER_KEY: KEYS.owner, E2E_AUTH1_KEY: KEYS.auth1, E2E_AGENT_ID: String(a.agentId) });
  return async () => { for (const p of procs) { try { if (p.pid) process.kill(-p.pid); } catch { /* not a group */ } try { p.kill(); } catch { /* gone */ } } };
}
