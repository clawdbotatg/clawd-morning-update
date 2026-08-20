#!/usr/bin/env node
// Deterministic pass: read a raw feed snapshot (data/feed-YYYY-MM-DD.json,
// copied over by clawd-twitter's morning.sh), cluster it into themes and rank
// tweets by engagement. Writes state/brief.json for the LLM narrative pass and
// the renderer. No network, no LLM.
//
// Theme candidates are ENTITIES only — @mentions, $cashtags, link domains, and
// words that show up capitalized mid-sentence (proper nouns) — plus bigrams
// touching one. Generic-unigram scoring (feed-trends.js style) drowns in
// common English at full-feed size; entities are what stories are made of.
// The LLM narrative pass gets ~14 candidates and keeps/skips/titles them.
//
// Usage: node scripts/rank.js [data/feed-2026-08-16.json]  (default: newest)
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");
const STATE = join(ROOT, "state");

function abort(msg) {
  console.error(msg);
  process.exit(1);
}
const file =
  process.argv[2] ||
  join(
    DATA,
    readdirSync(DATA)
      .filter((f) => /^feed-\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .sort()
      .at(-1) || abort("no feed-*.json in data/")
  );

const feed = JSON.parse(readFileSync(file, "utf8"));
const date = (file.match(/feed-(\d{4}-\d{2}-\d{2})/) || [])[1] || feed.fetched_at?.slice(0, 10);

// merge the previous evening's pull (evening-pull.sh, ~10pm) if it exists —
// the 1000-post morning pull only reaches back ~80 minutes into a timeline
// this busy, so the evening file is a second, non-overlapping snapshot of
// the day. Dedupe by id; evening tweets keep their as-of-10pm engagement.
let rawTweets = feed.tweets;
{
  const prev = new Date(date + "T12:00:00Z");
  prev.setUTCDate(prev.getUTCDate() - 1);
  const eveFile = join(DATA, `feed-eve-${prev.toISOString().slice(0, 10)}.json`);
  if (existsSync(eveFile)) {
    const have = new Set(rawTweets.map((t) => t.id));
    const add = JSON.parse(readFileSync(eveFile, "utf8")).tweets.filter((t) => !have.has(t.id));
    rawTweets = rawTweets.concat(add);
    console.log(`merged evening feed: +${add.length} tweets (${eveFile.replace(ROOT + "/", "")})`);
  }
}

const tweets = rawTweets.map((t) => ({
  ...t,
  text: t.is_rt ? t.text.replace(/^RT @\w+: /, "") : t.text,
  eng: (t.likes || 0) + 2 * (t.rts || 0) + (t.replies || 0),
}));
const N = tweets.length;

// Thread/burst collapse: a run of tweets by ONE author within minutes (a
// thread, numbered or not) is one unit of attention, not N independent
// signals — a 40-tweet thesis thread once manufactured four themes and 12
// paper stories on its own. Scoring below counts each term once per burst,
// and slim() tags multi-tweet-burst tweets with the burst's root id so the
// paper pass can see thread membership.
const BURST_GAP_MS = 15 * 60 * 1000;
const bursts = [];
const burstOf = new Map(); // tweet id -> { root, len }
{
  const byAuthor = new Map();
  for (const t of tweets) {
    if (!byAuthor.has(t.author)) byAuthor.set(t.author, []);
    byAuthor.get(t.author).push(t);
  }
  for (const list of byAuthor.values()) {
    list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    let cur = [];
    for (const t of list) {
      if (cur.length && new Date(t.created_at) - new Date(cur.at(-1).created_at) <= BURST_GAP_MS) cur.push(t);
      else {
        if (cur.length) bursts.push(cur);
        cur = [t];
      }
    }
    if (cur.length) bursts.push(cur);
  }
  for (const b of bursts) for (const t of b) burstOf.set(t.id, { root: b[0].id, len: b.length });
}

const STOP = new Set(
  `the a an and i you he she we they it this that if then else for to of in on at by with from as is are was were be not no yes so just like get got rt gm monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september october november december`.split(
    /\s+/
  )
);

// pass 1: proper-noun detection — how often is each word capitalized when it
// is NOT starting a tweet or sentence?
const capCount = new Map();
const totCount = new Map();
for (const t of tweets) {
  const text = t.text.replace(/https?:\/\/\S+/g, " ").replace(/[@#$]\w+/g, " ");
  const toks = text.split(/\s+/).filter(Boolean);
  for (let i = 0; i < toks.length; i++) {
    const w = toks[i].replace(/[^a-zA-Z0-9-]/g, "");
    if (w.length < 3) continue;
    const lower = w.toLowerCase();
    if (STOP.has(lower)) continue;
    totCount.set(lower, (totCount.get(lower) || 0) + 1);
    const sentStart = i === 0 || /[.!?:\n]$/.test(toks[i - 1] || "");
    if (/^[A-Z]/.test(w) && !sentStart) capCount.set(lower, (capCount.get(lower) || 0) + 1);
  }
}
const isEntity = (w) => {
  const c = capCount.get(w) || 0;
  return c >= 5 && c / (totCount.get(w) || 1) > 0.65;
};

// pass 2: term extraction per tweet — entities + bigrams touching an entity
function* termsOf(t) {
  const text = t.text.replace(/https?:\/\/\S+/g, " ");
  for (const m of text.matchAll(/\$[A-Za-z]{2,10}\b/g)) yield m[0].toUpperCase();
  for (const m of text.matchAll(/@\w{2,15}\b/g)) yield m[0].toLowerCase();
  for (const u of t.urls || []) {
    try {
      yield new URL(u).hostname.replace(/^www\./, "");
    } catch {}
  }
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/gi, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
  for (const w of words) if (isEntity(w)) yield w;
  for (let i = 0; i < words.length - 1; i++)
    if (isEntity(words[i]) || isEntity(words[i + 1])) yield words[i] + " " + words[i + 1];
}

const scores = new Map(); // term -> { score, count, samples }
for (const burst of bursts) {
  // one seen-set per BURST: a term scores once per author-run, so a monologue
  // can't trend itself. Weight = the burst's best tweet, not the sum.
  const weight = 1 + Math.log10(1 + Math.max(...burst.map((t) => t.eng)));
  const seen = new Set();
  for (const t of burst) {
    for (const term of termsOf(t)) {
      if (seen.has(term)) continue;
      seen.add(term);
      const e = scores.get(term) || { score: 0, count: 0, samples: [] };
      e.score += weight;
      e.count += 1;
      e.samples.push(t);
      scores.set(term, e);
    }
  }
}

// keep terms in 4+ bursts but not ultra-generic (>5% of the feed).
// (was 5+ tweets — burst-collapse lowered every count, so the bar drops one)
let ranked = [...scores.entries()]
  .filter(([, e]) => e.count >= 4 && e.count < N * 0.05)
  .sort((a, b) => b[1].score - a[1].score);

// prefer bigrams over their dominant unigram parts
const bigramParts = new Set();
for (const [term, e] of ranked.slice(0, 60)) {
  if (term.includes(" ")) {
    const [a, b] = term.split(" ");
    const pa = scores.get(a),
      pb = scores.get(b);
    if (pa && e.count / pa.count > 0.6) bigramParts.add(a);
    if (pb && e.count / pb.count > 0.6) bigramParts.add(b);
  }
}
ranked = ranked.filter(([term]) => !bigramParts.has(term)).slice(0, 30);

// build themes; a tweet appears in at most one theme (highest-ranked theme wins)
const claimed = new Set();
const slim = (t) => {
  const b = burstOf.get(t.id);
  return {
    id: t.id,
    author: t.author,
    author_name: t.author_name || "",
    created_at: t.created_at,
    text: t.text,
    likes: t.likes || 0,
    rts: t.rts || 0,
    replies: t.replies || 0,
    is_rt: !!t.is_rt,
    media: t.media || [],
    // tweets sharing a `thread` id are one author-burst (thread) — the paper
    // pass caps a thread at two stories, so it needs to see membership
    ...(b && b.len > 1 ? { thread: b.root, thread_len: b.len } : {}),
  };
};
const themes = ranked
  .map(([term, e]) => {
    const samples = e.samples
      .filter((t) => !claimed.has(t.id))
      .sort((a, b) => b.eng - a.eng)
      .slice(0, 12);
    samples.forEach((t) => claimed.add(t.id));
    return { term, tweet_count: e.count, score: Math.round(e.score * 10) / 10, tweets: samples.map(slim) };
  })
  .filter((th) => th.tweets.length >= 2);

// overall top tweets (may overlap themes; renderer dedupes)
const top = [...tweets].sort((a, b) => b.eng - a.eng).slice(0, 50).map(slim);

// top media-carrying tweets — the paper's image pool. Themes routinely drop
// every tweet with a picture, so the paper pass gets them as their own list.
const pics = [...tweets]
  .filter((t) => (t.media || []).some((m) => m.url))
  .sort((a, b) => b.eng - a.eng)
  .slice(0, 20)
  .map(slim);

mkdirSync(STATE, { recursive: true });
const brief = {
  source: file.replace(ROOT + "/", ""),
  date,
  fetched_at: feed.fetched_at,
  hours: feed.hours,
  tweet_count: N,
  themes,
  top,
  pics,
};
writeFileSync(join(STATE, "brief.json"), JSON.stringify(brief, null, 2));
console.log(`brief.json: ${N} tweets → ${themes.length} themes (${brief.date})`);
console.log(themes.map((t) => t.term).join(" · "));
