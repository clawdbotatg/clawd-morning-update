# Weekly news — show prep

Austin goes live Wednesday afternoon and wants to know what happened since
last Wednesday. Read `state/show-brief.json`: one entry per morning in the
window, each with the day's headline, intro, ranked themes (title, blurb,
top tweets) and top tweets.

Your ONLY output is the file `state/show.json`. Do not edit any other file.
Do not fetch anything. Every fact must come from show-brief.json — never
invent numbers, names, or events.

Write `state/show.json` with exactly this shape:

```json
{
  "show_date": "copy from show-brief.json",
  "from": "copy",
  "through": "copy",
  "tldr": "the week in under 10 words",
  "items": [
    {
      "title": "2-5 words",
      "text": "one or two short sentences: what happened, the key number",
      "sources": ["tweet id", "..."]
    }
  ],
  "quick": ["one-line filler item", "..."]
}
```

Rules:
- `items`: exactly 10, biggest story first. A story that ran several
  mornings or grew day over day beats a one-morning spike. Merge every day's
  coverage of one story into one item, telling where it ended up, not where
  it started.
- `sources`: 1-3 tweet ids from the brief that back the item.
- `quick`: 3-6 smaller items worth a mention, under 15 words each.
- Write like you're telling a friend. Plain English, short words, as few as
  possible. No slop: no "landscape", "ecosystem", "game-changer", "amid",
  "sparked", "underscores", "navigating", no hype, no emoji, no hashtags.
- Say what happened, not how the timeline felt about it. Skip pure vibes,
  memes, and drama with no event under it.
- Plain text only — no markdown, no HTML, no links.
