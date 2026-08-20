#!/usr/bin/env node
// Generate the twitter/og unfurl cards: 1200x630 dark frames screenshotted
// from throwaway HTML pages by headless chromium (playwright-core + the
// machine's playwright browser cache). Two cards:
//   og/<date>.png — the DAY card (logo, date, top headlines), what a dated
//     edition link unfurls as.
//   og/home.png — the static BRAND card (big title + clawd + tagline), what
//     the root https://gmsers.com/ link unfurls as. Deliberately carries NO
//     day content — the root link is evergreen and unfurl caches are
//     per-URL, so day content there would go stale. Re-rendered every run
//     (idempotent) so design tweaks here ship on the next morning build.
// render-paper.js points og:image / twitter:image at whichever exists.
// Non-fatal in report.sh: no card just means the unfurl degrades to a
// plain summary.
import { readFileSync, readdirSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright-core";
import { esc } from "../lib/html.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DOCS = join(ROOT, "..", "clawd-daily", "docs");
const paper = JSON.parse(readFileSync(join(ROOT, "state", "paper.json"), "utf8"));
const stories = paper.stories || [];

// playwright-core ships no browser — use the newest cached headless shell
const cache = join(process.env.HOME, "Library", "Caches", "ms-playwright");
const shell = readdirSync(cache)
  .filter((d) => /^chromium_headless_shell-\d+$/.test(d))
  .sort((a, b) => +a.split("-")[1] - +b.split("-")[1])
  .map((d) => join(cache, d, "chrome-headless-shell-mac-arm64", "chrome-headless-shell"))
  .filter(existsSync)
  .at(-1);
if (!shell) {
  console.error("no cached chromium headless shell — skipping og card");
  process.exit(1);
}

const logo = `data:image/jpeg;base64,${readFileSync(join(DOCS, "gmsers.jpg")).toString("base64")}`;
const dateLong = new Date(paper.date + "T12:00:00").toLocaleDateString("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});

const rows = stories
  .slice(0, 4)
  .map(
    (s, i) => `<li class="${i === 0 ? "first" : ""}"><span class="n">${i + 1}.</span><span class="t">${esc(s.headline)}</span></li>`
  )
  .join("\n");

const dayHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing:border-box; margin:0; }
  body { width:1200px; height:630px; background:#000; color:#f4f4f2; overflow:hidden;
         font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
         padding:52px 64px; display:flex; flex-direction:column; }
  header { display:flex; align-items:flex-end; gap:24px; padding-bottom:26px; border-bottom:4px solid #f4f4f2; }
  header h1 { line-height:1; }
  header .date { padding-bottom:6px; }
  header img { width:96px; height:96px; border-radius:18px; }
  header h1 { font-size:64px; font-weight:800; letter-spacing:-.02em; }
  header .gm { color:#ff4b33; }
  header .dotcom { color:#9a9ea6; }
  header .date { margin-left:auto; color:#9a9ea6; font-size:24px; text-align:right; }
  ol { list-style:none; margin-top:30px; display:flex; flex-direction:column; gap:22px; }
  li { display:flex; gap:16px; font-size:33px; font-weight:600; line-height:1.25; letter-spacing:-.01em; }
  li .n { color:#ff4b33; flex:none; }
  li .t { display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
  li.first { font-size:40px; }
</style></head><body>
<header>
  <img src="${logo}">
  <h1><span class="gm">gm</span>sers<span class="dotcom">.com</span></h1>
  <div class="date">${esc(dateLong)}</div>
</header>
<ol>
${rows}
</ol>
</body></html>`;

// the brand card: what the root gmsers.com link unfurls as — big title,
// clawd, tagline. No date, no headlines, ever (see header comment).
const homeHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing:border-box; margin:0; }
  body { width:1200px; height:630px; background:#000; color:#f4f4f2; overflow:hidden;
         font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
         display:flex; flex-direction:column; align-items:center; justify-content:center; gap:36px; }
  img { width:224px; height:224px; border-radius:44px; }
  h1 { font-size:132px; font-weight:800; letter-spacing:-.03em; line-height:1; }
  h1 .gm { color:#ff4b33; }
  h1 .dotcom { color:#9a9ea6; }
  p { color:#9a9ea6; font-size:33px; letter-spacing:-.01em; }
</style></head><body>
<img src="${logo}">
<h1><span class="gm">gm</span>sers<span class="dotcom">.com</span></h1>
<p>gm, sers — the daily brief at the intersection of crypto and ai</p>
</body></html>`;

mkdirSync(join(DOCS, "og"), { recursive: true });
const browser = await chromium.launch({ executablePath: shell });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
for (const [html, name] of [
  [dayHtml, `${paper.date}.png`],
  [homeHtml, "home.png"],
]) {
  await page.setContent(html, { waitUntil: "load" });
  await page.screenshot({ path: join(DOCS, "og", name) });
  console.log(`og card → clawd-daily/docs/og/${name}`);
}
await browser.close();
