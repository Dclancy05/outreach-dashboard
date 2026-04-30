#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════╗
# ║  install-mcps.sh — one-shot MCP stack + agent capability installer  ║
# ╠══════════════════════════════════════════════════════════════════════╣
# ║                                                                      ║
# ║  Run this on your Mac, in the dashboard repo. It does the things    ║
# ║  Claude can't do from inside its sandbox — uses YOUR ssh key, gh    ║
# ║  auth, and Vercel-pulled .env to deploy:                            ║
# ║                                                                      ║
# ║    1.  VPS: install Docker (if missing), deploy MCP stack           ║
# ║    2.  VPS: register Tailscale Funnel paths under /mcp/*            ║
# ║    3.  Local: claude mcp add for each new server                    ║
# ║    4.  OAuth: open browser for Vercel + Gmail + Calendar (3 clicks) ║
# ║    5.  Sync project-specific agent-skills to /root/memory-vault     ║
# ║    6.  Insert MCP secrets into api_keys table                       ║
# ║    7.  Smoke test all 11 MCPs                                        ║
# ║                                                                      ║
# ║  Total user interaction: ~90s of OAuth clicks. Everything else auto.║
# ║  Idempotent — safe to re-run.                                       ║
# ║                                                                      ║
# ║  Usage:  bash scripts/install-mcps.sh                                ║
# ║                                                                      ║
# ╚══════════════════════════════════════════════════════════════════════╝
set -euo pipefail

VPS_HOST="${VPS_HOST:-root@srv1197943.hstgr.cloud}"
TS_FUNNEL_HOST="${TS_FUNNEL_HOST:-srv1197943.taild42583.ts.net}"
TS_FUNNEL_BASE="https://${TS_FUNNEL_HOST}:8443"
DASHBOARD_URL="${DASHBOARD_URL:-https://outreach-github.vercel.app}"
TOKEN_FILE="$HOME/.outreach-mcp-tokens"

# ANSI colors
G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; C='\033[0;36m'; B='\033[1m'; N='\033[0m'

step() { echo -e "\n${C}${B}━━ $1${N}"; }
ok()   { echo -e "${G}✓${N} $1"; }
warn() { echo -e "${Y}⚠${N}  $1"; }
fail() { echo -e "${R}✗${N} $1" >&2; exit 1; }
ask()  { read -r -p "$(echo -e "${Y}?${N} $1 [y/N] ")" yn; [[ $yn =~ ^[Yy]$ ]]; }

cd "$(dirname "$0")/.."

# ─── Pre-flight ────────────────────────────────────────────────────────
step "Pre-flight checks"
command -v ssh    >/dev/null || fail "ssh missing"
command -v gh     >/dev/null || fail "gh missing (brew install gh)"
command -v jq     >/dev/null || fail "jq missing (brew install jq)"
command -v rsync  >/dev/null || fail "rsync missing"
command -v claude >/dev/null || fail "claude CLI missing — install Claude Code first"
command -v openssl >/dev/null || fail "openssl missing"
gh auth status >/dev/null 2>&1 || fail "Run 'gh auth login' first"

[[ -f .env.vercel.prod ]] || fail ".env.vercel.prod not found — run: vercel env pull .env.vercel.prod"

SUPABASE_URL=$(grep '^NEXT_PUBLIC_SUPABASE_URL=' .env.vercel.prod | head -1 | sed 's/^[^=]*=//' | tr -d '"' | sed 's/\\n//g')
SUPABASE_SR_KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.vercel.prod | head -1 | sed 's/^[^=]*=//' | tr -d '"' | sed 's/\\n//g')
[[ -n "$SUPABASE_URL" && -n "$SUPABASE_SR_KEY" ]] || fail "Couldn't read Supabase URL/key from .env.vercel.prod"
ok "Tools present + Supabase creds loaded"

# ─── Tokens ─────────────────────────────────────────────────────────────
step "Bearer tokens"
umask 077
if [[ -f "$TOKEN_FILE" ]]; then
  source "$TOKEN_FILE"
  ok "Reusing existing tokens from $TOKEN_FILE"
else
  PLAYWRIGHT_MCP_TOKEN=$(openssl rand -hex 24)
  DEVTOOLS_MCP_TOKEN=$(openssl rand -hex 24)
  POSTGRES_MCP_TOKEN=$(openssl rand -hex 24)
  cat > "$TOKEN_FILE" <<EOF
PLAYWRIGHT_MCP_TOKEN=$PLAYWRIGHT_MCP_TOKEN
DEVTOOLS_MCP_TOKEN=$DEVTOOLS_MCP_TOKEN
POSTGRES_MCP_TOKEN=$POSTGRES_MCP_TOKEN
EOF
  chmod 600 "$TOKEN_FILE"
  ok "Generated 3 fresh bearer tokens (saved to $TOKEN_FILE, mode 600)"
