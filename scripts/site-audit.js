// A site audit that runs inside the page and returns findings, not opinions.
//
// The old scripts/layout-audit.js came from another project: it looks for
// .btn and .numbers > div, which do not exist here, so it reported nothing
// and reported it confidently. It also parsed colours with a regex, which is
// the thing that produced three false alarms in one afternoon: a 1.06 for
// text that was really 8.38 because the colour was oklab(), a 1.08 because
// the ground was a 75% glass panel, a 3.01 that was real. A number you cannot
// trust is worse than no number, because you go and "fix" working code.
//
// So colour is resolved by painting it, which handles every colour space the
// browser supports, and the ground is the whole ancestor background stack
// composited in order rather than the first opaque one found.
//
// Usage: paste the IIFE into the page, or run window.__audit() after it.
(() => {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 1;
  const cx = cv.getContext("2d", { willReadFrequently: true });

  /* paint a colour over what is already there and read the result back, so
     oklab(), color(srgb …), rgba() and named colours all come back as plain
     bytes with the alpha already composited. */
  const paint = (c) => { cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); };
  const read = () => [...cx.getImageData(0, 0, 1, 1).data].slice(0, 3);
  const reset = () => { cx.clearRect(0, 0, 1, 1); };

  const lum = ([r, g, b]) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const contrast = (fg, bg) => {
    const a = lum(fg), b = lum(bg);
    return +(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2));
  };

  const pageBg = () => getComputedStyle(document.documentElement).getPropertyValue("--bg-base").trim() || "#fff";

  /* every background from the page down to the element, composited in order.
     a single "first opaque ancestor" is wrong whenever a translucent panel
     sits on another, which is most of this site. */
  function ground(el) {
    const stack = [];
    for (let n = el; n; n = n.parentElement) {
      const bg = getComputedStyle(n).backgroundColor;
      if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") stack.unshift(bg);
    }
    reset(); paint(pageBg());
    for (const bg of stack) paint(bg);
    return read();
  }

  /* opacity is inherited down the tree and applies to the element's own
     background as well as its text, so a row faded to 55% is darker text on a
     lighter ground, not just lighter text. */
  function inheritedOpacity(el) {
    let o = 1;
    for (let n = el; n; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity) || 1;
    return o;
  }

  /* only elements that themselves render text. a wrapper whose text comes
     entirely from children would be measured with the wrong colour. */
  const hasOwnText = (el) =>
    [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);

  /* aria-hidden anywhere up the tree is the author saying this is decoration,
     not content. the 371px "trustset" watermark in the footer sits at 1.46:1
     on purpose and its parent already says so; auditing it produces a finding
     on every page that nobody should ever act on. */
  const decorative = (el) => {
    for (let n = el; n; n = n.parentElement) if (n.getAttribute?.("aria-hidden") === "true") return true;
    return false;
  };

  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  const label = (el) => el.textContent.trim().replace(/\s+/g, " ").slice(0, 44);

  function textFindings() {
    const out = [];
    for (const el of document.querySelectorAll("main *, footer *, header *")) {
      if (!hasOwnText(el) || !visible(el) || decorative(el)) continue;
      const cs = getComputedStyle(el);
      /* transparent text is a layout placeholder holding a column's width
         until its label arrives, and a contrast ratio against it is
         meaningless. worth its own note, because a screen reader still reads
         it, but it is not a contrast failure. */
      if (cs.color === "rgba(0, 0, 0, 0)" || cs.color === "transparent") {
        if (!el.closest("[aria-hidden='true']")) out.push({ kind: "invisible-text-still-announced", text: label(el) });
        continue;
      }
      const o = inheritedOpacity(el);
      /* below this an element is mid-animation rather than dim by choice.
         a looping hero cycles rows through low opacities and reporting a
         frame of one is reporting the clock, not the design. */
      if (o < 0.15) continue;

      let g = ground(el);
      if (o < 1) { reset(); paint(pageBg()); paint(`rgba(${g.join(",")},${o})`); g = read(); }

      reset(); paint(`rgb(${g.join(",")})`);
      paint(cs.color);
      if (o < 1) { const f = read(); reset(); paint(`rgb(${g.join(",")})`); paint(`rgba(${f.join(",")},${o})`); }
      const fg = read();

      const size = parseFloat(cs.fontSize);
      const bold = parseInt(cs.fontWeight, 10) >= 700;
      const large = size >= 24 || (size >= 18.66 && bold);
      const min = large ? 3 : 4.5;
      /* an inactive control is exempt from the contrast minimum, and a dimmed
         disabled button on every page drowns out the findings that matter. it
         is still recorded, under its own kind, so it can be looked at. */
      const btn = el.closest("button, [role=button]");
      const off = btn && (btn.disabled || btn.getAttribute("aria-disabled") === "true");
      const ratio = contrast(fg, g);
      if (off) { if (ratio < min) out.push({ kind: "disabled-control-faint", ratio, text: label(el) }); continue; }
      if (ratio < min) out.push({ kind: "contrast", ratio, min, size: +size.toFixed(1), opacity: +o.toFixed(2), text: label(el), fg: `rgb(${fg})`, ground: `rgb(${g})`, declared: cs.color, tag: el.tagName });
    }
    return out;
  }

  function layoutFindings() {
    const out = [];
    const de = document.documentElement;
    if (de.scrollWidth > de.clientWidth) {
      out.push({ kind: "horizontal-scroll", scrollWidth: de.scrollWidth, clientWidth: de.clientWidth });
      /* name the widest offender, because "the page scrolls" is not actionable */
      let worst = null;
      for (const el of document.querySelectorAll("body *")) {
        const r = el.getBoundingClientRect();
        if (r.right > de.clientWidth + 1 && (!worst || r.right > worst.right)) {
          worst = { right: Math.round(r.right), text: label(el), tag: el.tagName + "." + (typeof el.className === "string" ? el.className.split(" ")[0] : "") };
        }
      }
      if (worst) out.push({ kind: "overflowing-element", ...worst });
    }

    /* a label wraps when its own text spans more than one line box. height
       alone is wrong: the feature tabs are 64px because they hold an icon row
       and a progress rule, and a tall control is not a wrapped one. */
    for (const b of document.querySelectorAll("button, a.drawn-btn, .drawn-btn")) {
      if (!visible(b)) continue;
      for (const node of b.childNodes) {
        if (node.nodeType !== 3 || !node.textContent.trim()) continue;
        const rng = document.createRange();
        rng.selectNodeContents(node);
        const lines = new Set([...rng.getClientRects()].map((r) => Math.round(r.top)));
        if (lines.size > 1) out.push({ kind: "button-wraps", lines: lines.size, text: label(b) });
      }
    }

    /* any direct-child group of a grid with more than one column: the items
       sharing a row must share a top, and the row must share a bottom. */
    for (const grid of document.querySelectorAll("main .grid, main [class*='grid-cols']")) {
      const cs = getComputedStyle(grid);
      if (cs.display !== "grid") continue;
      const cols = cs.gridTemplateColumns.split(" ").filter(Boolean).length;
      if (cols < 2) continue;
      const kids = [...grid.children].filter(visible);
      if (kids.length < 2) continue;
      const rows = new Map();
      for (const k of kids) {
        const r = k.getBoundingClientRect();
        const key = Math.round(r.top);
        if (!rows.has(key)) rows.set(key, []);
        rows.get(key).push({ bottom: Math.round(r.bottom), width: r.width, text: label(k) });
      }
      for (const [top, items] of rows) {
        if (items.length < 2) continue;
        /* only sibling PANELS. a 32px step number beside its paragraph shares
           a row and will never share a bottom, and demanding that it does is
           how a rule about symmetry turns into noise. if one item is under a
           third of the widest, this is a label and its content. */
        const widest = Math.max(...items.map((i) => i.width));
        if (items.some((i) => i.width < widest / 3)) continue;
        const bottoms = new Set(items.map((i) => i.bottom));
        if (bottoms.size > 1) {
          out.push({ kind: "row-bottoms-differ", top, bottoms: [...bottoms], items: items.map((i) => i.text) });
        }
      }
    }
    return out;
  }

  function linkFindings() {
    const out = [];
    for (const a of document.querySelectorAll("a[href]")) {
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:")) continue;
      if (href.startsWith("/") && !a.textContent.trim()) out.push({ kind: "empty-link", href });
      if (/^https?:/.test(href) && a.target === "_blank" && !/noreferrer|noopener/.test(a.rel || "")) {
        out.push({ kind: "unsafe-target-blank", href });
      }
      if (/undefined|NaN|\/\/$/.test(href)) out.push({ kind: "broken-href", href, text: label(a) });
    }
    return out;
  }

  /* measure twice and keep only what both runs agree on.
     a theme flip runs css transitions, and getComputedStyle hands back the
     in-flight value while they run, which is how this tool reported a tile at
     1.03 that is really 14.8. anything that appears in one pass and not the
     next was a transition, not a defect. */
  window.__auditStable = async (settle = 1200) => {
    await new Promise((r) => setTimeout(r, settle));
    const a = window.__audit();
    await new Promise((r) => setTimeout(r, 400));
    const b = window.__audit();
    const key = (f) => JSON.stringify([f.kind, f.text, f.href, f.top]);
    const inB = new Set(b.findings.map(key));
    return { ...a, findings: a.findings.filter((f) => inB.has(key(f))) };
  };

  window.__audit = () => ({
    url: location.pathname,
    theme: document.documentElement.dataset.theme || "unset",
    width: innerWidth,
    findings: [...layoutFindings(), ...textFindings(), ...linkFindings()],
  });
  return window.__audit();
})();
