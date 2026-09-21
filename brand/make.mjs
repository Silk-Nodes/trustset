/* regenerate every brand asset from one definition.
 *
 * the mark is geometry, so it needs no font. the wordmark is dm mono, which
 * is vendored under fonts/ rather than fetched, so this produces identical
 * output on a machine that has never seen the font and in five years when
 * the google fonts url has moved. run: node make.mjs
 */
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync, mkdirSync } from "node:fs";

/* the locked palette. BRAND.md is the source, this is the copy that renders. */
const P = {
  /* orange and orangeText are two tokens on purpose. orange fills bars and the
     eyes; as words on the cream ground it measures 3.28, which fails body text.
     orangeText is the per-theme type token, 5.02 on light. see BRAND.md. */
  light: { ground: "#f4f3ee", text: "#111210", orange: "#e8552b", orangeText: "#b83f1b" },
  dark:  { ground: "#0b0c0a", text: "#f2f1ec", orange: "#ff6a3d", orangeText: "#ff6a3d" },
};
const INK_ON_ORANGE = "#160a06";
const FONTS = ["fonts/DMMono-Regular.ttf", "fonts/DMMono-Medium.ttf"];

/* the face, on a 48 grid. top bar, two eyes, bottom bar. */
const face = (bar, eye) =>
  `<rect x="9" y="9" width="30" height="6" fill="${bar}"/>` +
  `<rect x="9" y="20" width="11" height="8" fill="${eye}"/>` +
  `<rect x="28" y="20" width="11" height="8" fill="${eye}"/>` +
  `<rect x="9" y="33" width="30" height="6" fill="${bar}"/>`;

/* f7. the tile is the TEXT colour and the bars are the GROUND colour, so the
   mark inverts against whatever page it sits on and never disappears. */
const tileBody = (tile, bar, eye) =>
  `<rect width="48" height="48" rx="10" fill="${tile}"/>` +
  `<rect x="12" y="13" width="24" height="5" fill="${bar}"/>` +
  `<rect x="12" y="22" width="9" height="6" fill="${eye}"/>` +
  `<rect x="27" y="22" width="9" height="6" fill="${eye}"/>` +
  `<rect x="12" y="32" width="24" height="5" fill="${bar}"/>`;

const svg = (body, w = 48, h = 48) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="trustset">${body}</svg>`;

const png = (src, width) =>
  new Resvg(src, {
    fitTo: { mode: "width", value: width },
    font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: "DM Mono" },
  }).render().asPng();

mkdirSync("assets", { recursive: true });
const out = (name, buf) => { writeFileSync(`assets/${name}`, buf); console.log("  " + name); };

console.log("marks and tiles");
for (const t of ["light", "dark"]) {
  const p = P[t];
  out(`mark-on-${t}.svg`, svg(face(p.text, p.orange)));
  out(`tile-on-${t}.svg`, svg(tileBody(p.text, p.ground, p.orange)));
  out(`tile-on-${t}.png`, png(svg(tileBody(p.text, p.ground, p.orange)), 1024));
}
out("tile-orange.svg", svg(tileBody(P.dark.orange, INK_ON_ORANGE, INK_ON_ORANGE)));
out("tile-orange.png", png(svg(tileBody(P.dark.orange, INK_ON_ORANGE, INK_ON_ORANGE)), 1024));

/* the favicon carries both themes in one file and switches with the os. */
out("favicon.svg", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" role="img" aria-label="trustset"><style>
.tile{fill:${P.light.text}}.bar{fill:${P.light.ground}}.eye{fill:${P.light.orange}}
@media(prefers-color-scheme:dark){.tile{fill:${P.dark.text}}.bar{fill:${P.dark.ground}}.eye{fill:${P.dark.orange}}}
</style><rect class="tile" width="48" height="48" rx="10"/><rect class="bar" x="12" y="13" width="24" height="5"/><rect class="eye" x="12" y="22" width="9" height="6"/><rect class="eye" x="27" y="22" width="9" height="6"/><rect class="bar" x="12" y="32" width="24" height="5"/></svg>`);

/* the lockup. dm mono is monospaced, so the advance is exact arithmetic and
   the box never has to be guessed: 0.6em per glyph, measured off the font. */
/* dm mono is monospaced, so the box is arithmetic rather than a guess:
   0.6em of advance per glyph, less the tracking, plus room on the right so
   the final t never sits on the edge. the face is scaled to the word's cap
   height (~0.7em) so the two read as one object instead of a mark beside
   some text. */
const ADV = 0.6, TRACK = -0.5;
console.log("wordmarks");
for (const t of ["light", "dark"]) {
  const p = P[t], word = "trustset", fs = 48;
  const capH = fs * 0.635;             // measured: matches the word's own ink height
  const scale = capH / 30;             // the face's ink is 30 of its 48 grid
  const markW = 48 * scale;
  const gap = fs * 0.42, padR = fs * 0.076, padY = 10;  // padR measured so the right margin equals the left
  const textW = word.length * fs * ADV + (word.length - 1) * TRACK;
  const w = Math.round(markW + gap + textW + padR);
  const h = Math.round(capH + padY * 2);
  const baseline = padY + capH;
  const body =
    `<g transform="translate(0,${(baseline - capH - 9 * scale + 0.67).toFixed(2)}) scale(${scale.toFixed(4)})">${face(p.text, p.orange)}</g>` +
    `<text x="${(markW + gap).toFixed(1)}" y="${baseline.toFixed(1)}" font-family="DM Mono" font-weight="500" font-size="${fs}" letter-spacing="${TRACK}" fill="${p.text}">${word}</text>`;
  out(`wordmark-on-${t}.svg`, svg(body, w, h));
  out(`wordmark-on-${t}.png`, png(svg(body, w, h), w * 6));
}

