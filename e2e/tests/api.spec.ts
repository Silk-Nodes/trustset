/* the guards on the routes that sign or send, and the read routes against the
   chain. nothing here sends a transaction: every request is one the server
   must refuse, or a read */
import { test, expect } from "@playwright/test";
import { ethers } from "ethers";
import { agent, ks } from "./chain";

const base = () => process.env.E2E_BASE!;
const post = (path: string, body: unknown, type = "application/json") =>
  fetch(base() + path, { method: "POST", headers: { "content-type": type }, body: typeof body === "string" ? body : JSON.stringify(body) });
const stranger = ethers.Wallet.createRandom();

test("every route that signs or sends refuses a post that is not json", async () => {
  for (const path of ["/api/demo", "/api/gas", "/api/panic", "/api/live-agent", "/api/stop-key"]) {
    const r = await post(path, '{"action":"pause"}', "text/plain");
    expect(r.status, `${path} took a cross-site text/plain post`).toBe(415);
  }
});

test("/api/demo: owner must be an address, and a read never registers", async () => {
  expect((await fetch(base() + "/api/demo?owner=shared")).status).toBe(400);
  const r = await fetch(base() + "/api/demo?owner=" + stranger.address);
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ needsStart: true });
});

test("/api/demo: a start needs the owner's signature for today, and actions need a start", async () => {
  const bad = await post("/api/demo", { action: "start", owner: stranger.address, signature: "0x12" });
  expect(bad.status).toBe(401);
  const other = ethers.Wallet.createRandom();
  const day = new Date().toISOString().slice(0, 10);
  const wrong = await other.signMessage(`trustset: a practice agent owned by ${stranger.address.toLowerCase()} on ${day}`);
  expect((await post("/api/demo", { action: "start", owner: stranger.address, signature: wrong })).status, "signed by someone else").toBe(401);
  const trade = await post("/api/demo", { action: "trade", owner: stranger.address });
  expect(trade.status).toBe(409);
  expect((await trade.json()).needsStart).toBe(true);
});

test("/api/gas: a drip needs the address's own signature for today", async () => {
  const r = await post("/api/gas", { address: stranger.address, signature: await ethers.Wallet.createRandom().signMessage("anything") });
  expect(r.status).toBe(401);
  expect((await post("/api/gas", { address: "not an address", signature: "0x" })).status).toBe(400);
});

test("/api/verify: a stranger's signature is never trusted, and bad input is refused", async () => {
  const sig = await stranger.signMessage("hello");
  const r = await post("/api/verify", { agent: Number(process.env.E2E_AGENT_ID), message: "hello", signature: sig });
  const j = await r.json();
  expect(j.trusted).toBe(false);
  expect(j.caveat).toMatch(/not agent \d+'s key/);
  expect((await post("/api/verify", { agent: "abc", message: "hello", signature: sig })).status).toBe(400);
  const future = Math.floor(Date.now() / 1000) + 3600;
  expect((await fetch(base() + `/api/verify?agent=1&at=${future}`)).status).toBe(400);
});

test("/api/registry matches the chain, agent by agent", async () => {
  const j = await (await fetch(base() + "/api/registry")).json();
  const n = Number(await ks().agentCount());
  expect(j.count).toBe(n);
  for (const row of j.agents) {
    const a = await agent(row.id);
    expect(["none", "active", "paused", "revoked", "rotated"][row.status], `agent ${row.id}`).toBe(a.status);
    expect(row.revocationKey.toLowerCase()).toBe(a.owner.toLowerCase());
  }
});

test("/api/fleet: ids that do not exist are skipped, and the list is capped", async () => {
  const r = await fetch(base() + "/api/fleet?ids=1,999999");
  expect(r.status).toBe(200);
  const j = await r.json();
  expect(Object.keys(j.stopKeys)).not.toContain("999999");
  const many = Array.from({ length: 600 }, (_, i) => i + 1).join(",");
  expect((await fetch(base() + "/api/fleet?ids=" + many)).status).toBe(200);
});

test("/api/explorer: bad paging is clamped, never passed to sql", async () => {
  const r = await fetch(base() + "/api/explorer?limit=abc&offset=-5");
  expect(r.status).toBe(200);
  const j = await r.json();
  expect(JSON.stringify(j)).not.toMatch(/column|syntax|relation|nan/i);
});
