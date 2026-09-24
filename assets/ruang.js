/* ---------------------------------------------------------------
   Ruang — the pane engine. See docs/ruang.md, sections 6 to 11.

   A link opens a pane beside the one you are reading instead of
   replacing it, and the arrangement lives in the URL, so a layout is
   something you can send to someone.

   Three things this file must never break:

   1. Without it the site is a plain document. It mounts the sheet
      that is already in the HTML as pane 0 — it never refetches it —
      and every pane path stays a real, loadable URL.
   2. One pane is focused, and the accent colour says which.
   3. Narrow viewports never get here at all: the boot script in
      build.mjs withholds the `ruang` class below 900px.
   --------------------------------------------------------------- */

const WIDE = 900;
const root = document.documentElement;

const capacity = () => (innerWidth >= 1400 ? 3 : innerWidth >= WIDE ? 2 : 1);

/* A path is stored as its real pathname and serialised without its
   outer slashes. Anything with an extension (/404.html) keeps its
   shape; everything else is a directory URL. */
const toParam = (path) => path.replace(/^\/|\/$/g, "");
const fromParam = (seg) => {
  const s = seg.replace(/^\/|\/$/g, "");
  if (s === "") return "/";
  return s.includes(".") ? `/${s}` : `/${s}/`;
};

let panes = [];
let active = 0;
let clock = 0; // for least-recently-focused recycling
let hinted = false;
let zoomed = false;
let row;
let indicators;
let live;

/* ---------- content ---------- */

// The fragment is the page: a pane can never show something a direct
// visit would not, and there is no second artefact to keep in sync.
const cache = new Map();

