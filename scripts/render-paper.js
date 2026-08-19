#!/usr/bin/env node
// Render state/paper.json (the public-paper LLM pass) into the clawd-daily
// repo: ../clawd-daily/docs/<date>.html + index.html. This is the PUBLIC
// paper — crypto × ai + world politics, curated from the same paid feed pull
// as the private morning update. hackernews-shaped: a masthead, then ONE flat
// numbered list of headlines ordered by importance (rank is the only
// hierarchy). Each row is a <details>: collapsed = headline + a tiny
// "read more" line, open = dek + picture + source tweets. No sections, no
// columns, no JS. All LLM/tweet text is escaped — words, never markup.
//
// paper.json shape (written by prompts/paper.md):
//   { "date": "YYYY-MM-DD",
//     "stories": [ { "headline", "dek"?, "sources": [], "image"? } ] }
// Legacy editions (lead + sections) are flattened in document order.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { esc, cleanText, fmtN } from "../lib/html.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STATE = join(ROOT, "state");
const DAILY = join(ROOT, "..", "clawd-daily");
const DOCS = join(DAILY, "docs");
const SITE = "https://clawdbotatg.github.io/clawd-daily/";

if (!existsSync(DAILY)) {
  console.error("clawd-daily repo not found beside clawd-morning-update — skipping paper");
  process.exit(1);
}
const brief = JSON.parse(readFileSync(join(STATE, "brief.json"), "utf8"));
const paper = JSON.parse(readFileSync(join(STATE, "paper.json"), "utf8"));
if (paper.date !== brief.date) {
  console.error(`paper.json is for ${paper.date} but brief is ${brief.date} — stale, skipping`);
  process.exit(1);
}

// flat ranked list; legacy lead+sections editions flatten in document order
const stories = (
  paper.stories || [paper.lead, ...(paper.sections || []).flatMap((s) => s.stories)]
).filter(Boolean);

// resolve source tweet ids against everything the brief carries
const tweets = new Map();
for (const t of [...brief.themes.flatMap((th) => th.tweets), ...brief.top, ...(brief.pics || [])])
  tweets.set(t.id, t);

const sourceLinks = (ids = []) => {
  const rows = ids
    .map((id) => tweets.get(id))
    .filter(Boolean)
    .map((t) => {
      const stat = t.likes ? ` · ♥ ${fmtN(t.likes)}` : "";
      return `<a class="src" href="https://x.com/${esc(t.author)}/status/${esc(t.id)}" target="_blank" rel="noopener">
  <span class="srchead">@${esc(t.author)}${stat}</span>
  <span class="srctext">${esc(cleanText(t.text).replace(/\s+/g, " ").slice(0, 240))}</span>
</a>`;
    });
  if (!rows.length) return "";
  return `<div class="srcs">${rows.join("\n")}</div>`;
};

// a story may point `image` at a source tweet carrying attached media —
// the picture prints inside the expanded story (the collapsed page is text).
// Photos only: a video's thumbnail is a frame grab (usually someone's face),
// not the chart/screenshot/scene the image rule is for.
const storyImage = (s) => {
  const url = tweets.get(s.image)?.media?.find((m) => m.type === "photo" && m.url)?.url;
  return url ? `<img class="pic" src="${esc(url)}" alt="" loading="lazy">` : "";
};

// collapsed: headline + subtext line (top source + "read more");
// open: dek (if any) + picture + source tweets
const story = (s) => {
  const dek = [s.dek, s.body].filter(Boolean).map(esc).join(" ");
  const first = (s.sources || []).map((id) => tweets.get(id)).find(Boolean);
  const via = first ? `@${esc(first.author)}${first.likes ? ` ♥ ${fmtN(first.likes)}` : ""} · ` : "";
  return `<li><details>
  <summary>
    <span class="hl">${esc(s.headline)}</span>
    <span class="sub">${via}<span class="more">read more</span></span>
  </summary>
  ${dek ? `<p class="dek">${dek}</p>` : ""}
  ${storyImage(s)}
  ${sourceLinks(s.sources)}
</details></li>`;
};

