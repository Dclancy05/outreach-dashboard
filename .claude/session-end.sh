#!/usr/bin/env bash
# SessionEnd hook — runs at end of every Claude Code session in this repo.
# Calls the JSONL transcript parser to write a clean, redacted markdown file
# to /root/memory-vault/Conversations/. The chokidar-watched syncer mirrors
# it to Supabase within ~1s so it appears in the dashboard's Conversations tab.
set -u

# Read JSON from stdin (Claude provides {"session_id":"...","reason":"...","cwd":"..."})
INPUT=""
if [ ! -t 0 ]; then
  INPUT=$(cat 2>/dev/null || echo "{}")
fi

SESSION_ID=""
if command -v jq >/dev/null 2>&1; then
  SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // ""' 2>/dev/null)
fi

# Fallback: pick the most recently modified JSONL if no session_id
if [ -z "$SESSION_ID" ] || [ "$SESSION_ID" = "null" ]; then
  LATEST_JSONL=$(ls -t /root/.claude/projects/-root/*.jsonl 2>/dev/null | head -1)
  if [ -n "$LATEST_JSONL" ]; then
    SESSION_ID=$(basename "$LATEST_JSONL" .jsonl)
  fi
fi

if [ -z "$SESSION_ID" ]; then
  echo "[session-end] no session id found — skipping" >&2
  exit 0
fi

JSONL="/root/.claude/projects/-root/${SESSION_ID}.jsonl"
if [ ! -f "$JSONL" ]; then
  echo "[session-end] no transcript at $JSONL — skipping" >&2
  exit 0
fi

# Run the parser. Output filename is deterministic (date + short_id) so reruns overwrite.
if /root/.bun/bin/bun run /root/services/parse-session.ts "$SESSION_ID" 2>&1; then
  echo "[session-end] wrote transcript for $SESSION_ID" >&2
else
  echo "[session-end] parser failed for $SESSION_ID" >&2
fi

exit 0
