# Ruang — design specification

Status: draft for implementation. Supersedes **Wastra** (the batik-cloth theme in
`assets/style.css`, `assets/cloth.js`).

Ruang is Indonesian for *room*, and for *space*. The site stops being a sequence
of pages and becomes a tiling window manager: reading is spatial, the reader
composes the view, and a layout is a thing you can send to someone.

---

## 1. Intent

One sentence: **the site behaves like the machine it was built on.**

Three commitments that follow from it, in priority order. When something in this
spec conflicts, the lower number wins.

1. **Focus is the only ornament.** Exactly one pane is focused. That pane gets
   the accent colour; nothing else on the site is ever allowed to use it. A
   reader glancing at the screen must know where they are without reading a word.
2. **Structure over depth.** Strictly 2D: no shadows, no gradients, no blur, no
   parallax, no canvas. Interest comes from hairlines, alignment, and density.
3. **A layout is addressable.** Any arrangement of panes serialises into the URL
   and restores from it. This is the feature the concept exists for.

## 2. Non-goals

- Not a terminal emulator pastiche. No fake prompts, no blinking block cursor, no
  `$ whoami`, no typewriter text, no ASCII art banner. Ruang borrows a window
  manager's *structure*, not a shell's costume.
- Not a general-audience redesign. On phones Ruang deliberately degrades to the
  plain document it already is (§10). Splitting is a desktop affordance and the
  spec does not apologise for that.
- Not a single-page app. No client router owning the site, no framework, no build
  step beyond the Node script that already exists.
- Not animated. Transitions exist only to show that a pane arrived (§9.4).

## 3. Decisions already taken

These were live questions; they are closed. Rationale included because each one
is the kind of thing that gets quietly reversed during implementation.

**3.1 No `Super` key bindings.** The obvious pitch for this concept is
`super+h/j/k/l` to mirror Hyprland. It cannot work: on your own laptop Hyprland
grabs `Super` at the compositor and the browser never sees the event. A binding
that is dead on the author's machine is not a binding. Ruang uses **unmodified
single keys** instead (§9.2) — legitimate here because the site has no text
inputs anywhere — with no `Alt` combos either, since `Alt`+letter collides with
menu access keys on Linux Firefox.

**3.2 A plain click splits.** Clicking an internal link opens a *new pane beside
the current one* rather than replacing it. Splitting has to be the default
gesture or nobody will ever discover the concept — but it needs a ceiling, so
pane count is capped and the least-recently-focused pane is recycled at the cap
(§7.2).

Amended in phase 2: this section used to give `Ctrl`/`Cmd`-click the job of
replacing a pane in place. Implementing it meant calling `preventDefault` on the
one gesture every user already owns — open in a new tab — which is a worse
trade than losing the feature. **All modified clicks now fall through to the
browser untouched.** Replace-in-place moved to a key instead, where it costs no
convention: `r` in phase 4, which is link-hint mode with the chosen link
replacing the focused pane rather than splitting it.

**3.3 Both colour schemes ship.** Dark is the default and the one the design is
drawn for, but the current site honours `prefers-color-scheme` and regressing to
dark-only is a real accessibility loss. Both token sets are specified in §4 with
measured ratios.

**3.4 The batik is retired, with two survivors.** The wax-drawing cloth and
Ruang cannot coexist: a hand-dyed indigo field is loud, and commitment 1 needs
the screen quiet enough that a single orange hairline reads as *state*. So
`assets/cloth.js` and every `data-cloth` hook go. `assets/motif.js` **stays** and
keeps earning its place in two reduced forms:

- the favicon, unchanged;
- a **pane glyph**: one single motif cell, `stillSVG()` at 14×14px, seeded by the
  pane's path, rendered in the pane title bar as that pane's icon.

Same function, same seed-from-address rule, so a page's identity survives the
redesign at 1/50th the volume. Kawung, parang and truntum become how you tell
panes apart at a glance.

**3.5 Monospace everywhere, one family.** Plus Jakarta Sans is dropped entirely
(both woff2 files and its OFL). Default to self-hosted **JetBrains Mono**
(variable, latin subset, SIL OFL 1.1 — ship the licence beside it exactly as the
current `assets/fonts/` does). If you buy Berkeley Mono it is a one-token swap;
the spec assumes nothing about which.

---

## 4. Tokens

