#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════╗
# ║  deploy-terminals.sh — one-shot wire-up for /agency/terminals        ║
# ╠══════════════════════════════════════════════════════════════════════╣
# ║                                                                      ║
# ║  Run this on your Mac. It does the four things Claude couldn't do    ║
# ║  from inside its session (no GH token, no VPS ssh key, no Supabase   ║
# ║  admin write):                                                       ║
# ║                                                                      ║
# ║    1.  Merge PR #41 (feat/terminals-workspace)                       ║
# ║    2.  Apply 3 Supabase migrations                                   ║
# ║    3.  Deploy terminal-server on srv1197943                          ║
# ║    4.  Insert TERMINAL_RUNNER_URL + TERMINAL_RUNNER_TOKEN            ║
# ║                                                                      ║
# ║  Asks before each destructive step. Safe to re-run — most steps      ║
# ║  are idempotent.                                                     ║
# ║                                                                      ║
# ║  Usage:  bash scripts/deploy-terminals.sh                            ║
# ║                                                                      ║
# ╚══════════════════════════════════════════════════════════════════════╝
set -euo pipefail

REPO="Dclancy05/outreach-dashboard"
PR_NUMBER=41
VPS_HOST="${VPS_HOST:-root@srv1197943.hstgr.cloud}"
TS_FUNNEL_HOST="${TS_FUNNEL_HOST:-srv1197943.taild42583.ts.net}"
TS_FUNNEL_URL="https://${TS_FUNNEL_HOST}:8443/terminals"
DASHBOARD_URL="${DASHBOARD_URL:-https://outreach-github.vercel.app}"

# ANSI colors
G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; C='\033[0;36m'; B='\033[1m'; N='\033[0m'

step()   { echo -e "\n${C}${B}━━ $1${N}"; }
ok()     { echo -e "${G}✓${N} $1"; }
warn()   { echo -e "${Y}⚠${N}  $1"; }
fail()   { echo -e "${R}✗${N} $1" >&2; exit 1; }
ask()    { read -r -p "$(echo -e "${Y}?${N} $1 [y/N] ")" yn; [[ $yn =~ ^[Yy]$ ]]; }

cd "$(dirname "$0")/.."

step "Pre-flight checks"
command -v gh    >/dev/null || fail "gh CLI not installed (brew install gh)"
command -v jq    >/dev/null || fail "jq not installed (brew install jq)"
command -v curl  >/dev/null || fail "curl not installed"
command -v ssh   >/dev/null || fail "ssh not installed"
gh auth status >/dev/null 2>&1 || fail "Run 'gh auth login' first"
ok "All tools present"

# Source the prod env (Supabase service role key + URL). Optional — without
# it we still merge the PR + deploy the VPS service; you'd just need to
# apply migrations and set api_keys manually via the Supabase web UI.
SUPABASE_URL=""
SUPABASE_SR_KEY=""
HAVE_SUPA=0
if [[ -f .env.vercel.prod ]]; then
  SUPABASE_URL=$(grep '^NEXT_PUBLIC_SUPABASE_URL=' .env.vercel.prod | head -1 | sed 's/^[^=]*=//' | tr -d '"' | sed 's/\\n//g')
  SUPABASE_SR_KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.vercel.prod | head -1 | sed 's/^[^=]*=//' | tr -d '"' | sed 's/\\n//g')
  if [[ -n "$SUPABASE_URL" && -n "$SUPABASE_SR_KEY" ]]; then
    HAVE_SUPA=1
    ok "Supabase creds loaded from .env.vercel.prod"
  fi
fi
if [[ $HAVE_SUPA -eq 0 ]]; then
  warn "No .env.vercel.prod — steps 2 (migrations) and 4 (api_keys) will be skipped"
  echo "   To unlock them, run: vercel env pull .env.vercel.prod"
fi

