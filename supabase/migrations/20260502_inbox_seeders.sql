-- Phase 4 backend — Inbox seeders.
--
-- Adds source-tracking columns to `notifications` so the seeder library
-- (`src/lib/notifications-seeder.ts`) can dedupe by (source_kind, source_id):
-- each row in (ai_agent_log, workflow_runs, accounts) generates AT MOST one
-- notification, ever. Dedupe enforced by the partial unique index below.
--
-- Notes vs. the original Phase 4 plan spec:
--   * `source_id` is `text` (not `uuid`) because accounts use a TEXT primary
--     key (`account_id`) while ai_agent_log/workflow_runs use uuid. Storing
--     uuids as text loses no information here and lets one column carry all
--     three source PK shapes without a tagged-union mess.
--   * `notifications.metadata` is added (jsonb) — the live notifications
--     table has no place for the contextual metadata the seeder writes
--     (account_id, workflow_id, etc.). Without it the inbox UI would have
--     to re-query each source to render link targets.
--
-- Health flags on `accounts` (`captcha_required`, `auto_paused_reason`) are
-- new — these are the inputs the future account-health auto-pause logic
-- (SYSTEM.md §24, item 2) will write, and the inbox seeder reads from them
-- now so the moment those producers ship the inbox lights up automatically.

-- 1. Notifications: source-tracking + metadata.
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS source_kind text,
  ADD COLUMN IF NOT EXISTS source_id   text,
  ADD COLUMN IF NOT EXISTS metadata    jsonb;

-- Partial unique index: dedupes seeded rows but allows existing/future
-- non-source notifications (NULL source_kind) to coexist freely.
CREATE UNIQUE INDEX IF NOT EXISTS idx_notif_source
  ON notifications(source_kind, source_id)
  WHERE source_kind IS NOT NULL;

-- 2. Accounts: health flags consumed by the account_health seeder.
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS captcha_required   boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_paused_reason text;

-- Partial index for the account_health query — only the (small) subset of
-- rows that actually need attention is indexed, so the query is O(matches)
-- not O(accounts).
CREATE INDEX IF NOT EXISTS idx_accounts_paused
  ON accounts(captcha_required, auto_paused_reason)
  WHERE captcha_required = true OR auto_paused_reason IS NOT NULL;
