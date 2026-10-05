import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Marked } from "marked";
import { markedHighlight } from "marked-highlight";
import hljs from "highlight.js";
import { site } from "./site.js";

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, "dist");

// Matches the page background in assets/style.css.
const THEME = { light: "#ffffff", dark: "#111111" };

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const marked = new Marked(
  markedHighlight({
    emptyLangClass: "hljs",
    langPrefix: "hljs language-",
    highlight(code, lang) {
      const language = hljs.getLanguage(lang) ? lang : "plaintext";
      return hljs.highlight(code, { language }).value;
    },
  })
);

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const abs = (p) => new URL(p, site.url).href;
const write = (relPath, contents) => {
  const target = join(OUT, relPath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
};

/* ---------- frontmatter ---------- */

const KNOWN_KEYS = new Set([
  "title",
  "date",
  "summary",
  "description",
  "tags",
  "draft",
  "updated",
  "image",
]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const unquote = (s) => {
  const quoted =
    s.length >= 2 && ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")));
  return quoted ? s.slice(1, -1) : s;
};

function parseValue(raw) {
  if (raw.startsWith("[") && raw.endsWith("]")) {
    const inner = raw.slice(1, -1).trim();
    return inner === "" ? [] : inner.split(",").map((item) => unquote(item.trim()));
  }
  if (raw === "true") return true;
  if (raw === "false") return false;
  return unquote(raw);
}

function parseFrontmatter(file, source) {
  if (!source.startsWith("---\n")) throw new Error(`${file}: missing frontmatter block`);
  const end = source.indexOf("\n---\n", 3);
  if (end === -1) throw new Error(`${file}: missing frontmatter block`);
  const block = source.slice(4, end);
  const body = source.slice(end + 5);
  const data = {};
  for (const line of block.split("\n")) {
    if (line.trim() === "") continue;
    const match = /^([A-Za-z][A-Za-z0-9_-]*):[ \t]*(.*)$/.exec(line);
    if (!match) throw new Error(`${file}: unsupported frontmatter line: ${line}`);
    const key = match[1];
    if (!KNOWN_KEYS.has(key)) throw new Error(`${file}: unknown frontmatter key: ${key}`);
    data[key] = parseValue(match[2].trim());
  }
  return { data, body };
}

const isDate = (v) => typeof v === "string" && DATE_RE.test(v) && !Number.isNaN(Date.parse(v));

function stringList(file, key, value) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${file}: ${key} must be a list of strings`);
  }
  return value;
}

/* ---------- content ---------- */

function loadPosts() {
  const dir = join(ROOT, "posts");
  const posts = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
    const rel = `posts/${file}`;
    const slug = file.slice(0, -3);
    if (!SLUG_RE.test(slug)) throw new Error(`${rel}: invalid slug: ${slug}`);
    const { data, body } = parseFrontmatter(rel, readFileSync(join(dir, file), "utf8"));
    if (typeof data.title !== "string" || data.title === "") throw new Error(`${rel}: missing title`);
    if (!isDate(data.date)) throw new Error(`${rel}: missing or invalid date (expected YYYY-MM-DD)`);
    if (typeof data.summary !== "string" || data.summary === "") throw new Error(`${rel}: missing summary`);
    if (data.updated !== undefined && !isDate(data.updated)) {
      throw new Error(`${rel}: invalid updated (expected YYYY-MM-DD)`);
    }
    if (data.image !== undefined && typeof data.image !== "string") {
      throw new Error(`${rel}: image must be a string`);
    }
    if (data.draft !== undefined && typeof data.draft !== "boolean") {
      throw new Error(`${rel}: draft must be true or false`);
    }
    const html = marked.parse(body);
    posts.push({
      slug,
      title: data.title,
      date: data.date,
      updated: data.updated,
      summary: data.summary,
      tags: data.tags === undefined ? [] : stringList(rel, "tags", data.tags),
      draft: data.draft === true,
      html,
    });
  }
  posts.sort((a, b) =>
    a.date === b.date ? (a.slug < b.slug ? -1 : 1) : a.date < b.date ? 1 : -1
  );
  return posts;
}

/* ---------- layout ---------- */

// Black on white, set in whatever Times the reader's machine has: no web
// fonts, no theme files. The favicon is the one mark the site keeps.
const favicon = (() => {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' fill='#333'/><text x='16' y='24' font-family='Times New Roman,serif' font-size='24' font-weight='700' text-anchor='middle' fill='#fff'>a</text></svg>`;
  return `data:image/svg+xml,${svg.replace(/#/g, "%23").replace(/</g, "%3C").replace(/>/g, "%3E")}`;
})();

// Drop a square photo at assets/avatar.jpg and the header picks it up.
const AVATAR = existsSync(join(ROOT, "assets/avatar.jpg"));

const LINKS = [
  ["Email", `mailto:${site.email}`],
  ["GitHub", site.github],
  ["RSS", "/feed.xml"],
];

const toggle = `<button type="button" class="theme-toggle" aria-label="Toggle dark mode" title="Toggle dark mode">🌓</button>`;

