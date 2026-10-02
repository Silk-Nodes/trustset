/* the deployed site, read only. what a judge opens, checked the way it has
   been checked by hand: every page answers, nothing errors, the security
   policy blocks nothing of ours, no sideways scroll, no label broken over two
   lines, text at 4.5:1 or better, in both themes at three widths */
import { test, expect, type Page } from "@playwright/test";
import { ethers } from "ethers";

const PAGES = ["/", "/demo", "/agents", "/agents/guarding", "/explorer", "/how", "/faq", "/panic?id=24", "/passkey"];
const WIDTHS = [393, 768, 1400];

async function measure(page: Page) {
  return page.evaluate(() => {
    const d = document.documentElement;
    /* a label is broken when one run of its text sits on more than one line */
    const broken: string[] = [];
    for (const b of document.querySelectorAll("button, a.drawn-btn")) {
      if (!(b as HTMLElement).offsetParent) continue;
      const w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        if (!n.textContent?.trim()) continue;
        const r = document.createRange(); r.selectNodeContents(n);
        const lines = new Set([...r.getClientRects()].map(x => Math.round(x.top)));
        if (lines.size > 1) broken.push(n.textContent.trim().slice(0, 30));
      }
    }
    const lum = (c: number[]) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
    /* rgb() is 0 to 255; color(srgb ...) is 0 to 1, and alpha is 0 to 1 in both */
    const rgb = (s: string) => { const v = (s.match(/[\d.]+/g) || []).map(Number); return s.startsWith("color(") ? [v[0] * 255, v[1] * 255, v[2] * 255, ...(v.length > 3 ? [v[3]] : [])] : v; };
    const bgOf = (el: Element) => { for (let n: Element | null = el; n; n = n.parentElement) { const c = rgb(getComputedStyle(n).backgroundColor); if (c.length >= 3 && (c[3] === undefined || c[3] > 0.95)) return c; } return rgb(getComputedStyle(document.body).backgroundColor); };
    const low: string[] = [];
    for (const el of document.querySelectorAll("body *")) {
      const h = el as HTMLElement;
      if (!h.offsetParent || h.closest("[aria-hidden=true]")) continue;
      if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent!.trim())) continue;
      const cs = getComputedStyle(h);
      let o = 1; for (let n: HTMLElement | null = h; n; n = n.parentElement) { const v = parseFloat(getComputedStyle(n).opacity); o *= isNaN(v) ? 1 : v; }
      if (o < 0.99) continue; /* a faded state (disabled, loading) is not reading text */
      const fg = rgb(cs.color); if ((fg[3] ?? 1) < 0.99) continue;
      const a = lum(fg), b = lum(bgOf(el)); const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      const size = parseFloat(cs.fontSize), bold = Number(cs.fontWeight) >= 700;
      const need = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
      if (ratio < need) low.push(`${ratio.toFixed(2)} "${h.textContent!.trim().slice(0, 24)}"`);
    }
    return { sideways: d.scrollWidth - d.clientWidth, broken: [...new Set(broken)], low: [...new Set(low)].slice(0, 6) };
  });
}

for (const path of PAGES) {
  test(`${path} answers, with no errors and nothing blocked`, async ({ page }) => {
    const errors: string[] = [];
    page.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 160)); if (/Content Security Policy/.test(m.text())) errors.push("CSP " + m.text().slice(0, 140)); });
    page.on("pageerror", e => errors.push(e.message.slice(0, 160)));
    const r = await page.goto(path, { waitUntil: "networkidle" });
    expect(r?.status()).toBe(200);
    await page.waitForTimeout(1500);
    expect(errors).toEqual([]);
  });
  for (const w of WIDTHS) for (const theme of ["light", "dark"]) {
    test(`${path} at ${w} in ${theme}: no sideways scroll, no broken labels, readable text`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 900 });
      await page.goto(path, { waitUntil: "networkidle" });
      await page.evaluate(t => { document.documentElement.dataset.theme = t; }, theme);
      await page.waitForTimeout(700);
      const m = await measure(page);
      expect(m.sideways, "sideways scroll in px").toBe(0);
      expect(m.broken, "button labels broken over two lines").toEqual([]);
      expect(m.low, "text under 4.5:1 (3:1 when large)").toEqual([]);
    });
  }
}

test("the explorer's verdict matches the chain for a trusted, a stopped and a lapsed agent", async ({ page }) => {
  const p = new ethers.JsonRpcProvider("https://testnet-rpc.monad.xyz", undefined, { staticNetwork: true });
  const d = await (await fetch(new URL("/api/chain", test.info().project.use.baseURL!).toString())).json();
  const ks = new ethers.Contract(d.killSwitch, ["function liveness(uint256) view returns (bool trusted, bool expired, bool lapsed, uint64, uint64)", "function getAgent(uint256) view returns (tuple(address,address,address,uint64,uint8,uint8 status,uint64,uint256,bytes32,uint64,uint64,uint64,address[]))"], p);
  for (const id of [24, 1, 7]) {
    const [l, a] = await Promise.all([ks.liveness(id), ks.getAgent(id)]);
    const status = Number(a[5]);
    const want = l[0] ? "Trusted" : status === 3 ? "Stopped" : status === 4 ? "Rotated" : status === 2 ? "Paused" : l[1] ? "Expired" : "Gone quiet";
    await page.goto(`/explorer/${id}`, { waitUntil: "networkidle" });
    await expect(page.locator("span.text-\\[28px\\]").first(), `agent ${id}`).toHaveText(want, { timeout: 20_000 });
  }
});