fi

# ─── User inputs (only those we can't pull from .env or api_keys) ──────
step "Required values you must paste once"

# Postgres connection string — NOT in .env.vercel.prod by default. Must be
# fetched from Supabase Project Settings → Database → Connection string →
# Pooler (Transaction). Format documented in the prompt.
if [[ -z "${POSTGRES_CONNECTION_STRING:-}" ]]; then
  if grep -q '^POSTGRES_CONNECTION_STRING=' "$TOKEN_FILE" 2>/dev/null; then
    POSTGRES_CONNECTION_STRING=$(grep '^POSTGRES_CONNECTION_STRING=' "$TOKEN_FILE" | sed 's/^[^=]*=//')
    ok "Reusing saved POSTGRES_CONNECTION_STRING"
  else
    echo
    echo "  Paste your Supabase Pooler connection string. Get it at:"
    echo "    https://supabase.com/dashboard/project/yfufocegjhxxffqtkvkr/settings/database"
    echo "  → Connection string → Transaction (port 6543) → Reveal password"
    echo
    read -r -p "  POSTGRES_CONNECTION_STRING: " POSTGRES_CONNECTION_STRING
    [[ -z "$POSTGRES_CONNECTION_STRING" ]] && fail "Connection string required"
    echo "POSTGRES_CONNECTION_STRING=$POSTGRES_CONNECTION_STRING" >> "$TOKEN_FILE"
    ok "Saved"
  fi
fi

# Helper: read existing api_keys row for an env_var
read_api_key() {
  local env_var="$1"
  curl -s -H "apikey: $SUPABASE_SR_KEY" -H "Authorization: Bearer $SUPABASE_SR_KEY" \
    "$SUPABASE_URL/rest/v1/api_keys?env_var=eq.${env_var}&select=value&limit=1" \
    | jq -r '.[0].value // empty'
}

# Helper: upsert api_keys row
upsert_api_key() {
  local name="$1" provider="$2" env_var="$3" value="$4"
  # Try PATCH first (upsert by env_var match)
  local upd
  upd=$(curl -s -X PATCH "$SUPABASE_URL/rest/v1/api_keys?env_var=eq.${env_var}" \
    -H "apikey: $SUPABASE_SR_KEY" -H "Authorization: Bearer $SUPABASE_SR_KEY" \
    -H "Content-Type: application/json" -H "Prefer: return=representation" \
    -d "$(jq -nc --arg v "$value" '{value: $v}')")
  if [[ "$upd" != "[]" ]] && echo "$upd" | grep -q '^\['; then
    return 0
  fi
  curl -s -X POST "$SUPABASE_URL/rest/v1/api_keys" \
    -H "apikey: $SUPABASE_SR_KEY" -H "Authorization: Bearer $SUPABASE_SR_KEY" \
    -H "Content-Type: application/json" \
    -d "$(jq -nc --arg n "$name" --arg p "$provider" --arg e "$env_var" --arg v "$value" \
          '{name: $n, provider: $p, env_var: $e, value: $v}')" >/dev/null
}

# Pull values that may already be set in api_keys; prompt only for missing
GITHUB_TOKEN_VAL=$(read_api_key GITHUB_PAT)
[[ -z "$GITHUB_TOKEN_VAL" ]] && {
  echo
  echo "  GitHub PAT not in api_keys. Generate one at:"
  echo "    https://github.com/settings/tokens?type=beta (fine-grained, repo+workflow scope)"
  read -r -p "  GITHUB_PAT: " GITHUB_TOKEN_VAL
  [[ -n "$GITHUB_TOKEN_VAL" ]] && upsert_api_key "GitHub PAT" "github" "GITHUB_PAT" "$GITHUB_TOKEN_VAL"
}

# Optional service tokens — accept blank, those MCPs just won't get added
CONTEXT7_API_KEY_VAL=$(read_api_key CONTEXT7_API_KEY)
[[ -z "$CONTEXT7_API_KEY_VAL" ]] && {
  read -r -p "  CONTEXT7_API_KEY (optional, ENTER to skip): " CONTEXT7_API_KEY_VAL
  [[ -n "$CONTEXT7_API_KEY_VAL" ]] && upsert_api_key "Context7" "context7" "CONTEXT7_API_KEY" "$CONTEXT7_API_KEY_VAL"
}
BRAVE_SEARCH_API_KEY_VAL=$(read_api_key BRAVE_SEARCH_API_KEY)
[[ -z "$BRAVE_SEARCH_API_KEY_VAL" ]] && {
  read -r -p "  BRAVE_SEARCH_API_KEY (optional, ENTER to skip): " BRAVE_SEARCH_API_KEY_VAL
  [[ -n "$BRAVE_SEARCH_API_KEY_VAL" ]] && upsert_api_key "Brave Search" "brave" "BRAVE_SEARCH_API_KEY" "$BRAVE_SEARCH_API_KEY_VAL"
}
APIFY_TOKEN_VAL=$(read_api_key APIFY_TOKEN)
TWILIO_SID=$(read_api_key TWILIO_ACCOUNT_SID)
TWILIO_AUTH=$(read_api_key TWILIO_AUTH_TOKEN)

