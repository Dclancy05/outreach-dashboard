#!/usr/bin/env bash
# Periodic safety-net: re-parse the most recently active session JSONL
# every few minutes so we never lose more than ~5 minutes of conversation
# even if SessionEnd doesn't fire (e.g. user kills the terminal abruptly).
set -u

# Pick the JSONL that was modified within the last hour (skip ancient ones).
LATEST=$(find /root/.claude/projects/-root -maxdepth 1 -name "*.jsonl" -mmin -60 -printf '%T@ %p\n' 2>/dev/null \
  | sort -rn | head -1 | cut -d' ' -f2-)

if [ -z "$LATEST" ]; then
  exit 0  # no active session
fi

SESSION_ID=$(basename "$LATEST" .jsonl)
/root/.bun/bin/bun run /root/services/parse-session.ts "$SESSION_ID" >> /var/log/session-checkpoint.log 2>&1 || true
