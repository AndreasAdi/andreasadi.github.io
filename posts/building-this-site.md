---
title: Building this site by hand
date: 2026-09-20
updated: 2026-09-23
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
