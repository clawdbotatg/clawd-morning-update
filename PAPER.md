# The public paper — gmsers.com

Handoff notes for whoever works on this next (agent or human). The private
morning report (README.md) and the public paper share one pipeline; this file
covers the paper half end to end, including the hosting story, because the
hosting is the part you can't re-derive from the code.

## The two repos, and which one is "the site"

- **clawd-morning-update** (this repo) — the pipeline. All paper *code* lives
  here: `prompts/paper.md`, `scripts/render-paper.js`, `scripts/og-image.js`,
  the paper steps in `scripts/report.sh`. Its own `docs/` is the **private
  report**, not the paper — don't confuse them.
- **clawd-daily** (checked out *beside* this repo — `render-paper.js` resolves
  `../clawd-daily` and exits 1 if it's missing) — the published site. Only
  rendered output lives there, all under `docs/`: dated editions
  (`YYYY-MM-DD.html`), `index.html` (the newest edition's content, but with
  STATIC brand unfurl meta — og/home.png — because platforms cache unfurls
  per-URL and the root link is evergreen), `og/<date>.png` unfurl cards,
  banner images, `days.json`, favicon/pfp.
  Nothing in clawd-daily is hand-edited except emergencies; the renderer
  overwrites `index.html` + today's page on every run.

## Hosting (as of 2026-08-19)

- **gmsers.com is served by Vercel**, project under the **buidlguidldao**
  team, git-connected to `clawdbotatg/clawd-daily`. **Push to clawd-daily
  main = deploy.** Austin created the project and attached the domain by hand
  in the dashboard.
- `vercel.json` at clawd-daily's root is the whole config: no build step,
  `outputDirectory: docs`, **`cleanUrls: true`** — the day-rail links are
  extensionless (`/2026-08-19`), so cleanUrls is load-bearing, not cosmetic.
- The old GitHub Pages URL (`clawdbotatg.github.io/clawd-daily/`) still
  serves, but everything (og meta, telegram links) points at gmsers.com via
  the `SITE` constant at the top of `render-paper.js`. If the domain ever
  moves again, `SITE` is the one knob, plus the telegram line in `report.sh`.
- History lesson: the first Vercel import pointed at *this* repo
  (clawd-morning-update) and 404'd, because the site content is in
  clawd-daily. The site is the **output repo**, always.

## Daily flow (inside report.sh, 7:30am Denver)

report.sh runs BEFORE clawd-twitter's 8:02 gm run and owns the morning feed
pull (if today's `data/feed-*.json` is missing it pulls via clawd-twitter's
`read-feed.js`), so the paper is live when the gm tweet goes out.

Know this about the raw material: the timeline runs ~800 posts/hour, so a
1000-post pull reaches back only ~80 minutes — each pull is a snapshot, not
"the last 14 hours". Two snapshots feed each edition: the 7:30am pull plus
the previous evening's `scripts/evening-pull.sh` (launchd
com.clawd.evening-pull, 10pm, 500 posts — `EVENING_PAGES` is the budget
knob), which rank.js merges in automatically when `data/feed-eve-<D-1>.json`
exists. Budget: X bills ~$0.005/post against a $250/mo account spend limit;
the guard is `X_POSTS_MONTHLY_CAP` in clawd-twitter/.env (47000 ≈ $235 —
raise the X dashboard limit before raising it).

rank.js also collapses author bursts: tweets by one author within 15 minutes
are one thread — scored once (a 40-tweet thread once manufactured four fake
themes), and tagged `thread`/`thread_len` in brief.json so the paper pass
can enforce its at-most-two-stories-per-thread rule. Editions cap at 60
stories (5 full ad chunks + a clean final 10), never padded to get there.

1. Step 2b: LLM paper pass — `prompts/paper.md` reads `state/brief.json`,
   writes `state/paper.json` (date, ~8-word `tldr`, ranked `stories`). Failure
   is non-fatal: the paper just skips a day. Check `state/report.log` — LLM
   passes fail silently from the outside.
