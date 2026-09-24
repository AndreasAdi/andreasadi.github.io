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
}

const skeleton = () =>
  `<div class="skeleton"><span></span><span></span><span></span></div>`;

function errorBody(path, reason) {
  return `<h1>Not loaded</h1>
<p class="lede">${path} — ${reason}</p>
<p><a href="/">Back home</a></p>`;
}

/* ---------- layout ---------- */

function mount() {
  row.replaceChildren(...panes.map((p) => p.el));
}

function sync({ push = false } = {}) {
  panes.forEach((p, i) => {
    p.el.classList.toggle("is-focused", i === active);
    p.el.style.flex = p.width ? `${p.width} 1 0` : "1 1 0";
  });
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
  return `/?p=${p}&f=${active}`;
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
  evict(pane);
  mount();
  sync({ push: true });
  pane.el.focus({ preventScroll: true });

  try {
    const data = await load(path);
    if (!panes.includes(pane)) return; // closed or evicted while loading
    pane.el.classList.remove("is-loading");
    fill(pane, data);
    sync();
    say(`Opened ${data.title}. Pane ${panes.indexOf(pane) + 1} of ${panes.length}.`);
  } catch (err) {
    if (!panes.includes(pane)) return;
    pane.el.classList.remove("is-loading");
    pane.el.classList.add("is-error");
    fill(pane, { title: "Not loaded", docTitle: document.title, body: errorBody(path, err.message), glyph: "" });
    sync();
    say(`${path} could not be loaded.`);
  }

  if (!hinted) {
    hinted = true;
    hint("a link opens a pane beside this one · × or the URL to share a layout");
  }
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
    wanted.map((p) =>
      load(p).catch((err) => ({
        path: p,
        title: "Not loaded",
        docTitle: document.title,
        body: errorBody(p, err.message),
        glyph: "",
        failed: true,
      }))
    )
  );

  panes = loaded.map((d, i) => {
    const pane = makePane(d);
    if (d.failed) pane.el.classList.add("is-error");
    if (useWidths) pane.width = widths[i];
    return pane;
  });
  active = Math.min(Math.max(parseInt(q.get("f") ?? "0", 10) || 0, 0), panes.length - 1);
  panes[active].seen = ++clock;
  mount();
  sync();
  return true;
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
  bar.prepend(indicators);
  bar.insertBefore(hintEl, bar.querySelector(".build")); // keep the sha last
  bar.append(live);

  // Mount the sheet that is already here rather than fetching it again,
  // and prime the cache with it so a ?p= naming this path costs no request.
  cache.set(seed.path, Promise.resolve(seed));
  panes = [makePane(seed)];
  active = 0;
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

  addEventListener("resize", () => {
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
