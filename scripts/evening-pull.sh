#!/bin/bash
# Evening feed pull. launchd (com.clawd.evening-pull) fires this at 10:00pm
# Denver. Austin's home timeline runs ~800 posts/hour, so the morning 1000-post
# pull only reaches back ~80 minutes — the paper was a snapshot of 6:45-8am and
# the whole evening news cycle was invisible. This grabs a second,
# non-overlapping snapshot; rank.js merges feed-eve-<today>.json into the NEXT
# morning's brief automatically (and skips it if the file is missing, so a
# failed pull costs nothing but coverage). After the pull, an LLM pass writes
# a short digest of what landed and sends it to Austin on Telegram (see below).
#
# EVENING_PAGES is the budget knob: pages*100 posts at ~$0.005/post.
# 5 (=500 posts ≈ $2.50/night ≈ $77/mo) + the 1000-post morning pull ≈ 46.5k
# posts a 31-day month against X_POSTS_MONTHLY_CAP (60000 since 2026-09-23,
# clawd-twitter/.env; it was 47000 = the cadence with 1% slack, and ran dry). lib/feed.js paces pulls to what's left / days left, so
# when the month runs hot THIS pull is the one that gets trimmed first (it's
# the day's last) and Austin is told. Bump to 10 only after raising the spend
# limit in the X dashboard AND the cap.
set -uo pipefail
export PATH="$HOME/.local/bin:/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:/usr/bin:/bin"
EVENING_PAGES="${EVENING_PAGES:-5}"

cd "$(dirname "$0")/.."
mkdir -p state data
LOCK="state/.ran-evening-$(date +%Y-%m-%d)"
[ -f "$LOCK" ] && exit 0
touch "$LOCK"
exec >> state/report.log 2>&1
echo "=== evening pull $(date) ==="

EVE_FEED="data/feed-eve-$(date +%F).json"
if (cd ../clawd-twitter && node scripts/read-feed.js 6 "$EVENING_PAGES" --json > /dev/null); then
  cp ../clawd-twitter/state/last-feed.json "$EVE_FEED"
  echo "evening feed archived: $EVE_FEED"
else
  echo "evening pull failed — tomorrow's paper runs on the morning pull alone"
  echo "=== evening pull done $(date) ==="
  exit 0
fi

# Evening digest → Austin's Telegram (asked for 2026-09-15: "hmu with an
# evening digest just for me so I can read what is in it and understand what
# is being used for tomorrow's show"). This is the ONE scheduled message this
# chain sends him; the morning chain stays silent on success. Never fatal:
# the pull above is already archived, a digest failure only costs the note.
# Same LLM sandbox as report.sh (Read/Write only, no network, no posting);
# if the LLM pass fails, the deterministic top-5 from evening-digest.js is
# sent instead so the note always arrives.
rm -f state/evening-digest.txt
FALLBACK=$(node scripts/evening-digest.js "$EVE_FEED" 2>&1) || FALLBACK=""
if [ -n "${CLAUDE_P_AGENT_HOME:-}" ] && [ -f state/evening-feed.txt ]; then
  cat prompts/evening.md | python3 "$CLAUDE_P_AGENT_HOME/adapters/run.py" --cwd "$PWD" --max-turns 12 \
    --timeout 600 --tool "Read" --tool "Write" > /dev/null || echo "evening digest pass failed — sending the plain top-5"
fi
if [ -s state/evening-digest.txt ]; then
  MSG=$(cat state/evening-digest.txt)
else
  MSG="🌙 evening pull (digest pass failed — raw top 5)
$FALLBACK"
fi
(cd ../clawd-twitter && printf '%s' "$MSG" | node scripts/tg-send.js -) || echo "telegram send failed"
echo "=== evening pull done $(date) ==="
