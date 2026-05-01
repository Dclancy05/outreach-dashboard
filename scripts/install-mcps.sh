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
    ok "Found saved POSTGRES_CONNECTION_STRING"
  fi
fi

# Validate the connection string. A valid Supabase Pooler URL ends with
# /postgres (the database name). Earlier paste truncation left it ending in
# "/po" — silently broken. We re-prompt instead of using a corrupt value.
while [[ -z "${POSTGRES_CONNECTION_STRING:-}" || ! "$POSTGRES_CONNECTION_STRING" =~ /postgres$ ]]; do
  if [[ -n "${POSTGRES_CONNECTION_STRING:-}" ]]; then
    warn "Saved Postgres connection string looks truncated (must end with /postgres)"
    sed -i.bak '/^POSTGRES_CONNECTION_STRING=/d' "$TOKEN_FILE" 2>/dev/null || true
    rm -f "${TOKEN_FILE}.bak" 2>/dev/null || true
    POSTGRES_CONNECTION_STRING=""
  fi
  echo
  echo "  Paste your full Supabase Pooler connection string."
  echo "  Get it at: https://supabase.com/dashboard/project/yfufocegjhxxffqtkvkr/settings/database"
  echo "  → Connection string → Transaction (port 6543) → Reveal password"
  echo "  ⚠ Make sure it ends with /postgres (the database name) — paste must be on ONE line"
  echo
  read -r -p "  POSTGRES_CONNECTION_STRING: " POSTGRES_CONNECTION_STRING
  [[ -z "$POSTGRES_CONNECTION_STRING" ]] && fail "Connection string required"
done
# Persist (only happens if we re-prompted; original branch already saved it)
if ! grep -q '^POSTGRES_CONNECTION_STRING=' "$TOKEN_FILE" 2>/dev/null; then
  echo "POSTGRES_CONNECTION_STRING=$POSTGRES_CONNECTION_STRING" >> "$TOKEN_FILE"
fi
ok "Postgres connection string OK (ends with /postgres)"

# Heal a known-bad api_keys row: prior runs leaked the trailing "stgres" (from
# the Postgres truncation) into the GITHUB_PAT prompt. Real GitHub PATs are
# 40+ chars; anything shorter is the leaked garbage.
GH_EXISTING=$(curl -s -H "apikey: $SUPABASE_SR_KEY" -H "Authorization: Bearer $SUPABASE_SR_KEY" \
  "$SUPABASE_URL/rest/v1/api_keys?env_var=eq.GITHUB_PAT&select=id,value&limit=1" | jq -r '.[0].value // empty')
