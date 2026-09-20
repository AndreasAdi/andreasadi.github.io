---
title: Building this site by hand
date: 2026-09-20
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
