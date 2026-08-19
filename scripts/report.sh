#!/bin/bash
# Morning report build. launchd (com.clawd.morning-report) fires this at 8:20am
# Denver, after clawd-twitter's 8:02 morning.sh has copied the raw feed into
# data/feed-YYYY-MM-DD.json. Deterministic rank → LLM narrative → static HTML →
# push to GitHub Pages. A missing feed or a failed LLM pass degrades, never
# blocks: the report ships without narrative rather than not at all.
set -uo pipefail
export PATH="$HOME/.local/bin:/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:/usr/bin:/bin"

cd "$(dirname "$0")/.."
mkdir -p state data docs
LOCK="state/.ran-report-$(date +%Y-%m-%d-%H)"
[ -f "$LOCK" ] && exit 0
touch "$LOCK"
exec >> state/report.log 2>&1
echo "=== report run $(date) ==="

TODAY_FEED="data/feed-$(date +%F).json"
if [ ! -f "$TODAY_FEED" ]; then
  echo "no feed for today ($TODAY_FEED) — morning pull failed or hasn't run; skipping"
  exit 0
fi

# 1. deterministic: cluster + rank
rm -f state/narrative.json
if ! node scripts/rank.js "$TODAY_FEED"; then
  echo "rank.js failed"
  exit 1
fi

# 2. LLM narrative pass (Read/Write only — no network, no posting tools).
# Failure is non-fatal: render.js degrades to raw theme terms.
if [ -n "${CLAUDE_P_AGENT_HOME:-}" ]; then
  cat prompts/report.md | python3 "$CLAUDE_P_AGENT_HOME/adapters/run.py" --cwd "$PWD" --max-turns 30 \
    --tool "Read" --tool "Write" || echo "narrative pass failed — rendering without it"
fi

# 2b. LLM public-paper pass (The Morning Claw — clawd-daily). Same sandbox.
# Failure is non-fatal: the private report still ships, the paper skips a day.
rm -f state/paper.json
if [ -n "${CLAUDE_P_AGENT_HOME:-}" ] && [ -d ../clawd-daily ]; then
  cat prompts/paper.md | python3 "$CLAUDE_P_AGENT_HOME/adapters/run.py" --cwd "$PWD" --max-turns 30 \
    --tool "Read" --tool "Write" || echo "paper pass failed — no edition today"
fi

# 3. render static HTML
if ! node scripts/render.js; then
  echo "render.js failed"
  exit 1
fi

# 3a. render the public paper (needs state/paper.json from 2b; skips if absent).
# The unfurl card renders first so render-paper can point og:image at it;
# card failure is non-fatal — the unfurl just degrades to a plain summary.
PAPER=0
if [ -f state/paper.json ]; then
  node scripts/og-image.js || echo "og card failed — unfurl degrades"
  if node scripts/render-paper.js; then
    PAPER=1
  fi
fi

# 3b. persist dated brief + narrative — the weekly rollup reads these
DATE=$(date +%F)
mkdir -p state/briefs state/narratives
cp state/brief.json "state/briefs/$DATE.json" 2>/dev/null || true
cp state/narrative.json "state/narratives/$DATE.json" 2>/dev/null || true

# 4. recon drop — agent-readable vibe digest on the shared desk. Never fatal.
# ~/recon is the canonical home (macOS TCC blocks cron/agents from ~/Desktop);
# Austin keeps a Desktop symlink pointing here for human browsing.
RECON="$HOME/recon/twitter"
mkdir -p "$RECON"
cp state/digest.md "$RECON/latest.md" 2>/dev/null || true
cp state/brief.json "$RECON/latest.json" 2>/dev/null || true

# 5. publish: commit docs/ and push (GitHub Pages serves docs/ on master)
PUBLISHED=0
git add docs
if git diff --cached --quiet; then
  echo "nothing new to publish"
else
  if git commit -m "report $(date +%F)" --quiet && git push --quiet; then
    echo "published $(date +%F)"
    PUBLISHED=1
  else
    echo "git push failed — report built locally but not published"
  fi
fi

# 5b. publish the paper (its own repo — GitHub Pages serves clawd-daily/docs)
PAPER_LIVE=0
if [ "$PAPER" = 1 ]; then
  (cd ../clawd-daily && git add docs && { git diff --cached --quiet || git commit -m "edition $(date +%F)" --quiet; } && git push --quiet) \
    && PAPER_LIVE=1 && echo "paper published $(date +%F)" \
    || echo "paper push failed — edition built locally but not published"
fi

# 6. link Austin to it on Telegram (only when a fresh page actually shipped;
# a failed push would send a link to yesterday's page). Never fatal.
if [ "$PUBLISHED" = 1 ]; then
  MSG="morning update: https://clawdbotatg.github.io/clawd-morning-update/$(date +%F).html"
  [ "$PAPER_LIVE" = 1 ] && MSG="$MSG
today's paper: https://clawdbotatg.github.io/clawd-daily/$(date +%F).html"
  node ../clawd-twitter/scripts/tg-send.js "$MSG 🦞" \
    || echo "tg-send failed — report published, link not sent"
fi

echo "=== report run done $(date) ==="
