# Design — a blog and nothing else

After [tinyclouds.org](https://tinyclouds.org/). The site exists to write in;
everything that was not a post has been removed. Earlier designs (Wastra,
Ruang, a serif editorial pass, an omarchy.org pass) are in git history.

## Decisions

- **Pages:** home (name, links, list of posts) and one page per post. Nothing
  else. `/posts/`, `/projects/` and `/about/` redirect home.
- **Type:** the system's Times New Roman, 18px, line-height 1.6, in a 680px
  column. No web fonts; code uses the system monospace.
- **Colour:** #333 on white with #0066cc links; #eee on #111 with #66bbff
  links in dark. Dates and secondary links are grey.
- **Dark mode:** follows `prefers-color-scheme` until the 🌓 button is pressed;
  the choice is saved and applied in `<head>` before first paint. That button
  (`assets/theme.js`) is the only script.
- **Avatar:** put a square photo at `assets/avatar.jpg` and the home header
  shows it at 80px. Without the file, the header is just the name.

## Writing a post

Add `posts/<slug>.md` with `title`, `date` (YYYY-MM-DD) and `summary` in the
frontmatter. `summary` is used for the page description and the RSS feed, not
shown on the page. `draft: true` keeps a post out of the build.