Every ratio below is measured, not estimated. Text pairs are held to ≥4.5:1, the
focus indicator and the resize handle to ≥3:1 (WCAG 1.4.11, non-text contrast).

### 4.1 Dark (default)

| Token | Value | Role |
|---|---|---|
| `--ground` | `#0b0c0d` | the desktop behind the panes; gutters |
| `--pane` | `#14161a` | pane fill |
| `--raised` | `#1b1e24` | code blocks, title bars, status bar |
| `--rule` | `#2a2e36` | hairlines, unfocused pane border |
| `--rule-hi` | `#3a3f4a` | table rules, hover borders |
| `--handle` | `#666e7d` | gutter on hover/keyboard-resize |
| `--ink` | `#d6d9de` | body text |
| `--muted` | `#8b929f` | metadata, dates, tags, status bar |
| `--accent` | `#ff6a1f` | **focus only** — focused border, focus ring, active status segment |

Measured, dark:

```
ink    on pane 12.80   on ground 13.83   on raised 11.80
muted  on pane  5.79   on ground  6.26   on raised  5.33
accent on pane  6.33   on ground  6.84   on raised  5.83
handle on pane  3.53   on ground  3.81
```

`--rule` against `--pane` is 1.33:1 — deliberately near-invisible. Unfocused
borders are structure, not information; focus is carried entirely by `--accent`
appearing, which clears 3:1 with room to spare.

### 4.2 Light

| Token | Value |
|---|---|
| `--ground` | `#e8e6e1` |
| `--pane` | `#f6f5f2` |
| `--raised` | `#eeece7` |
| `--rule` | `#c7c4bd` |
| `--rule-hi` | `#a8a49b` |
| `--handle` | `#7e7a71` |
| `--ink` | `#1b1d21` |
| `--muted` | `#565b64` |
| `--accent` | `#b23c06` |

Measured, light:

```
ink    on pane 15.48   on ground 13.53   on raised 14.30
muted  on pane  6.26   on ground  5.47   on raised  5.78
accent on pane  5.44   on ground  4.75   on raised  5.02
handle on pane  3.92   on ground  3.43
```

Light keeps a cool-grey paper rather than white, so `--pane` still reads as a
*surface sitting on* `--ground` at 1.14:1 without a shadow.

### 4.3 Structure tokens

```
--line:   1.5rem   /* 24px — the baseline. every line-height is a multiple */
--pad:    2ch      /* pane padding, horizontal and vertical */
--gutter: 1px      /* between panes; hit area is 9px, see §9.3 */
--measure: 72ch    /* prose max width inside a pane */
--pane-min: 44ch   /* below this a pane cannot be resized or opened */
--pane-step: 4ch   /* one press of H or L */
--bar: calc(var(--line) + 4px)   /* status bar height */
```

`--pane-min` and `--pane-step` are **measured** by `ruang.js` at runtime rather
than duplicated as numbers in the script. Phase 4 shipped with `--pane-min`
missing from `:root` — `var(--pane-min)` then resolves to nothing, the probe
measures 0, and every clamp silently becomes no clamp. Keep them defined.

Reuse the existing pattern: tokens on `:root`, redefined under
`@media (prefers-color-scheme: dark)`, and `color-scheme` declared so form
controls and scrollbars follow.

---

## 5. Typography

Root `15px`, baseline `24px`. Because the family is monospace, `ch` **is** the
cell width — use `ch` for horizontal rhythm directly and never hardcode px for
measure, padding, or pane minimums.

| Element | Size | Line | Treatment |
|---|---|---|---|
| `h1` | 24px | 48px | regular weight, `-0.01em` tracking |
| `h2` | 18px | 24px | medium, preceded by a full `--line` of space |
| `h3` | 15px | 24px | medium, uppercase, `+0.08em` tracking |
| body | 15px | 24px | regular |
| small / meta | 13px | 24px | `--muted` |
| pane title | 13px | 24px | uppercase, `+0.06em`, `--muted` (`--ink` when focused) |
| status bar | 13px | 24px | `--muted` |

Every line-height is a multiple of 24px, so text across two adjacent panes sits
on a shared baseline grid. This is the whole reason the type scale is this narrow
— it is worth more than a wider range of sizes.

Rules:

- No italics anywhere. Emphasis is weight, case, and colour. (Monospace italics
  are weak, and `--muted` plus uppercase covers every case the content has.)
