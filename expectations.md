# Expectations (Austin, 2026-10-29)

The X feed died three times (09-23, 10-16, 10-27..29). Each time I said it
was fixed. These are the rules from now on.

## 1. Austin never logs into X to buy credits again

**Why it should hold:** X auto-recharge is on. It charges $100 whenever
the balance falls below $20.

**Checked:** it never worked before because the settings form has a "yes,
charge me" checkbox that was never ticked, so the setting never saved.
On 10-29 I set it, then tested it with a $10 charge set to fire at $93.
The balance crossed $93 and X charged $10 within a minute ($93.29 → $102.57).
After that I set it back to $100 under $20 and reloaded the page. It stuck.

**What could still break it:** the card gets declined, X changes or
switches off the feature, or X's $700 monthly spend cap is hit (we spend
about $150 a month, so this is far off).

## 2. The paper never goes dark for lack of credits

**Why:** auto-recharge refills long before $0. If it ever fails, the
morning pull shrinks to 200 posts once credits drop below $15, so the paper
keeps running on a thin feed for days.

**Checked:** the $15 shrink is in `clawd-twitter/lib/feed.js`. The estimate
it relies on matched X's bill: $77.70 billed for 13,018 posts we recorded
(10-18..26).

## 3. Spending stays low

**Why:** the morning pull is 500 posts (was 1000), and the 10pm pull is 300
(was 500). That's about $5 a day, or ~$150 a month, down from ~$285.

**Checked:** X bills about $0.005–0.006 per post. Nothing else we run
uses a meaningful share of credits.

## 4. Austin only hears about it when something breaks

**Why:** every morning, before the pull, `report.sh` runs
`node scripts/x-credits.js sync`. It reads the real balance and the
auto-recharge setting from the X console (clawd's Chrome, signed in as
Austin). Telegram alerts go out only when:
- auto-recharge is off or has no threshold, or
- the balance is more than $5 under the trigger, meaning the recharge
  didn't fire.

**Checked:** sync ran on the live page and read $102.57 with $100 under $20.
I gave the parser a copy of the old broken page, and it correctly saw the
recharge as off. If the sync itself fails (Chrome closed, signed out),
the pull falls back to the local estimate. The estimate has the same
alerts, so a failed sync isn't silent.

## 5. Nothing gets called "fixed" until it's proven

A warning is not a fix. A setting isn't fixed until I've seen it work.
If I can't prove it, I say so.

## 6. Answers are short, plain English, no slop
