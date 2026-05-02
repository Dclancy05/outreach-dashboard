#!/usr/bin/env bash
# prod-status.sh — one-shot oracle for "what's the state of production right now?"
#
# Used by the fix-test-fix loop. Output is designed to be skim-readable
# (LATEST_DEPLOY one-liner first, then recent commits, then open PRs,
# then recent error notifications). All calls are read-only.
#
# Usage:  bash scripts/prod-status.sh
# Env:    GH_TOKEN required for gh CLI calls (auto-extracted from
#         ~/.git-credentials if unset)
set -euo pipefail

if [[ -z "${GH_TOKEN:-}" ]]; then
  GH_TOKEN=$(awk -F'[:@]' 'NR==1 {print $3}' ~/.git-credentials 2>/dev/null || true)
  export GH_TOKEN
fi

REPO="Dclancy05/outreach-dashboard"

echo "=== PROD STATUS ($(date -u +%Y-%m-%dT%H:%M:%SZ)) ==="

# Latest production deploy
LATEST=$(gh api "repos/$REPO/deployments?per_page=1&environment=Production" --jq '.[0] | {sha, created_at, id}' 2>/dev/null || echo '{}')
SHA=$(echo "$LATEST" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('sha','')[:7])" 2>/dev/null || echo "?")
CREATED=$(echo "$LATEST" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('created_at',''))" 2>/dev/null || echo "?")
ID=$(echo "$LATEST" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null || echo "")
STATE="?"
if [[ -n "$ID" ]]; then
  STATE=$(gh api "repos/$REPO/deployments/$ID/statuses" --jq '.[0].state // "unknown"' 2>/dev/null || echo "?")
fi
echo "LATEST DEPLOY: sha=$SHA state=$STATE created=$CREATED"

# Local main vs prod alignment
HEAD_SHA=$(gh api "repos/$REPO/commits/main" --jq '.sha[0:7]' 2>/dev/null || echo "?")
if [[ "$HEAD_SHA" == "$SHA" ]]; then
  echo "MAIN ↔ PROD: ✅ aligned at $SHA"
else
  echo "MAIN ↔ PROD: ⚠ main=$HEAD_SHA prod=$SHA (waiting for deploy)"
fi

# Last 5 commits
echo
echo "--- last 5 commits on main ---"
gh api "repos/$REPO/commits?per_page=5&sha=main" --jq '.[] | "\(.sha[0:7])  \(.commit.message | split("\n")[0])"' 2>/dev/null | head -5

# Open PRs
echo
echo "--- open PRs ---"
gh pr list --state open --json number,title,headRefName,mergeStateStatus,statusCheckRollup --limit 10 2>/dev/null \
  | python3 -c "
import json, sys
d = json.load(sys.stdin)
if not d:
    print('  (none)')
for pr in d:
    rolls = pr.get('statusCheckRollup', []) or []
    pending = sum(1 for r in rolls if r.get('status') == 'IN_PROGRESS' or r.get('state') == 'PENDING')
    fails = sum(1 for r in rolls if r.get('conclusion') == 'FAILURE' or r.get('state') == 'FAILURE')
    print(f\"  #{pr['number']:>3}  {pr.get('mergeStateStatus','?'):>10}  pending={pending} fail={fails}  {pr['title'][:60]}\")
" 2>/dev/null

# Latest 5 error-class notifications (from production via REST)
echo
echo "--- recent error notifications (last 5) ---"
URL="https://yfufocegjhxxffqtkvkr.supabase.co"
KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"
if [[ -z "$KEY" && -f .env.local ]]; then
  KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | head -1 | cut -d'"' -f2 | tr -d '\\n')
fi
if [[ -n "$KEY" ]]; then
  curl -s "$URL/rest/v1/notifications?select=created_at,type,title&type=in.(cron_error,maintenance_error,error,task_failed,workflow_failed)&order=created_at.desc&limit=5" \
    -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
    | python3 -c "
import json, sys
try:
  data = json.load(sys.stdin)
  if isinstance(data, dict):
    print(f\"  (REST error: {data.get('message') or data.get('error') or data})\"); sys.exit(0)
  if not data: print('  (none)'); sys.exit(0)
  for r in data:
    print(f\"  {r.get('created_at','')[:19]}  {r.get('type','?'):>20}  {(r.get('title') or '')[:60]}\")
except Exception as e:
  print(f'  (parse err: {e})')
" 2>/dev/null
else
  echo "  (no service role key in env)"
fi

echo
echo "=== END ==="
