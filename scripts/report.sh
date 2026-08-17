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
  cat prompts/report.md | python3 "$CLAUDE_P_AGENT_HOME/adapters/run.py" --cwd "$PWD" --max-turns 10 \
    --tool "Read" --tool "Write" || echo "narrative pass failed — rendering without it"
fi

# 3. render static HTML
if ! node scripts/render.js; then
  echo "render.js failed"
  exit 1
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
git add docs
if git diff --cached --quiet; then
  echo "nothing new to publish"
else
  git commit -m "report $(date +%F)" --quiet && git push --quiet \
    && echo "published $(date +%F)" \
    || echo "git push failed — report built locally but not published"
fi

echo "=== report run done $(date) ==="
