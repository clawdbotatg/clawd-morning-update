#!/bin/bash
# Weekly news for Austin's Wednesday show: last Wednesday → today, top 10,
# published to gmsers.com/week/<show date>. Run by hand (the `weekly-news`
# skill) — Tuesday afternoon or Wednesday before the show.
#   bash scripts/show.sh            # full: merge → LLM pass → render → push
#   bash scripts/show.sh --render   # state/show.json already written: render → push
set -uo pipefail
export PATH="$HOME/.local/bin:/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:/usr/bin:/bin"
CLAUDE_P_AGENT_HOME="${CLAUDE_P_AGENT_HOME:-$HOME/clawd-harness/projects/claude-p-agent}"

cd "$(dirname "$0")/.."

if [ "${1:-}" != "--render" ]; then
  node scripts/show.js || exit 1
  rm -f state/show.json
  cat prompts/show.md | python3 "$CLAUDE_P_AGENT_HOME/adapters/run.py" --cwd "$PWD" --max-turns 20 \
    --tool "Read" --tool "Write" >> state/show.log 2>&1 || echo "LLM pass failed (see state/show.log)"
  [ -f state/show.json ] || { echo "no state/show.json — write it per prompts/show.md, then: bash scripts/show.sh --render"; exit 2; }
fi

node scripts/render-show.js || exit 1
SHOW=$(node -e "console.log(JSON.parse(require('fs').readFileSync('state/show.json','utf8')).show_date)")

cd ../clawd-daily
git add docs/week
if ! git diff --cached --quiet; then
  git commit -m "week $SHOW" --quiet && git pull --rebase --quiet && git push --quiet \
    && echo "published https://gmsers.com/week/$SHOW" \
    || echo "git push failed — page built locally in clawd-daily/docs/week/"
else
  echo "unchanged — https://gmsers.com/week/$SHOW"
fi