# ─── Step 1: Merge PR #41 ─────────────────────────────────────────────
step "1/4 — Merge PR #${PR_NUMBER}"
PR_STATE=$(gh pr view "$PR_NUMBER" --repo "$REPO" --json state -q .state 2>/dev/null || echo "UNKNOWN")
if [[ "$PR_STATE" == "MERGED" ]]; then
  ok "Already merged"
elif [[ "$PR_STATE" == "OPEN" ]]; then
  if ask "Merge PR #${PR_NUMBER} into main?"; then
    gh pr merge "$PR_NUMBER" --repo "$REPO" --squash --delete-branch || fail "merge failed"
    ok "Merged"
    echo "   Waiting 90s for Vercel to redeploy main…"
    for i in {1..18}; do
      code=$(curl -sI -o /dev/null -w "%{http_code}" "${DASHBOARD_URL}/agency/terminals")
      [[ "$code" == "200" ]] && { ok "Production /agency/terminals is live (HTTP 200)"; break; }
      [[ $i -eq 18 ]] && warn "Vercel still deploying (HTTP $code) — check vercel.com"
      sleep 5
    done
  else
    warn "Skipping merge — page will keep returning 404 in production"
  fi
else
  warn "PR is in unexpected state: $PR_STATE — skipping"
fi

# ─── Step 2: Apply Supabase migrations ────────────────────────────────
step "2/4 — Apply 3 Supabase migrations"
if [[ $HAVE_SUPA -eq 0 ]]; then
  warn "Skipping — no .env.vercel.prod. Apply manually in Supabase SQL editor:"
  echo "    • supabase/migrations/20260430_terminal_sessions.sql"
  echo "    • supabase/migrations/20260430_terminal_sessions_phase_b.sql"
  echo "    • supabase/migrations/20260430_terminal_sessions_phase_c.sql"
fi
if [[ $HAVE_SUPA -eq 1 ]]; then
# Supabase REST API doesn't run raw DDL. We use the management API's pg endpoint.
# Easier path: surface the CLI command. But we can use the supabase-cli via psql
# IF the user has DATABASE_URL. Otherwise fall back to instructions.
#
# Actually — Supabase exposes a /pg/v1 endpoint internally but it's not part of
# the public REST API. The clean path is to use psql with the connection string
# from the Supabase dashboard. That URL is NOT in .env.vercel.prod by default.
#
# We try psql; if not available or no SUPABASE_DB_URL set, print the SQL paths.
if command -v psql >/dev/null && [[ -n "${SUPABASE_DB_URL:-}" ]]; then
  if ask "Apply 3 migrations via psql?"; then
    for m in supabase/migrations/20260430_terminal_sessions.sql \
             supabase/migrations/20260430_terminal_sessions_phase_b.sql \
             supabase/migrations/20260430_terminal_sessions_phase_c.sql; do
      echo "  applying $m..."
      psql "$SUPABASE_DB_URL" -f "$m" -v ON_ERROR_STOP=1 || fail "migration $m failed"
    done
    ok "All 3 migrations applied"
  fi
else
  warn "psql not configured (set SUPABASE_DB_URL or 'brew install postgresql')"
  echo "   Manual path: open Supabase SQL editor, paste each file in order:"
  echo "     • supabase/migrations/20260430_terminal_sessions.sql"
  echo "     • supabase/migrations/20260430_terminal_sessions_phase_b.sql"
  echo "     • supabase/migrations/20260430_terminal_sessions_phase_c.sql"
  ask "Continue without migrations? (you'll need to do this manually for the page to work)" || exit 0
fi
fi

# ─── Step 3: Deploy terminal-server on the VPS ────────────────────────
step "3/4 — Deploy terminal-server on $VPS_HOST"
if ! ssh -o ConnectTimeout=5 -o BatchMode=yes "$VPS_HOST" "echo ok" >/dev/null 2>&1; then
  warn "SSH to $VPS_HOST failed (no agent key?). Run with the right key, e.g."
  echo "   ssh-add ~/.ssh/id_ed25519 && bash scripts/deploy-terminals.sh"
  ask "Continue without VPS deploy?" || exit 0
