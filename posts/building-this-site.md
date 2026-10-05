---
title: Building this site by hand
date: 2026-09-20
updated: 2026-10-05
summary: Plain HTML, one Node script, and no framework - how this site is put together.
tags: [meta, node]
---

I wanted a place to write about what I build without adopting a framework, a
theme, or a server. So the site is three things: Markdown files, one Node
script, and a stylesheet.

## How a build works

`build.mjs` reads every file in `posts/`, parses the frontmatter, renders the
Markdown to HTML, and writes the result into `dist/`:

```js
const html = await marked.parse(markdown);   // marked + highlight.js
write(`posts/${slug}/index.html`, layout({ title, description: summary, content: html }));
```

A GitHub Actions workflow uploads `dist/` to GitHub Pages. Nothing runs on the
visitor's machine: no JavaScript, no fonts from a CDN, no analytics.

## What I left out

- A framework or static site generator - the build is one file.
- A database and an admin panel - a post is a file in `posts/`.
- Client-side syntax highlighting - highlighting happens at build time.

If I want something else later, the source of truth is still Markdown files and
a `projects.js` list.

## Update, September 23

The site now runs one script in the page. `cloth.js` uses WebGL to dye a batik
cloth for each page: kawung, parang or truntum, picked from the page's address,
so the same page always gets the same cloth. The strip along the edge of this
page is one. Move your pointer across a cloth to draw on it with wax; the dye
slowly bleeds back in.

The build writes a still SVG of the same pattern into every page, so without
JavaScript or WebGL you see the cloth standing still. There are still no
dependencies in the page, no fonts from a CDN, and no analytics.

## Update, September 24

The cloth is gone. It was the loudest thing on the page, and what replaced it
needs the screen quiet. The site is now laid out like the tiling window manager
I actually work in: monospace throughout, hairline rules, a status bar along the
bottom, and exactly one accent colour, which is allowed to mean *this is where
you are* and nothing else. Every line height is a multiple of 24 pixels, so two
columns of text sit on the same grid — which matters for what comes next.

`cloth.js` was deleted. `motif.js` stayed, doing two smaller jobs: the favicon,
and a sixteen-pixel scrap of kawung, parang or truntum that each page still
picks from its own address. Same function, same rule, a fiftieth of the volume.

Next is the part this was all for: clicking a link will open a pane beside the
one you are reading instead of replacing it, and the arrangement of panes will
live in the URL, so a post can be handed to someone already tiled next to the
project it is about.

## Update, October 5

I never built the panes. The window-manager idea was fun to design and tiring to
read in: a reader who came for a post got a layout to learn first.

The site now borrows from [omarchy.org](https://omarchy.org/) instead: monospace
everywhere, square corners, and a wordmark drawn in pixels over a scatter of
lit cells. Both are SVG written by the build from a five-by-seven bitmap font,
so they cost nothing to load. Each project gets a small mirrored identicon
until it has a screenshot.

The colours are Omarchy's themes, all of them. Press `T` to step through them,
`Shift`+`T` to step back, or use the picker in the header; your choice is kept
for the next visit. That makes this the first version with a script again, and
it is a small one. Without it the site follows your system's light or dark
setting and nothing else is missing.

Some of those palettes were drawn for a desktop rather than for paragraphs, so
the build measures each one and nudges any text colour that falls under 4.5:1
contrast before writing the stylesheet.