function layout({ title, description, path, content, type = "website", top }) {
  const docTitle = title === site.title ? site.title : `${title} | ${site.title}`;
  return `<!DOCTYPE html>
<html lang="${site.language}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(docTitle)}</title>
<meta name="description" content="${esc(description)}">
<meta name="theme-color" content="${THEME.light}" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="${THEME.dark}" media="(prefers-color-scheme: dark)">
<link rel="canonical" href="${abs(path)}">
<meta property="og:type" content="${type}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${abs(path)}">
<meta name="twitter:card" content="summary">
<link rel="alternate" type="application/rss+xml" title="${esc(site.title)}" href="/feed.xml">
<link rel="icon" href="${favicon}">
<link rel="stylesheet" href="/style.css">
<script>
// The saved choice is applied before first paint; otherwise the system decides.
(function () {
  try {
    var t = localStorage.getItem("theme");
    if (t === "dark" || t === "light") document.documentElement.dataset.theme = t;
  } catch (e) {}
})();
</script>
<script src="/theme.js" defer></script>
</head>
<body>
<div class="container">
${top}
<main>
${content}
</main>
</div>
</body>
</html>
`;
}

/* ---------- pages ---------- */

const posts = loadPosts().filter((p) => !p.draft);
const newest = posts.length ? posts[0].date : new Date().toISOString().slice(0, 10);

const backBar = `<div class="topbar">
  <a class="back" href="/">← Back</a>
  ${toggle}
</div>`;

{
  const header = `<header class="header">
  ${AVATAR ? `<img src="/avatar.jpg" alt="${esc(site.author)}" class="avatar" width="80" height="80">` : ""}
  <div class="header-content">
    <h1 class="site-title">${esc(site.title)}</h1>
    <nav class="links" aria-label="Elsewhere">
      ${LINKS.map(([label, href]) => `<a href="${href}">${label}</a>`).join("\n      ")}
    </nav>
  </div>
  ${toggle}
</header>`;
  const list = posts.length
    ? `<ul class="post-list">
${posts
  .map(
    (p) => `  <li>
    <h2><a href="/posts/${p.slug}/">${esc(p.title)}</a></h2>
    <time class="post-date" datetime="${p.date}">${p.date}</time>
  </li>`
  )
  .join("\n")}
</ul>`
    : `<p class="post-date">Nothing here yet.</p>`;
  write(
    "index.html",
    layout({ title: site.title, description: site.description, path: "/", top: header, content: list })
  );
}

for (const post of posts) {
  write(
    `posts/${post.slug}/index.html`,
    layout({
      title: post.title,
      description: post.summary,
      path: `/posts/${post.slug}/`,
      type: "article",
      top: backBar,
      content: `<article>
  <h1>${esc(post.title)}</h1>
  <time class="post-date" datetime="${post.date}">${post.date}</time>
  <div class="post-body">
${post.html}
  </div>
</article>`,
    })
  );
}

// The old list page and the retired sections send readers home.
const redirect = (to) => `<!DOCTYPE html>
<meta charset="utf-8">
<title>Moved</title>
<meta http-equiv="refresh" content="0; url=${to}">
<link rel="canonical" href="${abs(to)}">
<p><a href="${to}">Moved here.</a></p>
`;
for (const old of ["posts", "projects", "about"]) write(`${old}/index.html`, redirect("/"));

write(
  "404.html",
  layout({
    title: "Not found",
    description: "That page does not exist.",
    path: "/404.html",
    top: backBar,
    content: `<h1>Not found</h1>
<p>That page does not exist.</p>`,
  })
);

/* ---------- feed, sitemap, robots ---------- */

{
  const items = posts
    .map(
      (p) => `    <item>
      <title>${esc(p.title)}</title>
      <link>${abs(`/posts/${p.slug}/`)}</link>
      <guid isPermaLink="true">${abs(`/posts/${p.slug}/`)}</guid>
      <pubDate>${new Date(`${p.date}T00:00:00Z`).toUTCString()}</pubDate>
      <description>${esc(p.summary)}</description>
    </item>`
    )
    .join("\n");
  write(
    "feed.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(site.title)}</title>
    <link>${abs("/")}</link>
    <description>${esc(site.description)}</description>
    <language>${site.language}</language>
    <atom:link href="${abs("/feed.xml")}" rel="self" type="application/rss+xml"/>
    <lastBuildDate>${new Date(`${newest}T00:00:00Z`).toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>
`
  );
}

{
  const routes = [
    ["/", newest],
    ...posts.map((p) => [`/posts/${p.slug}/`, p.updated ?? p.date]),
  ];
  const urls = routes
    .map(
      ([path, lastmod]) => `  <url>
    <loc>${abs(path)}</loc>
    <lastmod>${lastmod}</lastmod>
  </url>`
    )
    .join("\n");
  write(
    "sitemap.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`
  );
}

write("robots.txt", `User-agent: *
Allow: /

Sitemap: ${abs("/sitemap.xml")}
`);

/* ---------- assets ---------- */

function copyDir(src, dest) {
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const from = join(src, entry.name);
    const to = join(dest, entry.name);
    if (entry.isDirectory()) {
      mkdirSync(to, { recursive: true });
      copyDir(from, to);
    } else if (entry.isFile()) {
      mkdirSync(dirname(to), { recursive: true });
      copyFileSync(from, to);
    }
  }
}
copyDir(join(ROOT, "assets"), OUT);

console.log(`built ${posts.length} posts → dist/`);