2. Step 3a: `og-image.js` renders the 1200×630 unfurl card
   (masthead + top-4 headlines) → `clawd-daily/docs/og/<date>.png`, via
   playwright-core + the machine's cached chromium headless shell. Non-fatal.
3. Banner refresh loop: curls each promo site's og image, `sips
   --resampleWidth 1200` doubles as the is-it-an-image gate, keeps the last
   good copy on any failure.
4. `render-paper.js` → `clawd-daily/docs/<date>.html` + `index.html`.
   It refuses to render if `paper.json`'s date ≠ `brief.json`'s (stale pass).
5. Step 5b: commit + push clawd-daily → Vercel deploys → link goes to Austin
   on Telegram (`https://gmsers.com/<date>`).

## Page anatomy (all in render-paper.js — one file, no client JS)

- **Flat ranked list**: one `<details>` per story, chunked into `<ol
  start=…>` groups of 10 so numbering runs straight through the cards.
  Collapsed = headline + top source + "read more"; open = dek, photo (photos
  only, never video thumbnails), source tweets. Voice and rules live in
  `prompts/paper.md` — lowercase, specific, no slop.
- **Promo cards** (`ADS` deck, `AD_EVERY = 10`): one card after every *full*
  chunk of 10 stories, **each card at most once per edition** (repeats read
  as spam — this was a bug once). Deck order = page order: onedollaraudit,
  larv.ai, ethskills.com, slop.computer, leftclaw.services. A >50-story
  edition runs bannerless after the deck is spent; a <10-story edition gets
  one card at the end. **Adding a banner = three places**: the `ADS` entry
  (href/img/alt/w/h), the refresh loop in `report.sh` (filename + og-image
  URL), and a one-time fetch of the image into `clawd-daily/docs/` so the
  first render doesn't 404.
- **Day rail** (`aside.days`): every edition as `wed, aug 19` + ~8-word tldr,
  sticky right column ≥900px, stacks below the footer on phones. Data is
  `clawd-daily/docs/days.json`, newest first — **the ledger lives in the
  output repo**, not in `state/`. The renderer upserts today's entry
  (fallbacks: `paper.tldr` → existing days.json entry → top headline) and
  preserves the rest, so *removing* a day means deleting its entry from
  days.json and re-rendering (done 2026-08-19 for the two pre-rail editions;
  their HTML files still exist on disk, just unlinked).
- **Unfurl meta**: `og:image` → `SITE + og/<date>.png`, `og:url`, twitter
  `summary_large_image`; falls back to a plain summary card if the og PNG for
  the date doesn't exist. Platforms cache unfurls — use X's card validator
  after meta changes.
- **Footer**: onedollaraudit is *not* here anymore (it's in the card
  rotation); just the credit line — powered by $CLAWD (→ clawdbotatg.eth.limo)
  — daily updates from @clawdbotatg (→ x.com/clawdbotatg)'s morning tweets —
  and an "rss" link to `/feed.xml`.
- **RSS** (`docs/feed.xml`): regenerated whole on every render from
  days.json — one item per edition (tldr = title/description, dated page =
  link/guid, pubDate 13:30 UTC), capped at 50, advertised via
  `<link rel="alternate">` in every page's head.

## Rendering by hand

```
node scripts/render-paper.js   # needs state/{brief,paper}.json + ../clawd-daily
```

Then commit + push clawd-daily to deploy. From a git worktree of this repo,
`../clawd-daily` won't resolve — symlink the real clawd-daily beside the
worktree (`.claude/worktrees/clawd-daily`) and copy/symlink `state/` in
(it's gitignored, so worktrees don't have it).

## Verifying visually

No probe script yet. The pattern that works: render, then screenshot
`file:///…/clawd-daily/docs/index.html` with playwright-core + the cached
chromium headless shell (`~/Library/Caches/ms-playwright/
chromium_headless_shell-*/chrome-headless-shell-mac-arm64/chrome-headless-shell`)
at 1380×900 and 390×844. Checks that matter: rail sticky right / stacked on
phone, a card sitting between story 10 and 11 with numbering continuing at
11, no repeated banner, and — after a deploy — `curl -s https://gmsers.com/ |
grep og:image` (live meta, not local files).
