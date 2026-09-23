import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";

export const dynamic = "force-dynamic";

export type ChainCfg = {
  source: "monad-testnet" | "anvil";
  chain: string;
  rpc: string;
  chainIdHex: string;
  explorer: string;
  killSwitch: string;
  humanTouch: string;
  venue: string;
  /* the labels contract. absent on a chain that was deployed before it existed. */
  labels?: string;
  /* sealed notes, the passkey encrypted runbook. absent before it was deployed. */
  notes?: string;
  /* Dynamic's environment id. public by design; it is read here, from env, so
     changing environments is not a rebuild. unset means no email sign-in. */
  dynamicEnvironmentId?: string;
  /* the refund rail and the mock dollar it was seeded with on testnet. */
  refunds?: string;
  mockUsd?: string;
  /* only the local demo has these: anvil's published default keys, so the
     console can act without a wallet. on testnet both are absent and every
     write goes through the reader's own wallet. */
  ownerKey?: string;
  agentPrivKey?: string;
};

/* the repo root, where deployments/ lives. settable because a service is
   started from wherever systemd put it, not from the web directory. */
const root = () => process.env.TRUSTSET_ROOT || join(process.cwd(), "..");

/* the local anvil demo, when it is asked for and actually answering. */
async function local(): Promise<ChainCfg | null> {
  try {
    const cfg = JSON.parse(await readFile(join(root(), "demo", "config.json"), "utf8"));
    const r = await fetch("http://127.0.0.1:8545", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }), signal: AbortSignal.timeout(1500) });
    if (!r.ok) return null;
    return { source: "anvil", chain: "Local anvil", rpc: "http://127.0.0.1:8545", chainIdHex: "0x7a69", explorer: "",
      killSwitch: cfg.killSwitch, humanTouch: cfg.humanTouch, venue: cfg.venue, ownerKey: cfg.ownerKey, agentPrivKey: cfg.agentPrivKey };
  } catch { return null; }
}

/* the deployed product. written by script/Testnet.s.sol. */
async function testnet(): Promise<ChainCfg | null> {
  try {
    const d = JSON.parse(await readFile(join(root(), "deployments", "monad-testnet.json"), "utf8"));
    return { source: "monad-testnet", chain: "Monad testnet", rpc: "https://testnet-rpc.monad.xyz", chainIdHex: "0x279f",
      explorer: "https://testnet.monadexplorer.com", killSwitch: d.killSwitch, humanTouch: d.humanTouch, venue: d.venue, labels: d.labels, notes: d.notes, refunds: d.refunds, dynamicEnvironmentId: process.env.DYNAMIC_ENVIRONMENT_ID || undefined, mockUsd: d.mockUsd };
  } catch { return null; }
}

export async function GET() {
  const cfg = process.env.NEXT_PUBLIC_CHAIN === "local" ? await local() : await testnet();
  if (!cfg) return NextResponse.json({ error: "no chain configured" }, { status: 404, headers: { "cache-control": "no-store" } });
  return NextResponse.json(cfg, { headers: { "cache-control": "no-store" } });
}