- Ligatures off globally: `font-feature-settings: "calt" 0`. Including code —
  `!=` rendering as `≠` in a code sample on a developer's site is a liability.
- `font-variant-numeric: tabular-nums` globally. Dates in a post list should form
  a column.
- Prose wraps at `min(var(--measure), 100%)`; a pane narrower than the measure
  simply wraps earlier, never scrolls horizontally.
- `text-wrap: pretty` on headings and `p`.

---

## 6. Layout model

### 6.1 The shell

The document is exactly viewport-height and **does not scroll**. `overflow:
hidden` on `html, body`.

```
┌──────────────────────────────────────────────────────────────┐
│ ▞ ANDREAS ADI          posts  projects  about                │  header, --bar tall
├───────────────────────┬──────────────────────────────────────┤
│ ▞ POSTS               │ ▞ BUILDING THIS SITE                 │  pane title bars
│───────────────────────│──────────────────────────────────────│
│                       │                                      │
│  scrolls              │  scrolls independently                │
│  independently        │                                      │
│                       │                                      │
├───────────────────────┴──────────────────────────────────────┤
│ 1:posts  [2:building-this-site]        ?  rss  gh  ⟨a1b2c3⟩  │  status bar, --bar tall
└──────────────────────────────────────────────────────────────┘
                        ↑ 1px gutter, draggable
```

- **Header**: brand plus nav, `--bar` tall, `--raised`, one hairline below. Nav
  links split like any other link.
- **Panes**: a flat left-to-right row. Not a tree — no vertical splits in v1.
  Each pane is its own scroll container with its own title bar.
- **Status bar**: pane indicators left, utility cluster right. It replaces the
  site footer entirely (§11.3), so it carries what the footer carried.

### 6.2 Pane count cap

Driven by `--pane-min` (44ch ≈ 396px) plus `2×--pad`:

| Viewport | Max panes |
|---|---|
| `< 900px` | 1 — splitting disabled entirely (§10) |
| `900–1399px` | 2 |
| `≥ 1400px` | 3 |

Opening a pane at the cap recycles the least-recently-focused pane rather than
refusing. Never refuse a click. On viewport shrink below the current count, panes
are closed from least-recently-focused until they fit.

### 6.3 Sizing and zoom

Panes are sized in percentages of the row and default to equal shares. Dragging a
gutter reallocates between its two neighbours only, clamped so neither drops
below `--pane-min`. Zoom (`f`) expands the focused pane to the full row and
collapses the others to a 3ch-wide labelled stub — kept visible on purpose, so
zoom reads as a state you are in rather than panes having vanished. `Escape`
exits.

As shipped: the pane count changing resets every width to an equal share, and
opening or closing a pane leaves zoom. Zoom follows focus, so `h`/`l` or
clicking a stub while zoomed moves the zoom rather than dropping out of it.

---

## 7. URL contract

This is the signature feature; treat this section as normative.

### 7.1 Grammar

```
/?p=<path>|<path>|<path>&f=<index>&w=<pct>,<pct>,<pct>&z=1
```

- `p` — pipe-joined pane paths, leading and trailing slashes stripped, each
  `encodeURIComponent`-encoded. Home is the empty string. Order is left to right.
- `f` — zero-based index of the focused pane. Default `0`. Out-of-range clamps.
- `w` — integer percentages, must sum to 100 ± 1 and match `p` in length.
  Omitted, malformed, or mismatched → equal shares. Never an error.
- `z` — `1` when the focused pane is zoomed (§6.3); absent otherwise. Added in
  phase 4: a zoom survives a reload and travels with a shared link, which is the
  same argument that puts `p` and `f` there.
- `w` is written only when a width differs from an equal share by more than a
  point, so an untouched layout keeps a clean URL.
- Unknown params are ignored and preserved on rewrite.

`/?p=posts/building-this-site|projects&f=1` is an essay pre-tiled beside the
project it is about. That is the shareable artefact.

### 7.2 Behaviour

- Any layout change (`open`, `close`, `focus`, `zoom`) does `history.replaceState`.
  Only **open** and **close** push a new entry — focus changes must not fill the
  back stack. Gutter drags `replaceState` on pointer-up, never during the drag.
- `popstate` rebuilds the layout from the URL.
- Every pane path stays a real, independently-loadable URL. A single-pane layout
  rewrites to that page's own clean path (`/posts/x/`), not to `?p=posts/x`.
