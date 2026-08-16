#!/usr/bin/env node
// Weekly rollup, deterministic pass: merge the last 7 days of daily briefs
// (state/briefs/YYYY-MM-DD.json, persisted by report.sh) into
// state/weekly-brief.json — themes that lasted vs one-day wonders, and the
// week's top tweets. No network, no LLM.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BRIEFS = join(ROOT, "state", "briefs");

const files = readdirSync(BRIEFS)
  .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
  .sort()
  .slice(-7);
if (!files.length) {
  console.error("no dated briefs in state/briefs/");
  process.exit(1);
}
const days = files.map((f) => JSON.parse(readFileSync(join(BRIEFS, f), "utf8")));

// merge themes across days by term
const merged = new Map(); // term -> { days: [date], score, tweet_count, samples }
for (const day of days) {
  for (const th of day.themes) {
    const e = merged.get(th.term) || { days: [], score: 0, tweet_count: 0, samples: [] };
    e.days.push(day.date);
    e.score += th.score;
    e.tweet_count += th.tweet_count;
    e.samples.push(...th.tweets);
    merged.set(th.term, e);
  }
}

const eng = (t) => t.likes + 2 * t.rts + t.replies;
const themes = [...merged.entries()]
  // days-present is the week's real signal: a story that shows up 4 mornings
  // beats a one-day engagement spike, so weight score by days^1.5
  .sort((a, b) => b[1].score * Math.pow(b[1].days.length, 1.5) - a[1].score * Math.pow(a[1].days.length, 1.5))
  .slice(0, 14)
  .map(([term, e]) => {
    const seen = new Set();
    const samples = e.samples
      .filter((t) => !seen.has(t.id) && seen.add(t.id))
      .sort((a, b) => eng(b) - eng(a))
      .slice(0, 6);
    return {
      term,
      days_present: e.days,
      score: Math.round(e.score * 10) / 10,
      tweet_count: e.tweet_count,
      tweets: samples,
    };
  });

// week's top tweets across all daily top-lists, deduped. RT wrappers are
// excluded — their metrics are the original's virality (often off-topic spam),
// not something the timeline authored this week.
const seen = new Set();
const top = days
  .flatMap((d) => d.top)
  .filter((t) => !t.is_rt && !seen.has(t.id) && seen.add(t.id))
  .sort((a, b) => eng(b) - eng(a))
  .slice(0, 12);

const out = {
  week_of: days[0].date,
  through: days.at(-1).date,
  days: days.map((d) => d.date),
  tweet_count: days.reduce((n, d) => n + d.tweet_count, 0),
  themes,
  top,
};
mkdirSync(join(ROOT, "state"), { recursive: true });
writeFileSync(join(ROOT, "state", "weekly-brief.json"), JSON.stringify(out, null, 2));
console.log(
  `weekly-brief.json: ${days.length} days (${out.week_of} → ${out.through}), ${themes.length} themes`
);
console.log(themes.map((t) => `${t.term}(${t.days_present.length}d)`).join(" · "));
