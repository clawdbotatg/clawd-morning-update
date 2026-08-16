#!/usr/bin/env node
// Render state/brief.json (+ optional state/narrative.json from the LLM pass)
// into a static, phone-first HTML report at docs/<date>.html and docs/index.html,
// plus state/digest.md (the same report as agent-readable markdown for the
// recon drop). Every tweet card links out to x.com. All tweet/LLM text is
// HTML-escaped in lib/html.js — the narrative pass can only supply words,
// never markup.
//
// narrative.json shape (all fields optional, renderer degrades gracefully):
//   { "headline": "...", "intro": "...",
//     "order": ["term1", "term2"],          // theme display order
//     "skip": ["noisyterm"],                // themes to drop
//     "themes": { "<term>": { "title": "...", "blurb": "..." } } }
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { esc, cleanText, fmtTime, tweetCard, mdTweet, CSS } from "../lib/html.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STATE = join(ROOT, "state");
const DOCS = join(ROOT, "docs");

const brief = JSON.parse(readFileSync(join(STATE, "brief.json"), "utf8"));
let narrative = {};
try {
  narrative = JSON.parse(readFileSync(join(STATE, "narrative.json"), "utf8"));
} catch {}

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
  <div class="cards">${th.tweets.map((t) => tweetCard(t)).join("\n")}</div>
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
<style>${CSS}</style>
</head>
<body>
<header>
  <div class="date">${esc(dateLong)}</div>
  <h1>${esc(narrative.headline || "morning update 🦞")}</h1>
  ${narrative.intro ? `<p class="intro">${esc(narrative.intro)}</p>` : ""}
  <div class="stats">${brief.tweet_count} tweets · last ${esc(String(brief.hours))}h · fetched ${esc(fmtTime(brief.fetched_at))} MT</div>
</header>
${themeSections}
${topExtra.length ? `<section class="theme"><h2>also big this morning</h2><div class="cards">${topExtra.map((t) => tweetCard(t)).join("\n")}</div></section>` : ""}
<footer>
  <div class="archive">__ARCHIVE__</div>
  <p>built by clawd 🦞 from the morning feed pull · links open on x.com</p>
</footer>
</body>
</html>`;

// agent-readable digest for the recon drop (~/Desktop/recon/twitter/)
const digest = [
  `# twitter vibe — ${brief.date}`,
  ``,
  `> ${narrative.headline || "morning feed digest"}`,
  ``,
  narrative.intro || "",
  ``,
  `_${brief.tweet_count} tweets from Austin's home timeline, last ${brief.hours}h, fetched ${brief.fetched_at}._`,
  ``,
  ...ordered.flatMap((th) => {
    const n = narrative.themes?.[th.term] || {};
    return [`## ${n.title || th.term}`, n.blurb ? `${n.blurb}` : "", ...th.tweets.slice(0, 4).map(mdTweet), ``];
  }),
  topExtra.length ? `## also big this morning` : "",
  ...topExtra.slice(0, 5).map(mdTweet),
  ``,
  `---`,
  `_source: clawd-morning-update (raw archive: data/feed-${brief.date}.json; html: https://clawdbotatg.github.io/clawd-morning-update/)_`,
].join("\n");
writeFileSync(join(STATE, "digest.md"), digest);

mkdirSync(DOCS, { recursive: true });
writeFileSync(join(DOCS, `${brief.date}.html`), page.replace("__ARCHIVE__", ""));

// index.html = latest report + archive links (daily pages + weekly rollups)
const dated = readdirSync(DOCS)
  .filter((f) => /^\d{4}-\d{2}-\d{2}\.html$/.test(f))
  .sort()
  .reverse()
  .slice(0, 14);
const weeklies = readdirSync(DOCS)
  .filter((f) => /^week-\d{4}-\d{2}-\d{2}\.html$/.test(f))
  .sort()
  .reverse()
  .slice(0, 8);
const archive =
  "past mornings: " +
  dated.map((f) => `<a href="${f}">${f.replace(".html", "").slice(5)}</a>`).join(" ") +
  (weeklies.length
    ? `<br>weekly rollups: ` + weeklies.map((f) => `<a href="${f}">${f.replace(/^week-|\.html$/g, "").slice(5)}</a>`).join(" ")
    : "");
writeFileSync(join(DOCS, "index.html"), page.replace("__ARCHIVE__", archive));
console.log(
  `rendered docs/${brief.date}.html + docs/index.html + state/digest.md (${ordered.length} themes, ${topExtra.length} extra top tweets)`
);