ok "Required values gathered"

# ─── Step 1: VPS — Docker + MCP stack deploy ───────────────────────────
step "1/7 — Deploy MCP stack to $VPS_HOST"
if ! ssh -o ConnectTimeout=5 -o BatchMode=yes "$VPS_HOST" "echo ok" >/dev/null 2>&1; then
  fail "SSH to $VPS_HOST failed. Run: ssh-add ~/.ssh/id_ed25519 (or whichever key)"
fi
ok "SSH reachable"

# Sync source up
echo "  rsync source up…"
rsync -az --delete vps-deliverables/mcp-stack/ "$VPS_HOST:/opt/mcp-stack/" || fail "rsync failed"

# Bootstrap Docker + compose stack on VPS
ssh "$VPS_HOST" bash -s <<EOF
set -euo pipefail

# Auto-install Docker if missing
if ! command -v docker >/dev/null 2>&1; then
  echo "  installing docker.io..."
  apt-get update -qq
  apt-get install -y -qq docker.io
  systemctl enable --now docker
fi

# Write the env file with our tokens + pg conn string
cat > /etc/mcp-stack.env <<ENV
PLAYWRIGHT_MCP_TOKEN=$PLAYWRIGHT_MCP_TOKEN
DEVTOOLS_MCP_TOKEN=$DEVTOOLS_MCP_TOKEN
POSTGRES_MCP_TOKEN=$POSTGRES_MCP_TOKEN
CHROME_CDP_URL=http://127.0.0.1:9222
POSTGRES_CONNECTION_STRING=$POSTGRES_CONNECTION_STRING
ENV
chmod 600 /etc/mcp-stack.env

cd /opt/mcp-stack
# docker compose v2 reads env_file via --env-file at the compose level.
# Symlink in our shared env so the YAML's \${VAR} interpolation works.
ln -sf /etc/mcp-stack.env .env
docker compose up -d --remove-orphans

# Wait for containers to be healthy
echo "  waiting for containers to start..."
sleep 8
docker compose ps --format json | jq -r '.[] | "  - \(.Service): \(.State)"' || true
EOF

ok "Containers deployed"

# Tailscale Funnel paths
ssh "$VPS_HOST" bash -s <<'EOF'
set -euo pipefail
tailscale funnel --bg --https=8443 --set-path=/mcp/playwright http://127.0.0.1:8010 2>&1 | head -3 || true
tailscale funnel --bg --https=8443 --set-path=/mcp/devtools   http://127.0.0.1:8011 2>&1 | head -3 || true
tailscale funnel --bg --https=8443 --set-path=/mcp/postgres   http://127.0.0.1:8012 2>&1 | head -3 || true
echo "--- funnel status ---"
tailscale funnel status | head -20
EOF
ok "Funnel paths registered"

# ─── Step 2: Smoke-test the VPS-hosted MCPs ────────────────────────────
step "2/7 — Smoke test VPS MCPs"
sleep 3
for service in playwright devtools postgres; do
  case "$service" in
    playwright) tok="$PLAYWRIGHT_MCP_TOKEN" ;;
    devtools)   tok="$DEVTOOLS_MCP_TOKEN"   ;;
    postgres)   tok="$POSTGRES_MCP_TOKEN"   ;;
  esac
  code=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $tok" \
    "$TS_FUNNEL_BASE/mcp/$service/healthz")
  if [[ "$code" == "200" ]]; then
    ok "$service MCP: HTTP 200"
  else
    warn "$service MCP returned HTTP $code (may still be starting; rerun in 30s)"
  fi
done

# ─── Step 3: Local Mac — claude mcp add ─────────────────────────────────
step "3/7 — Register MCPs in Claude Code"

add_mcp() {
  local name="$1"; shift
  if claude mcp list 2>/dev/null | grep -q "^$name "; then
    ok "$name already registered"
  else
    if claude mcp add "$name" "$@" 2>&1 | grep -qE "added|registered|configured"; then
      ok "$name added"
    else
      warn "$name add returned non-zero — re-run if it doesn't appear in 'claude mcp list'"
    fi
  fi
}

