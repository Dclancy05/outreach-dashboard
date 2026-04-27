#!/usr/bin/env bash
#
# sync-vault.sh — keeps ~/.claude/agents/ mirrored from the memory-vault's
# Jarvis/agent-skills/. Runs as a systemd timer (or inotify-driven) on the
# AI VPS so any edit in the dashboard FileEditor lands in the Claude Code
# subagent path within seconds.
#
# Two modes:
#   bash sync-vault.sh once    — single one-shot rsync (for cron / CI)
#   bash sync-vault.sh watch   — inotifywait loop (for systemd .service)
#
# Requires: rsync. For 'watch' mode: inotify-tools (apt-get install inotify-tools).

set -euo pipefail

VAULT_DIR="${VAULT_DIR:-/root/memory-vault/Jarvis/agent-skills}"
AGENTS_DIR="${AGENTS_DIR:-/root/.claude/agents}"

mkdir -p "$AGENTS_DIR"

sync_once() {
  if [ ! -d "$VAULT_DIR" ]; then
    echo "[sync-vault] vault dir missing: $VAULT_DIR" >&2
    return 1
  fi
  rsync -a --delete --include="*.md" --exclude="*" "$VAULT_DIR/" "$AGENTS_DIR/"
  echo "[sync-vault] synced $(ls "$AGENTS_DIR"/*.md 2>/dev/null | wc -l) agent file(s)"
}

case "${1:-once}" in
  once)
    sync_once
    ;;
  watch)
    sync_once
    if ! command -v inotifywait >/dev/null; then
      echo "[sync-vault] inotifywait not installed — falling back to 30s polling"
      while true; do sleep 30; sync_once; done
    else
      inotifywait -m -e modify,create,delete,move "$VAULT_DIR" |
      while read -r _; do
        # debounce: drain bursts
        sleep 0.5
        sync_once
      done
    fi
    ;;
  *)
    echo "Usage: $0 [once|watch]" >&2
    exit 1
    ;;
esac
