/* ---------------------------------------------------------------
   Ruang pane engine — acceptance checks (docs/ruang.md §14).

   Serves dist/, drives a headless Chromium over the DevTools
   protocol, and asserts the behaviour the spec promises: a click
   splits, the layout is in the URL, a shared URL restores it, a bad
   path does not take the other panes down, and a narrow viewport
   never boots the engine at all.

   Run: npm run build && npm run test:panes
   Set RUANG_SHOTS=/some/dir to also write screenshots.
   --------------------------------------------------------------- */

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const SHOTS = process.env.RUANG_SHOTS;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".woff2": "font/woff2",
  ".xml": "application/xml",
  ".txt": "text/plain; charset=utf-8",
};

const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const file = join(OUT, path.endsWith("/") ? `${path}index.html` : path);
  if (!file.startsWith(OUT)) return res.writeHead(403).end();
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" }).end("404 File not found");
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const bin =
  process.env.CHROMIUM ??
  ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"].find((p) => existsSync(p));
if (!bin) {
  console.log("no chromium found — set CHROMIUM to run these checks");
  server.close();
  process.exit(0);
}

const profile = await mkdtemp(join(tmpdir(), "ruang-"));
const port = 9000 + Math.floor(Math.random() * 900);
const browser = spawn(
  bin,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "--window-size=1440,860",
    "about:blank",
  ],
  { stdio: "ignore" }
);

const done = async (code) => {
  browser.kill();
  server.close();
  // chromium is still flushing its profile; removing it under the browser
  // races to ENOTEMPTY, and a leftover temp dir is not worth failing over
  await new Promise((r) => {
    browser.once("exit", r);
    setTimeout(r, 2000);
  });
  await rm(profile, { recursive: true, force: true }).catch(() => {});
  process.exit(code);
};

let version;
for (let i = 0; i < 50 && !version; i++) {
  await sleep(200);
  version = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json()).catch(() => null);
}
if (!version) {
  console.error("chromium did not start");
  await done(1);
}

const target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === "page");
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));

let seq = 0;
const waiting = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  const slot = m.id && waiting.get(m.id);
  if (!slot) return;
  waiting.delete(m.id);
  m.error ? slot.reject(new Error(JSON.stringify(m.error))) : slot.resolve(m.result);
};
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++seq;
    waiting.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? "eval failed");
  return r.result.value;
};
const go = async (path) => {
  await send("Page.navigate", { url: BASE + path });
  await sleep(700);
};
const click = async (selector) => {
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  await sleep(600);
};
const key = async (k, modifiers = 0) => {
  const printable = k.length === 1;
  const code = k === "?" ? 191 : printable ? k.toUpperCase().charCodeAt(0) : k === "Escape" ? 27 : 0;
  const base = { modifiers, key: k, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code };
  await send("Input.dispatchKeyEvent", { type: "keyDown", ...base, ...(printable ? { text: k } : {}) });
  await send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
  await sleep(250);
};
const shot = async (name) => {
  if (!SHOTS) return;
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  await writeFile(join(SHOTS, `${name}.png`), Buffer.from(data, "base64"));
};

const STATE = `(() => {
  const panes = [...document.querySelectorAll(".pane")];
  return {
    count: panes.length,
    titles: panes.map((p) => p.querySelector(".pane-title").textContent),
    focused: panes.findIndex((p) => p.classList.contains("is-focused")),
    error: panes.some((p) => p.classList.contains("is-error")),
    url: location.pathname + location.search,
    tags: [...document.querySelectorAll(".pane-tag")].map((t) => t.textContent),
    booting: document.documentElement.classList.contains("ruang-booting"),
  };
})()`;
const state = () => evaluate(STATE);

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 860, deviceScaleFactor: 1, mobile: false });

