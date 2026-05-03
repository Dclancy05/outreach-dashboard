# Supabase Restore Playbook

> Last updated: 2026-05-03 (Wave 5.2 of the 59-hour bulletproofing plan)

The system writes a daily encrypted Postgres dump to S3 at `04:00 UTC` (~midnight ET) via `.github/workflows/supabase-cold-backup.yml`. This doc is the recovery procedure if Supabase ever loses data.

## Time-to-Recovery target

**~30 minutes.** Most of that is the actual restore (`pg_restore` against a fresh project), not finding the dump.

## Step 1 — Pull the latest dump

```bash
# List recent backups
aws s3 ls s3://$AWS_S3_BUCKET/supabase/

# Pull the most recent
aws s3 cp s3://$AWS_S3_BUCKET/supabase/<stamp>.dump.gpg /tmp/restore.dump.gpg
```

## Step 2 — Decrypt

```bash
# The passphrase lives in 1Password under "Supabase Backup GPG Pass"
# (and in Vercel env / GitHub Actions secret BACKUP_GPG_PASS for ops)
gpg --batch --yes --passphrase "$BACKUP_GPG_PASS" \
    --decrypt --output /tmp/restore.dump \
    /tmp/restore.dump.gpg
```

## Step 3 — Restore to a staging Supabase branch first

NEVER restore directly to production. Restore to a fresh Supabase branch, verify, then promote.

```bash
# Create a Supabase branch from the dashboard or CLI:
supabase branches create restore-test

# Get the branch's connection string from the Supabase dashboard,
# then restore:
pg_restore --no-owner --no-acl --clean --if-exists \
  --dbname="postgres://postgres:[branch-pass]@<branch-host>:5432/postgres" \
  /tmp/restore.dump
```

## Step 4 — Smoke test the restored DB

Run these queries on the staging branch:
```sql
SELECT count(*) FROM accounts;       -- should be ~1-2 dozen
SELECT count(*) FROM leads;          -- thousands
SELECT count(*) FROM send_log;       -- many thousands
SELECT max(created_at) FROM send_log; -- should be within ~24h of dump time
```

## Step 5 — Promote (only if Step 4 passes)

If the staging branch looks good, you have two paths:

**Path A — Promote the branch to production**
This is faster but irreversible. From Supabase dashboard, choose "Merge to production."

**Path B — Pause the app, restore to production directly, unpause**
Slower but you keep prod's connection string + secrets unchanged.
1. Pause Vercel deployment (toggle to maintenance)
2. Take a final pre-restore snapshot of the prod DB just in case
3. `pg_restore` against prod connection string
4. Unpause Vercel

## Step 6 — Verify in app

1. Open `https://outreach-github.vercel.app`
2. Log in with PIN `122436`
3. Walk every primary page: `/agency/leads`, `/agency/accounts`, `/automations`, `/jarvis/observability`
4. Look for empty states (= restore missed something) or stale data

## What's NOT in the dump

- Auth users (Supabase Auth is in a separate project; if it ever goes down we re-PIN)
- Storage buckets (cookie files, screenshots)
  - Cookies are also captured daily by `/api/cron/cookie-backup` to a separate Supabase storage path — restore that too if needed
- Vercel env vars + secrets (those live in Vercel; back up out-of-band per `reference_credentials_inventory.md`)

## When to use this playbook

- A migration accidentally drops data
- Someone runs `DELETE FROM <table>` without a WHERE clause
- Supabase has a region-wide incident
- Anything that loses rows we care about

For "I changed schema and want to roll back" — usually a forward migration is faster. Use this only when the forward path is genuinely worse.
