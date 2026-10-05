// Pixel type for the wordmark and favicon. Every glyph is 5 wide and 7 tall;
// '#' is a lit cell. Only the letters the site spells are drawn.
const FONT = {
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  I: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
  N: ["#...#", "##..#", "##..#", "#.#.#", "#..##", "#..##", "#...#"],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
};

const ROWS = 7;

// Lit cells of a word as [x, y] pairs, one blank column between letters.
function cells(word) {
  const out = [];
  let x0 = 0;
  for (const ch of word.toUpperCase()) {
    const glyph = FONT[ch];
    if (!glyph) throw new Error(`pixel font has no glyph for ${JSON.stringify(ch)}`);
    glyph.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) if (row[x] === "#") out.push([x0 + x, y]);
    });
    x0 += 6;
  }
  return { cells: out, width: x0 - 1 };
}

// The wordmark is lit from below, like omarchy.org's: the top rows sit in the
// field's dim shade and the base in the brand colour. Fills are CSS variables
// so a theme change relights it without a rebuild.
const SHADE = ["dim", "dim", "dim", "mid", "mid", "lit", "lit"];

export function wordmarkSVG(word, label) {
  const { cells: lit, width } = cells(word);
  const byShade = { dim: [], mid: [], lit: [] };
  for (const [x, y] of lit) byShade[SHADE[y]].push(`M${x} ${y}h1v1h-1z`);
  const paths = Object.entries(byShade)
    .map(([shade, d]) => `<path class="px-${shade}" d="${d.join("")}"/>`)
    .join("");
  const a11y = label ? `role="img" aria-label="${label}"` : `aria-hidden="true"`;
  return `<svg class="wordmark" viewBox="0 0 ${width} ${ROWS}" ${a11y} shape-rendering="crispEdges">${paths}</svg>`;
}

// A deterministic scatter of single cells for the hero background: empty in
// the middle where the words are, thickening toward both edges.
function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function fieldSVG({ cols = 96, rows = 36, seed = 7 } = {}) {
  const rand = mulberry32(seed);
  const tiers = { 1: [], 2: [], 3: [] };
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const edge = Math.abs(x - (cols - 1) / 2) / ((cols - 1) / 2); // 0 centre, 1 edge
      const p = Math.max(0, edge - 0.45) ** 2 * 1.1;
      const r = rand();
      if (r >= p) continue;
      const tier = r < p * 0.15 ? 3 : r < p * 0.45 ? 2 : 1;
      tiers[tier].push(`M${x + 0.15} ${y + 0.15}h.7v.7h-.7z`);
    }
  }
  const paths = Object.entries(tiers)
    .map(([tier, d]) => `<path class="fx-${tier}" d="${d.join("")}"/>`)
    .join("");
  // Cells are inset so a gap shows between neighbours.
  return `<svg class="field" viewBox="0 0 ${cols} ${rows}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${paths}</svg>`;
}

// A favicon is one image for every theme, so it is drawn in Tokyo Night.
export function faviconURI() {
  const { cells: lit } = cells("A");
  const d = lit.map(([x, y]) => `M${x * 4 + 6} ${y * 4 + 2}h4v4h-4z`).join("");
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32' shape-rendering='crispEdges'><rect width='32' height='32' fill='#1a1b26'/><path d='${d}' fill='#9ece6a'/></svg>`;
  return `data:image/svg+xml,${svg.replace(/#/g, "%23").replace(/</g, "%3C").replace(/>/g, "%3E")}`;
}

// A five-by-five mirrored identicon, seeded by a string: each project gets
// a small picture of its own until it has a screenshot.
export function identiconSVG(seed) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rand = mulberry32(h);
  const shades = { dim: [], mid: [], lit: [] };
  const names = Object.keys(shades);
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 3; x++) {
      if (rand() < 0.45) continue;
      const shade = names[Math.floor(rand() * 3)];
      for (const xx of new Set([x, 4 - x])) shades[shade].push(`M${xx} ${y}h1v1h-1z`);
    }
  }
  const paths = Object.entries(shades)
    .map(([shade, d]) => `<path class="px-${shade}" d="${d.join("")}"/>`)
    .join("");
  return `<svg class="identicon" viewBox="-1 -1 7 7" aria-hidden="true" shape-rendering="crispEdges">${paths}</svg>`;
}
