#!/usr/bin/env node
// Render state/brief.json (+ optional state/narrative.json from the LLM pass)
// into a static, phone-first HTML report at docs/<date>.html and docs/index.html.
// Every tweet card links out to x.com. All tweet/LLM text is HTML-escaped here —
// the narrative pass can only supply words, never markup.
//
// narrative.json shape (all fields optional, renderer degrades gracefully):
//   { "headline": "...", "intro": "...",
//     "order": ["term1", "term2"],          // theme display order
//     "skip": ["noisyterm"],                // themes to drop
//     "themes": { "<term>": { "title": "...", "blurb": "..." } } }
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STATE = join(ROOT, "state");
const DOCS = join(ROOT, "docs");

const brief = JSON.parse(readFileSync(join(STATE, "brief.json"), "utf8"));
let narrative = {};
try {
  narrative = JSON.parse(readFileSync(join(STATE, "narrative.json"), "utf8"));
} catch {}

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// X's API returns entity-encoded text (&amp; etc) — decode before our own
// escaping so it doesn't render double-escaped. Trailing t.co links are just
// media/quote stubs; the card itself links out, so drop them.
const cleanText = (s) =>
  String(s ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/(?:\s*https:\/\/t\.co\/\w+)+\s*$/, "");

const fmtN = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k" : String(n));
const fmtTime = (iso) => {
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/Denver",
    });
  } catch {
    return "";
  }
};

function tweetCard(t) {
  const url = `https://x.com/${t.author}/status/${t.id}`;
  // RT wrappers carry the original's rt count but zero likes/replies — show
  // only the metrics that exist instead of a row of zeros.
  const meta = [
    t.likes ? `♥ ${fmtN(t.likes)}` : "",
    t.rts ? `🔁 ${fmtN(t.rts)}` : "",
    t.replies ? `💬 ${fmtN(t.replies)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return `<a class="tw" href="${esc(url)}" target="_blank" rel="noopener">
  <div class="twhead"><span class="name">${esc(t.author_name || t.author)}</span> <span class="handle">@${esc(t.author)}</span>${t.is_rt ? ' <span class="rtbadge">RT</span>' : ""}<span class="time">${esc(fmtTime(t.created_at))}</span></div>
  <div class="twtext">${esc(cleanText(t.text))}</div>
  ${meta ? `<div class="twmeta">${meta}</div>` : ""}
</a>`;
}

// assemble themes in narrative order (unknown terms keep brief order, skips drop)
const skip = new Set(narrative.skip || []);
const byTerm = new Map(brief.themes.map((th) => [th.term, th]));
const ordered = [];
for (const term of narrative.order || []) {
  if (byTerm.has(term) && !skip.has(term)) {
    ordered.push(byTerm.get(term));
    byTerm.delete(term);
  }
}
for (const th of brief.themes) if (byTerm.has(th.term) && !skip.has(th.term)) ordered.push(th);

const themeSections = ordered
  .map((th) => {
    const n = narrative.themes?.[th.term] || {};
    return `<section class="theme">
  <h2>${esc(n.title || th.term)}</h2>
  ${n.blurb ? `<p class="blurb">${esc(n.blurb)}</p>` : ""}
  <div class="cards">${th.tweets.map(tweetCard).join("\n")}</div>
</section>`;
  })
  .join("\n");

const themedIds = new Set(ordered.flatMap((th) => th.tweets.map((t) => t.id)));
const topExtra = brief.top.filter((t) => !themedIds.has(t.id)).slice(0, 8);

const dateLong = new Date(brief.date + "T12:00:00").toLocaleDateString("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>morning update · ${esc(brief.date)}</title>
<style>
  :root { --bg:#f6f5f2; --card:#ffffff; --ink:#1a1a1a; --muted:#71717a; --line:#e4e4e7; --accent:#b4552d; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#101012; --card:#1a1a1e; --ink:#e8e8ea; --muted:#8e8e96; --line:#2a2a30; --accent:#e07a4a; }
  }
  * { box-sizing:border-box; margin:0; }
  body { background:var(--bg); color:var(--ink); font:16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
         max-width:640px; margin:0 auto; padding:16px 14px 60px; }
  header h1 { font-size:1.5rem; line-height:1.25; letter-spacing:-0.01em; }
  header .date { color:var(--muted); font-size:.85rem; margin-bottom:6px; text-transform:uppercase; letter-spacing:.06em; }
  header .stats { color:var(--muted); font-size:.85rem; margin-top:8px; }
  .intro { margin:16px 0 4px; font-size:1.02rem; }
  section.theme { margin-top:30px; }
  section.theme h2 { font-size:1.12rem; margin-bottom:4px; }
  .blurb { color:var(--muted); font-size:.92rem; margin-bottom:10px; }
  .cards { display:flex; flex-direction:column; gap:10px; margin-top:10px; }
  a.tw { display:block; background:var(--card); border:1px solid var(--line); border-radius:12px;
         padding:12px 14px; text-decoration:none; color:var(--ink); }
  a.tw:active { border-color:var(--accent); }
  .twhead { font-size:.85rem; margin-bottom:6px; }
  .twhead .name { font-weight:600; }
  .twhead .handle { color:var(--muted); }
  .twhead .time { color:var(--muted); float:right; }
  .rtbadge { color:var(--muted); border:1px solid var(--line); border-radius:4px; padding:0 4px; font-size:.7rem; }
  .twtext { white-space:pre-wrap; word-wrap:break-word; font-size:.95rem; }
  .twmeta { color:var(--muted); font-size:.8rem; margin-top:8px; }
  footer { margin-top:44px; color:var(--muted); font-size:.8rem; }
  footer a { color:var(--muted); }
  .archive a { margin-right:10px; }
</style>
</head>
<body>
<header>
  <div class="date">${esc(dateLong)}</div>
  <h1>${esc(narrative.headline || "morning update 🦞")}</h1>
  ${narrative.intro ? `<p class="intro">${esc(narrative.intro)}</p>` : ""}
  <div class="stats">${brief.tweet_count} tweets · last ${esc(String(brief.hours))}h · fetched ${esc(fmtTime(brief.fetched_at))} MT</div>
</header>
${themeSections}
${topExtra.length ? `<section class="theme"><h2>also big this morning</h2><div class="cards">${topExtra.map(tweetCard).join("\n")}</div></section>` : ""}
<footer>
  <div class="archive">__ARCHIVE__</div>
  <p>built by clawd 🦞 from the morning feed pull · links open on x.com</p>
</footer>
</body>
</html>`;

mkdirSync(DOCS, { recursive: true });
writeFileSync(join(DOCS, `${brief.date}.html`), page.replace("__ARCHIVE__", ""));

// index.html = latest report + archive links to the last 14 dated pages
const dated = readdirSync(DOCS)
  .filter((f) => /^\d{4}-\d{2}-\d{2}\.html$/.test(f))
  .sort()
  .reverse()
  .slice(0, 14);
const archive = "past mornings: " + dated.map((f) => `<a href="${f}">${f.replace(".html", "").slice(5)}</a>`).join(" ");
writeFileSync(join(DOCS, "index.html"), page.replace("__ARCHIVE__", archive));
console.log(`rendered docs/${brief.date}.html + docs/index.html (${ordered.length} themes, ${topExtra.length} extra top tweets)`);
