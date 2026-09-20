import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Marked } from "marked";
import { markedHighlight } from "marked-highlight";
import hljs from "highlight.js";
import { site } from "./site.js";
import { projects } from "./projects.js";

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, "dist");

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
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const prettyDate = (iso) =>
  `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}, ${iso.slice(0, 4)}`;
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
    posts.push({
      slug,
      title: data.title,
      date: data.date,
      updated: data.updated,
      summary: data.summary,
      tags: data.tags === undefined ? [] : stringList(rel, "tags", data.tags),
      draft: data.draft === true,
      html: marked.parse(body),
    });
  }
  posts.sort((a, b) =>
    a.date === b.date ? (a.slug < b.slug ? -1 : 1) : a.date < b.date ? 1 : -1
  );
  return posts;
}

function validateProjects() {
  projects.forEach((p, i) => {
    const fail = (msg) => {
      throw new Error(`projects.js: entry ${i}: ${msg}`);
    };
    for (const key of ["name", "description", "repo"]) {
      if (typeof p[key] !== "string" || p[key] === "") fail(`missing ${key}`);
    }
    if (p.url !== null && typeof p.url !== "string") fail("url must be a string or null");
    if (!Array.isArray(p.tags) || p.tags.some((t) => typeof t !== "string")) {
      fail("tags must be a list of strings");
    }
    if (p.featured !== undefined && typeof p.featured !== "boolean") {
      fail("featured must be true or false");
    }
  });
  if (projects.length === 0) throw new Error("projects.js: no projects");
  return projects.map((p) => ({ ...p, featured: p.featured === true }));
}

/* ---------- layout ---------- */

function layout({ title, description, path, content, section, type = "website" }) {
  const docTitle = title === site.title ? `${site.title} — ${site.tagline}` : `${title} — ${site.title}`;
  const nav = [
    ["Home", "/", "home"],
    ["Posts", "/posts/", "posts"],
    ["Projects", "/projects/", "projects"],
    ["About", "/about/", "about"],
  ]
    .map(
      ([label, href, key]) =>
        `<a href="${href}"${key === section ? ' aria-current="page"' : ""}>${label}</a>`
    )
    .join("\n      ");
  return `<!DOCTYPE html>
<html lang="${site.language}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(docTitle)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${abs(path)}">
<meta property="og:type" content="${type}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${abs(path)}">
<meta name="twitter:card" content="summary">
<link rel="alternate" type="application/rss+xml" title="${esc(site.title)}" href="/feed.xml">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%231f5fd0'/%3E%3Ctext x='16' y='22' font-family='system-ui,sans-serif' font-size='15' font-weight='600' fill='%23ffffff' text-anchor='middle'%3EA%3C/text%3E%3C/svg%3E">
<link rel="stylesheet" href="/style.css">
<link rel="stylesheet" href="/highlight.css">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <a class="brand" href="/">${esc(site.title)}</a>
  <nav aria-label="Main">
      ${nav}
  </nav>
</header>
<main id="main">
${content}
</main>
<footer class="site-footer">
  <p>© ${new Date().getFullYear()} ${esc(site.author)}</p>
  <p><a href="${site.github}">GitHub</a> · <a href="mailto:${site.email}">Email</a> · <a href="/feed.xml">RSS</a></p>
</footer>
</body>
</html>
`;
}

/* ---------- partials ---------- */

const postItem = (p) => `<li>
  <h2><a href="/posts/${p.slug}/">${esc(p.title)}</a></h2>
  <p><time datetime="${p.date}">${prettyDate(p.date)}</time> · ${esc(p.summary)}</p>
</li>`;

const projectItem = (p) => `<li class="project">
  <h3><a href="${p.repo}">${esc(p.name)}</a></h3>
  <p>${esc(p.description)}</p>
  <ul class="tags">${p.tags.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
  ${p.url ? `<p><a href="${p.url}">Live site →</a></p>` : ""}
</li>`;

