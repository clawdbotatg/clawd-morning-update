#!/bin/bash
# Weekly rollup. launchd (com.clawd.weekly-rollup) fires this Sunday 8:40am
# Denver, after the daily report has archived its brief. Merges the week's
# dated briefs → LLM narrative (incl. tweet angles) → static HTML → recon +
# Pages → tg-send Austin the link. Degrades, never blocks: no narrative still
# ships a rollup; a missing week of data exits quietly.
set -uo pipefail
export PATH="$HOME/.local/bin:/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:/usr/bin:/bin"

cd "$(dirname "$0")/.."
mkdir -p state docs
LOCK="state/.ran-weekly-$(date +%Y-%m-%d)"
[ -f "$LOCK" ] && exit 0
touch "$LOCK"
exec >> state/weekly.log 2>&1
echo "=== weekly run $(date) ==="

# 1. deterministic merge of the week's dated briefs
if ! node scripts/weekly.js; then
  echo "weekly.js failed (no briefs yet?) — nothing to roll up"
  exit 0
fi

# 2. LLM narrative + tweet angles (Read/Write only). Non-fatal.
rm -f state/weekly-narrative.json
if [ -n "${CLAUDE_P_AGENT_HOME:-}" ]; then
  cat prompts/weekly.md | python3 "$CLAUDE_P_AGENT_HOME/adapters/run.py" --cwd "$PWD" --max-turns 10 \
    --tool "Read" --tool "Write" || echo "narrative pass failed — rendering without it"
fi

# 3. render
if ! node scripts/render-weekly.js; then
  echo "render-weekly.js failed"
  exit 1
fi
# refresh index.html so its footer picks up the new weekly link
node scripts/render.js || true

# 4. recon drop
# ~/recon is the canonical home (macOS TCC blocks cron/agents from ~/Desktop);
# Austin keeps a Desktop symlink pointing here for human browsing.
RECON="$HOME/recon/twitter"
mkdir -p "$RECON"
cp state/weekly-digest.md "$RECON/weekly.md" 2>/dev/null || true

# 5. publish + tell Austin
THROUGH=$(node -e "console.log(JSON.parse(require('fs').readFileSync('state/weekly-brief.json','utf8')).through)")
git add docs
if ! git diff --cached --quiet; then
  git commit -m "weekly rollup through $THROUGH" --quiet && git push --quiet \
    && echo "published week-$THROUGH" \
    || echo "git push failed — rollup built locally but not published"
fi
node ../clawd-twitter/scripts/tg-send.js "weekly timeline rollup is up: https://clawdbotatg.github.io/clawd-morning-update/week-$THROUGH.html 🦞" \
  || echo "tg-send failed"

echo "=== weekly run done $(date) ==="
