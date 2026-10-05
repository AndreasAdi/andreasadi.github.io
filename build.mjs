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

// Matches --ground in assets/style.css.
const THEME = { dark: "#151413", light: "#fbfaf7" };

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
    const words = html.replace(/<[^>]*>/g, " ").split(/\s+/).filter(Boolean).length;
    posts.push({
      slug,
      title: data.title,
      date: data.date,
      updated: data.updated,
      summary: data.summary,
      tags: data.tags === undefined ? [] : stringList(rel, "tags", data.tags),
      draft: data.draft === true,
      html,
      minutes: Math.max(1, Math.round(words / 220)),
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
    if (p.page !== undefined && (typeof p.page !== "string" || !p.page.startsWith("/posts/"))) {
      fail("page must be a /posts/... path");
    }
    if (p.featured !== undefined && typeof p.featured !== "boolean") {
      fail("featured must be true or false");
    }
  });
  if (projects.length === 0) throw new Error("projects.js: no projects");
  return projects.map((p) => ({ ...p, featured: p.featured === true }));
}

/* ---------- layout ---------- */

const NAV = [
  ["Posts", "/posts/", "posts"],
  ["Projects", "/projects/", "projects"],
  ["About", "/about/", "about"],
];

const nav = (section) => `<nav class="nav" aria-label="Main">
    ${NAV.map(
      ([label, href, key]) => `<a href="${href}"${key === section ? ' aria-current="page"' : ""}>${label}</a>`
    ).join("\n    ")}
  </nav>`;

// The one piece of the batik design that survives: a kawung cell.
const favicon = (() => {
  const nila = "#1c2b5a";
  const mori = "#e8e7e1";
  const soga = "#7a4a24";
  const oval = (cx, cy, rx, ry) =>
    `<ellipse cx='${cx}' cy='${cy}' rx='${rx}' ry='${ry}' fill='${mori}'/><ellipse cx='${cx}' cy='${cy}' rx='${rx * 0.2}' ry='${ry * 0.2}' fill='${soga}'/>`;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='6' fill='${nila}'/><g transform='rotate(45 16 16)'>${oval(22, 16, 5.6, 3.8)}${oval(10, 16, 5.6, 3.8)}${oval(16, 22, 3.8, 5.6)}${oval(16, 10, 3.8, 5.6)}</g></svg>`;
  return `data:image/svg+xml,${svg.replace(/#/g, "%23").replace(/</g, "%3C").replace(/>/g, "%3E")}`;
})();

const footer = () => `<footer class="site-footer">
  <span>© ${new Date().getFullYear()} ${esc(site.author)}</span>
  <ul>
    <li><a href="${site.github}">GitHub</a></li>
    <li><a href="mailto:${site.email}">Email</a></li>
    <li><a href="/feed.xml">RSS</a></li>
  </ul>
</footer>`;

// Every page is the same shape: header, one column, footer.
function layout({ title, description, path, content, section, type = "website" }) {
  const docTitle = title === site.title ? `${site.title} — ${site.tagline}` : `${title} — ${site.title}`;
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
<link rel="preload" href="/fonts/newsreader-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/style.css">
<link rel="stylesheet" href="/highlight.css">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <a class="brand" href="/">${esc(site.title)}</a>
  ${nav(section)}
</header>
<main id="main">
${content}
</main>
${footer()}
</body>
</html>
`;
}

/* ---------- partials ---------- */

const postItem = (p, h = "h2") => `<li class="post-item">
  <time class="post-date" datetime="${p.date}">${p.date}</time>
  <${h} class="post-title"><a href="/posts/${p.slug}/">${esc(p.title)}</a></${h}>
  <p class="post-summary">${esc(p.summary)}</p>${
    p.tags.length ? `\n  <span class="post-tags">${p.tags.map(esc).join(", ")}</span>` : ""
  }
</li>`;

const projectItem = (p, h = "h2") => `<li class="project">
  <${h} class="project-name"><a href="${p.page ?? p.repo}">${esc(p.name)}</a></${h}>
  <p class="project-desc">${esc(p.description)}</p>
  <p class="project-meta">
    <span>${p.tags.map(esc).join(", ")}</span>${p.page ? `\n    <a href="${p.repo}">Source</a>` : ""}${p.url ? `\n    <a href="${p.url}">Live site</a>` : ""}
  </p>
</li>`;

/* ---------- pages ---------- */

const posts = loadPosts().filter((p) => !p.draft);
const allProjects = validateProjects();
const featured = allProjects.filter((p) => p.featured);
const newest = posts.length ? posts[0].date : new Date().toISOString().slice(0, 10);

{
  const shelf = (id, label, body) => `<section class="shelf" aria-labelledby="${id}">
  <h2 id="${id}">${label}</h2>
  <div>
${body}
  </div>
</section>`;
  const home = `<h1 class="intro">${esc(site.intro)}</h1>
${shelf(
  "latest-posts",
  "Posts",
  posts.length
    ? `  <ul class="post-list">
${posts.slice(0, 3).map((p) => postItem(p, "h3")).join("\n")}
  </ul>
  <p class="more"><a href="/posts/">All posts</a></p>`
    : `  <p>No posts yet.</p>`
)}
${shelf(
  "selected-projects",
  "Projects",
  featured.length
    ? `  <ul class="project-list">
${featured.map((p) => projectItem(p, "h3")).join("\n")}
  </ul>
  <p class="more"><a href="/projects/">All projects</a></p>`
    : `  <p>No projects yet.</p>`
)}
<p class="contact">${site.contact}</p>`;
  write(
    "index.html",
    layout({
      title: site.title,
      description: site.description,
      path: "/",
      content: home,
      section: "home",
    })
  );
}

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
${posts.map((p) => postItem(p)).join("\n")}
</ul>`
    : `<p class="lede">No posts yet.</p>`
}`,
  })
);

for (const [i, post] of posts.entries()) {
  const newer = posts[i - 1];
  const older = posts[i + 1];
  const pager =
    newer || older
      ? `<nav class="post-nav" aria-label="More posts">
  ${older ? `<a class="prev" href="/posts/${older.slug}/"><span>Older</span>${esc(older.title)}</a>` : ""}
  ${newer ? `<a class="next" href="/posts/${newer.slug}/"><span>Newer</span>${esc(newer.title)}</a>` : ""}
</nav>`
      : "";
  const tags = post.tags.length ? `<span>${post.tags.map(esc).join(", ")}</span>` : "";
  const updated = post.updated ? `<span>updated ${post.updated}</span>` : "";
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
  <p class="post-meta">
    <time datetime="${post.date}">${post.date}</time>
    <span>${post.minutes} min read</span>
    ${tags}
    ${updated}
  </p>
  ${post.html}
</article>
${pager}
<p class="back-link"><a href="/posts/">All posts</a></p>`,
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
${allProjects.map((p) => projectItem(p)).join("\n")}
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
<h1>${esc(data.title)}</h1>
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
    section: "",
    content: `<h1>Not found</h1>
<p class="lede">That page does not exist.</p>
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
