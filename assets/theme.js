// Theme switching, the only script on the site. The <head> applies a saved
// theme before first paint; this file wires the picker and the T key.
// Without it the page follows prefers-color-scheme and loses nothing else.

const root = document.documentElement;
const menu = document.getElementById("themes");
const picks = [...menu.querySelectorAll("[data-pick]")];
const names = picks.map((b) => b.dataset.pick).filter(Boolean);
const status = document.getElementById("theme-status");
const meta = [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => [m, m.content]);
let hideTimer;

function current() {
  return root.dataset.theme || "";
}

function apply(name, announce) {
  if (name) root.dataset.theme = name;
  else delete root.dataset.theme;
  try {
    if (name) localStorage.setItem("theme", name);
    else localStorage.removeItem("theme");
  } catch {}
  for (const b of picks) b.setAttribute("aria-pressed", String(b.dataset.pick === name));
  const bg = getComputedStyle(root).getPropertyValue("--bg").trim();
  for (const [m, original] of meta) m.content = name ? bg : original;
  if (announce) {
    status.textContent = `theme: ${name || "auto"}`;
    status.classList.add("on");
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => status.classList.remove("on"), 1600);
  }
}

menu.addEventListener("click", (e) => {
  const b = e.target.closest("[data-pick]");
  if (!b) return;
  apply(b.dataset.pick, false);
});

addEventListener("keydown", (e) => {
  if (e.key !== "t" && e.key !== "T") return;
  if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
  if (e.target.closest("input, textarea, select, [contenteditable]")) return;
  const i = names.indexOf(current());
  const step = e.key === "T" ? -1 : 1;
  apply(names[(i + step + names.length) % names.length], true);
});

apply(current(), false);
