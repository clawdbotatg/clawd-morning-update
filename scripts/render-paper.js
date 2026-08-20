#!/usr/bin/env node
// Render state/paper.json (the public-paper LLM pass) into the clawd-daily
// repo: ../clawd-daily/docs/<date>.html + index.html. This is the PUBLIC
// paper — crypto × ai + world politics, curated from the same paid feed pull
// as the private morning update. hackernews-shaped: a masthead, then ONE flat
// numbered list of headlines ordered by importance (rank is the only
// hierarchy). Each row is a <details>: collapsed = headline + a tiny
// "read more" line, open = dek + picture + source tweets. A right rail lists
// every past edition as date + ~8-word tldr (docs/days.json, maintained here);
// promo cards (friends-of-the-paper og banners) interlace the list every 10
// stories. No sections, no JS. All LLM/tweet text is escaped — words, never
// markup.
//
// paper.json shape (written by prompts/paper.md):
//   { "date": "YYYY-MM-DD",
//     "stories": [ { "headline", "dek"?, "sources": [], "image"? } ] }
// Legacy editions (lead + sections) are flattened in document order.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { esc, cleanText, fmtN } from "../lib/html.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STATE = join(ROOT, "state");
const DAILY = join(ROOT, "..", "clawd-daily");
const DOCS = join(DAILY, "docs");
const SITE = "https://gmsers.com/"; // vercel serves clawd-daily/docs here (cleanUrls)

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

// flat ranked list; legacy lead+sections editions flatten in document order
const stories = (
  paper.stories || [paper.lead, ...(paper.sections || []).flatMap((s) => s.stories)]
).filter(Boolean);

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
  return `<div class="srcs">${rows.join("\n")}</div>`;
};

// a story may point `image` at a source tweet carrying attached media —
// the picture prints inside the expanded story (the collapsed page is text).
// Photos only: a video's thumbnail is a frame grab (usually someone's face),
// not the chart/screenshot/scene the image rule is for.
const storyImage = (s) => {
  const url = tweets.get(s.image)?.media?.find((m) => m.type === "photo" && m.url)?.url;
  return url ? `<img class="pic" src="${esc(url)}" alt="" loading="lazy">` : "";
};

// collapsed: headline + subtext line (top source + "read more");
// open: dek (if any) + picture + source tweets
const story = (s) => {
  const dek = [s.dek, s.body].filter(Boolean).map(esc).join(" ");
  const first = (s.sources || []).map((id) => tweets.get(id)).find(Boolean);
  const via = first ? `@${esc(first.author)}${first.likes ? ` ♥ ${fmtN(first.likes)}` : ""} · ` : "";
  return `<li><details>
  <summary>
    <span class="hl">${esc(s.headline)}</span>
    <span class="sub">${via}<span class="more">read more</span></span>
  </summary>
  ${dek ? `<p class="dek">${dek}</p>` : ""}
  ${storyImage(s)}
  ${sourceLinks(s.sources)}
</details></li>`;
};