else
  if ask "Deploy terminal-server to $VPS_HOST?"; then
    # Generate (or reuse) bearer token. We persist to a local file so re-runs
    # don't generate fresh tokens that would invalidate the dashboard config.
    TOKEN_FILE=".terminal-runner-token"
    if [[ -f "$TOKEN_FILE" ]]; then
      TOKEN=$(cat "$TOKEN_FILE")
      ok "Reusing existing token ($(echo "$TOKEN" | cut -c1-8)…)"
    else
      TOKEN=$(openssl rand -hex 24)
      echo "$TOKEN" > "$TOKEN_FILE"
      chmod 600 "$TOKEN_FILE"
      ok "Generated new token (saved to $TOKEN_FILE)"
    fi

    # Sync the source up
    echo "  rsync source up…"
    rsync -az --delete --exclude=node_modules \
      vps-deliverables/terminal-server/ \
      "$VPS_HOST:/opt/terminal-server/" || fail "rsync failed"

    # Install deps + register systemd unit
    ssh "$VPS_HOST" bash -s <<EOF
set -euo pipefail
apt-get install -y -qq tmux make g++ python3 >/dev/null
chmod +x /opt/terminal-server/agent-bootstrap.sh
cd /opt/terminal-server
npm install --silent
which claude > /tmp/claude-path || echo "/root/.local/bin/claude" > /tmp/claude-path
CLAUDE_BIN=\$(cat /tmp/claude-path)
cat > /etc/systemd/system/terminal-server.service <<UNIT
[Unit]
Description=Terminal Server (persistent multi-terminal for the dashboard)
After=network.target
[Service]
Type=simple
WorkingDirectory=/opt/terminal-server
Environment=PORT=10002
Environment=HOST=127.0.0.1
Environment=TERMINAL_RUNNER_TOKEN=$TOKEN
Environment=REPO_ROOT=/root/projects/outreach-dashboard
Environment=WORKTREE_ROOT=/root/projects/wt
Environment=DEFAULT_TERMINAL_COMMAND=\$CLAUDE_BIN
Environment=MAX_SESSIONS=8
Environment=TERMINAL_MEM_LIMIT=1G
Environment=TERMINAL_CPU_QUOTA=200%
Environment=ALLOWED_ORIGINS=$DASHBOARD_URL
EnvironmentFile=-/etc/terminal-server.env
ExecStart=/usr/bin/npx tsx index.ts
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
[Install]
WantedBy=multi-user.target
UNIT
# Supabase env (optional; cost watcher needs it to update DB)
if [[ ! -f /etc/terminal-server.env ]]; then
  cat > /etc/terminal-server.env <<ENV
SUPABASE_URL=$SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SR_KEY
ENV
  chmod 600 /etc/terminal-server.env
fi
systemctl daemon-reload
systemctl enable terminal-server >/dev/null
systemctl restart terminal-server
sleep 2
systemctl is-active --quiet terminal-server && echo "service: running" || echo "service: FAILED"
# Tailscale Funnel path (idempotent — if already set, this is a no-op)
tailscale funnel --bg --https=8443 --set-path=/terminals http://localhost:10002 2>&1 | head -3 || true
echo "---healthz---"
curl -s http://127.0.0.1:10002/healthz || echo "(local healthz failed)"
EOF
    ok "VPS deploy complete"
  fi
fi

# ─── Step 4: Set TERMINAL_RUNNER_URL + TOKEN in api_keys ──────────────
step "4/4 — Configure dashboard secrets"
if [[ $HAVE_SUPA -eq 0 ]]; then
  warn "Skipping — no .env.vercel.prod. Set these manually in $DASHBOARD_URL/agency/memory#api-keys:"
  if [[ -f "${TOKEN_FILE:-}" ]]; then
    echo "    TERMINAL_RUNNER_URL = $TS_FUNNEL_URL"
    echo "    TERMINAL_RUNNER_TOKEN = $(cat "$TOKEN_FILE")"
  else
    echo "    TERMINAL_RUNNER_URL = $TS_FUNNEL_URL"
    echo "    TERMINAL_RUNNER_TOKEN = (generate any 32+ char random string)"
  fi