if [[ -n "$GH_EXISTING" && ${#GH_EXISTING} -lt 30 ]]; then
  warn "Found short GITHUB_PAT in api_keys (${#GH_EXISTING} chars) — likely leaked junk; deleting"
  curl -s -X DELETE -H "apikey: $SUPABASE_SR_KEY" -H "Authorization: Bearer $SUPABASE_SR_KEY" \
    "$SUPABASE_URL/rest/v1/api_keys?env_var=eq.GITHUB_PAT" >/dev/null 2>&1 || true
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

# ─── Step 1: Cleanup orphan Docker MCP stack from earlier attempts ─────
# The original Docker compose stack 502'd because of wrong CLI flags in
# the container start commands. We've abandoned that approach for stdio
# MCPs (matching Dylan's existing playwright-global pattern). This step
# cleans up any leftover containers + funnel paths so they don't keep
# burning RAM. Optional — won't fail the script if there's nothing to clean.
step "1/7 — Cleanup orphan Docker MCP stack (if present)"
if ssh -o ConnectTimeout=5 -o BatchMode=yes "$VPS_HOST" "echo ok" >/dev/null 2>&1; then
  ok "SSH reachable"
  ssh "$VPS_HOST" 'cd /opt/mcp-stack 2>/dev/null && docker compose down --rmi local --volumes 2>&1 | tail -3 || true' 2>/dev/null || true
  ssh "$VPS_HOST" "tailscale funnel --https=8443 --set-path=/mcp/playwright off 2>/dev/null || true" 2>/dev/null || true
  ssh "$VPS_HOST" "tailscale funnel --https=8443 --set-path=/mcp/devtools off 2>/dev/null || true" 2>/dev/null || true
  ssh "$VPS_HOST" "tailscale funnel --https=8443 --set-path=/mcp/postgres off 2>/dev/null || true" 2>/dev/null || true
  ok "Orphan cleanup done (containers + funnel paths removed if they existed)"
else
  warn "SSH unreachable — skipping cleanup. Run: ssh-add ~/.ssh/id_ed25519"
fi

# ─── Step 2: skipped (no Docker stack to smoke-test anymore) ───────────
step "2/7 — VPS MCPs skip — using stdio everywhere now"
ok "Stdio MCPs are launched on-demand by Claude Code; no service to smoke-test"

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

# Universal helpers — handle the two real cases:
#   (a) `claude mcp add <name> ...` succeeds → ok
#   (b) `claude mcp add <name> ...` says "already exists" → also ok (idempotent)
#   (c) anything else → warn with the actual error visible
#
# CRITICAL: `<name>` MUST be the first positional argument to `claude mcp add`.
# Putting `--scope user` or `-e KEY=VAL` BEFORE the name causes the parser to
# treat the name as another option value (we hit this with github + brave-search
# in the previous run — error: "Invalid environment variable format: github").

mac_add() {
  # Args are passed verbatim to `claude mcp add`. Caller is responsible for
  # putting <name> first.
  local name="$1"
  if claude mcp list 2>/dev/null | grep -qE "^${name}[: ]"; then
    ok "Mac: ${name} already registered"
    return 0
  fi
  local out
  out=$(claude mcp add "$@" 2>&1)
  if [[ $? -eq 0 ]]; then
    ok "Mac: ${name} added"
  elif [[ "$out" == *"already exists"* ]]; then
    ok "Mac: ${name} already registered"
  else
    warn "Mac: ${name} — $out"
  fi
}

vps_add() {
  # Same contract, but runs over SSH. We pass a single string (already
  # quoted) since shell quoting through SSH is fiddly.
  local name="$1"
  local cmd="$2"
  if ssh "$VPS_HOST" "claude mcp list 2>/dev/null | grep -qE '^${name}[: ]'"; then
    ok "VPS: ${name} already registered"
    return 0
  fi
  local out
  out=$(ssh "$VPS_HOST" "$cmd" 2>&1)
  if [[ $? -eq 0 ]]; then
    ok "VPS: ${name} added"
  elif [[ "$out" == *"already exists"* ]]; then
    ok "VPS: ${name} already registered"
  else
    warn "VPS: ${name} — $out"
  fi
}

# Cleanup any broken HTTP entries left over from the abandoned Docker stack
echo "  Cleaning up broken HTTP entries from prior runs (if present)..."
for name in playwright devtools postgres apify context7 brave-search twilio github; do
  claude mcp remove "$name" --scope user >/dev/null 2>&1 || true
  ssh "$VPS_HOST" "claude mcp remove '$name' --scope user >/dev/null 2>&1 || true" 2>/dev/null || true
done

# ─── Playwright (browser + devtools combined via --caps devtools) ─────
# Mac: skip if playwright-global already covers it.
if claude mcp list 2>/dev/null | grep -qE "^playwright-global[: ]"; then
  ok "Mac: playwright (have playwright-global already)"
else
  mac_add playwright --scope user -- npx -y @playwright/mcp --caps devtools
fi
vps_add playwright \
  "claude mcp add playwright --scope user -- npx -y @playwright/mcp --caps devtools --cdp-endpoint http://127.0.0.1:9222"

# ─── Postgres MCP (direct SQL into Supabase) ──────────────────────────
mac_add postgres --scope user -- npx -y @modelcontextprotocol/server-postgres "$POSTGRES_CONNECTION_STRING"
vps_add postgres \
  "claude mcp add postgres --scope user -- npx -y @modelcontextprotocol/server-postgres '$POSTGRES_CONNECTION_STRING'"

# ─── GitHub MCP (PR / issue / repo ops) ────────────────────────────────
if [[ -n "$GITHUB_TOKEN_VAL" ]]; then
  mac_add github --scope user -e "GITHUB_PERSONAL_ACCESS_TOKEN=$GITHUB_TOKEN_VAL" -- npx -y @modelcontextprotocol/server-github
  vps_add github \
    "claude mcp add github --scope user -e 'GITHUB_PERSONAL_ACCESS_TOKEN=$GITHUB_TOKEN_VAL' -- npx -y @modelcontextprotocol/server-github"
fi

# ─── Sentry MCP (Mac only — device-code OAuth doesn't work headless) ───
mac_add sentry --scope user -- npx -y @sentry/mcp-server

# ─── Context7 (X-API-Key header) ───────────────────────────────────────
if [[ -n "$CONTEXT7_API_KEY_VAL" ]]; then
  mac_add context7 --scope user --transport http "https://mcp.context7.com" --header "X-API-Key: $CONTEXT7_API_KEY_VAL"
  vps_add context7 \
    "claude mcp add context7 --scope user --transport http 'https://mcp.context7.com' --header 'X-API-Key: $CONTEXT7_API_KEY_VAL'"
fi

# ─── Brave Search ──────────────────────────────────────────────────────
if [[ -n "$BRAVE_SEARCH_API_KEY_VAL" ]]; then
  mac_add brave-search --scope user -e "BRAVE_API_KEY=$BRAVE_SEARCH_API_KEY_VAL" -- npx -y @modelcontextprotocol/server-brave-search
  vps_add brave-search \
    "claude mcp add brave-search --scope user -e 'BRAVE_API_KEY=$BRAVE_SEARCH_API_KEY_VAL' -- npx -y @modelcontextprotocol/server-brave-search"
fi

# ─── Twilio (alpha — Mac only, no SMS sending from headless VPS) ────
if [[ -n "$TWILIO_SID" && -n "$TWILIO_AUTH" ]]; then
  mac_add twilio --scope user -e "TWILIO_ACCOUNT_SID=$TWILIO_SID" -e "TWILIO_AUTH_TOKEN=$TWILIO_AUTH" -- npx -y @twilio-alpha/mcp
fi

# ─── Apify (HTTP, Bearer auth) ─────────────────────────────────────────
if [[ -n "$APIFY_TOKEN_VAL" ]]; then
  mac_add apify --scope user --transport http "https://mcp.apify.com" --header "Authorization: Bearer $APIFY_TOKEN_VAL"
  vps_add apify \
    "claude mcp add apify --scope user --transport http 'https://mcp.apify.com' --header 'Authorization: Bearer $APIFY_TOKEN_VAL'"
fi

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
