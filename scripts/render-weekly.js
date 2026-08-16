#!/usr/bin/env node
// Render state/weekly-brief.json (+ optional state/weekly-narrative.json)
// into docs/week-<through-date>.html plus state/weekly-digest.md for the
// recon drop. Same card/style language as the daily report; adds a
// days-present line per theme and the tweet-angles panel.
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { esc, tweetCard, mdTweet, CSS } from "../lib/html.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STATE = join(ROOT, "state");
const DOCS = join(ROOT, "docs");

const brief = JSON.parse(readFileSync(join(STATE, "weekly-brief.json"), "utf8"));
let narrative = {};
try {
  narrative = JSON.parse(readFileSync(join(STATE, "weekly-narrative.json"), "utf8"));
} catch {}

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

const dayShort = (d) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" });
const dayLabel = (t) =>
  new Date(t.created_at).toLocaleDateString("en-US", { weekday: "short", timeZone: "America/Denver" });

const themeSections = ordered
  .map((th) => {
    const n = narrative.themes?.[th.term] || {};
    return `<section class="theme">
  <h2>${esc(n.title || th.term)}</h2>
  <div class="daysline">${th.days_present.map(dayShort).join(" · ")}</div>
  ${n.blurb ? `<p class="blurb">${esc(n.blurb)}</p>` : ""}
  <div class="cards">${th.tweets.slice(0, 5).map((t) => tweetCard(t, dayLabel(t))).join("\n")}</div>
</section>`;
  })
  .join("\n");

const themedIds = new Set(ordered.flatMap((th) => th.tweets.map((t) => t.id)));
const topExtra = brief.top.filter((t) => !themedIds.has(t.id)).slice(0, 8);

const angles = (narrative.tweet_angles || []).filter(Boolean);
const rangeLong = `${new Date(brief.week_of + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric" })} – ${new Date(brief.through + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`;

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>week on the timeline · ${esc(brief.through)}</title>
<style>${CSS}</style>
</head>
<body>
<header>
  <div class="date">the week · ${esc(rangeLong)}</div>
  <h1>${esc(narrative.headline || "the week on the timeline 🦞")}</h1>
  ${narrative.intro ? `<p class="intro">${esc(narrative.intro)}</p>` : ""}
  <div class="stats">${brief.tweet_count} tweets across ${brief.days.length} morning pulls</div>
</header>
${themeSections}
${topExtra.length ? `<section class="theme"><h2>biggest tweets of the week</h2><div class="cards">${topExtra.map((t) => tweetCard(t, dayLabel(t))).join("\n")}</div></section>` : ""}
${
  angles.length
    ? `<section class="theme"><h2>tweet angles for clawd</h2><div class="angles"><ol>${angles
        .map((a) => `<li>${esc(a)}</li>`)
        .join("")}</ol></div><p class="blurb" style="margin-top:8px">ideas only — nothing posts without approval. tell clawd "draft #n" to turn one into real options.</p></section>`
    : ""
}
<footer>
  <p><a href="index.html">← today's morning update</a></p>
  <p>built by clawd 🦞 from a week of morning feed pulls · links open on x.com</p>
</footer>
</body>
</html>`;

mkdirSync(DOCS, { recursive: true });
writeFileSync(join(DOCS, `week-${brief.through}.html`), page);

const digest = [
  `# the week on twitter — ${brief.week_of} → ${brief.through}`,
  ``,
  `> ${narrative.headline || "weekly rollup"}`,
  ``,
  narrative.intro || "",
  ``,
  `_${brief.tweet_count} tweets across ${brief.days.length} morning pulls (${brief.days.join(", ")})._`,
  ``,
  ...ordered.flatMap((th) => {
    const n = narrative.themes?.[th.term] || {};
    return [
      `## ${n.title || th.term} (${th.days_present.length}/${brief.days.length} days)`,
      n.blurb ? `${n.blurb}` : "",
      ...th.tweets.slice(0, 3).map(mdTweet),
      ``,
    ];
  }),
  angles.length ? `## tweet angles (ideas only, approval-gated as always)` : "",
  ...angles.map((a, i) => `${i + 1}. ${a}`),
  ``,
  `---`,
  `_source: clawd-morning-update weekly (html: https://clawdbotatg.github.io/clawd-morning-update/week-${brief.through}.html)_`,
].join("\n");
writeFileSync(join(STATE, "weekly-digest.md"), digest);
console.log(`rendered docs/week-${brief.through}.html + state/weekly-digest.md (${ordered.length} themes, ${angles.length} angles)`);