- A path that 404s renders an error pane in place (§8.3) and stays in the URL.
  One bad path must not discard the rest of a shared layout.

### 7.3 Crawlers

Query-string layouts are never linked from static HTML, so nothing new becomes
crawlable. `rel=canonical` continues to point at the page the document was built
as. The server-rendered page is what every crawler and reader-mode sees, and that
is unchanged from today.

---

## 8. Pane content

### 8.1 Fetch contract

To open path `P`:

1. Check an in-memory `Map` cache, keyed by normalised path.
2. Otherwise `fetch(P)` — the canonical page, exactly as built today.
3. Parse with `DOMParser`, extract `#main` for the body and `<title>` for the
   pane title (strip the ` — Andreas Adi` suffix).
4. Cache and insert.

No new build output. The fragment *is* the page, so a pane can never show
something a direct visit would not, and there is one fewer artefact to keep in
sync. If payload ever matters, emitting `dist/x/<path>.html` fragments is a
drop-in optimisation behind the same function — deliberately deferred.

### 8.2 States

Each pane is in exactly one of: `loading` (title bar shows the target path,
body holds three `--rule` skeleton lines — no spinner), `ready`, `error`.

### 8.3 Error pane

Any non-2xx or network failure renders inside the pane: the attempted path in
`--ink`, a one-line reason, and a link home. Neighbouring panes are untouched.
`dist/404.html` keeps working for direct visits; its `variant: "lost"` hole
treatment goes with the cloth.

---

## 9. Interaction

### 9.1 Pointer

| Gesture | Result |
|---|---|
| click internal link | open in a new pane to the right of the focused pane, and focus it |
| `Ctrl`/`Cmd`/`Shift`+click, middle-click | left to the browser — new tab, new window (§3.2) |
| click external link | new browser tab — `target=_blank rel="noopener"`, set by `ruang.js` at boot and after every pane fill, not by the build, so the plain document keeps ordinary link behaviour |
| click anywhere in a pane | focus that pane |
| click pane title bar `×` | close |
| drag gutter | resize the two neighbours |

First split in a session writes a single hint into the status bar — *a link opens
a pane beside this one · × or the URL to share a layout* — which fades after 8s.
Once, never again in that session. No modal, no tour, no `localStorage`.

### 9.2 Keyboard

Unmodified single keys, ignored when any modifier is held or when focus is inside
a control. Bindings are listed in the `?` sheet and nowhere else on screen.

| Key | Action |
|---|---|
| `h` / `l` | focus pane left / right |
| `j` / `k` | scroll focused pane down / up (native, one `--line` per press) |
| `s` | link-hint mode — label every link in the focused pane; typing a label opens it in a new pane |
| `r` | the same, but the link replaces the focused pane (§3.2) |
| `f` | zoom focused pane / unzoom |
| `H` / `L` | make the focused pane narrower / wider by `--pane-step` |
| `x` | close focused pane (never the last one) |
| `1`–`3` | focus pane by index |
| `g` | focus the nav |
| `?` | help sheet |
| `Escape` | exit zoom, hint mode, or help |

`s` rather than `f` for hints because `f` is the window-manager verb for
fullscreen and that association is stronger here than the vimium one.

`H`/`L` grow and shrink the *focused pane* rather than "moving its right
gutter": the same operation, but it still means something for the last pane in
the row, which has no right gutter and would otherwise have two dead keys.

### 9.3 Hit areas

Phase 2 shipped the gutter as paint only — a 1px flex gap, no element — because
a `separator` role that resizes nothing is a lie to a screen reader. Phase 4
makes it real:

The gutter is 1px of paint and **9px of hit area**, centred, with
`cursor: col-resize`. It is a real control: `role="separator"`,
`aria-orientation="vertical"`, `aria-valuenow` as the left pane's percentage,
focusable, and arrow-key resizable. `--handle` on hover, focus, and during drag
(≥3:1, §4).

### 9.4 Motion

Only two transitions exist: pane width `120ms ease-out`, and pane content
opacity `0 → 1` in `90ms` on arrival. Nothing else animates. Both are removed
under `prefers-reduced-motion: reduce`, where panes appear instantly.

---

## 10. Progressive enhancement

The layer order matters more than any single feature here.

1. **No JS.** Every page is the complete server-rendered document it is today:
   header, `#main`, status bar as a static footer. Links navigate normally. Ruang
   is invisible and nothing is broken. This stays true permanently — it is the
   reason the fetch contract reuses canonical pages.
