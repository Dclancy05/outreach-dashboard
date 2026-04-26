#!/usr/bin/env bash
# Runs at the start of every Claude Code session in this project.
# Outputs a brief context dump that gets shown to the AI.
set -u
cd /root/projects/outreach-dashboard 2>/dev/null || exit 0

# 1. Fetch latest from origin (no merge — non-destructive)
git fetch origin --quiet 2>/dev/null

BRANCH=$(git branch --show-current 2>/dev/null || echo "?")
AHEAD=$(git rev-list --count "@{u}..HEAD" 2>/dev/null || echo "0")
BEHIND=$(git rev-list --count "HEAD..@{u}" 2>/dev/null || echo "0")
DIRTY=$(git status --porcelain | wc -l | tr -d ' ')

echo "## Session start context"
echo
echo "**Repo state:** branch \`$BRANCH\` — ahead $AHEAD, behind $BEHIND, $DIRTY uncommitted file(s)"
echo

# 2. Last 3 commits for orientation
echo "**Recent commits:**"
git log --pretty=format:'- \`%h\` %s _(%cr)_' -3 2>/dev/null
echo
echo

# 3. Latest session log (so I can pick up where the last session left off)
LATEST_SESSION=$(ls -t memory-hq/sessions/*.md 2>/dev/null | head -1)
if [ -n "$LATEST_SESSION" ]; then
  echo "**Last session log:** \`$LATEST_SESSION\`"
  echo "_(read it for prior context)_"
  echo
fi

# 4. Memory HQ changes since last commit
HQ_DIRTY=$(git status --porcelain memory-hq/ 2>/dev/null | wc -l | tr -d ' ')
if [ "$HQ_DIRTY" -gt 0 ]; then
  echo "**⚠️ Memory HQ has $HQ_DIRTY uncommitted change(s)** — consider committing before this session ends."
  echo
fi

# 5. Quick service health (silent if all good)
DOCKER_DOWN=0
for c in falkordb langfuse-langfuse-web-1; do
  if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${c}$"; then
    DOCKER_DOWN=$((DOCKER_DOWN+1))
  fi
done
if [ "$DOCKER_DOWN" -gt 0 ]; then
  echo "**⚠️ $DOCKER_DOWN AI VPS service(s) are down.** Run \`claude-status\` for details."
  echo
fi

exit 0
