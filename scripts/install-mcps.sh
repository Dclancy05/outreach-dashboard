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

# ─── Step 3: Register MCPs in Claude Code (Mac AND VPS) ─────────────────
step "3/7 — Register MCPs in Claude Code (Mac + VPS)"

# Two registration paths:
#   - Mac: stdio for things that should run locally (npm packages), HTTP via
#     Tailscale Funnel for the VPS-hosted Docker containers.
#   - VPS: same MCPs registered there too, so subagents spawned by
#     agent-runner (via Telegram-driven workflows when the Mac is asleep)
#     can use them. VPS uses localhost URLs for the Docker containers
#     (faster, no funnel hop) and stdio packages run as VPS subprocesses.
#
# Why register on both: Dylan uses Telegram-from-phone to drive workflows
# on the VPS even when the Mac is off. Without VPS-side registration, those
# spawned agents would have no browser/devtools/postgres/github/sentry.

add_http_mcp() {
  # $1=name  $2=mac_url  $3=vps_url  $4=bearer_token
  local name="$1" mac_url="$2" vps_url="$3" tok="$4"

  # Mac side
  if claude mcp list 2>/dev/null | grep -q "^${name} "; then
    ok "Mac: ${name} already registered"
  else
    claude mcp add --scope user --transport http "$name" "$mac_url" \
      --header "Authorization: Bearer $tok" >/dev/null 2>&1 \
      && ok "Mac: ${name} added" \
      || warn "Mac: ${name} add failed"
  fi

  # VPS side
  if ssh "$VPS_HOST" "claude mcp list 2>/dev/null | grep -q '^${name} '"; then
    ok "VPS: ${name} already registered"
  else
    ssh "$VPS_HOST" "claude mcp add --scope user --transport http '${name}' '${vps_url}' --header 'Authorization: Bearer ${tok}'" >/dev/null 2>&1 \
      && ok "VPS: ${name} added" \
      || warn "VPS: ${name} add failed"
  fi
}

add_stdio_mcp() {
  # $1=name  $2=env-string-or-empty  $3+=command and args
  local name="$1"; shift
  local envstr="$1"; shift
  local cmd_str="$*"

  # Mac side
  if claude mcp list 2>/dev/null | grep -q "^${name} "; then
    ok "Mac: ${name} already registered"
  else
    if [[ -n "$envstr" ]]; then
      eval "claude mcp add --scope user $envstr ${name} -- $cmd_str" >/dev/null 2>&1 \
        && ok "Mac: ${name} added" \
        || warn "Mac: ${name} add failed"
    else
      eval "claude mcp add --scope user ${name} -- $cmd_str" >/dev/null 2>&1 \
        && ok "Mac: ${name} added" \
        || warn "Mac: ${name} add failed"
    fi
  fi

  # VPS side
  if ssh "$VPS_HOST" "claude mcp list 2>/dev/null | grep -q '^${name} '"; then
    ok "VPS: ${name} already registered"
  else
    if [[ -n "$envstr" ]]; then
      ssh "$VPS_HOST" "claude mcp add --scope user $envstr ${name} -- $cmd_str" >/dev/null 2>&1 \
        && ok "VPS: ${name} added" \
        || warn "VPS: ${name} add failed"
    else
      ssh "$VPS_HOST" "claude mcp add --scope user ${name} -- $cmd_str" >/dev/null 2>&1 \
        && ok "VPS: ${name} added" \
        || warn "VPS: ${name} add failed"
    fi
  fi
}

# ─── Cleanup any broken HTTP entries from prior runs ──────────────────
# The earlier docker-compose approach 502'd because the container start
# scripts had wrong syntax for @playwright/mcp / supergateway. Replacing
# with stdio packages — same proven pattern as Dylan's existing
# playwright-global MCP. Faster, no Docker, no bearer tokens to keep
# in sync. Cleanup runs first so re-runs heal the stale state.
echo "  Cleaning up broken HTTP entries (if present)..."
for name in playwright devtools postgres; do
  claude mcp remove "$name" --scope user >/dev/null 2>&1 || true
  ssh "$VPS_HOST" "claude mcp remove '$name' --scope user >/dev/null 2>&1 || true" 2>/dev/null || true
done

# ─── Stdio MCPs (replace HTTP) ──────────────────────────────────────────
# Playwright with --caps devtools = browser AND devtools in one MCP.
# On Mac: launches local Chrome (Dylan's existing playwright-global
# already does this — we use a different name to avoid collision).
# On VPS: connects to existing Chrome+CDP at localhost:9222 — uses the
# host's running Chrome, no Docker needed.

# Mac: skip if playwright-global already covers it
if claude mcp list 2>/dev/null | grep -qE "^(playwright|playwright-global) "; then
  ok "Mac: playwright (have playwright-global already)"
else
  claude mcp add --scope user playwright -- npx -y @playwright/mcp --caps devtools 2>&1 | head -1 \
    && ok "Mac: playwright added" || warn "Mac: playwright add failed"
fi

# VPS: connect to existing Chrome+CDP
if ssh "$VPS_HOST" "claude mcp list 2>/dev/null | grep -q '^playwright '"; then
  ok "VPS: playwright already registered"
else
  ssh "$VPS_HOST" "claude mcp add --scope user playwright -- npx -y @playwright/mcp --caps devtools --cdp-endpoint http://127.0.0.1:9222" 2>&1 | head -1 \
    && ok "VPS: playwright added (uses host Chrome+CDP)" || warn "VPS: playwright add failed"