let failures = 0;
const check = (label, ok, detail) => {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${label}${ok ? "" : `\n        ${JSON.stringify(detail)}`}`);
};

// the document mounts as pane 0, without a refetch
await go("/");
let s = await state();
check("home mounts as a single pane", s.count === 1 && s.url === "/", s);
check("a single pane offers no close button", await evaluate(`getComputedStyle(document.querySelector(".pane-close")).display === "none"`));
check("a single pane wears no accent", await evaluate(`getComputedStyle(document.querySelector(".pane")).outlineColor === "rgba(0, 0, 0, 0)"`));

// a click splits
await click('.pane a[href="/posts/building-this-site/"]');
s = await state();
check("a click opens a second pane", s.count === 2, s);
check("the new pane takes focus", s.focused === 1, s);
check("the layout lands in the URL", s.url.startsWith("/?p="), s);
check("the status bar lists both panes", s.tags.length === 2 && s.tags[1].startsWith("["), s);
check("the status bar stays on screen", await evaluate(`(() => {
  const r = document.querySelector(".statusbar").getBoundingClientRect();
  return r.top >= 0 && r.bottom <= innerHeight + 1 && r.width > 0;
})()`));
check("panes scroll, the page does not", await evaluate(`(() => {
  const bodies = [...document.querySelectorAll(".pane-body")];
  return document.body.scrollHeight <= innerHeight + 1 && bodies.some((b) => b.scrollHeight > b.clientHeight + 1);
})()`));
check("the nav marks the focused pane's section", await evaluate(`document.querySelector(".nav [aria-current]").getAttribute("href") === "/posts/"`));
check("only one nav item claims to be current", await evaluate(`document.querySelectorAll(".nav [aria-current]").length === 1`));
check("two panes share one baseline grid", await evaluate(`(() => {
  const tops = [...document.querySelectorAll(".pane-body h1")].map((h) => h.getBoundingClientRect().top);
  return tops.length === 2 && Math.abs(tops[0] - tops[1]) < 0.5;
})()`));
await shot("panes-split");

// back undoes the split, not the focus changes
const history = await send("Page.getNavigationHistory");
await send("Page.navigateToHistoryEntry", { entryId: history.entries.at(-2).id });
await sleep(600);
s = await state();
check("back undoes the split", s.count === 1 && s.url === "/", s);

// an open path is focused, not duplicated
await go("/");
await click('.pane a[href="/posts/building-this-site/"]');
await click('.nav a[href="/posts/"]');
await click('.pane a[href="/posts/building-this-site/"]');
s = await state();
check("a link to an open pane focuses it", s.count === 3 && new Set(s.titles).size === 3, s);
check("a fourth click recycles rather than overflowing", (await click('.nav a[href="/about/"]'), (await state()).count) === 3, await state());
await shot("panes-three");

// a shared layout restores
await go("/?p=posts|projects&f=1");
s = await state();
check("a shared URL restores both panes", s.count === 2, s);
check("a shared URL restores focus", s.focused === 1, s);
check("panes carry their own titles", s.titles.join(",") === "Posts,Projects", s);
check("no flash is left behind", s.booting === false, s);
await shot("panes-shared");

// closing
await evaluate(`document.querySelectorAll(".pane-close")[1].click()`);
await sleep(300);
s = await state();
check("closing a pane leaves the other", s.count === 1, s);
check("one pane means a clean URL", s.url === "/posts/", s);

// a bad path does not take the layout down
await go("/?p=posts|nope-not-here");
s = await state();
check("a missing path renders an error pane", s.error === true, s);
check("the other pane survives it", s.count === 2, s);
await shot("panes-error");

// narrow never boots
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await go("/");
s = await state();
check("a narrow viewport stays a plain document", s.count === 0, s);
check("a narrow viewport still renders content", await evaluate(`!!document.querySelector("#main .post-list")`));

// phase 3: the key map, hints and the help sheet
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 860, deviceScaleFactor: 1, mobile: false });
await go("/");
await click('.pane a[href="/posts/building-this-site/"]');
await key("h");
check("h moves focus left", (await state()).focused === 0, await state());
await key("l");
check("l moves focus right", (await state()).focused === 1, await state());
await key("1");
check("a number focuses that pane", (await state()).focused === 0, await state());
check("focus moves are announced", await evaluate(`document.querySelector(".statusbar .sr-only").textContent.includes("Pane 1 of 2")`));
await key("j");
await key("j");
check("j scrolls the focused pane", await evaluate(`document.querySelectorAll(".pane-body")[0].scrollTop > 0`));
await key("k");
await key("k");
check("k scrolls it back", await evaluate(`document.querySelectorAll(".pane-body")[0].scrollTop === 0`));
await key("g");
check("g jumps to the nav", await evaluate(`!!document.activeElement.closest(".nav")`));

await key("?", 8);
check("? opens the help sheet", await evaluate(`document.querySelector(".help")?.open === true`));
check("the sheet lists every binding", await evaluate(`document.querySelectorAll(".help dt").length === 11`));
check("the sheet is actually on screen", await evaluate(`(() => {
  const r = document.querySelector(".help").getBoundingClientRect();
  return r.width > 200 && r.height > 100 && r.top >= 0 && r.bottom <= innerHeight;
})()`));
await shot("help-sheet");
await key("Escape");
check("escape closes the sheet", await evaluate(`document.querySelector(".help").open === false`));
check("closing the sheet returns focus where it was", await evaluate(`!!document.activeElement.closest(".nav")`));

await evaluate(`document.querySelectorAll(".pane")[0].focus()`);
await key("s");
check("s labels the links in the focused pane", await evaluate(`document.querySelectorAll(".hint-label").length > 0`));
await shot("link-hints");
const label = await evaluate(`document.querySelector('.pane.is-focused .pane-body a[href="/projects/"]').dataset.hint`);
check("every hinted link carries its label", typeof label === "string" && label.length > 0, label);
for (const ch of label) await key(ch);
await sleep(500);
let k = await state();
check("typing a label opens that link", k.titles.includes("Projects"), k);
check("the labels clear after use", await evaluate(`document.querySelectorAll(".hint-label").length === 0`));

await key("s");
await key("Escape");
check("escape leaves link hints", await evaluate(`document.querySelectorAll(".hint-label").length === 0 && !document.querySelector("[data-hint]")`));

const before = (await state()).count;
await key("x", 2);
check("a modified key is left to the browser", (await state()).count === before, await state());
await key("x");
check("x closes the focused pane", (await state()).count === before - 1, await state());

// phase 4: zoom, resize, replace-in-place
await go("/?p=|posts&f=0");
check("a gutter sits between the panes", await evaluate(`(() => {
  const g = document.querySelector(".gutter");
  return !!g && g.getAttribute("role") === "separator" && g.getAttribute("aria-orientation") === "vertical";
})()`));
check("the gutter reports the left pane's share", await evaluate(`Number(document.querySelector(".gutter").getAttribute("aria-valuenow")) === 50`));

await key("f");
check("f zooms the focused pane", await evaluate(`document.querySelectorAll(".pane.is-stub").length === 1`));
check("the others collapse to a stub, not away", await evaluate(`(() => {
  const s = document.querySelector(".pane.is-stub").getBoundingClientRect();
  return s.width > 8 && s.width < 60;
})()`));
check("zoom is in the URL", (await state()).url.includes("z=1"), await state());
await shot("zoomed");
await key("Escape");
check("escape unzooms", await evaluate(`document.querySelectorAll(".pane.is-stub").length === 0`));
check("zoom leaves the URL", !(await state()).url.includes("z=1"), await state());

await key("L");
await key("L");
let widths = await evaluate(`[...document.querySelectorAll(".pane")].map((p) => Math.round(p.getBoundingClientRect().width))`);
check("L widens the focused pane", widths[0] > widths[1], widths);
check("widths are in the URL", (await state()).url.includes("&w="), await state());
await key("H");
await key("H");
widths = await evaluate(`[...document.querySelectorAll(".pane")].map((p) => Math.round(p.getBoundingClientRect().width))`);
check("H narrows it back", Math.abs(widths[0] - widths[1]) < 4, widths);

for (let n = 0; n < 20; n++) await key("H");
const share = await evaluate(`(() => {
  const row = document.querySelector(".row").clientWidth;
  const pane = document.querySelectorAll(".pane")[0].getBoundingClientRect().width;
  const probe = document.createElement("span");
  probe.style.cssText = "position:absolute;visibility:hidden;width:var(--pane-min)";
  document.querySelector(".row").append(probe);
  const min = probe.offsetWidth;
  probe.remove();
  return { pane: Math.round(pane), min, row };
})()`);
check("a pane never shrinks past --pane-min", share.pane >= share.min - 2, share);

// drag the gutter
const g = await evaluate(`(() => { const r = document.querySelector(".gutter").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
const before4 = await evaluate(`document.querySelectorAll(".pane")[0].getBoundingClientRect().width`);
await send("Input.dispatchMouseEvent", { type: "mousePressed", x: g.x, y: g.y, button: "left", buttons: 1, clickCount: 1 });
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: g.x + 140, y: g.y, button: "left", buttons: 1 });
await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: g.x + 140, y: g.y, button: "left", buttons: 0 });
await sleep(300);
const after4 = await evaluate(`document.querySelectorAll(".pane")[0].getBoundingClientRect().width`);
check("dragging the gutter resizes the neighbours", after4 > before4 + 100, { before: before4, after: after4 });
check("the drag is written to the URL on release", (await state()).url.includes("&w="), await state());
await shot("resized");