/* ---------- pages ---------- */

const posts = loadPosts().filter((p) => !p.draft);
const allProjects = validateProjects();
const featured = allProjects.filter((p) => p.featured);
const newest = posts.length ? posts[0].date : new Date().toISOString().slice(0, 10);

const home = `<h1>${esc(site.author)}</h1>
<p class="lede">${esc(site.tagline)}</p>
<section class="section">
  <h2>Latest posts</h2>
${
  posts.length
    ? `  <ul class="post-list">
${posts.slice(0, 3).map(postItem).join("\n")}
  </ul>
  <p><a href="/posts/">All posts →</a></p>`
    : `  <p class="lede">No posts yet.</p>`
}
</section>
<section class="section">
  <h2>Selected projects</h2>
${
  featured.length
    ? `  <ul class="project-list">
${featured.map(projectItem).join("\n")}
  </ul>
  <p><a href="/projects/">All projects →</a></p>`
    : `  <p class="lede">No projects yet.</p>`
}
</section>`;

write(
  "index.html",
  layout({ title: site.title, description: site.description, path: "/", content: home, section: "home" })
);

write(
  "posts/index.html",
  layout({
    title: "Posts",
    description: `Every post on ${site.title}.`,
    path: "/posts/",
    section: "posts",
    content: `<h1>Posts</h1>
${
  posts.length
    ? `<ul class="post-list">
${posts.map(postItem).join("\n")}
</ul>`
    : `<p class="lede">No posts yet.</p>`
}`,
  })
);

for (const post of posts) {
  const tags = post.tags.length ? ` · ${post.tags.map(esc).join(", ")}` : "";
  write(
    `posts/${post.slug}/index.html`,
    layout({
      title: post.title,
      description: post.summary,
      path: `/posts/${post.slug}/`,
      section: "posts",
      type: "article",
      content: `<article>
  <h1>${esc(post.title)}</h1>
  <p class="meta"><time datetime="${post.date}">${prettyDate(post.date)}</time>${tags}</p>
  ${post.html}
</article>
<p><a href="/posts/">← All posts</a></p>`,
    })
  );
}

write(
  "projects/index.html",
  layout({
    title: "Projects",
    description: `Things ${site.author} has built.`,
    path: "/projects/",
    section: "projects",
    content: `<h1>Projects</h1>
<ul class="project-list">
${allProjects.map(projectItem).join("\n")}
</ul>`,
  })
);

{
  const file = "content/about.md";
  const { data, body } = parseFrontmatter(file, readFileSync(join(ROOT, file), "utf8"));
  if (typeof data.title !== "string" || data.title === "") throw new Error(`${file}: missing title`);
  if (typeof data.description !== "string" || data.description === "") {
    throw new Error(`${file}: missing description`);
  }
  write(
    "about/index.html",
    layout({
      title: data.title,
      description: data.description,
      path: "/about/",
      section: "about",
      content: `<article>
${marked.parse(body)}</article>`,
    })
  );
}

write(
  "404.html",
  layout({
    title: "Not found",
    description: "That page does not exist.",
    path: "/404.html",
    section: "home",
    content: `<h1>Not found</h1>
<p>That page does not exist.</p>
<p><a href="/">Back home</a></p>`,
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
    ["/posts/", newest],
    ["/projects/", newest],
    ["/about/", newest],
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

/* ---------- styles ---------- */

const theme = (scheme, file) =>
  `@media (prefers-color-scheme: ${scheme}) {\n${readFileSync(
    join(ROOT, "node_modules/highlight.js/styles", file),
    "utf8"
  )}\n}`;
write(
  "highlight.css",
  [
    theme("light", "github.min.css"),
    theme("dark", "github-dark.min.css"),
    "pre code.hljs { background: transparent; padding: 0; }",
  ].join("\n")
);

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

console.log(`built ${posts.length} posts, ${allProjects.length} projects → dist/`);
