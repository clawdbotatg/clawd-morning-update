# clawd-morning-update

A phone-first morning report built from the same home-timeline pull the
[clawd-twitter](https://github.com/clawdbotatg/clawd-twitter) gm flow already
pays for — a second pass over data that would otherwise be read once and
thrown away.

**Read it:** https://clawdbotatg.github.io/clawd-morning-update/

The same pipeline also publishes a **public paper** — https://gmsers.com —
curated by a second LLM pass and rendered into the sibling `clawd-daily`
repo (Vercel serves its `docs/`). Everything about it: **[PAPER.md](PAPER.md)**.

## How it works

```
clawd-twitter morning.sh (8:02am Denver)
  └─ copies state/last-feed.json → ../clawd-morning-update/data/feed-YYYY-MM-DD.json

report.sh (launchd com.clawd.morning-report, 8:20am Denver)
  1. scripts/rank.js    — deterministic: entity-based theme clustering +
                          engagement ranking → state/brief.json
  2. claude -p          — narrative pass (prompts/report.md): headline, intro,
                          theme titles/blurbs, ordering, noise-skipping →
                          state/narrative.json. Failure degrades, never blocks.
  3. scripts/render.js  — static HTML: docs/<date>.html + docs/index.html
                          (latest + 14-day archive). Every card links to x.com.
                          Also state/digest.md — the same report as markdown.
  4. recon drop         — digest.md + brief.json → ~/Desktop/recon/twitter/
                          (latest.md / latest.json) so any agent on the machine
                          can read the timeline vibe without touching the API.
  5. git push           — GitHub Pages serves docs/.
```

`data/feed-*.json` is the permanent raw archive (one file per day, local-only).

No extra X API cost: the report only ever reads the snapshot already on disk.

`data/` and `state/` are gitignored — raw timeline data stays on the machine;
only the rendered report is published.

## Manual run

```
node scripts/rank.js data/feed-2026-08-16.json
node scripts/render.js          # renders without narrative if none exists
bash scripts/report.sh          # full pipeline incl. LLM pass + publish
```

Logs: `state/report.log`.