2. **JS, narrow (`< 900px`).** The pane engine does not initialise. Links
   navigate normally. The site is exactly the document from (1), with the
   `overflow: hidden` viewport lock **not** applied. No swipe gestures, no
   drawer.
3. **JS, wide.** `ruang.js` wraps the existing `#main` into pane 0 in place —
   without refetching it — and starts intercepting clicks.

Boot, on the current inline-script pattern in `layout()`: an inline script sets
`documentElement.classList.add("js")` (already there) plus `ruang` when the
viewport qualifies, before first paint. If `?p=` is present with more than one
path, that same inline script also adds `ruang-booting`, which hides `#main`, so
a shared multi-pane link never flashes the single-pane document before rearranging.
`ruang.js` removes `ruang-booting` once pane 0 is mounted. A `<noscript>` rule
and a 2s failsafe timeout both clear it, so a script error can never leave a
blank page.

---

## 11. Accessibility

- Each pane is `role="region"` with `aria-label` from its title. Panes are not
  focus traps — `Tab` moves through all panes in visual order.
- Opening a pane moves focus to its container (`tabindex="-1"`), so the next
  `Tab` lands inside the new content.
- A `aria-live="polite"` region in the status bar announces openings, closings
  and zoom: *"Opened Posts. Pane 2 of 3."*
- The focused pane's border is `--accent` at 2px (6.33:1). Keyboard focus rings
  are `--accent` at 2px with a 2px offset and are never removed, in either scheme.
- Focus must be visible on the gutter separator and the pane close button, not
  only on links.
- The skip link stays and targets the focused pane.
- `?` help sheet is a real `<dialog>`: focus-trapped while open, `Escape` closes,
  focus returns to the invoker.
- Zoom is always escapable by keyboard and by clicking any collapsed stub.
- Honour `prefers-reduced-motion` (§9.4) and `prefers-contrast: more` by
  promoting `--rule` to `--rule-hi`.

---

## 12. Build changes

Concrete, against the current tree.

**12.1 `assets/style.css`** — replaced wholesale. Keep the existing house style
of the file: a header comment explaining the metaphor and the measured contrast
pairs, tokens on `:root`, no preprocessor. Budget ≤8KB gzipped.

**12.2 `assets/ruang.js`** — new, ES module, no dependencies. Owns: pane model,
URL serialise/parse, fetch and cache, click interception, keyboard map, gutter
drag, zoom, hint mode, live-region announcements. Budget ≤10KB gzipped.

This number moved twice — 6KB, then 8KB, then 10KB — which is worth admitting
rather than hiding, because it was never derived from anything. 8.5KB of gzipped
JavaScript is not a performance problem on any connection this site will meet;
the constraint that actually matters is the one in §12.2's first line, **no
dependencies and no build step for the page's own script**, and that has held
since phase 2. 10KB is set with room on purpose so it stops being edited every
phase. If it is ever in reach again, that means something was added that wants
justifying on its own terms, not a smaller comment budget: the file ships
unminified, the way the rest of the source does. Plain DOM, in the
house style.

**12.3 `build.mjs`**

- `layout()` — drop the `variant: "lost"` and `variant: "home"` branches and the
  `cloth(...)` calls; every page becomes one shape: header, `#main`, status bar.
  Add `data-pane-path` and `data-pane-title` to `<main>` so `ruang.js` can mount
  pane 0 without a refetch. Swap the `cloth.js` module tag for `ruang.js`.
- `footer()` → `statusbar()`. Must still carry ©, GitHub, email and RSS; they
  become the right-hand cluster. Drop the `placard` cloth label.
- `cloth()` — deleted. `clothCount` goes with it.
- `projectItem()` — the `swatch` div becomes the 14×14 pane glyph via
  `stillSVG()`; keep `motif()` seeded by `p.repo`.
- `postItem()` — restructure to a grid row (`date | title | tags`) so the post
  list is a proper column-aligned table. Dates get `tabular-nums`.
- Home page — the hero goes. Pane 0 on `/` is a session pane: name, tagline, then
  the posts and projects tables. No `data-wax`, no `cloth-hint`.
- New: inject a short build SHA for the status bar. `spawnSync("git", ["rev-parse",
  "--short", "HEAD"])`, falling back to `process.env.GITHUB_SHA?.slice(0, 7)` and
  then to `"dev"` — Actions checkouts and local dirty trees both have to work.
