import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Marked } from "marked";
import { markedHighlight } from "marked-highlight";
import hljs from "highlight.js";
import { site } from "./site.js";
import { projects } from "./projects.js";
import { themes, DEFAULT_DARK, DEFAULT_LIGHT } from "./themes.js";
import { wordmarkSVG, fieldSVG, identiconSVG, faviconURI } from "./lib/pixel.js";

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, "dist");

// The footer names the build. Local dirty trees and Actions checkouts
// both have to work, so fall through rather than fail.
const BUILD = (() => {
  const r = spawnSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" });
  const sha = r.status === 0 ? r.stdout.trim() : "";
  return sha || process.env.GITHUB_SHA?.slice(0, 7) || "dev";
})();

const favicon = faviconURI();

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

/* ---------- themes ---------- */

const hexRGB = (h) => {
  let s = h.slice(1);
  if (s.length === 3) s = [...s].map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
};
const luminance = (h) => {
  const [r, g, b] = hexRGB(h).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
const mix = (a, b, t) =>
  "#" +
  hexRGB(a)
    .map((c, i) => Math.round(c + (hexRGB(b)[i] - c) * t).toString(16).padStart(2, "0"))
    .join("");

// Omarchy's palettes were drawn for a desktop, not for body copy. Where one
// misses 4.5:1 the build corrects it here rather than hand-editing the data:
// muted text walks toward the text colour, links fall back to the text
// colour (they keep a brand underline), and button ink takes whichever
// candidate reads best on the brand fill.
function themeVars(name) {
  const [bg, surface, border, text, muted0, brand, ink0, dim, mid, lit] = themes[name];
  let muted = muted0;
  for (let t = 0.05; contrast(muted, surface) < 4.5 && t <= 1; t += 0.05) muted = mix(muted0, text, t);
  const link = contrast(brand, bg) >= 4.5 && contrast(brand, surface) >= 4.5 ? brand : text;
  const ink = [ink0, "#0c0e10", "#ffffff"].sort((a, b) => contrast(b, brand) - contrast(a, brand))[0];
  const scheme = luminance(bg) > 0.4 ? "light" : "dark";
  return { bg, surface, border, text, muted, brand, link, ink, dim, mid, lit, scheme };
}

const declarations = (name) => {
  const v = themeVars(name);
  return `color-scheme: ${v.scheme}; --bg: ${v.bg}; --surface: ${v.surface}; --border: ${v.border}; --text: ${v.text}; --muted: ${v.muted}; --brand: ${v.brand}; --link: ${v.link}; --ink: ${v.ink}; --dim: ${v.dim}; --mid: ${v.mid}; --lit: ${v.lit};`;
};

const THEME_NAMES = Object.keys(themes);
const THEME = { dark: themes[DEFAULT_DARK][0], light: themes[DEFAULT_LIGHT][0] };

/* ---------- layout ---------- */

const NAV = [
  ["posts", "/posts/", "posts"],
  ["projects", "/projects/", "projects"],
  ["about", "/about/", "about"],
];

const nav = (section) => `<nav class="nav" aria-label="Main">
      ${NAV.map(
        ([label, href, key]) => `<a href="${href}"${key === section ? ' aria-current="page"' : ""}>${label}</a>`
      ).join("\n      ")}
    </nav>`;

const ICON = {
  theme: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 2h12v12H2z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 2h6v12H8z" fill="currentColor"/></svg>`,
  rss: `<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M2 2h1a11 11 0 0 1 11 11v1h-2v-1a9 9 0 0 0-9-9H2zm0 4h1a7 7 0 0 1 7 7v1H8v-1a5 5 0 0 0-5-5H2zm0 5h3v3H2z"/></svg>`,
  github: `<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>`,
};

const swatch = (name) => {
  const v = themeVars(name);
  return `<span class="swatch" aria-hidden="true"><i style="background:${v.bg}"></i><i style="background:${v.text}"></i><i style="background:${v.brand}"></i></span>`;
};

const themeMenu = `<div id="themes" class="theme-menu" popover>
      <p class="theme-menu-head">theme <kbd>T</kbd> next <kbd>⇧T</kbd> back</p>
      <button type="button" data-pick="">${`<span class="swatch auto" aria-hidden="true"><i></i><i></i><i></i></span>`}auto</button>
      ${THEME_NAMES.map((n) => `<button type="button" data-pick="${n}">${swatch(n)}${n}</button>`).join("\n      ")}
    </div>`;

const header = (section) => `<header class="site-header">
  <div class="wrap bar">
    <a class="brand" href="/">${wordmarkSVG("A")}<span>andreas adi</span></a>
    ${nav(section)}
    <div class="tools">
      <button type="button" class="icon js-only" popovertarget="themes" aria-label="Change theme (T)" title="Change theme (T)">${ICON.theme}</button>
      <a class="icon" href="/feed.xml" aria-label="RSS feed" title="RSS feed">${ICON.rss}</a>
      <a class="icon" href="${site.github}" aria-label="GitHub" title="GitHub">${ICON.github}</a>
      <a class="btn btn-brand" href="mailto:${site.email}">Email</a>
    </div>
    ${themeMenu}
  </div>
</header>`;

const footer = () => `<footer class="site-footer">
  <div class="wrap">
    <span>© ${new Date().getFullYear()} ${esc(site.author)}</span>
    <span class="build">built from <a href="${site.github}/andreasadi.github.io/commit/${BUILD}">${esc(BUILD)}</a> by one node script</span>
    <ul>
      <li><a href="${site.github}">github</a></li>
      <li><a href="mailto:${site.email}">email</a></li>
      <li><a href="/feed.xml">rss</a></li>
    </ul>
  </div>
</footer>`;

// The path above a page's title, written the way a shell would show it.
const crumb = (path) => `<p class="crumb">~${esc(path.replace(/\/$/, "") || "/")}</p>`;

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
<link rel="stylesheet" href="/style.css">
<link rel="stylesheet" href="/themes.css">
<script>
(function () {
  var r = document.documentElement;
  r.classList.add("js");
  try {
    var t = localStorage.getItem("theme");
    if (${JSON.stringify(THEME_NAMES)}.indexOf(t) !== -1) r.dataset.theme = t;
  } catch (e) {}
})();
</script>
<script src="/theme.js" defer></script>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
${header(section)}
<main id="main">
${content}
</main>
${footer()}
<p id="theme-status" class="toast" role="status" aria-live="polite"></p>
</body>
</html>
`;
}

/* ---------- partials ---------- */

const postItem = (p, h = "h2") => `<li class="post-item">
  <time class="post-date" datetime="${p.date}">${p.date}</time>
  <div>
    <${h} class="post-title"><a href="/posts/${p.slug}/">${esc(p.title)}</a></${h}>
    <p class="post-summary">${esc(p.summary)}</p>${
      p.tags.length ? `\n    <p class="tags">${p.tags.map((t) => `<span>#${esc(t)}</span>`).join(" ")}</p>` : ""
    }
  </div>
</li>`;

const projectCard = (p, h = "h2") => `<li class="card project">
  <div class="card-art">${identiconSVG(p.name)}</div>
  <div class="card-body">
    <${h} class="project-name"><a href="${p.page ?? p.repo}">${esc(p.name)}</a></${h}>
    <p class="project-desc">${esc(p.description)}</p>
    <p class="tags">${p.tags.map((t) => `<span>${esc(t)}</span>`).join(" ")}</p>
    <p class="project-links">${p.page ? `<a href="${p.repo}">source</a>` : `<a href="${p.repo}">repo</a>`}${
      p.url ? ` <a href="${p.url}">live ↗</a>` : ""
    }</p>
  </div>
</li>`;

const sectionHead = (id, label, href, more) => `<div class="section-head">
    <h2 id="${id}">${label}</h2>${href ? `\n    <a class="btn" href="${href}">${more} →</a>` : ""}
  </div>`;

/* ---------- pages ---------- */

const posts = loadPosts().filter((p) => !p.draft);
const allProjects = validateProjects();
const featured = allProjects.filter((p) => p.featured);
const newest = posts.length ? posts[0].date : new Date().toISOString().slice(0, 10);

{
  const latest = posts[0];
  const home = `<section class="hero">
  ${fieldSVG()}
  <div class="hero-inner">${
    latest
      ? `\n    <a class="pill" href="/posts/${latest.slug}/"><span>new</span> ${esc(latest.title)} →</a>`
      : ""
  }
    <h1>${wordmarkSVG(site.title, site.title)}</h1>
    <p class="lead">${esc(site.tagline)}</p>
    <p class="sub">${esc(site.sub)}</p>
    <p class="actions">
      <a class="btn btn-brand btn-lg" href="/projects/">See what I've built</a>
      <a class="btn btn-lg" href="/posts/">Read the posts</a>
    </p>
  </div>
</section>
<section class="band" aria-labelledby="latest-posts">
  ${sectionHead("latest-posts", "Latest posts", "/posts/", "All posts")}
  ${
    posts.length
      ? `<ul class="post-list">
${posts.slice(0, 3).map((p) => postItem(p, "h3")).join("\n")}
  </ul>`
      : `<p class="muted">No posts yet.</p>`
  }
</section>
<section class="band" aria-labelledby="selected-projects">
  ${sectionHead("selected-projects", "Things I've built", "/projects/", "All projects")}
  ${
    featured.length
      ? `<ul class="cards">
${featured.map((p) => projectCard(p, "h3")).join("\n")}
  </ul>`
      : `<p class="muted">No projects yet.</p>`
  }
</section>
<section class="band" aria-labelledby="contact">
  <div class="card contact">
    <div>
      <h2 id="contact">Have something to build?</h2>
      <p class="muted">${esc(site.contact)}</p>
    </div>
    <a class="btn btn-brand btn-lg" href="mailto:${site.email}">${esc(site.email)}</a>
  </div>
</section>`;
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
    content: `<div class="page">
${crumb("/posts/")}
<h1>Posts</h1>
${
  posts.length
    ? `<ul class="post-list">
${posts.map((p) => postItem(p)).join("\n")}
</ul>`
    : `<p class="muted">No posts yet.</p>`
}
</div>`,
  })
);

for (const [i, post] of posts.entries()) {
  const newer = posts[i - 1];
  const older = posts[i + 1];
  const pager =
    newer || older
      ? `<nav class="post-nav" aria-label="More posts">
  ${older ? `<a class="card prev" href="/posts/${older.slug}/"><span>← older</span>${esc(older.title)}</a>` : ""}
  ${newer ? `<a class="card next" href="/posts/${newer.slug}/"><span>newer →</span>${esc(newer.title)}</a>` : ""}
</nav>`
      : "";
  const tags = post.tags.length ? `<span>${post.tags.map((t) => `#${esc(t)}`).join(" ")}</span>` : "";
  const updated = post.updated ? `<span>updated ${post.updated}</span>` : "";
  write(
    `posts/${post.slug}/index.html`,
    layout({
      title: post.title,
      description: post.summary,
      path: `/posts/${post.slug}/`,
      section: "posts",
      type: "article",
      content: `<div class="page">
${crumb(`/posts/${post.slug}/`)}
<article class="prose">
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
<p class="back-link"><a href="/posts/">← all posts</a></p>
</div>`,
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
    content: `<div class="wide">
${crumb("/projects/")}
<h1>Projects</h1>
<ul class="cards">
${allProjects.map((p) => projectCard(p)).join("\n")}
</ul>
</div>`,
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
      content: `<div class="page">
${crumb("/about/")}
<article class="prose">
<h1>${esc(data.title)}</h1>
${marked.parse(body)}</article>
</div>`,
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
    content: `<div class="page">
<p class="crumb">~/404</p>
<h1>Not found</h1>
<p class="muted">No such file or directory.</p>
<p><a class="btn" href="/">cd ~</a></p>
</div>`,
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

// One rule per theme, plus the two defaults for visitors who have not
// picked: dark unless the system asks for light.
write(
  "themes.css",
  [
    `:root { ${declarations(DEFAULT_DARK)} }`,
    `@media (prefers-color-scheme: light) { :root:not([data-theme]) { ${declarations(DEFAULT_LIGHT)} } }`,
    ...THEME_NAMES.map((n) => `:root[data-theme="${n}"] { ${declarations(n)} }`),
  ].join("\n") + "\n"
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
