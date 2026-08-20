#!/bin/bash
# Evening feed pull. launchd (com.clawd.evening-pull) fires this at 10:00pm
# Denver. Austin's home timeline runs ~800 posts/hour, so the morning 1000-post
# pull only reaches back ~80 minutes — the paper was a snapshot of 6:45-8am and
# the whole evening news cycle was invisible. This grabs a second,
# non-overlapping snapshot; rank.js merges feed-eve-<today>.json into the NEXT
# morning's brief automatically (and skips it if the file is missing, so a
# failed pull costs nothing but coverage).
#
# EVENING_PAGES is the budget knob: pages*100 posts at ~$0.005/post.
# 5 (=500 posts ≈ $2.50/night ≈ $77/mo) fits the X account's $250/mo spend
# limit beside the morning pull ($155/mo); bump to 10 only after raising the
# spend limit in the X dashboard (and X_POSTS_MONTHLY_CAP in
# clawd-twitter/.env to match).
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
fi
echo "=== evening pull done $(date) ==="
