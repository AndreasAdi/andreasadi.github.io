# Design — after omarchy.org

Supersedes the brief serif "quiet editorial" pass, Ruang (`redesign/ruang`,
still on origin) and Wastra before it.

The site looks like the desktop it is built on: monospace, square, lit by an
Omarchy theme.

## Decisions

- **Type:** JetBrains Mono for everything, self-hosted. No second family.
- **Shape:** square corners. Cards and code blocks get a 1px ring
  (`box-shadow: 0 0 0 1px`), never a drop shadow.
- **Colour:** every Omarchy theme, defined once in `themes.js`. The build
  writes `themes.css` and corrects any theme whose muted text, links or button
  ink miss 4.5:1 (see `themeVars` in `build.mjs`). Defaults: `tokyo-night`,
  or `flexoki-light` when the system asks for light.
- **Pixels:** `lib/pixel.js` holds a 5×7 bitmap font. The build draws the hero
  wordmark, the header mark, the favicon, the hero's cell field and each
  project's identicon as SVG. All fills are theme variables.
- **Script:** one, `assets/theme.js`, for the picker and the `T` / `Shift+T`
  keys. A few lines in `<head>` apply a saved theme before first paint.
  Without JavaScript the picker is hidden and the page follows
  `prefers-color-scheme`.
- **Nerd details:** a `~/path` crumb above page titles, `##` before article
  headings, `-` list bullets, `#tags`, and the commit hash in the footer.

## Pages

- **Home:** "new" pill to the latest post, pixel wordmark, tagline, two
  buttons, latest posts, project cards, contact card.
- **Post:** crumb, title, date, reading time, tags, body, older/newer cards.
- **Projects:** card grid. An optional `page` field in `projects.js` points a
  card at a write-up under `/posts/`.
- **About:** `content/about.md`.