function load(path) {
  if (cache.has(path)) return cache.get(path);
  const pending = fetch(path, { credentials: "same-origin" })
    .then(async (res) => {
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`.trim());
      const doc = new DOMParser().parseFromString(await res.text(), "text/html");
      const main = doc.getElementById("main");
      if (!main) throw new Error("no content");
      return {
        path,
        title: main.dataset.paneTitle || doc.title,
        docTitle: doc.title,
        body: main.innerHTML,
        glyph: doc.getElementById("pane-glyph")?.innerHTML ?? "",
      };
    })
    .catch((err) => {
      cache.delete(path); // a failure is not worth remembering
      throw err;
    });
  cache.set(path, pending);
  return pending;
}

/* ---------- panes ---------- */

let glyphSeq = 0;

// Two pages can ship a pattern under the same id; once both are in one
// document the second would win. Rename on the way in.
function adoptGlyph(html) {
  if (!html) return "";
  const id = `rg${++glyphSeq}`;
  return html.replace(/id="([^"]+)"/, `id="${id}"`).replace(/url\(#[^)]+\)/, `url(#${id})`);
}

function makePane(data) {
  const el = document.createElement("section");
  el.className = "pane";
  el.tabIndex = -1;
  el.setAttribute("role", "region");
  el.innerHTML = `<div class="pane-bar">
  <span class="pane-glyph">${adoptGlyph(data.glyph)}</span>
  <span class="pane-title"></span>
  <button class="pane-close" type="button" title="Close pane">&#215;</button>
</div>
<div class="pane-body"></div>`;
  const pane = {
    el,
    body: el.querySelector(".pane-body"),
    titleEl: el.querySelector(".pane-title"),
    glyphEl: el.querySelector(".pane-glyph"),
    path: data.path,
    title: data.title,
    docTitle: data.docTitle,
    seen: ++clock,
  };
  el.querySelector(".pane-close").addEventListener("click", (e) => {
    e.stopPropagation();
    close(panes.indexOf(pane));
  });
  el.addEventListener("pointerdown", () => {
    const i = panes.indexOf(pane);
    if (i !== -1 && i !== active) focus(i);
  });
  fill(pane, data);
  return pane;
}

function fill(pane, data) {
  pane.title = data.title;
  pane.docTitle = data.docTitle;
  pane.titleEl.textContent = data.title;
  pane.el.setAttribute("aria-label", data.title);
  if (data.glyph !== undefined) pane.glyphEl.innerHTML = adoptGlyph(data.glyph);
  pane.body.className = "pane-body";
  pane.body.innerHTML = data.body;
  markExternal(pane.body);
}

// A cross-origin link would navigate the whole shell away and take every
// open pane with it. In the enhanced layer it gets its own tab; the plain
// document is left alone, where losing a layout is not a risk.
function markExternal(scope) {
  for (const a of scope.querySelectorAll("a[href]")) {
    const url = new URL(a.href, location.href);
    if (url.protocol.startsWith("http") && url.origin !== location.origin) {
      a.target = "_blank";
      a.rel = `${a.rel ? a.rel + " " : ""}noopener`.trim();
    }
  }
}

const skeleton = () =>
  `<div class="skeleton"><span></span><span></span><span></span></div>`;

function errorData(path, reason) {
  return {
    path,
    title: "Not loaded",
    docTitle: document.title,
    glyph: "",
    failed: true,
    body: `<h1>Not loaded</h1>
<p class="lede">${path} — ${reason}</p>
<p><a href="/">Back home</a></p>`,
  };
}

// Both ways of filling a pane — opening a new one and replacing one in
// place — end the same way, including when the fetch fails.
async function settle(pane, path, verb) {
  let data;
  try {
    data = await load(path);
  } catch (err) {
    data = errorData(path, err.message);
  }
  if (!panes.includes(pane)) return; // closed or recycled while loading
  pane.el.classList.remove("is-loading");
  pane.el.classList.toggle("is-error", data.failed === true);
  fill(pane, data);
  sync();
  say(
    data.failed
      ? `${path} could not be loaded.`
      : `${verb} ${data.title}. Pane ${panes.indexOf(pane) + 1} of ${panes.length}.`.trim()
  );
}

/* ---------- layout ---------- */

function mount() {
  const kids = [];
  panes.forEach((pane, i) => {
    if (i) kids.push(gutter(i)); // gutter i sits between pane i-1 and pane i
    kids.push(pane.el);
  });
  row.replaceChildren(...kids);
}

// Opening or closing resets the row to equal shares. Anything cleverer
// (preserving ratios as the count changes) is arithmetic nobody asked for.
function share() {
  const equal = 100 / panes.length;
  for (const p of panes) p.width = equal;
}

// --pane-min and --pane-step live in the stylesheet; measure them rather
// than keep a second copy of the numbers here.
let sizes = null;
function px() {
  if (!sizes) {
    const probe = document.createElement("span");
    probe.style.cssText = "position:absolute;visibility:hidden";
    row.append(probe);
    probe.style.width = "var(--pane-min)";
    const min = probe.offsetWidth;
    probe.style.width = "var(--pane-step)";
    const step = probe.offsetWidth;
    probe.remove();
    sizes = { min, step };
  }
  return sizes;
}

const minPct = () => (px().min / row.clientWidth) * 100;
const stepPct = () => (px().step / row.clientWidth) * 100;

function paint() {
  if (panes.length < 2) zoomed = false;
  row.classList.toggle("is-zoomed", zoomed);
  panes.forEach((p, i) => {
    const stub = zoomed && i !== active;
    p.el.classList.toggle("is-stub", stub);
    p.el.style.flex = zoomed ? (stub ? "0 0 3ch" : "1 1 auto") : `${p.width ?? 100 / panes.length} 1 0`;
  });
}

/* ---------- gutters ---------- */

function gutter(i) {
  const g = document.createElement("div");
  g.className = "gutter";
  g.tabIndex = 0;
  g.setAttribute("role", "separator");
  g.setAttribute("aria-orientation", "vertical");
  g.setAttribute("aria-label", `Resize ${panes[i - 1].title}`);
  g.dataset.index = String(i);
  g.addEventListener("pointerdown", drag);
  g.addEventListener("keydown", (e) => {
    const by = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
    if (!by) return;
    e.preventDefault();
    move(i - 1, i, by * stepPct());
    sync();
  });
  return g;
}

// Reallocate between two neighbours only, and never below --pane-min.
function move(a, b, delta) {
  if (zoomed) return;
  const low = minPct();
  const d = Math.max(-(panes[a].width - low), Math.min(panes[b].width - low, delta));
  panes[a].width += d;
  panes[b].width -= d;
  paint();
  return d;
}

function drag(e) {
  if (zoomed || e.button !== 0) return;
  const g = e.currentTarget;
  const i = Number(g.dataset.index);
  const startX = e.clientX;
  const startA = panes[i - 1].width;
  const startB = panes[i].width;
  g.setPointerCapture(e.pointerId);
  e.preventDefault();

  const onMove = (ev) => {
    panes[i - 1].width = startA;
    panes[i].width = startB;
    move(i - 1, i, ((ev.clientX - startX) / row.clientWidth) * 100);
  };
  const onUp = () => {
    g.removeEventListener("pointermove", onMove);
    g.removeEventListener("pointerup", onUp);
    g.removeEventListener("pointercancel", onUp);
    sync(); // the URL is written once, on release, never during the drag
  };
  g.addEventListener("pointermove", onMove);
  g.addEventListener("pointerup", onUp);
  g.addEventListener("pointercancel", onUp);
}

function sync({ push = false } = {}) {
  panes.forEach((p, i) => p.el.classList.toggle("is-focused", i === active));
  paint();
  for (const g of row.querySelectorAll(".gutter")) {
    const i = Number(g.dataset.index);
    g.setAttribute("aria-valuenow", String(Math.round(panes[i - 1]?.width ?? 0)));
  }
  row.dataset.count = panes.length;
  row.classList.toggle("is-single", panes.length === 1);

  indicators.replaceChildren(
    ...panes.map((p, i) => {
      const s = document.createElement("span");
      s.className = i === active ? "pane-tag is-focused" : "pane-tag";
      s.textContent = i === active ? `[${i + 1}:${p.title}]` : `${i + 1}:${p.title}`;
      return s;
    })
  );

  // The served document baked aria-current into the nav, but with panes the
  // focused pane is what "here" means. Two accents disagreeing is worse than
  // one, so the nav follows the focus.
  const here = panes[active]?.path ?? "";
  let best = null;
  for (const a of document.querySelectorAll(".nav a")) {
    a.removeAttribute("aria-current");
    const href = new URL(a.href, location.href).pathname;
    if (here === href || (href !== "/" && here.startsWith(href))) {
      if (!best || href.length > best.href.length) best = { a, href };
    }
  }
  if (!best && here === "/") best = { a: document.querySelector('.nav a[href="/"]'), href: "/" };
  best?.a?.setAttribute("aria-current", "page");

  const url = serialize();
  if (url !== location.pathname + location.search) {
    history[push ? "pushState" : "replaceState"]({ ruang: true }, "", url);
  }
  document.title = panes[active]?.docTitle ?? document.title;
}

function serialize() {
  if (panes.length === 1) return panes[0].path;
  const p = panes.map((x) => encodeURIComponent(toParam(x.path))).join("|");
  let url = `/?p=${p}&f=${active}`;

  const equal = 100 / panes.length;
  if (panes.some((x) => Math.abs(x.width - equal) > 1)) {
    const w = panes.map((x) => Math.round(x.width));
    w[w.length - 1] = 100 - w.slice(0, -1).reduce((a, b) => a + b, 0); // absorb rounding
    url += `&w=${w.join(",")}`;
  }
  if (zoomed) url += "&z=1";
  return url;
}

function focus(i, { announce = false } = {}) {
  if (i < 0 || i >= panes.length) return;
  active = i;
  panes[i].seen = ++clock;
  sync();
  if (announce) say(`${panes[i].title}. Pane ${i + 1} of ${panes.length}.`);
}

function close(i) {
  if (panes.length <= 1 || i < 0 || i >= panes.length) return;
  const [gone] = panes.splice(i, 1);
  gone.el.remove();
  zoomed = false;
  share();
  active = Math.min(active > i ? active - 1 : active, panes.length - 1);
  panes[active].seen = ++clock;
  sync({ push: true });
  panes[active].el.focus({ preventScroll: true });
  say(`Closed ${gone.title}. ${panes.length} pane${panes.length === 1 ? "" : "s"}.`);
}

// Never refuse a click: at the cap the least-recently-focused pane goes.
function evict(keep) {
  while (panes.length > capacity()) {
    let victim = -1;
    for (let i = 0; i < panes.length; i++) {
      if (panes[i] === keep) continue;
      if (victim === -1 || panes[i].seen < panes[victim].seen) victim = i;
    }
    if (victim === -1) break;
    const [gone] = panes.splice(victim, 1);
    gone.el.remove();
    if (active > victim) active--;
  }
}

async function open(path) {
  const existing = panes.findIndex((p) => p.path === path);
  if (existing !== -1) {
    focus(existing, { announce: true });
    panes[existing].el.focus({ preventScroll: true });
    return;
  }

  const pane = makePane({ path, title: path, body: skeleton(), glyph: "" });
  pane.el.classList.add("is-loading");
  panes.splice(active + 1, 0, pane);
  active = active + 1;
  zoomed = false;
  evict(pane);
  share();
  mount();
  sync({ push: true });
  pane.el.focus({ preventScroll: true });
  await settle(pane, path, "Opened");

  if (!hinted) {
    hinted = true;
    hint("a link opens a pane beside this one · × or the URL to share a layout");
  }
}

// Replace-in-place, which §3.2 took off the pointer and handed to a key.
async function replaceIn(pane, path) {
  if (pane.path === path) return say("Already here.");
  pane.path = path;
  pane.el.classList.remove("is-error");
  pane.el.classList.add("is-loading");
  fill(pane, { title: path, docTitle: document.title, body: skeleton(), glyph: "" });
  sync({ push: true });
  await settle(pane, path, "Now showing");
}

/* ---------- status bar ---------- */

function say(message) {
  live.textContent = message;
}

let hintTimer;
function hint(text) {
  const el = document.querySelector(".statusbar .hint");
  if (!el) return;
  el.textContent = text;
  el.classList.add("is-on");
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => el.classList.remove("is-on"), 8000);
}

/* ---------- links ---------- */

function interesting(a, e) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
  if (!a || a.target || a.hasAttribute("download")) return false;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin) return false;
  if (url.pathname === location.pathname && url.hash) return false;
  // only pages: feed.xml, fonts and the like belong to the browser
  return url.pathname.endsWith("/") || url.pathname.endsWith(".html");
}

