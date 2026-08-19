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
  return `<div class="srcs"><div class="srclabel">sources</div>${rows.join("\n")}</div>`;
};

// a story may point `image` at a source tweet carrying attached media —
// the picture prints in the collapsed view (viral pics are part of the news)
const storyImage = (s) => {
  const url = tweets.get(s.image)?.media?.find((m) => m.url)?.url;
  return url ? `<img class="pic" src="${esc(url)}" alt="" loading="lazy">` : "";
};

// headline always visible; the description is clamped to 2 lines with "…"
// until tapped (the <details> opens → full text + source tweets)
const story = (s, cls = "story") => `<details class="${cls}">
  <summary>
    <h3>${esc(s.headline)}<span class="chev">▸</span></h3>
    <p class="dek">${esc(s.dek)}${s.body ? " " + esc(s.body) : ""}</p>
    ${storyImage(s)}
  </summary>
  ${sourceLinks(s.sources)}
</details>`;

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
  :root { --paper:#fcfcfa; --ink:#17181a; --muted:#6b6f76; --faint:#e6e6e2; --accent:#c2410c; }
  @media (prefers-color-scheme: dark) {
    :root { --paper:#141518; --ink:#e9eaec; --muted:#95989f; --faint:#2a2c31; --accent:#f97316; }
  }
  * { box-sizing:border-box; margin:0; }
  body { background:var(--paper); color:var(--ink); max-width:1200px; margin:0 auto; padding:22px 18px 60px;
         font:16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
  .masthead { padding-bottom:12px; border-bottom:2px solid var(--ink); }
  .masthead h1 { font-size:1.5rem; font-weight:800; letter-spacing:-.02em; }
  .masthead h1 a { color:var(--ink); text-decoration:none; }
  .masthead h1 .claw { color:var(--accent); }
  .tagline { color:var(--muted); font-size:.88rem; margin-top:1px; }
  .dateline { display:flex; gap:14px; color:var(--muted); margin-top:8px;
              font-size:.75rem; text-transform:uppercase; letter-spacing:.07em; }
  /* full-page front: sections flow through newspaper columns on wide screens,
     collapse to the single phone column below ~720px. Stories never split. */
  main.columns { columns:320px 3; column-gap:32px; column-rule:1px solid var(--faint); margin-top:4px; }
  .paper-section { margin-top:18px; }
  .kicker { font-size:.72rem; font-weight:700; text-transform:uppercase; letter-spacing:.12em;
            color:var(--accent); margin-bottom:1px; break-after:avoid; }
  details.story { border-bottom:1px solid var(--faint); padding:8px 0; break-inside:avoid; }
  details.story summary { cursor:pointer; list-style:none; -webkit-user-select:none; user-select:none; }
  details.story summary::-webkit-details-marker { display:none; }
  .story h3 { font-size:.98rem; font-weight:700; line-height:1.25; letter-spacing:-.01em;
              display:flex; align-items:baseline; gap:8px; }
  .story h3 .chev { margin-left:auto; color:var(--muted); font-size:.75rem; flex:none;
                    transition:transform .15s; }
  details.story[open] h3 .chev { transform:rotate(90deg); }
  .story .dek { color:var(--muted); font-size:.85rem; line-height:1.4; margin-top:2px; }
  /* collapsed: description capped at 2 lines with an ellipsis; open = full text */
  details.story:not([open]) .dek { display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
  details.story[open] .dek { color:var(--ink); }
  details.story.lead { padding:16px 0 12px; break-inside:auto; }
  .lead h3 { font-size:clamp(1.35rem, 1rem + 1.8vw, 2.1rem); line-height:1.15; }
  .lead .dek { font-size:1rem; max-width:820px; }
  details.story.lead:not([open]) .dek { -webkit-line-clamp:3; }
  .lead .pic { max-width:820px; }
  /* attached viral pics: visible collapsed (cropped), full when open */
  .story .pic { display:block; width:100%; border-radius:8px; margin-top:8px; }
  details.story:not([open]) .pic { max-height:230px; object-fit:cover; }
  .srcs { margin-top:10px; }
  .srclabel { font-size:.72rem; font-weight:700; text-transform:uppercase; letter-spacing:.1em; color:var(--accent); }
  a.src { display:block; text-decoration:none; color:var(--ink); border-left:2px solid var(--faint);
          padding:6px 10px; margin-top:8px; font-size:.85rem; }
  a.src:hover { border-left-color:var(--accent); }
  .srchead { display:block; font-size:.76rem; font-weight:600; color:var(--muted); margin-bottom:2px; }
  .srctext { color:var(--ink); opacity:.85; }
  footer { margin-top:36px; color:var(--muted); font-size:.8rem; }
  footer a { color:var(--muted); }
  .archive { margin-top:8px; line-height:1.9; }
  .archive a { margin-right:10px; }
`;

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>the morning claw · ${esc(paper.date)}</title>
<meta name="description" content="${esc(paper.lead?.headline || "daily brief at the intersection of crypto and ai")}">
<style>${CSS}</style>
</head>
<body>
<header class="masthead">
  <h1><a href="index.html">the morning claw <span class="claw">🦞</span></a></h1>
  <div class="tagline">crypto × ai, and the world that moves them</div>
  <div class="dateline"><span>${esc(dateLong)}</span><span>no. ${editionNo}</span></div>
</header>
${paper.lead ? story(paper.lead, "story lead") : ""}
<main class="columns">
${sections}
</main>
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
