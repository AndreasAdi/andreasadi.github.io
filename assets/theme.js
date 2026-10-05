// The 🌓 button. The <head> applies a saved choice before first paint;
// until the reader presses this, the system's light or dark setting decides.

const root = document.documentElement;
const dark = matchMedia("(prefers-color-scheme: dark)");

for (const button of document.querySelectorAll(".theme-toggle")) {
  button.addEventListener("click", () => {
    const now = root.dataset.theme || (dark.matches ? "dark" : "light");
    const next = now === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {}
  });
}
