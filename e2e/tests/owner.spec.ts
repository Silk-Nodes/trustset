/* the owner's whole flow, on a fresh local chain. every step checks the page
   and then the contract, because the page saying it happened is not the
   same as it happening. runs in order: later steps use what earlier ones made */
import { test, expect, type Page } from "@playwright/test";
import { ethers } from "ethers";
import { agent, consent, ks, provider } from "./chain";

test.describe.configure({ mode: "serial" });
const base = () => process.env.E2E_BASE!;
const owner = () => new ethers.Wallet(process.env.E2E_OWNER_KEY!).address;
/* the breaker in the open agent's panel, not the one in its fleet row */
const panelSwitch = (page: Page) => page.locator("article").getByRole("button", { name: /^(pause|bring) /i }).first();

test("the console lists the owner's three demo agents from the chain", async ({ page }) => {
  await page.goto(base() + "/agents");
  for (const id of [1, 2, 3]) await expect(page.getByText(new RegExp(`AGENT ${id}\\b`, "i")).first()).toBeVisible();
});

test("a tap answers at once, then the receipt, then the chain agrees", async ({ page }) => {
  await page.goto(base() + "/agents/1");
  const sw = panelSwitch(page);
  await expect(sw).toHaveAttribute("aria-pressed", "true");
  const t = Date.now();
  await sw.click();
  /* the switch is already thrown, before anything is signed or sent */
  await expect(sw).toHaveAttribute("aria-pressed", "false", { timeout: 1000 });
  const answered = Date.now() - t;
  expect(answered, `the switch moved ${answered}ms after the tap`).toBeLessThan(600);
  await expect(page.getByText(/Paused at block [\d,]+/)).toBeVisible();
  expect((await agent(1)).status).toBe("paused");
});

test("bringing it back says so from the receipt, and the chain agrees", async ({ page }) => {
  await page.goto(base() + "/agents/1");
  const sw = panelSwitch(page);
  await expect(sw).toHaveAttribute("aria-pressed", "false");
  await sw.click();
  await expect(sw).toHaveAttribute("aria-pressed", "true", { timeout: 1000 });
  await expect(page.getByText(/Back on at block [\d,]+/)).toBeVisible();
  expect((await agent(1)).status).toBe("active");
});

test("set both keeps the end date when only the heartbeat changes", async ({ page }) => {
  const before = await agent(2);
  expect(before.expiresAt, "the demo gives agent 2 an end date").toBeGreaterThan(0);
  await page.goto(base() + "/agents/2");
  await page.getByRole("button", { name: /^Limits/ }).first().click();
  await expect(page.getByLabel("Trusted until")).toHaveValue("-1");
  await page.getByLabel("Must report every").selectOption({ label: "1 hour" });
  await page.getByRole("button", { name: "Set both" }).click();
  await expect.poll(async () => (await agent(2)).heartbeatWindow, { timeout: 20_000 }).toBe(3600);
  expect((await agent(2)).expiresAt, "the end date was kept").toBe(before.expiresAt);
});

test("escape during a hold to stop cancels it, and nothing is sent", async ({ page }) => {
  await page.goto(base() + "/agents/3");
  const sw = panelSwitch(page);
  await sw.focus();
  await page.keyboard.down(" ");
  await page.waitForTimeout(700);
  await page.keyboard.press("Escape");
  await page.keyboard.up(" ");
  await page.waitForTimeout(2500);
  expect((await agent(3)).status, "a cancelled hold must not stop the agent").not.toBe("revoked");
});

test("an unbroken hold stops the agent for good", async ({ page }) => {
  await page.goto(base() + "/agents/3");
  const sw = panelSwitch(page);
  await sw.focus();
  await page.keyboard.down(" ");
  await page.waitForTimeout(2400);
  await page.keyboard.up(" ");
  await expect.poll(async () => (await agent(3)).status, { timeout: 20_000 }).toBe("revoked");
  await expect(page.getByText(/locked out for good/i)).toBeVisible();
});

let newId = 0n;
const guardian = () => new ethers.Wallet(process.env.E2E_AUTH1_KEY!).address;
test("registering an agent through the dialog, with its consent and a guardian", async ({ page }) => {
  const agentWallet = ethers.Wallet.createRandom();
  const sig = await consent(agentWallet, owner());
  const before = Number(await ks().agentCount());
  await page.goto(base() + "/agents");
  await page.getByRole("button", { name: /register/i }).first().click();
  const d = page.getByRole("dialog", { name: "Register an agent" });
  await d.getByPlaceholder("0x…").first().fill(agentWallet.address);
  await d.getByPlaceholder(/signature/).fill(sig);
  await expect(d.getByText("Signed by that agent, for this owner.")).toBeVisible();
  await d.getByRole("button", { name: "Continue" }).click();
  await d.getByPlaceholder("Treasury sweeper").fill("e2e agent");
  await d.getByRole("button", { name: "Continue" }).click();
  await d.getByPlaceholder(/0x/).first().fill(guardian());
  await d.getByRole("button", { name: /^Add/ }).click();
  await d.getByRole("button", { name: "Continue" }).click();
  await d.getByRole("button", { name: "Register" }).click();
  await expect.poll(async () => Number(await ks().agentCount()), { timeout: 30_000 }).toBe(before + 1);
  newId = BigInt(before + 1);
  const a = await agent(newId);
  expect(a.owner.toLowerCase()).toBe(owner().toLowerCase());
  expect(a.guardians.map(g => g.toLowerCase())).toContain(guardian().toLowerCase());
  await expect(page.getByText(new RegExp(`AGENT ${newId}\\b`, "i")).first()).toBeVisible();
});

test("a guardian's pause shows as a trip on the owner's console", async ({ page }) => {
  expect(newId, "needs the agent registered above").toBeGreaterThan(0n);
  const g = new ethers.Wallet(process.env.E2E_AUTH1_KEY!, provider());
  await (await ks(g).guardianPause(newId)).wait();
  expect(await ks().guardianPaused(newId)).toBe(true);
  await page.goto(base() + `/agents/${newId}`);
  /* read from the chain's guardianPaused, not from an index this chain has not got */
  await expect(panelSwitch(page)).toHaveAttribute("data-state", "tripped", { timeout: 20_000 });
});
