#!/usr/bin/env bash
#
# deploy.sh — one-shot installer for the agent-runner on the AI VPS.
#
# Run this on the AI VPS (where this repo lives at /root/projects/outreach-dashboard).
# It:
#   1. Copies vps-deliverables/agent-runner/ to /root/agent-runner
#   2. Installs deps (npm install)
#   3. Generates an AGENT_RUNNER_TOKEN (or reuses if /etc/agent-runner.env exists)
#   4. Writes /etc/agent-runner.env (mode 0600)
#   5. Installs + enables + starts the systemd unit
#   6. Installs the vault-sync systemd unit so .md edits in the dashboard land in ~/.claude/agents/
#   7. Smoke-tests with /healthz
#
# Then prints the AGENT_RUNNER_URL + TOKEN you need to paste into Vercel env.
#
# Requires: ANTHROPIC_API_KEY (the runner makes direct Anthropic API calls,
#           because Claude Code's OAuth + non-interactive permission flags
#           clash with security policies).
#
# Usage:
#   ANTHROPIC_API_KEY=sk-ant-... bash deploy.sh

set -euo pipefail

REPO_DIR="${REPO_DIR:-/root/projects/outreach-dashboard}"
RUNNER_DIR="/root/agent-runner"
ENV_FILE="/etc/agent-runner.env"

if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  echo "ERROR: ANTHROPIC_API_KEY env var required."
  echo "  Get one at https://console.anthropic.com/settings/keys"
  echo "  Then re-run: ANTHROPIC_API_KEY=sk-ant-... bash $0"
  exit 1
fi

echo "[1/7] Copying agent-runner to $RUNNER_DIR…"
mkdir -p "$RUNNER_DIR"
cp -r "$REPO_DIR/vps-deliverables/agent-runner/." "$RUNNER_DIR/"

echo "[2/7] Installing deps…"
( cd "$RUNNER_DIR" && npm install --silent 2>&1 | tail -3 )

echo "[3/7] Token…"
if [ -f "$ENV_FILE" ] && grep -q '^AGENT_RUNNER_TOKEN=' "$ENV_FILE"; then
  TOKEN=$(grep '^AGENT_RUNNER_TOKEN=' "$ENV_FILE" | cut -d= -f2-)
  echo "  reused existing token from $ENV_FILE"
else
  TOKEN=$(openssl rand -hex 32)
  echo "  generated new token"
fi

echo "[4/7] Writing $ENV_FILE (mode 0600)…"
cat > "$ENV_FILE" <<EOF
NODE_ENV=production
PORT=10001
HOST=127.0.0.1
AGENT_RUNNER_TOKEN=$TOKEN
ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY
AGENTS_DIR=/root/.claude/agents
EOF
chmod 600 "$ENV_FILE"

echo "[5/7] Installing systemd unit for agent-runner…"
cp "$RUNNER_DIR/agent-runner.service" /etc/systemd/system/agent-runner.service
systemctl daemon-reload
systemctl enable agent-runner >/dev/null 2>&1 || true
systemctl restart agent-runner

echo "[6/7] Installing vault-sync systemd unit (keeps ~/.claude/agents in sync with the dashboard)…"
cat > /etc/systemd/system/agent-vault-sync.service <<'EOF'
[Unit]
Description=Mirror Jarvis/agent-skills/ → ~/.claude/agents/
After=network.target

[Service]
Type=simple
WorkingDirectory=/root/agent-runner
ExecStart=/bin/bash /root/agent-runner/sync-vault.sh watch
Restart=on-failure
RestartSec=10
Environment=VAULT_DIR=/root/memory-vault/Jarvis/agent-skills
Environment=AGENTS_DIR=/root/.claude/agents
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable agent-vault-sync >/dev/null 2>&1 || true
systemctl restart agent-vault-sync

echo "[7/7] Smoke-test…"
sleep 2
if curl -sS -m 3 http://127.0.0.1:10001/healthz | grep -q '"ok":true'; then
  echo "  ✓ agent-runner healthy"
else
  echo "  ✗ agent-runner not responding — check: journalctl -u agent-runner -n 50 --no-pager"
  exit 1
fi

# Default external URL via Tailscale (matches how MEMORY_VAULT_API_URL is exposed)
TS_HOST=$(tailscale status --json 2>/dev/null | grep -oE '"DNSName":"[^"]+"' | head -1 | cut -d'"' -f4 | sed 's/\.$//')
EXT_URL="http://${TS_HOST:-srv1197943}.taild42583.ts.net:10001"

echo
echo "─────────────────────────────────────────────────────────────────"
echo "  ✅ DONE. Add these to Vercel env (Production + Preview):"
echo "─────────────────────────────────────────────────────────────────"
echo "  AGENT_RUNNER_URL=$EXT_URL"
echo "  AGENT_RUNNER_TOKEN=$TOKEN"
echo "  WORKFLOW_DAILY_BUDGET_USD=25"
echo
echo "  Quick command:"
echo "    cd $REPO_DIR"
echo "    vercel env add AGENT_RUNNER_URL production"
echo "    vercel env add AGENT_RUNNER_TOKEN production"
echo "    vercel env add WORKFLOW_DAILY_BUDGET_USD production"
echo "─────────────────────────────────────────────────────────────────"
echo
echo "  Tail logs anytime:  journalctl -fu agent-runner"
echo "  Vault watcher:      journalctl -fu agent-vault-sync"
