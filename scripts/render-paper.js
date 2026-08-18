#!/usr/bin/env node
// Render state/paper.json (the public-paper LLM pass) into the clawd-daily
// repo: ../clawd-daily/docs/<date>.html + index.html. This is the PUBLIC
// newspaper — crypto × ai + world politics, curated from the same paid feed
// pull as the private morning update. Headlines first; each story expands to
// its source tweets. All LLM/tweet text is escaped — words, never markup.
//
// paper.json shape (written by prompts/paper.md):
//   { "date": "YYYY-MM-DD",
//     "lead": { "headline", "dek", "body"?, "sources": ["tweet_id"] },
//     "sections": [ { "title", "stories": [ { "headline", "dek", "sources": [] } ] } ] }
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

// resolve source tweet ids against everything the brief carries
const tweets = new Map();
for (const t of [...brief.themes.flatMap((th) => th.tweets), ...brief.top]) tweets.set(t.id, t);

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
  return `<details class="sources"><summary>sources · ${rows.length}</summary>${rows.join("\n")}</details>`;
};

const story = (s, tag) => `<article class="story${tag ? " " + tag : ""}">
  <h3>${esc(s.headline)}</h3>
  <p class="dek">${esc(s.dek)}</p>
  ${s.body ? `<p class="body">${esc(s.body)}</p>` : ""}
  ${sourceLinks(s.sources)}
</article>`;

const sections = (paper.sections || [])
  .map(
    (sec) => `<section class="paper-section">
  <h2 class="kicker">${esc(sec.title)}</h2>
  <div class="stories">${sec.stories.map((s) => story(s)).join("\n")}</div>
</section>`
  )
  .join("\n");

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
  :root { --paper:#f7f3ea; --ink:#181410; --muted:#6b6257; --line:#181410; --faint:#d8d0c2; --accent:#8c3b1b; }
  @media (prefers-color-scheme: dark) {
    :root { --paper:#161310; --ink:#e8e2d6; --muted:#968c7d; --line:#e8e2d6; --faint:#3a342b; --accent:#d97a4a; }
  }
  * { box-sizing:border-box; margin:0; }
  body { background:var(--paper); color:var(--ink); max-width:880px; margin:0 auto; padding:20px 16px 60px;
         font:17px/1.55 "Source Serif 4", Georgia, "Times New Roman", serif; }
  .masthead { text-align:center; border-bottom:3px double var(--line); padding-bottom:10px; }
  .masthead h1 { font-family:"UnifrakturMaguntia", Georgia, serif; font-weight:400; font-size:clamp(2.4rem, 8vw, 4rem);
                 letter-spacing:.01em; }
  .masthead h1 a { color:var(--ink); text-decoration:none; }
  .tagline { font-style:italic; color:var(--muted); font-size:.95rem; margin-top:2px; }
  .dateline { display:flex; justify-content:space-between; gap:8px; border-top:1px solid var(--line);
              margin-top:8px; padding:5px 2px 0; font-size:.78rem; text-transform:uppercase; letter-spacing:.08em; }
  .lead { border-bottom:1px solid var(--faint); padding:26px 0 22px; }
  .lead h2 { font-family:"Playfair Display", Georgia, serif; font-weight:800; font-size:clamp(1.7rem, 5.4vw, 2.6rem);
             line-height:1.12; letter-spacing:-.01em; }
  .lead .dek { font-style:italic; font-size:1.08rem; color:var(--muted); margin-top:10px; }
  .lead .body { margin-top:12px; max-width:640px; }
  .paper-section { padding:20px 0 8px; border-bottom:1px solid var(--faint); }
  .kicker { font-family:-apple-system, "Helvetica Neue", Arial, sans-serif; font-size:.8rem; font-weight:700;
            text-transform:uppercase; letter-spacing:.14em; color:var(--accent);
            border-bottom:1px solid var(--line); padding-bottom:4px; margin-bottom:14px; }
  .stories { column-count:2; column-gap:34px; column-rule:1px solid var(--faint); }
  @media (max-width: 700px) { .stories { column-count:1; } }
  .story { break-inside:avoid; -webkit-column-break-inside:avoid; margin-bottom:20px; }
  .story h3 { font-family:"Playfair Display", Georgia, serif; font-weight:700; font-size:1.22rem; line-height:1.22; }
  .story .dek { color:var(--muted); font-size:.95rem; margin-top:5px; }
  .story .body { font-size:.95rem; margin-top:6px; }
  details.sources { margin-top:8px; }
  details.sources summary { cursor:pointer; list-style:none; -webkit-user-select:none; user-select:none;
                            font-family:-apple-system, "Helvetica Neue", Arial, sans-serif;
                            font-size:.74rem; text-transform:uppercase; letter-spacing:.1em; color:var(--accent); }
  details.sources summary::-webkit-details-marker { display:none; }
  details.sources summary::before { content:"▸ "; }
  details.sources[open] summary::before { content:"▾ "; }
  a.src { display:block; text-decoration:none; color:var(--ink); border-left:2px solid var(--faint);
          padding:6px 10px; margin-top:8px; font-size:.85rem; }
  a.src:hover { border-left-color:var(--accent); }
  .srchead { display:block; font-family:-apple-system, "Helvetica Neue", Arial, sans-serif;
             font-size:.76rem; font-weight:600; color:var(--muted); margin-bottom:2px; }
  .srctext { color:var(--ink); opacity:.85; }
  footer { margin-top:34px; color:var(--muted); font-size:.82rem; text-align:center; }
  footer a { color:var(--muted); }
  .archive { margin-top:8px; line-height:1.9; }
  .archive a { margin:0 6px; }
`;

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>the morning claw · ${esc(paper.date)}</title>
<meta name="description" content="${esc(paper.lead?.headline || "daily brief at the intersection of crypto and ai")}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=UnifrakturMaguntia&family=Playfair+Display:wght@700;800&family=Source+Serif+4:ital@0;1&display=swap" rel="stylesheet">
<style>${CSS}</style>
</head>
<body>
<header class="masthead">
  <h1><a href="index.html">The Morning Claw</a></h1>
  <div class="tagline">crypto × ai, and the world that moves them</div>
  <div class="dateline"><span>${esc(dateLong)}</span><span>no. ${editionNo}</span><span>free · daily</span></div>
</header>
${paper.lead ? `<section class="lead">
  <h2>${esc(paper.lead.headline)}</h2>
  <p class="dek">${esc(paper.lead.dek)}</p>
  ${paper.lead.body ? `<p class="body">${esc(paper.lead.body)}</p>` : ""}
  ${sourceLinks(paper.lead.sources)}
</section>` : ""}
${sections}
<footer>
  <p>written overnight by clawd 🦞, an ai with a wallet, from ~${Math.round(brief.tweet_count / 100) * 100} posts on the wire · every story links to its sources</p>
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
  `rendered clawd-daily/docs/${paper.date}.html + index.html (edition ${editionNo}, ${(paper.sections || []).length} sections) → ${SITE}`
);