- `theme()` — keep both highlight.js schemes; override `pre` background to
  `--raised` and its border to `--rule`.

**12.4 Deletions** — `assets/cloth.js`; `assets/fonts/plus-jakarta-sans-*.woff2`;
`assets/fonts/OFL-plus-jakarta-sans.txt`; the `data-cloth`, `data-clear`,
`data-wax` and `data-hole` hooks; the font preload for Plus Jakarta Sans.

**12.5 Retained** — `assets/motif.js` in full (favicon plus pane glyphs, §3.4),
the frontmatter parser, feed, sitemap, robots, and the whole content pipeline.
None of this changes.

**12.6 Added** — `assets/fonts/jetbrains-mono-latin.woff2` (variable, latin
subset) plus its OFL, and a matching `<link rel=preload>`.

---

## 13. Budgets

| Metric | Budget |
|---|---|
| `style.css` | ≤8KB gzipped |
| `ruang.js` | ≤10KB gzipped |
| mono webfont | ≤45KB |
| requests on first paint | unchanged from today |
| requests per split | 1, then 0 (cached) |
| CLS | 0 — pane 0 is server-rendered and mounted in place |
| pane open → content painted | <150ms on cache hit |

`ruang.js` must not block first paint: pane 0 is already in the HTML, so the
module loads `defer`-style as a module and mounts after parse.

---

## 14. Acceptance checklist

Ship gates, not nice-to-haves. The ticked ones run as
`npm run test:panes` (`test/panes.mjs`), which serves `dist/` and drives a
headless Chromium; the rest are still by hand.

- [x] JS disabled: every page reads completely, all links work, nothing is hidden.
- [x] `?p=posts/building-this-site|projects&f=1` restores that exact layout with
      pane 2 focused, with no flash of the single-pane document.
- [x] Narrow viewport (`390px`): identical to a no-JS visit, no horizontal scroll,
      no viewport lock.
- [x] Keyboard only, no mouse: open two panes, move focus, scroll, resize, zoom,
      unzoom, close, reach every link by hint — all reachable, focus always
      visible.
- [x] Screen reader announces each pane open with its position.
- [ ] `prefers-reduced-motion`: no transitions run.
- [ ] Both schemes: measured ratios in §4 hold; accent appears **only** on focus.
- [x] Back button after two splits and a focus change returns through layouts,
      not through focus changes.
- [x] A 404 path inside a shared multi-pane URL leaves the other panes intact.
- [x] Opening a 4th pane at the cap recycles rather than refusing or overflowing.
- [x] Two adjacent panes share a baseline grid — body text lines up across the gutter.
- [ ] `grep -r data-cloth dist/` is empty.

---

## 15. Phasing

Each phase is independently shippable; stopping after any of them leaves a
coherent site.

1. ~~**Tokens and type.**~~ *Shipped.* New `style.css`, mono font, status bar,
   restructured post and project tables, cloth removed.
2. ~~**Pane engine.**~~ *Shipped.* Mount pane 0, click-to-split, close, focus,
   the URL contract, fetch and cache, error panes — plus the nav change in §6.1
   and the amendment in §3.2, both found while building it.
3. ~~**Keyboard.**~~ *Shipped.* Key map, `?` sheet, live-region announcements,
   link hints — plus `target=_blank` on external links (§9.1), without which one
   click on a GitHub link took every open pane with it.
4. ~~**Polish.**~~ *Shipped.* Gutter drag and the `H`/`L` resize keys, zoom with
   stubs and `f`, `r` for replace-in-place, the `z` and `w` URL parameters.
   `prefers-contrast` landed in phase 1 and the first-split hint in phase 2.

All four phases are built. `npm run test:panes` covers them.

## 16. Open questions

Only the ones that actually need your answer; everything else is decided above.

1. **Mono family** — spec assumes JetBrains Mono. Berkeley Mono is a token swap
   if you want to buy it.
2. **Pane cap of 3** — 3 at ≥1400px assumes you mostly work on the laptop panel.
   If you're usually on an external display, 4 is defensible; it changes only the
   table in §6.2.
3. **Vertical splits** — excluded from v1 as a real complexity jump (a row
   becomes a tree, and the URL grammar needs nesting). Worth it only if you find
   yourself wanting an essay above its own source rather than beside it.
