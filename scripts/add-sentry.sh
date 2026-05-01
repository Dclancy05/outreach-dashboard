#!/usr/bin/env bash
# Tiny helper to add the Sentry MCP without copy-paste line-break pain.
# Usage: bash scripts/add-sentry.sh <SENTRY_AUTH_TOKEN>
set -euo pipefail

TOKEN="${1:-}"
if [[ -z "$TOKEN" ]]; then
  echo "Usage: bash scripts/add-sentry.sh sntryu_xxx_token_here"
  exit 1
fi

VPS_HOST="${VPS_HOST:-root@srv1197943.hstgr.cloud}"

# Mac
claude mcp remove sentry --scope user >/dev/null 2>&1 || true
claude mcp add sentry --scope user -e "SENTRY_AUTH_TOKEN=$TOKEN" -- npx -y @sentry/mcp-server
echo ""

# VPS (best-effort)
if ssh -o ConnectTimeout=5 -o BatchMode=yes "$VPS_HOST" "echo ok" >/dev/null 2>&1; then
  ssh "$VPS_HOST" "claude mcp remove sentry --scope user >/dev/null 2>&1 || true"
  ssh "$VPS_HOST" "claude mcp add sentry --scope user -e SENTRY_AUTH_TOKEN=$TOKEN -- npx -y @sentry/mcp-server"
  echo "  ✓ VPS: sentry added"
else
  echo "  ⚠ Skipping VPS sentry add (SSH not reachable)"
fi

echo ""
echo "=== Mac claude mcp list ==="
claude mcp list | grep -i sentry || echo "(sentry not listed yet — may need fresh shell)"
