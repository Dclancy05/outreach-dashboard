#!/usr/bin/env bash
#
# apply.sh — apply a single SQL migration file to the Supabase Postgres.
#
# Usage:
#   DATABASE_URL='postgresql://postgres.<ref>:<pwd>@aws-0-<region>.pooler.supabase.com:5432/postgres' \
#     bash apply.sh 20260427_agent_workflows.sql
#
# Get DATABASE_URL from Supabase Studio → Project Settings → Database →
# Connection string → "URI" tab → copy the "Connection pooling" URL.
# (Or pass --db-url to your supabase CLI; same string.)

set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "usage: bash apply.sh <migration-file.sql>"
  exit 1
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL env var not set."
  echo "  Get it from Supabase Studio → Settings → Database → Connection pooling"
  echo "  Then run: DATABASE_URL='...' bash $0 $1"
  exit 1
fi

MIGRATION="$1"
[ ! -f "$MIGRATION" ] && MIGRATION="$(dirname "$0")/$1"
if [ ! -f "$MIGRATION" ]; then
  echo "ERROR: migration file not found: $1"
  exit 1
fi

echo "Applying $MIGRATION to Supabase…"
psql "$DATABASE_URL" \
  -v ON_ERROR_STOP=1 \
  --single-transaction \
  -f "$MIGRATION"

echo "✓ done"
