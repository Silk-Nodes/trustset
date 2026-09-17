// run in the page: returns geometry facts the preferences file demands
(() => {
  const r = {};
  r.viewport = innerWidth + 'x' + innerHeight;
  r.noHorizontalScroll = document.documentElement.scrollWidth === document.documentElement.clientWidth;
  r.scrollWidth = document.documentElement.scrollWidth; r.clientWidth = document.documentElement.clientWidth;
  const btns = [...document.querySelectorAll('.btn, .theme')];
  r.buttonsWrap = btns.filter(b => b.getBoundingClientRect().height > 48).map(b => b.textContent.trim());
  const groups = ['.numbers > div', '.who > div', '.facts > div', '.prim'];
  r.rows = {};
  for (const g of groups) {
    const els = [...document.querySelectorAll(g)];
    const byTop = {};
    els.forEach(e => { const b = e.getBoundingClientRect(); const k = Math.round(b.top); (byTop[k] = byTop[k] || []).push(Math.round(b.bottom)); });
    r.rows[g] = Object.entries(byTop).map(([top, bottoms]) => ({ top: +top, n: bottoms.length, bottomsEqual: new Set(bottoms).size === 1 }));
  }
  const theme = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  r.theme = theme;
  const parse = c => { const m = c.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; };
  const bgc = parse(getComputedStyle(document.body).backgroundColor);
  const blend = c => ({ r: c.r * c.a + bgc.r * (1 - c.a), g: c.g * c.a + bgc.g * (1 - c.a), b: c.b * c.a + bgc.b * (1 - c.a) });
  const lum = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(c.r) + .7152 * f(c.g) + .0722 * f(c.b); };
  const Lbg = lum(bgc);
  const ratio = c => { const L = lum(blend(parse(c))); return ((Math.max(L, Lbg) + .05) / (Math.min(L, Lbg) + .05)).toFixed(2); };
  const sample = {};
  for (const sel of ['p', '.muted', '.label', 'a', '.btn.primary', 'h1', 'pre']) { const e = document.querySelector(sel); if (e) sample[sel] = ratio(getComputedStyle(e).color); }
  r.contrastVsBody = sample; r.body = bg;
  return r;
})();