const dateLong = new Date(paper.date + "T12:00:00").toLocaleDateString("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});

// the day ledger (docs/days.json): one {date, tldr} per edition, newest
// first — the right rail renders it, so every new day needs an entry. The
// tldr comes from the paper pass; a hand-seeded entry survives as fallback.
const daysPath = join(DOCS, "days.json");
let days = [];
try {
  days = JSON.parse(readFileSync(daysPath, "utf8"));
} catch {}
const tldr = (paper.tldr || days.find((d) => d.date === paper.date)?.tldr || stories[0]?.headline || "").trim();
days = [{ date: paper.date, tldr }, ...days.filter((d) => d.date !== paper.date)].sort((a, b) =>
  b.date.localeCompare(a.date)
);
writeFileSync(daysPath, JSON.stringify(days, null, 2) + "\n");

// right rail: every day, extensionless links (GitHub Pages and Vercel
// cleanUrls both serve 2026-08-19.html at /2026-08-19)
const dayShort = (iso) =>
  new Date(iso + "T12:00:00")
    .toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    .toLowerCase();
const rail = days
  .map(
    (d) => `<a class="day${d.date === paper.date ? " now" : ""}" href="${esc(d.date)}">
  <span class="d">${esc(dayShort(d.date))}</span>
  <span class="tl">${esc(d.tldr)}</span>
</a>`
  )
  .join("\n");

// promo cards — each site's og card (fetched/refreshed daily by report.sh,
// last good copy kept on failure), interlaced into the list: one card after
// every full ${AD_EVERY} stories, cycling the deck. w/h are layout hints only
// (CSS does width:100%/height:auto), so drift after a site redesign is fine.
const ADS = [
  { href: "https://www.onedollaraudit.com/", img: "onedollaraudit.png", alt: "one dollar audit — a serious security audit, one dollar", w: 1200, h: 630 },
  { href: "https://larv.ai/", img: "larv.jpg", alt: "larv.ai", w: 1200, h: 628 },
  { href: "https://ethskills.com/", img: "ethskills.png", alt: "ethskills — ethereum knowledge for ai agents", w: 1200, h: 628 },
  { href: "https://slop.computer/", img: "slopcomputer.jpg", alt: "slop.computer — onchain podcast", w: 1200, h: 800 },
  { href: "https://leftclaw.services/", img: "leftclaw.jpg", alt: "leftclaw services", w: 1200, h: 630 },
];
const AD_EVERY = 10;
const adCard = (a) =>
  `<p class="ad"><a href="${a.href}" target="_blank" rel="noopener"><img class="banner" src="${a.img}" alt="${esc(a.alt)}" loading="lazy" width="${a.w}" height="${a.h}"></a></p>`;

// the feed: stories in chunks of AD_EVERY (each its own <ol start=…> so the
// ranked numbering runs straight through), a card after every full chunk —
// each card at most once (a monster edition just runs bannerless after the
// deck is spent; repeats read as spam). A short edition that never earns a
// slot still gets one card at the end.
let adI = 0;
let feed = "";
for (let i = 0; i < stories.length; i += AD_EVERY) {
  const chunk = stories.slice(i, i + AD_EVERY);
  feed += `<ol class="stories" start="${i + 1}">\n${chunk.map(story).join("\n")}\n</ol>\n`;
  if (chunk.length === AD_EVERY && adI < ADS.length) feed += adCard(ADS[adI++]) + "\n";
}
if (!adI) feed += adCard(ADS[0]) + "\n";

mkdirSync(DOCS, { recursive: true });
const priorEditions = readdirSync(DOCS).filter((f) => /^\d{4}-\d{2}-\d{2}\.html$/.test(f));
const editionNo = priorEditions.includes(`${paper.date}.html`) ? priorEditions.length : priorEditions.length + 1;

const CSS = `
  /* gmsers is dark, always: black page, white text, lobster-red links */
  :root { --paper:#000; --ink:#f4f4f2; --muted:#9a9ea6; --faint:#242629; --accent:#ff4b33; }
  * { box-sizing:border-box; margin:0; }
  body { background:var(--paper); color:var(--ink); max-width:1240px; margin:0 auto; padding:22px 18px 60px;
         font:18px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
  /* main list + right rail of days; rail stacks below on phones */
  .wrap { display:flex; gap:44px; align-items:flex-start; margin-top:16px; }
  .wrap main { flex:1; min-width:0; }
  aside.days { width:270px; flex:none; position:sticky; top:18px; max-height:calc(100vh - 36px);
               overflow:auto; scrollbar-width:none; }
  aside.days::-webkit-scrollbar { display:none; }
  a.day { display:block; padding:9px 0; border-bottom:1px solid var(--faint); text-decoration:none; }
  a.day .d { display:block; color:var(--ink); font-weight:700; font-size:.85rem; }
  a.day.now .d { color:var(--accent); }
  a.day .tl { display:block; color:var(--muted); font-size:.8rem; line-height:1.35; margin-top:1px; }
  a.day:hover .d { color:var(--accent); }
  @media (max-width:900px) {
    .wrap { display:block; }
    aside.days { width:auto; position:static; max-height:none; margin-top:30px;
                 border-top:2px solid var(--ink); padding-top:8px; }
  }
  .masthead { position:relative; padding-bottom:10px; border-bottom:2px solid var(--ink); }
  .mrow { display:flex; align-items:flex-end; gap:16px; flex-wrap:wrap; }
  .masthead h1 { font-size:2.4rem; font-weight:800; letter-spacing:-.02em; line-height:1; }
  .masthead h1 a { color:var(--ink); text-decoration:none; }
  .masthead h1 .gm { color:var(--accent); }
  .masthead h1 .dotcom { color:var(--muted); }
  .pfp { width:64px; height:64px; border-radius:12px; flex:none; }
  .dateline { position:absolute; top:0; right:0; color:var(--muted); font-size:.8rem; text-align:right; }
  ol.stories { margin-top:16px; padding-left:2em; }
  ol.stories li { padding:7px 0; }
  ol.stories li::marker { color:var(--muted); font-size:.85rem; }
  summary { cursor:pointer; list-style:none; -webkit-user-select:none; user-select:none; }
  summary::-webkit-details-marker { display:none; }
  .hl { font-size:1.2rem; font-weight:600; letter-spacing:-.01em; line-height:1.3; }
  .sub { display:block; color:var(--muted); font-size:.78rem; margin-top:2px; }
  .sub .more { color:var(--accent); }
  details[open] .sub .more { opacity:.5; }
  .dek { font-size:1rem; line-height:1.5; margin:7px 0 2px; max-width:46em; }
  .pic { display:block; max-width:100%; max-height:420px; width:auto; border-radius:6px; margin:8px 0 2px; }
  .srcs { margin:6px 0 4px; }
  a.src { display:block; text-decoration:none; color:var(--ink); border-left:2px solid var(--faint);
          padding:5px 10px; margin-top:6px; font-size:.84rem; }
  a.src:hover { border-left-color:var(--accent); }
  .srchead { display:block; font-size:.74rem; font-weight:600; color:var(--accent); margin-bottom:1px; }
  .srctext { color:var(--ink); opacity:.85; }
  footer { margin-top:32px; color:var(--muted); font-size:.78rem; }
  footer a { color:var(--accent); }
  .powered { margin-top:14px; }
  .powered a { color:var(--accent); text-decoration:none; }
  .ad { margin:26px 0; }
  .ad .banner { display:block; width:100%; height:auto; border-radius:12px; }
`;

// Two unfurls, on purpose: the dated page unfurls as that day's card, but
// index.html — the root https://gmsers.com/ link — gets STATIC brand meta
// (og/home.png: big title + clawd + tagline, rendered by og-image.js).
// Never point the root at the day's content: the root link is evergreen and
// x.com etc. cache unfurls per-URL, so a dated card there is stale by noon.
const TAGLINE = "gm, sers — the daily brief at the intersection of crypto and ai";
const page = ({ title, ogTitle, desc, card, url }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="theme-color" content="#000000">
<link rel="icon" type="image/png" href="favicon.png">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<meta property="og:site_name" content="gmsers">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${esc(ogTitle)}">
<meta property="og:description" content="${esc(desc)}">
${
  existsSync(join(DOCS, "og", card))
    ? `<meta property="og:image" content="${SITE}og/${card}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${SITE}og/${card}">`
    : `<meta property="og:image" content="${SITE}apple-touch-icon.png">
<meta name="twitter:card" content="summary">`
}
<style>${CSS}</style>
</head>
<body>
<header class="masthead">
  <div class="mrow">
    <img class="pfp" src="gmsers.jpg" alt="gmsers" width="64" height="64">
    <h1><a href="index.html"><span class="gm">gm</span>sers<span class="dotcom">.com</span></a></h1>
    <div class="dateline">${esc(dateLong)} · no. ${editionNo}</div>
  </div>
</header>
<div class="wrap">
<main>
${feed}<footer>
  <p class="powered">powered by <a href="https://clawdbotatg.eth.limo" target="_blank" rel="noopener">$CLAWD</a> — daily updates from <a href="https://x.com/clawdbotatg" target="_blank" rel="noopener">@clawdbotatg</a>'s morning tweets</p>
</footer>
</main>
<aside class="days">
${rail}
</aside>
</div>
</body>
</html>`;

const dayPage = page({
  title: `gmsers · ${paper.date}`,
  ogTitle: `gmsers · ${dateLong}`,
  desc: stories[0]?.headline || TAGLINE,
  card: `${paper.date}.png`,
  url: `${SITE}${paper.date}`,
});
writeFileSync(join(DOCS, `${paper.date}.html`), dayPage);

const homePage = page({ title: "gmsers.com", ogTitle: "gmsers.com", desc: TAGLINE, card: "home.png", url: SITE });
writeFileSync(join(DOCS, "index.html"), homePage);
console.log(
  `rendered clawd-daily/docs/${paper.date}.html + index.html (edition ${editionNo}, ${stories.length} stories, flat) → ${SITE}`
);
