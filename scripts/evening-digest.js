#!/usr/bin/env node
// Compact, ranked view of an evening feed pull for the evening digest.
// Usage: node scripts/evening-digest.js data/feed-eve-YYYY-MM-DD.json [top=160]
// Writes state/evening-feed.txt: one line per tweet, highest engagement first,
// retweets collapsed onto their text, links stripped — small enough for the
// LLM pass to Read in one go. Prints a 3-line plain-text fallback summary to
// stdout (used for the Telegram message if the LLM pass fails).
import { readFileSync, writeFileSync, mkdirSync } from "fs";

const [file, topArg] = process.argv.slice(2);
if (!file) { console.error("usage: evening-digest.js <feed-eve.json> [top]"); process.exit(2); }
const TOP = parseInt(topArg, 10) || 160;
const { tweets, fetched_at } = JSON.parse(readFileSync(file, "utf8"));

const score = (t) => t.likes + 2 * t.rts + t.replies;
const clean = (s) => s.replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim();
const seen = new Set();
const ranked = [];
for (const t of [...tweets].sort((a, b) => score(b) - score(a))) {
  const key = clean(t.text).slice(0, 80).toLowerCase();
  if (seen.has(key)) continue; // same text retweeted by several people
  seen.add(key);
  ranked.push(t);
}
const lines = ranked.slice(0, TOP).map((t) => {
  // a retweet carries the ORIGINAL's counts and "RT @orig: text" — credit the
  // original author and note who on Austin's timeline retweeted it
  const m = t.is_rt && t.text.match(/^RT @(\w+): ([\s\S]*)$/);
  const who = m ? `@${m[1]} (rt by @${t.author})` : `@${t.author}`;
  const text = clean(m ? m[2] : t.text).slice(0, 260);
  return `${who} [${t.likes}♥ ${t.rts}↻ ${t.replies}💬] ${text}`;
});
const times = tweets.map((t) => new Date(t.created_at).getTime());
const span = `${new Date(Math.min(...times)).toISOString().slice(11, 16)}–${new Date(Math.max(...times)).toISOString().slice(11, 16)} UTC`;
mkdirSync("state", { recursive: true });
writeFileSync(
  "state/evening-feed.txt",
  `# evening pull ${fetched_at} — ${tweets.length} tweets (${ranked.length} distinct), posted ${span}, top ${lines.length} by engagement\n` +
    lines.join("\n") + "\n"
);
console.log(`${tweets.length} tweets (${ranked.length} distinct), posted ${span}`);
for (const l of lines.slice(0, 5)) console.log(l.slice(0, 160));