fi

# Postgres MCP (stdio with conn string as first arg)
if claude mcp list 2>/dev/null | grep -q "^postgres "; then
  ok "Mac: postgres already registered"
else
  claude mcp add --scope user postgres -- npx -y @modelcontextprotocol/server-postgres "$POSTGRES_CONNECTION_STRING" 2>&1 | head -1 \
    && ok "Mac: postgres added" || warn "Mac: postgres add failed"
fi
if ssh "$VPS_HOST" "claude mcp list 2>/dev/null | grep -q '^postgres '"; then
  ok "VPS: postgres already registered"
else
  ssh "$VPS_HOST" "claude mcp add --scope user postgres -- npx -y @modelcontextprotocol/server-postgres '$POSTGRES_CONNECTION_STRING'" 2>&1 | head -1 \
    && ok "VPS: postgres added" || warn "VPS: postgres add failed"
fi

# GitHub MCP — `-e KEY=VAL` is the actual Claude Code env-flag syntax
# (the `--env` form silently fails on some versions). Switching here.
if [[ -n "$GITHUB_TOKEN_VAL" ]]; then
  if claude mcp list 2>/dev/null | grep -q "^github "; then
    ok "Mac: github already registered"
  else
    claude mcp add --scope user -e "GITHUB_PERSONAL_ACCESS_TOKEN=$GITHUB_TOKEN_VAL" github -- npx -y @modelcontextprotocol/server-github 2>&1 | head -1 \
      && ok "Mac: github added" || warn "Mac: github add failed"
  fi
  if ssh "$VPS_HOST" "claude mcp list 2>/dev/null | grep -q '^github '"; then
    ok "VPS: github already registered"
  else
    ssh "$VPS_HOST" "claude mcp add --scope user -e 'GITHUB_PERSONAL_ACCESS_TOKEN=$GITHUB_TOKEN_VAL' github -- npx -y @modelcontextprotocol/server-github" 2>&1 | head -1 \
      && ok "VPS: github added" || warn "VPS: github add failed"
  fi
fi

# Sentry — Mac only (device-code OAuth can't complete on headless VPS).
if claude mcp list 2>/dev/null | grep -q "^sentry "; then
  ok "Mac: sentry already registered"
else
  claude mcp add --scope user sentry -- npx -y @sentry/mcp-server 2>&1 | head -1 \
    && ok "Mac: sentry added (device-code OAuth on first call)" || warn "Mac: sentry add failed"
fi

if [[ -n "$CONTEXT7_API_KEY_VAL" ]]; then
  # Context7 uses X-API-Key header, not Bearer — separate from add_http_mcp
  if claude mcp list 2>/dev/null | grep -q "^context7 "; then
    ok "Mac: context7 already registered"
  else
    claude mcp add --scope user --transport http context7 "https://mcp.context7.com" \
      --header "X-API-Key: $CONTEXT7_API_KEY_VAL" >/dev/null 2>&1 \
      && ok "Mac: context7 added" || warn "Mac: context7 add failed"
  fi
  if ssh "$VPS_HOST" "claude mcp list 2>/dev/null | grep -q '^context7 '"; then
    ok "VPS: context7 already registered"
  else
    ssh "$VPS_HOST" "claude mcp add --scope user --transport http context7 'https://mcp.context7.com' --header 'X-API-Key: $CONTEXT7_API_KEY_VAL'" >/dev/null 2>&1 \
      && ok "VPS: context7 added" || warn "VPS: context7 add failed"
  fi
fi

if [[ -n "$BRAVE_SEARCH_API_KEY_VAL" ]]; then
  if claude mcp list 2>/dev/null | grep -q "^brave-search "; then
    ok "Mac: brave-search already registered"
  else
    claude mcp add --scope user -e "BRAVE_API_KEY=$BRAVE_SEARCH_API_KEY_VAL" brave-search -- npx -y @modelcontextprotocol/server-brave-search 2>&1 | head -1 \
      && ok "Mac: brave-search added" || warn "Mac: brave-search add failed"
  fi
  if ssh "$VPS_HOST" "claude mcp list 2>/dev/null | grep -q '^brave-search '"; then
    ok "VPS: brave-search already registered"
  else
    ssh "$VPS_HOST" "claude mcp add --scope user -e 'BRAVE_API_KEY=$BRAVE_SEARCH_API_KEY_VAL' brave-search -- npx -y @modelcontextprotocol/server-brave-search" 2>&1 | head -1 \
      && ok "VPS: brave-search added" || warn "VPS: brave-search add failed"
  fi
fi

if [[ -n "$TWILIO_SID" && -n "$TWILIO_AUTH" ]]; then
  if claude mcp list 2>/dev/null | grep -q "^twilio "; then
    ok "Mac: twilio already registered"
  else
    claude mcp add --scope user -e "TWILIO_ACCOUNT_SID=$TWILIO_SID" -e "TWILIO_AUTH_TOKEN=$TWILIO_AUTH" twilio -- npx -y @twilio-alpha/mcp 2>&1 | head -1 \
      && ok "Mac: twilio added" || warn "Mac: twilio add failed"
  fi
fi

[[ -n "$APIFY_TOKEN_VAL" ]] && \
  add_http_mcp apify "https://mcp.apify.com" "https://mcp.apify.com" "$APIFY_TOKEN_VAL"

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
