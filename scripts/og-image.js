#!/usr/bin/env node
// Generate the day's twitter/og unfurl card: a 1200x630 dark frame — logo,
// gmsers.com, date, the top headlines — screenshotted from a throwaway HTML
// page by headless chromium (playwright-core + the machine's playwright
// browser cache). Writes ../clawd-daily/docs/og/<date>.png, which
// render-paper.js points og:image / twitter:image at when it exists.
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

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
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

const browser = await chromium.launch({ executablePath: shell });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html, { waitUntil: "load" });
mkdirSync(join(DOCS, "og"), { recursive: true });
await page.screenshot({ path: join(DOCS, "og", `${paper.date}.png`) });
await browser.close();
console.log(`og card → clawd-daily/docs/og/${paper.date}.png`);