// r replaces in place
await go("/?p=|posts&f=0");
await key("r");
check("r labels links to replace with", await evaluate(`document.querySelectorAll(".hint-label").length > 0`));
const rlabel = await evaluate(`document.querySelector('.pane.is-focused .pane-body a[href="/projects/"]').dataset.hint`);
for (const c of rlabel) await key(c);
await sleep(500);
s = await state();
check("r replaces the pane instead of splitting", s.count === 2 && s.titles[0] === "Projects", s);

// the layer everything else rests on: without scripts it is a plain document
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 860, deviceScaleFactor: 1, mobile: false });
await send("Emulation.setScriptExecutionDisabled", { value: true });
await go("/posts/building-this-site/");
check("no JS: no panes are built", (await state()).count === 0);
check("no JS: the post still reads", await evaluate(`!!document.querySelector("#main article h1") && document.querySelector("#main article p").textContent.length > 40`));
check("no JS: the status bar is still there", await evaluate(`!!document.querySelector(".statusbar a[href='/feed.xml']")`));
check("no JS: nothing is left hidden", await evaluate(`getComputedStyle(document.getElementById("main")).visibility === "visible"`));
await send("Emulation.setScriptExecutionDisabled", { value: false });

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
ws.close();
await done(failures ? 1 : 0);
