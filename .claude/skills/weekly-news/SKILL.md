---
name: weekly-news
description: Austin's Wednesday-show prep — top 25 news from last Wednesday to now, published to gmsers.com/week/<show date>. Use when he says "weekly news", "show prep", or asks what happened this week.
---

# Weekly news (show prep)

Austin goes live Wednesday afternoon. Window: last Wednesday → today.

1. `node scripts/show.js` — merges the daily briefs + narratives into
   `state/show-brief.json` (prints the window).
2. Read `state/show-brief.json` and `prompts/show.md`. Write
   `state/show.json` yourself, following prompts/show.md exactly (you are the
   LLM pass — don't call `claude -p`, it isn't logged in from here).
   To list tweet ids per theme compactly:
   `python3 -c "import json;d=json.load(open('state/show-brief.json'));[print(x['date'],th['title'],[(t['id'],t['author']) for t in th['tweets']]) for x in d['days'] for th in x['themes']]"`
3. `bash scripts/show.sh --render` — renders and pushes clawd-daily; push =
   Vercel deploy (~1 min). Prints the URL.
4. Reply in chat: the link, then the 25 items as a numbered list, one short
   line each. Plain English, as few words as possible, no slop.

Re-running the same week overwrites that week's page.