/* the readme and social card. 1280x640, the ratio github and x both crop well. */
console.log("banner");
for (const t of ["light", "dark"]) {
  const p = P[t];
  const body =
    `<rect width="1280" height="640" fill="${p.ground}"/>` +
    `<g transform="translate(90,150) scale(3.125)">${tileBody(p.text, p.ground, p.orange)}</g>` +
    `<text x="90" y="420" font-family="DM Mono" font-weight="500" font-size="92" letter-spacing="-2" fill="${p.text}">trustset</text>` +
    `<text x="90" y="478" font-family="DM Mono" font-weight="400" font-size="31" fill="${p.text}" opacity="0.62">the trust stack for ai agents on monad</text>` +
    `<rect x="90" y="524" width="150" height="5" fill="${p.orange}"/>`;
  out(`banner-${t}.svg`, svg(body, 1280, 640));
  out(`banner-${t}.png`, png(svg(body, 1280, 640), 1280));
}
/* the square logo an upload form wants: no transparent corners, because a
   png with alpha lands on whatever colour that form happens to use. */
console.log("logo and favicons");
for (const t of ["light", "dark"]) {
  const p = P[t], S = 48, inset = 9;
  const body = `<rect width="${S}" height="${S}" fill="${p.ground}"/>` +
    `<g transform="translate(${inset},${inset}) scale(${(S - inset * 2) / 48})">${tileBody(p.text, p.ground, p.orange)}</g>`;
  out(`logo-${t}.svg`, svg(body));
  out(`logo-${t}.png`, png(svg(body), 1024));
}
/* favicon rasters, for the browsers that will not read an svg one. the dark
   tile, fixed rather than theme-aware: the face inside it is cream and orange,
   so it reads on a light tab bar and a dark one alike. */
const fav = svg(tileBody(P.light.text, P.light.ground, P.light.orange));
out("favicon-dark-tile.svg", fav);
for (const size of [16, 32, 180, 512]) out(`favicon-${size}.png`, png(fav, size));
/* the social card. 1280x640, the ratio github and x both show uncropped.
   hierarchy for a reader who has never heard of this: the name, then what
   it is in six words, then proof. the proof is the one thing a logo card
   cannot do, a strip of beats that breaks at one orange spike, with the
   word the switch returned underneath. orange is used exactly once.
   the top-left quarter carries nothing on purpose: the hackathon platform
   stamps the project logo there, and a card that also carries it doubles
   it. nothing sits in the bottom-left either, so the strip is the only
   thing on the left and reads as the datum it is. */
console.log("social card");
for (const theme of ["dark", "light"]) {
  const p = P[theme], W = 1280, H = 640, X = 430;
  const mono = (x, y, size, text, w = 400, extra = "", fill = p.text) =>
    `<text x="${x}" y="${y}" font-family="DM Mono" font-weight="${w}" font-size="${size}" fill="${fill}" ${extra}>${text}</text>`;
  /* the lockup at 52px, same arithmetic as the wordmark */
  const fs = 52, capH = fs * 0.635, sc = capH / 30, markW = 48 * sc, gap = fs * 0.42;
  const lock = `<g transform="translate(${X},158)"><g transform="translate(0,${(-(capH + 9 * sc) + 0.67).toFixed(2)}) scale(${sc.toFixed(4)})">${face(p.text, p.orange)}</g>${mono(markW + gap, 0, fs, "trustset", 500, 'letter-spacing="-1"')}</g>`;
  /* the strip. 22px pitch from x=84, the spike sits under the end of the headline */
  const y = 392, pitch = 22, bw = 10, bh = 26, x0 = 84;
  const n = Math.floor((1196 - x0) / pitch) + 1;
  const trip = Math.round((1096 - x0) / pitch);
  let beats = "";
  for (let i = 0; i < n; i++) {
    const x = x0 + i * pitch;
    if (i < trip) beats += `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" fill="${p.text}"/>`;
    else if (i === trip) beats += `<rect x="${x}" y="${y - 14}" width="${bw}" height="${bh + 42}" fill="${p.orange}"/>`;
    else beats += `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" fill="${p.text}" fill-opacity="0.18"/>`;
  }
  const body =
    `<rect width="${W}" height="${H}" fill="${p.ground}"/>` +
    `<defs><pattern id="g-${theme}" width="32" height="32" patternUnits="userSpaceOnUse"><circle cx="16" cy="16" r="1.2" fill="${p.text}" fill-opacity="0.12"/></pattern></defs><rect width="${W}" height="${H}" fill="url(#g-${theme})"/>` +
    lock +
    mono(X, 262, 72, "the trust stack", 500, 'letter-spacing="-2.5"') +
    mono(X, 342, 72, "for ai agents", 500, 'letter-spacing="-2.5"') +
    beats +
    `<text x="${X}" y="488" font-family="DM Mono" font-weight="400" font-size="26" fill="${p.text}" fill-opacity="0.62">agent 7 on monad testnet  ·  <tspan fill="${p.orangeText}" fill-opacity="1" font-weight="500">REFUSED</tspan></text>` +
    mono(X, 524, 26, "paused by its owner, and may come back", 400, 'fill-opacity="0.62"');
  /* the dark one keeps the bare name, because it is the file that ships as
     the site's og image and as github's social preview. */
  const stem = theme === "dark" ? "social" : "social-light";
  out(`${stem}.svg`, svg(body, W, H));
  out(`${stem}.png`, png(svg(body, W, H), W));
}
console.log("done");