const dateLong = new Date(paper.date + "T12:00:00").toLocaleDateString("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});

mkdirSync(DOCS, { recursive: true });
const priorEditions = readdirSync(DOCS).filter((f) => /^\d{4}-\d{2}-\d{2}\.html$/.test(f));
const editionNo = priorEditions.includes(`${paper.date}.html`) ? priorEditions.length : priorEditions.length + 1;

const CSS = `
  /* gmsers is dark, always: black page, white text, lobster-red links */
  :root { --paper:#000; --ink:#f4f4f2; --muted:#9a9ea6; --faint:#242629; --accent:#ff4b33; }
  * { box-sizing:border-box; margin:0; }
  body { background:var(--paper); color:var(--ink); max-width:1000px; margin:0 auto; padding:22px 18px 60px;
         font:18px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
  .masthead { padding-bottom:10px; border-bottom:2px solid var(--ink); }
  .mrow { display:flex; align-items:center; justify-content:space-between; gap:14px; }
  .masthead h1 { font-size:1.7rem; font-weight:800; letter-spacing:-.02em; }
  .masthead h1 a { color:var(--ink); text-decoration:none; }
  .masthead h1 .gm { color:var(--accent); }
  .pfp { width:56px; height:56px; border-radius:10px; flex:none; }
  .dateline { color:var(--muted); font-size:.8rem; margin-top:3px; }
  ol.stories { margin-top:16px; padding-left:2em; }
  ol.stories li { padding:7px 0; }
  ol.stories li::marker { color:var(--muted); font-size:.85rem; }
  summary { cursor:pointer; list-style:none; -webkit-user-select:none; user-select:none; }
  summary::-webkit-details-marker { display:none; }
  .hl { font-size:1.2rem; font-weight:600; letter-spacing:-.01em; line-height:1.3; }
  .sub { display:block; color:var(--muted); font-size:.78rem; margin-top:2px; }
  .sub .more { color:var(--accent); }
  details[open] .sub .more { opacity:.5; }
  .dek { font-size:1rem; line-height:1.5; margin:7px 0 2px; max-width:46em; }
  .pic { display:block; max-width:100%; max-height:420px; width:auto; border-radius:6px; margin:8px 0 2px; }
  .srcs { margin:6px 0 4px; }
  a.src { display:block; text-decoration:none; color:var(--ink); border-left:2px solid var(--faint);
          padding:5px 10px; margin-top:6px; font-size:.84rem; }
  a.src:hover { border-left-color:var(--accent); }
  .srchead { display:block; font-size:.74rem; font-weight:600; color:var(--accent); margin-bottom:1px; }
  .srctext { color:var(--ink); opacity:.85; }
  footer { margin-top:32px; color:var(--muted); font-size:.78rem; }
  footer a { color:var(--accent); }
  .archive { margin-top:6px; line-height:1.9; }
  .archive a { margin-right:10px; }
`;

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>gmsers · ${esc(paper.date)}</title>
<meta name="description" content="${esc(stories[0]?.headline || "gm, sers — the daily brief at the intersection of crypto and ai")}">
<meta name="theme-color" content="#000000">
<style>${CSS}</style>
</head>
<body>
<header class="masthead">
  <div class="mrow">
    <h1><a href="index.html"><span class="gm">gm</span>sers.com</a></h1>
    <img class="pfp" src="gmsers.jpg" alt="gmsers" width="56" height="56">
  </div>
  <div class="dateline">gm, sers · crypto × ai, and the world that moves them · ${esc(dateLong)} · no. ${editionNo}</div>
</header>
<ol class="stories">
${stories.map(story).join("\n")}
</ol>
<footer>
  <p>written overnight by clawd 🦞, an ai with a wallet, from ~${Math.round(brief.tweet_count / 100) * 100} posts on the wire · ranked by importance · every story links to its sources</p>
  <div class="archive">__ARCHIVE__</div>
</footer>
</body>
</html>`;

writeFileSync(join(DOCS, `${paper.date}.html`), page.replace("__ARCHIVE__", ""));

const dated = readdirSync(DOCS)
  .filter((f) => /^\d{4}-\d{2}-\d{2}\.html$/.test(f))
  .sort()
  .reverse()
  .slice(0, 21);
const archive =
  "past editions: " + dated.map((f) => `<a href="${f}">${f.replace(".html", "").slice(5)}</a>`).join(" ");
writeFileSync(join(DOCS, "index.html"), page.replace("__ARCHIVE__", archive));
console.log(
  `rendered clawd-daily/docs/${paper.date}.html + index.html (edition ${editionNo}, ${stories.length} stories, flat) → ${SITE}`
);
