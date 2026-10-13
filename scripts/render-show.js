#!/usr/bin/env node
// Render state/show.json (prompts/show.md) into the public site:
// ../clawd-daily/docs/week/<show_date>.html + week/index.html (latest), served
// at gmsers.com/week/<show_date> and gmsers.com/week. Same look as the daily
// paper: black page, one numbered list, each item opens to its source tweets.
// All LLM/tweet text is escaped — words, never markup.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { esc, cleanText, fmtN } from "../lib/html.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STATE = join(ROOT, "state");
const DAILY = join(ROOT, "..", "clawd-daily");
const OUT = join(DAILY, "docs", "week");
const SITE = "https://gmsers.com/";

if (!existsSync(DAILY)) {
  console.error("clawd-daily repo not found beside clawd-morning-update");
  process.exit(1);
}
const brief = JSON.parse(readFileSync(join(STATE, "show-brief.json"), "utf8"));
const show = JSON.parse(readFileSync(join(STATE, "show.json"), "utf8"));
if (show.show_date !== brief.show_date) {
  console.error(`show.json is for ${show.show_date} but brief is ${brief.show_date} — stale`);
  process.exit(1);
}

const tweets = new Map();
for (const d of brief.days) for (const t of [...d.themes.flatMap((th) => th.tweets), ...d.top]) tweets.set(t.id, t);

const fmtDay = (s, opts) => new Date(s + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", ...opts });
const range = `${fmtDay(show.from, { weekday: "short", month: "short", day: "numeric" })} – ${fmtDay(show.through, {
  weekday: "short",
  month: "short",
  day: "numeric",
})}`;

const srcs = (ids = []) =>
  ids
    .map((id) => tweets.get(id))
    .filter(Boolean)
    .map(
      (t) => `<a class="src" href="https://x.com/${esc(t.author)}/status/${esc(t.id)}" target="_blank" rel="noopener">
  <span class="srchead">@${esc(t.author)}${t.likes ? ` · ♥ ${fmtN(t.likes)}` : ""}</span>
  <span class="srctext">${esc(cleanText(t.text).replace(/\s+/g, " ").slice(0, 240))}</span>
</a>`
    )
    .join("\n");

const item = (it) => `<li><details>
  <summary><span class="hl">${esc(it.title)}</span><span class="txt">${esc(it.text)}</span></summary>
  <div class="srcs">${srcs(it.sources)}</div>
</details></li>`;

const CSS = `
  :root { --paper:#000; --ink:#f4f4f2; --muted:#9a9ea6; --faint:#242629; --accent:#ff4b33; }
  * { box-sizing:border-box; margin:0; }
  body { background:var(--paper); color:var(--ink); max-width:760px; margin:0 auto; padding:22px 16px 60px;
         font:18px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
  .masthead { padding-bottom:10px; border-bottom:2px solid var(--ink); display:flex; align-items:flex-end; gap:14px; }
  .pfp { width:56px; height:56px; border-radius:12px; flex:none; }
  .masthead h1 { font-size:2rem; font-weight:800; letter-spacing:-.02em; line-height:1; }
  .masthead h1 a { color:var(--ink); text-decoration:none; }
  .masthead h1 .gm { color:var(--accent); }
  .masthead .sub { color:var(--muted); font-size:.85rem; margin-top:4px; }
  .tldr { font-size:1.35rem; font-weight:700; margin:18px 0 4px; letter-spacing:-.01em; }
  ol { margin-top:12px; padding-left:1.8em; }
  ol li { padding:8px 0; }
  ol li::marker { color:var(--accent); font-weight:700; }
  summary { cursor:pointer; list-style:none; }
  summary::-webkit-details-marker { display:none; }
  .hl { display:block; font-size:1.15rem; font-weight:700; line-height:1.3; }
  .txt { display:block; font-size:1rem; line-height:1.45; margin-top:2px; }
  details[open] .hl { color:var(--accent); }
  .srcs { margin:6px 0 4px; }
  a.src { display:block; text-decoration:none; color:var(--ink); border-left:2px solid var(--faint);
          padding:5px 10px; margin-top:6px; font-size:.84rem; }
  a.src:hover { border-left-color:var(--accent); }
  .srchead { display:block; font-size:.74rem; font-weight:600; color:var(--accent); }
  .srctext { opacity:.85; }
  h2 { font-size:.85rem; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); margin:28px 0 6px; }
  ul.quick { padding-left:1.2em; color:var(--ink); font-size:.95rem; }
  ul.quick li { padding:3px 0; }
  footer { margin-top:32px; color:var(--muted); font-size:.78rem; }
  footer a { color:var(--accent); }
`;

const url = `${SITE}week/${show.show_date}`;
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>gmsers · week of ${esc(show.from)}</title>
<meta name="description" content="${esc(show.tldr)}">
<meta name="theme-color" content="#000000">
<link rel="icon" type="image/png" href="/favicon.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta property="og:site_name" content="gmsers">
<meta property="og:url" content="${url}">
<meta property="og:title" content="gmsers · the week, ${esc(range)}">
<meta property="og:description" content="${esc(show.tldr)}">
<meta property="og:image" content="${SITE}apple-touch-icon.png">
<meta name="twitter:card" content="summary">
<style>${CSS}</style>
</head>
<body>
<header class="masthead">
  <img class="pfp" src="/gmsers.jpg" alt="gmsers" width="56" height="56">
  <div>
    <h1><a href="/"><span class="gm">gm</span>sers</a> · the week</h1>
    <div class="sub">${esc(range)}</div>
  </div>
</header>
<!-- week:${show.show_date} -->
<p class="tldr">${esc(show.tldr)}</p>
<ol>
${(show.items || []).map(item).join("\n")}
</ol>
${show.quick?.length ? `<h2>quick hits</h2>\n<ul class="quick">${show.quick.map((q) => `<li>${esc(q)}</li>`).join("")}</ul>` : ""}
<footer><p>from <a href="https://x.com/clawdbotatg" target="_blank" rel="noopener">@clawdbotatg</a>'s morning timeline reads · tap an item for its tweets · <a href="/">daily paper</a></p></footer>
</body>
</html>`;

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, `${show.show_date}.html`), html);
writeFileSync(join(OUT, "index.html"), html.replace(`<meta property="og:url" content="${url}">`, `<meta property="og:url" content="${SITE}week">`));
console.log(`rendered clawd-daily/docs/week/${show.show_date}.html → ${url}`);
