/* ---------------------------------------------------------------
   Batik motifs, shared by build.mjs (the still SVG every page ships)
   and cloth.js (the live WebGL cloth painted over it).

   A page's address seeds its motif, so a page always gets the same
   cloth. Geometry is in cell units; the fragment shader in cloth.js
   is generated from these same constants, so the still and the
   live cloth cannot drift apart.
   --------------------------------------------------------------- */

export const COLORS = {
  nila: "#1c2b5a", // indigo, the dye
  nilaTua: "#0f1733", // indigo after many dips
  mori: "#e8e7e1", // undyed cotton
  soga: "#7a4a24", // the brown second dye
  malam: "#e3c77a", // fresh wax
};

export const KINDS = ["Kawung", "Parang", "Truntum"];

// Kawung: four ovals around a point, on a 45° grid. Each oval is a
// cotton ring with an indigo line inside and a soga seed.
export const KAWUNG = { off: 0.27, rx: 0.22, ry: 0.15, line0: 0.56, line1: 0.68, seed: 0.18, dot: 0.08, dotSeed: 0.035 };

// Parang: diagonal bands, each with a border stripe, a row of dots,
// and a sinuous blade with an indigo line down its middle.
export const PARANG = { period: 1.6, border: 0.07, dotU: 0.17, dotStep: 0.32, dotR: 0.05, dotSeed: 0.022, bladeX: 0.62, amp: 0.2, half: 0.11, line: 0.03 };

// Truntum: eight-petal flowers alternating with four-dot rosettes.
export const TRUNTUM = { r: 0.34, base: 0.55, hole: 0.09, seed: 0.045, dotDist: 0.13, dotR: 0.045 };

const SCALE = [[92, 128], [66, 90], [54, 74]]; // css px per cell
const BASE_ANGLE = [45, 45, 0];
const TILT = [10, 16, 12];

// FNV-1a
export function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// mulberry32
function random(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function motif(seed) {
  const h = hash(seed);
  const next = random(h);
  const kind = h % 3;
  const [lo, hi] = SCALE[kind];
  return {
    kind,
    name: KINDS[kind],
    number: String(h % 10000).padStart(4, "0"),
    scale: lo + (hi - lo) * next(),
    angle: BASE_ANGLE[kind] + (next() - 0.5) * TILT[kind], // degrees
    phase: next(),
  };
}

/* ---------- still SVG ---------- */

const f = (n) => +n.toFixed(2);
const circle = (cx, cy, r, fill) => `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${fill}"/>`;
const ellipse = (cx, cy, rx, ry, fill) =>
  `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}"/>`;
const polygon = (points, fill) => `<polygon points="${points.map(([x, y]) => `${f(x)},${f(y)}`).join(" ")}" fill="${fill}"/>`;

function kawung(s) {
  const K = KAWUNG;
  const c = s / 2;
  const { mori, nila, soga } = COLORS;
  let out = "";
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const x = c + dx * K.off * s;
    const y = c + dy * K.off * s;
    const [rx, ry] = dx ? [K.rx * s, K.ry * s] : [K.ry * s, K.rx * s];
    out += ellipse(x, y, rx, ry, mori);
    out += ellipse(x, y, rx * K.line1, ry * K.line1, nila);
    out += ellipse(x, y, rx * K.line0, ry * K.line0, mori);
    out += ellipse(x, y, rx * K.seed, ry * K.seed, soga);
  }
  for (const x of [0, s]) {
    for (const y of [0, s]) out += circle(x, y, K.dot * s, mori) + circle(x, y, K.dotSeed * s, soga);
  }
  return { w: s, h: s, body: out };
}

function parang(s) {
  const P = PARANG;
  const h = P.period * s;
  const { mori, nila, soga } = COLORS;
  let out = `<rect width="${f(P.border * s)}" height="${f(h)}" fill="${mori}"/>`;
  for (let k = 0; k < Math.round(P.period / P.dotStep); k++) {
    const y = (k + 0.5) * P.dotStep * s;
    out += circle(P.dotU * s, y, P.dotR * s, mori) + circle(P.dotU * s, y, P.dotSeed * s, soga);
  }
  const blade = (half, fill) => {
    const left = [];
    const right = [];
    for (let i = 0; i <= 48; i++) {
      const v = (i / 48) * P.period;
      const x = P.bladeX + P.amp * Math.sin((2 * Math.PI * v) / P.period);
      left.push([(x - half) * s, v * s]);
      right.push([(x + half) * s, v * s]);
    }
    return polygon([...left, ...right.reverse()], fill);
  };
  out += blade(P.half, mori) + blade(P.line, nila);
  return { w: s, h, body: out };
}

function truntum(s) {
  const T = TRUNTUM;
  const { mori, nila, soga } = COLORS;
  let out = "";
  for (const [cx, cy] of [[0.5, 0.5], [1.5, 1.5]]) {
    const pts = [];
    for (let i = 0; i < 128; i++) {
      const a = (i / 128) * 2 * Math.PI;
      const r = T.r * (T.base + (1 - T.base) * Math.abs(Math.cos(4 * a)));
      pts.push([(cx + r * Math.cos(a)) * s, (cy + r * Math.sin(a)) * s]);
    }
    out += polygon(pts, mori) + circle(cx * s, cy * s, T.hole * s, nila) + circle(cx * s, cy * s, T.seed * s, soga);
  }
  for (const [cx, cy] of [[1.5, 0.5], [0.5, 1.5]]) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      out += circle((cx + dx * T.dotDist) * s, (cy + dy * T.dotDist) * s, T.dotR * s, mori);
    }
  }
  return { w: 2 * s, h: 2 * s, body: out };
}

const TILES = [kawung, parang, truntum];

// A still of the motif, sized by CSS to fill its container. `id` must be
// unique within the page.
export function stillSVG(m, id) {
  const { w, h, body } = TILES[m.kind](m.scale);
  return `<svg class="cloth-still" aria-hidden="true" focusable="false"><defs><pattern id="${id}" width="${f(w)}" height="${f(h)}" patternUnits="userSpaceOnUse" patternTransform="rotate(${f(m.angle)})">${body}</pattern></defs><rect width="100%" height="100%" fill="${COLORS.nila}"/><rect width="100%" height="100%" fill="url(#${id})"/></svg>`;
}
