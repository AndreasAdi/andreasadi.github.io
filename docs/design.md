# Design — quiet editorial

Supersedes Ruang (`redesign/ruang`, still on origin) and Wastra before it.

One serif, one column, one accent. The site exists to be read; type does the
work and nothing is allowed to compete with it.

## Decisions

- **Typeface:** Newsreader (OFL), self-hosted, variable weight, roman and italic.
  JetBrains Mono only for code, dates and metadata. No CDN.
- **Measure:** one centred column, 40rem, 1.25rem gutters. Body is 19px
  (18px under 36rem) at line-height 1.6.
- **Colour:** light by default, dark via `prefers-color-scheme`. One accent,
  used for links only. Tokens and measured contrast are in `assets/style.css`.
- **Frame:** header (name, three links), main, one-line footer. No status bar,
  no sidebar, no panes.
- **JavaScript:** none. Pages ship HTML and CSS only.
- **Identity:** the favicon stays (a kawung cell). Per-page motifs are gone.

## Pages

- **Home:** two-sentence intro (`site.intro`), latest posts, featured projects,
  a contact line (`site.contact`).
- **Post:** title, date, reading time, tags, body, older/newer links.
- **Projects:** name, one sentence, stack line. An optional `page` field in
  `projects.js` points the name at a write-up under `/posts/` and moves the repo
  to a "Source" link.
- **About:** `content/about.md`.

## Not done

Screenshots on project entries, until there are some worth showing. More posts:
the layout is only as good as what is in it.
