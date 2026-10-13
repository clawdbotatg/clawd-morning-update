#!/usr/bin/env node
// Show-prep weekly, deterministic pass: Austin goes live Wednesday afternoon
// and wants the week since last Wednesday. Window = [show Wednesday - 7 days,
// today], where the show Wednesday is today if today is Wednesday, else the
// next one. Merges each day's narrative (already-distilled headline/intro/
// theme blurbs) with that day's top theme tweets into state/show-brief.json.
// No network, no LLM.
//   node scripts/show.js [--today YYYY-MM-DD]
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STATE = join(ROOT, "state");

const argToday = process.argv.indexOf("--today");
const denverToday = new Date().toLocaleDateString("en-CA", { timeZone: "America/Denver" });
const today = argToday > 0 ? process.argv[argToday + 1] : denverToday;

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => {
  const d = new Date(s + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};
const dow = new Date(today + "T12:00:00Z").getUTCDay(); // 3 = wednesday
const showDate = addDays(today, (3 - dow + 7) % 7);
const from = addDays(showDate, -7);

const eng = (t) => t.likes + 2 * t.rts + t.replies;
// keep the brief small enough for one Read: just what the pass and renderer use
const slim = ({ id, author, text, likes, rts, replies }) => ({ id, author, text, likes, rts, replies });
const days = [];
for (let d = from; d <= today; d = addDays(d, 1)) {
  const bp = join(STATE, "briefs", `${d}.json`);
  const np = join(STATE, "narratives", `${d}.json`);
  if (!existsSync(bp)) continue;
  const brief = JSON.parse(readFileSync(bp, "utf8"));
  const narr = existsSync(np) ? JSON.parse(readFileSync(np, "utf8")) : null;
  const byTerm = new Map(brief.themes.map((th) => [th.term, th]));
  // narrative order first (the editor's ranking), then whatever it didn't rank
  const terms = narr ? (narr.order || []).filter((t) => byTerm.has(t)) : brief.themes.map((t) => t.term).slice(0, 8);
  days.push({
    date: d,
    headline: narr?.headline || "",
    intro: narr?.intro || "",
    themes: terms.map((term) => {
      const th = byTerm.get(term);
      return {
        term,
        title: narr?.themes?.[term]?.title || term,
        blurb: narr?.themes?.[term]?.blurb || "",
        tweets: [...th.tweets].sort((a, b) => eng(b) - eng(a)).slice(0, 3).map(slim),
      };
    }),
    top: brief.top.filter((t) => !t.is_rt).sort((a, b) => eng(b) - eng(a)).slice(0, 3).map(slim),
  });
}
if (!days.length) {
  console.error(`no briefs between ${from} and ${today}`);
  process.exit(1);
}

const out = { show_date: showDate, from, through: days.at(-1).date, days };
writeFileSync(join(STATE, "show-brief.json"), JSON.stringify(out, null, 2));
console.log(`show-brief.json: show ${showDate}, ${days.length} days (${from} → ${out.through})`);