elif [[ -f "${TOKEN_FILE:-}" ]]; then
  TOKEN=$(cat "$TOKEN_FILE")
  if ask "Insert TERMINAL_RUNNER_URL/TOKEN into api_keys table?"; then
    # Detect the api_keys schema (slug or env_var). Try slug first.
    SCHEMA_PROBE=$(curl -s -H "apikey: $SUPABASE_SR_KEY" -H "Authorization: Bearer $SUPABASE_SR_KEY" \
      "$SUPABASE_URL/rest/v1/api_keys?limit=1")
    if echo "$SCHEMA_PROBE" | grep -q '"slug"'; then
      KEY_FIELD="slug"
    elif echo "$SCHEMA_PROBE" | grep -q '"env_var"'; then
      KEY_FIELD="env_var"
    else
      warn "api_keys table schema unrecognized — fields visible:"
      echo "$SCHEMA_PROBE" | head -c 300
      KEY_FIELD=""
    fi
    if [[ -n "$KEY_FIELD" ]]; then
      for entry in \
        "TERMINAL_RUNNER_URL|$TS_FUNNEL_URL" \
        "TERMINAL_RUNNER_TOKEN|$TOKEN"; do
        env_var=${entry%|*}
        value=${entry#*|}
        slug=$(echo "$env_var" | tr '[:upper:]' '[:lower:]')
        case "$KEY_FIELD" in
          slug)
            curl -s -X POST "$SUPABASE_URL/rest/v1/api_keys" \
              -H "apikey: $SUPABASE_SR_KEY" -H "Authorization: Bearer $SUPABASE_SR_KEY" \
              -H "Content-Type: application/json" -H "Prefer: resolution=merge-duplicates" \
              -d "{\"slug\":\"$slug\",\"value\":\"$value\"}" >/dev/null
            ;;
          env_var)
            curl -s -X POST "$SUPABASE_URL/rest/v1/api_keys" \
              -H "apikey: $SUPABASE_SR_KEY" -H "Authorization: Bearer $SUPABASE_SR_KEY" \
              -H "Content-Type: application/json" -H "Prefer: resolution=merge-duplicates" \
              -d "{\"env_var\":\"$env_var\",\"value\":\"$value\"}" >/dev/null
            ;;
        esac
        ok "Set $env_var"
      done
    else
      warn "Skipped — set them manually at $DASHBOARD_URL/agency/memory#api-keys"
      echo "    TERMINAL_RUNNER_URL = $TS_FUNNEL_URL"
      echo "    TERMINAL_RUNNER_TOKEN = $TOKEN"
    fi
  fi
fi

# ─── Final smoke test ─────────────────────────────────────────────────
step "Smoke test"
sleep 2
PROD_TERMINALS=$(curl -sI -o /dev/null -w "%{http_code}" "$DASHBOARD_URL/agency/terminals")
PROD_HEALTHZ=$(curl -s "$TS_FUNNEL_URL/healthz" || echo "")
echo "  $DASHBOARD_URL/agency/terminals  →  HTTP $PROD_TERMINALS"
echo "  terminal-server /healthz         →  ${PROD_HEALTHZ:-(empty)}"
if [[ "$PROD_TERMINALS" == "200" && "$PROD_HEALTHZ" == *'"ok":true'* ]]; then
  echo
  echo -e "${G}${B}🎉  Everything is live.${N}"
  echo "    Open:  $DASHBOARD_URL/agency/terminals"
  echo "    Or text Telegram: /spawn write a hello-world component"
else
  echo
  warn "Some piece isn't fully wired yet — see HTTP codes above"
  echo "    If page is 404: PR not merged yet"
  echo "    If healthz is empty: VPS service or Funnel path not exposed"
fi
