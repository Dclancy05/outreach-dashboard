#!/bin/bash
# Hits the dashboard's /api/cron/workflow-tick once. Designed to be run by
# systemd timer every minute. Logs the response body to journal so failed
# ticks are visible via `journalctl -u workflow-tick`.
#
# Auth: WORKFLOW_TICK_VPS_TOKEN — read from /etc/workflow-tick.env (which has
# `WORKFLOW_TICK_VPS_TOKEN=...` and optionally `DASHBOARD_URL=...`).

set -euo pipefail

ENV_FILE="${WORKFLOW_TICK_ENV:-/etc/workflow-tick.env}"
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

DASHBOARD_URL="${DASHBOARD_URL:-https://outreach-github.vercel.app}"
TOKEN="${WORKFLOW_TICK_VPS_TOKEN:-}"

if [[ -z "$TOKEN" ]]; then
  echo "[workflow-tick] WORKFLOW_TICK_VPS_TOKEN not set in $ENV_FILE" >&2
  exit 64
fi

# 25s timeout — we expect milliseconds; anything more means the dashboard is
# struggling and a fresh tick a minute later is safer than a hung curl.
RESPONSE=$(curl -sS --max-time 25 \
  -H "Authorization: Bearer $TOKEN" \
  -X POST \
  "$DASHBOARD_URL/api/cron/workflow-tick" \
  -w "\n[http_code:%{http_code}]")

echo "[workflow-tick] $RESPONSE"

# Non-zero exit if the HTTP status wasn't 2xx, so systemd marks the unit
# failed (visible in `systemctl list-timers --failed`).
if [[ "$RESPONSE" != *"[http_code:2"* ]]; then
  exit 1
fi
