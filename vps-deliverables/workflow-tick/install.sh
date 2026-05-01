#!/bin/bash
# Install + enable the workflow-tick systemd timer on a fresh VPS.
#
# Usage:
#   sudo WORKFLOW_TICK_VPS_TOKEN=<token-from-api_keys-table> \
#        DASHBOARD_URL=https://outreach-github.vercel.app \
#        bash install.sh
#
# Idempotent — safe to re-run. Pulls the latest .sh / .service / .timer from
# the directory this script lives in.

set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Must run as root (sudo)" >&2
  exit 64
fi

if [[ -z "${WORKFLOW_TICK_VPS_TOKEN:-}" ]]; then
  echo "WORKFLOW_TICK_VPS_TOKEN env var required" >&2
  echo "Generate one + add to api_keys table (env_var=WORKFLOW_TICK_VPS_TOKEN), then export it here." >&2
  exit 64
fi

DASHBOARD_URL="${DASHBOARD_URL:-https://outreach-github.vercel.app}"
HERE="$(cd "$(dirname "$0")" && pwd)"

install -d -m 0755 /opt/workflow-tick
install -m 0755 "$HERE/workflow-tick.sh" /opt/workflow-tick/workflow-tick.sh

cat > /etc/workflow-tick.env <<EOF
WORKFLOW_TICK_VPS_TOKEN=$WORKFLOW_TICK_VPS_TOKEN
DASHBOARD_URL=$DASHBOARD_URL
EOF
chmod 600 /etc/workflow-tick.env
chown root:root /etc/workflow-tick.env

install -m 0644 "$HERE/workflow-tick.service" /etc/systemd/system/workflow-tick.service
install -m 0644 "$HERE/workflow-tick.timer" /etc/systemd/system/workflow-tick.timer

systemctl daemon-reload
systemctl enable --now workflow-tick.timer

echo
echo "✓ Installed. Timer status:"
systemctl status workflow-tick.timer --no-pager | head -10
echo
echo "Logs (one minute after install):"
echo "  journalctl -u workflow-tick -n 20 --no-pager"