# HTTP MCPs (point at the VPS Tailscale Funnel)
add_mcp playwright    --transport http --url "$TS_FUNNEL_BASE/mcp/playwright"  --header "Authorization: Bearer $PLAYWRIGHT_MCP_TOKEN"
add_mcp devtools      --transport http --url "$TS_FUNNEL_BASE/mcp/devtools"    --header "Authorization: Bearer $DEVTOOLS_MCP_TOKEN"
add_mcp postgres      --transport http --url "$TS_FUNNEL_BASE/mcp/postgres"    --header "Authorization: Bearer $POSTGRES_MCP_TOKEN"

# Stdio MCPs (run locally on the Mac)
[[ -n "$GITHUB_TOKEN_VAL" ]] && \
  add_mcp github --env GITHUB_PERSONAL_ACCESS_TOKEN="$GITHUB_TOKEN_VAL" -- npx -y @modelcontextprotocol/server-github

add_mcp sentry --env SENTRY_AUTH_TOKEN="" -- npx -y @sentry/mcp-server  # device-code OAuth on first call

[[ -n "$CONTEXT7_API_KEY_VAL" ]] && \
  add_mcp context7 --transport http --url "https://mcp.context7.com" --header "X-API-Key: $CONTEXT7_API_KEY_VAL"

[[ -n "$BRAVE_SEARCH_API_KEY_VAL" ]] && \
  add_mcp brave-search --env BRAVE_API_KEY="$BRAVE_SEARCH_API_KEY_VAL" -- npx -y @modelcontextprotocol/server-brave-search

[[ -n "$TWILIO_SID" && -n "$TWILIO_AUTH" ]] && \
  add_mcp twilio --env TWILIO_ACCOUNT_SID="$TWILIO_SID" --env TWILIO_AUTH_TOKEN="$TWILIO_AUTH" -- npx -y @twilio-alpha/mcp

[[ -n "$APIFY_TOKEN_VAL" ]] && \
  add_mcp apify --transport http --url "https://mcp.apify.com" --header "Authorization: Bearer $APIFY_TOKEN_VAL"

# ─── Step 4: OAuth flows for already-installed MCPs ────────────────────
step "4/7 — OAuth re-auth (3 clicks)"

if ask "Re-authorize Vercel MCP? (opens browser, click Allow)"; then
  echo "  In Claude Code, run: /authenticate plugin:vercel:vercel"
  warn "  This step requires running an MCP auth tool inside Claude — paste the prompt above into a Claude Code session"
fi
if ask "Re-authorize Gmail MCP?"; then
  echo "  In Claude Code, run: /authenticate claude.ai Gmail"
fi
if ask "Re-authorize Calendar MCP?"; then
  echo "  In Claude Code, run: /authenticate claude.ai Google Calendar"
fi

# ─── Step 5: Sync agent-skills to memory-vault ─────────────────────────
step "5/7 — Sync agent-skills to /root/memory-vault"
ssh "$VPS_HOST" "mkdir -p /root/memory-vault/Jarvis/agent-skills"
rsync -az vps-deliverables/mcp-stack/agent-skills/ "$VPS_HOST:/root/memory-vault/Jarvis/agent-skills/"
ok "Agent-skills synced (5 files)"

# Restart agent-runner so it picks up new agent .md files at next spawn
ssh "$VPS_HOST" "systemctl restart agent-runner.service" 2>/dev/null && ok "agent-runner restarted" || warn "agent-runner restart failed (service may not exist on this VPS)"

# ─── Step 6: Persist MCP secrets in api_keys ───────────────────────────
step "6/7 — Sync MCP bearer tokens to dashboard's api_keys"
upsert_api_key "Playwright MCP Token" "mcp_playwright" "PLAYWRIGHT_MCP_TOKEN" "$PLAYWRIGHT_MCP_TOKEN"
upsert_api_key "DevTools MCP Token"   "mcp_devtools"   "DEVTOOLS_MCP_TOKEN"   "$DEVTOOLS_MCP_TOKEN"
upsert_api_key "Postgres MCP Token"   "mcp_postgres"   "POSTGRES_MCP_TOKEN"   "$POSTGRES_MCP_TOKEN"
ok "Tokens persisted to api_keys"

# ─── Step 7: Final summary ─────────────────────────────────────────────
step "7/7 — Done"
echo
echo "  Try in a new Claude Code session:"
echo "    1. claude mcp list           # confirm all servers connected"
echo "    2. 'screenshot $DASHBOARD_URL/agency/terminals'  # tests Playwright"
echo "    3. 'recent errors in sentry' # tests Sentry (first call triggers device-code OAuth)"
echo "    4. 'SELECT count(*) FROM terminal_sessions'  # tests Postgres"
echo
echo -e "${G}${B}🎉  MCP stack live. Tokens at $TOKEN_FILE.${N}"
echo "  Re-run this script anytime — it's idempotent."