/* ---------- URL ---------- */

async function restore() {
  const q = new URLSearchParams(location.search);
  const raw = q.get("p");
  if (!raw) return false;
  const paths = raw.split("|").map((s) => fromParam(decodeURIComponent(s)));
  if (!paths.length) return false;

  const widths = (q.get("w") ?? "")
    .split(",")
    .map((n) => parseInt(n, 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  const useWidths = widths.length === paths.length && Math.abs(widths.reduce((a, b) => a + b, 0) - 100) <= 1;

  const wanted = paths.slice(0, capacity());
  const loaded = await Promise.all(
    wanted.map((p) => load(p).catch((err) => errorData(p, err.message)))
  );

  panes = loaded.map((d, i) => {
    const pane = makePane(d);
    if (d.failed) pane.el.classList.add("is-error");
    if (useWidths) pane.width = widths[i];
    return pane;
  });
  if (!useWidths) share();
  active = Math.min(Math.max(parseInt(q.get("f") ?? "0", 10) || 0, 0), panes.length - 1);
  zoomed = q.get("z") === "1" && panes.length > 1;
  panes[active].seen = ++clock;
  mount();
  sync();
  return true;
}

/* ---------- keyboard ---------- */

// Unmodified single keys. Legitimate only because the site has no text
// inputs; see docs/ruang.md §3.1 for why this is not super+hjkl.
const lineHeight = () => parseFloat(getComputedStyle(document.body).lineHeight) || 24;

function onKey(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  if (t instanceof Element && t.closest("input, textarea, select, [contenteditable=true]")) return;
  if (hints) return hintKey(e);
  if (help?.open) return; // the dialog handles its own Escape

  const i = active;
  const key = e.key;

  if (key === "?") return act(e, () => openHelp());
  if (key === "Escape") {
    if (zoomed) act(e, () => toggleZoom());
    return;
  }
  if (key >= "1" && key <= "9") {
    const n = Number(key) - 1;
    if (n < panes.length) act(e, () => focusPane(n));
    return;
  }

  switch (key) {
    case "h":
      return act(e, () => focusPane(i - 1));
    case "l":
      return act(e, () => focusPane(i + 1));
    case "j":
      return act(e, () => panes[i]?.body.scrollBy({ top: lineHeight() }));
    case "k":
      return act(e, () => panes[i]?.body.scrollBy({ top: -lineHeight() }));
    case "x":
      return act(e, () => close(i));
    case "g":
      return act(e, () => document.querySelector(".nav a")?.focus());
    case "s":
      return act(e, () => startHints("split"));
    case "r":
      return act(e, () => startHints("replace"));
    case "f":
      return act(e, () => toggleZoom());
    case "H":
      return act(e, () => resize(-1));
    case "L":
      return act(e, () => resize(1));
    default:
  }
}

function act(e, fn) {
  e.preventDefault();
  fn();
}

function focusPane(i) {
  if (i < 0 || i >= panes.length || i === active) return;
  focus(i, { announce: true });
  panes[i].el.focus({ preventScroll: true });
}

/* ---------- zoom ---------- */

// The others collapse to a labelled stub rather than vanishing, so zoom
// reads as a state you are in and not as panes having been closed.
function toggleZoom() {
  if (panes.length < 2) return say("Only one pane.");
  zoomed = !zoomed;
  sync();
  say(zoomed ? `Zoomed ${panes[active].title}.` : "Unzoomed.");
}

// Grow or shrink the focused pane at its neighbour's expense; the last
// pane borrows from its left, so the key always does something.
function resize(dir) {
  if (panes.length < 2 || zoomed) return;
  const i = active;
  if (i < panes.length - 1) move(i, i + 1, dir * stepPct());
  else move(i - 1, i, -dir * stepPct());
  sync();
  say(`${panes[i].title}, ${Math.round(panes[i].width)} percent.`);
}

/* ---------- link hints ---------- */

// Home row, so a label is never a reach. Two characters once a pane holds
// more links than the row has keys.
const HINT_KEYS = "asdfghjkl";

let hints = null;

function labelsFor(n) {
  if (n <= HINT_KEYS.length) return [...HINT_KEYS].slice(0, n);
  const out = [];
  for (const a of HINT_KEYS) {
    for (const b of HINT_KEYS) {
      out.push(a + b);
      if (out.length === n) return out;
    }
  }
  return out;
}

function startHints(mode = "split") {
  const pane = panes[active];
  if (!pane) return;
  const box = pane.body.getBoundingClientRect();
  const links = [...pane.body.querySelectorAll("a[href]")].filter((a) => {
    const r = a.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > box.top && r.top < box.bottom;
  });
  if (!links.length) return say("No links in view.");

  const layer = document.createElement("div");
  layer.className = "hint-layer";
  const items = labelsFor(links.length).map((label, n) => {
    const a = links[n];
    const r = a.getBoundingClientRect();
    const el = document.createElement("span");
    el.className = "hint-label";
    el.textContent = label.toUpperCase();
    // sit to the left of the link rather than on top of its first letter,
    // and never outside the pane it belongs to
    el.style.left = `${Math.max(box.left + 2, r.left - (6 + label.length * 8))}px`;
    el.style.top = `${r.top}px`;
    el.setAttribute("aria-hidden", "true");
    layer.append(el);
    a.dataset.hint = label;
    return { label, a, el };
  });
  document.body.append(layer);
  hints = { items, layer, typed: "", mode };
  pane.body.addEventListener("scroll", endHints, { once: true });
  say(`Link hints, ${mode === "replace" ? "replace this pane" : "open beside"}. ${items.length} link${
    items.length === 1 ? "" : "s"
  }. Type a label, Escape to leave.`);
}

function endHints(message) {
  if (!hints) return;
  for (const i of hints.items) delete i.a.dataset.hint;
  hints.layer.remove();
  hints = null;
  if (typeof message === "string") say(message);
}

function hintKey(e) {
  e.preventDefault();
  if (e.key === "Escape") return endHints("Link hints off.");
  if (e.key === "Backspace") {
    hints.typed = hints.typed.slice(0, -1);
    return paintHints();
  }
  if (e.key.length !== 1 || !HINT_KEYS.includes(e.key.toLowerCase())) return;

  hints.typed += e.key.toLowerCase();
  const live = hints.items.filter((i) => i.label.startsWith(hints.typed));
  if (!live.length) return endHints("No such label.");
  const exact = live.find((i) => i.label === hints.typed);
  if (!exact) return paintHints();

  const { a } = exact;
  const mode = hints.mode;
  endHints();
  if (a.target === "_blank" || new URL(a.href, location.href).origin !== location.origin) {
    a.click();
  } else if (mode === "replace") {
    replaceIn(panes[active], new URL(a.href, location.href).pathname);
  } else {
    open(new URL(a.href, location.href).pathname);
  }
}

function paintHints() {
  for (const i of hints.items) {
    const on = i.label.startsWith(hints.typed) && hints.typed !== "";
    i.el.classList.toggle("is-match", on);
    i.el.classList.toggle("is-out", hints.typed !== "" && !i.label.startsWith(hints.typed));
  }
}

/* ---------- help ---------- */

const BINDINGS = [
  ["h l", "focus the pane left or right"],
  ["1\u20133", "focus a pane by number"],
  ["j k", "scroll the focused pane"],
  ["s", "label the links in this pane, then type a label"],
  ["r", "same, but the link replaces this pane"],
  ["f", "zoom the focused pane, or unzoom"],
  ["H L", "make the focused pane narrower or wider"],
  ["x", "close the focused pane"],
  ["g", "jump to the nav"],
  ["?", "this sheet"],
  ["esc", "leave link hints or this sheet"],
];

let help;
let helpReturn;

function openHelp() {
  if (!help) {
    help = document.createElement("dialog");
    help.className = "help";
    help.innerHTML = `<div class="help-bar"><span>Keys</span><button class="pane-close" type="button" title="Close">&#215;</button></div>
<div class="help-body">
  <dl>${BINDINGS.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>
  <p class="help-note">A link opens a pane beside the one you are reading. Hold
  ctrl, cmd or shift and it is the browser's click again. The panes you have
  open are in the address bar, so a layout is something you can send to someone.</p>
</div>`;
    help.querySelector("button").addEventListener("click", () => help.close());
    help.addEventListener("close", () => helpReturn?.focus({ preventScroll: true }));
    document.body.append(help);
  }
  helpReturn = document.activeElement;
  help.showModal();
  say("Keys.");
}

/* ---------- boot ---------- */

async function init() {
  const main = document.getElementById("main");
  if (!main) return;

  const seed = {
    path: main.dataset.panePath || location.pathname,
    title: main.dataset.paneTitle || document.title,
    docTitle: document.title,
    body: main.innerHTML,
    glyph: document.getElementById("pane-glyph")?.innerHTML ?? "",
  };

  row = main;
  row.className = "row";
  row.removeAttribute("data-pane-path");
  row.removeAttribute("data-pane-title");
  row.replaceChildren();

  const bar = document.querySelector(".statusbar");
  indicators = document.createElement("span");
  indicators.className = "panes";
  live = document.createElement("span");
  live.className = "sr-only";
  live.setAttribute("aria-live", "polite");
  const hintEl = document.createElement("span");
  hintEl.className = "hint";
  const keys = document.createElement("button");
  keys.className = "keys";
  keys.type = "button";
  keys.textContent = "?";
  keys.title = "Keys";
  keys.addEventListener("click", () => openHelp());

  bar.prepend(indicators);
  bar.insertBefore(hintEl, bar.querySelector(".build")); // keep the sha last
  bar.insertBefore(keys, bar.querySelector(".build"));
  bar.append(live);

  // Mount the sheet that is already here rather than fetching it again,
  // and prime the cache with it so a ?p= naming this path costs no request.
  cache.set(seed.path, Promise.resolve(seed));
  panes = [makePane(seed)];
  active = 0;
  share();
  mount();

  // restore() has to read ?p= before sync() rewrites the URL, so the first
  // sync waits until we know whether there is a layout to restore.
  let restored = false;
  try {
    restored = await restore();
  } catch {
    restored = false; // a broken ?p= must still leave a usable page
  }
  if (!restored) sync();
  root.classList.remove("ruang-booting");

  document.addEventListener("click", (e) => {
    const a = e.target.closest("a");
    if (!interesting(a, e)) return;
    e.preventDefault();
    open(new URL(a.href, location.href).pathname);
  });

  addEventListener("popstate", async () => {
    const restored = await restore().catch(() => false);
    if (restored) return;
    const path = location.pathname;
    const i = panes.findIndex((p) => p.path === path);
    if (i !== -1) {
      panes = [panes[i]];
      active = 0;
      mount();
      sync();
    } else {
      location.reload();
    }
  });

  document.addEventListener("keydown", onKey);
  markExternal(document.body);

  addEventListener("resize", () => {
    if (hints) endHints();
    if (panes.length > capacity()) {
      evict(panes[active]);
      mount();
      sync();
    }
  });
}

if (root.classList.contains("ruang")) {
  init().catch(() => root.classList.remove("ruang-booting"));
} else {
  root.classList.remove("ruang-booting");
}
