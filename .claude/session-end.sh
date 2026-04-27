#!/usr/bin/env bash
# SessionEnd hook — runs at end of every Claude Code session in this repo.
# Writes a session summary file to /root/memory-vault/Conversations/ so it
# shows up in the dashboard's Conversations tab.
#
# Claude Code passes JSON via stdin with session metadata (session_id, reason).
# We capture that + repo state + a placeholder for human/AI summary.
set -u

VAULT_CONV=/root/memory-vault/Conversations
mkdir -p "$VAULT_CONV" 2>/dev/null

# Read JSON from stdin (Claude provides {"session_id":"...","reason":"...","cwd":"..."})
INPUT=""
if [ ! -t 0 ]; then
  INPUT=$(cat 2>/dev/null || echo "{}")
fi

if command -v jq >/dev/null 2>&1; then
  SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"' 2>/dev/null)
  REASON=$(echo "$INPUT" | jq -r '.reason // "ended"' 2>/dev/null)
  CWD=$(echo "$INPUT" | jq -r '.cwd // "/root/projects/outreach-dashboard"' 2>/dev/null)
else
  SESSION_ID="unknown"
  REASON="ended"
  CWD="/root/projects/outreach-dashboard"
fi

STAMP=$(date +%Y-%m-%d-%H%M)
SHORT_ID=${SESSION_ID:0:8}
FN="$VAULT_CONV/${STAMP}-${SHORT_ID}.md"

# Repo context
cd "$CWD" 2>/dev/null || cd /root/projects/outreach-dashboard 2>/dev/null
BRANCH=$(git branch --show-current 2>/dev/null || echo "?")
LAST_COMMIT=$(git log -1 --pretty=format:'%h %s — %cr' 2>/dev/null || echo "?")
DIRTY=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
COMMITS_THIS_SESSION=$(git log --since="2 hours ago" --pretty=format:'- `%h` %s' 2>/dev/null | head -10)

# Last AI activity from session JSONL (best-effort)
LAST_USER_MSG=""
TRANSCRIPT_FILE="/root/.claude/projects/-root/${SESSION_ID}.jsonl"
if [ -f "$TRANSCRIPT_FILE" ] && command -v jq >/dev/null 2>&1; then
  LAST_USER_MSG=$(jq -rs '
    map(select(.type == "user" and .message.role == "user"))
    | last
    | .message.content // ""
    | if type == "array" then map(if type == "object" then .text // "" else . end) | join(" ") else . end
    | .[0:200]
  ' "$TRANSCRIPT_FILE" 2>/dev/null)
fi

cat > "$FN" <<EOF
# Session $STAMP

- **Session ID:** \`$SESSION_ID\`
- **Ended:** $(date -Iseconds)
- **Reason:** $REASON
- **Branch:** \`$BRANCH\` ($DIRTY uncommitted file(s))
- **Last commit:** $LAST_COMMIT

## Last user prompt

> ${LAST_USER_MSG:-_(transcript not parseable — fill in manually)_}

## Commits during this session

${COMMITS_THIS_SESSION:-_(no commits)_}

## Summary

_AI: when you return for the next session, read this file and write a one-paragraph summary of what was accomplished. Or the human can edit this file directly via the Conversations tab._
EOF

exit 0
