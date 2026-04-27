-- 2026-04-27 — proxy_groups.status column + initial backfill
--
-- Spec (Accounts & Proxies.md):
--   "A Group's status flips to 'Active' once every account inside it is
--    logged in and healthy."
--
-- We store a denormalized status on proxy_groups so the Groups grid can
-- render the badge without aggregating accounts on every render. The
-- companion migration 20260427_group_status_recompute.sql defines a
-- function + trigger that keep this column in sync as accounts change.
--
-- Allowed values:
--   'no_accounts'  — group has zero accounts assigned
--   'needs_signin' — at least one account is pending_setup OR has expired cookies
--   'active'       — every account is active/warming AND cookies are healthy/stale
--   'error'        — reserved for explicit error states (proxy dead, etc.)
--
-- Default 'no_accounts' covers the row-creation case (group created with
-- no accounts yet). The backfill at the bottom of this file walks every
-- existing group and sets the correct value.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS.

ALTER TABLE proxy_groups
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL
    DEFAULT 'no_accounts'
    CHECK (status IN ('active', 'needs_signin', 'no_accounts', 'error'));

CREATE INDEX IF NOT EXISTS proxy_groups_status_idx
  ON proxy_groups (status);

-- ─── BACKFILL ────────────────────────────────────────────────────────────
-- Walk every group and set its status based on the accounts inside.
-- Rules (in priority order):
--   1. zero accounts                          → 'no_accounts'
--   2. any pending_setup OR expired cookies   → 'needs_signin'
--   3. all active/warming AND cookies healthy/stale → 'active'
--   4. otherwise                              → leave default ('no_accounts')
--                                               (operator can manually flag
--                                                'error' later)
--
-- This runs once at migration time. After this, the trigger in
-- 20260427_group_status_recompute.sql keeps the column fresh.

UPDATE proxy_groups pg
   SET status = sub.new_status
  FROM (
    SELECT g.id AS group_id,
           CASE
             WHEN COUNT(a.account_id) = 0
               THEN 'no_accounts'
             WHEN COUNT(*) FILTER (
                    WHERE a.status = 'pending_setup'
                       OR a.cookies_health = 'expired'
                  ) > 0
               THEN 'needs_signin'
             WHEN COUNT(*) FILTER (
                    WHERE a.status IN ('active', 'warming')
                      AND a.cookies_health IN ('healthy', 'stale')
                  ) = COUNT(a.account_id)
              AND COUNT(a.account_id) > 0
               THEN 'active'
             ELSE 'no_accounts'
           END AS new_status
      FROM proxy_groups g
      LEFT JOIN accounts a ON a.proxy_group_id = g.id
     GROUP BY g.id
  ) sub
 WHERE pg.id = sub.group_id
   AND pg.status IS DISTINCT FROM sub.new_status;
