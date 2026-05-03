-- Phase 2 — Scaling for 10x (90 accounts × 40 sends/day = 3,600 daily sends)
--
-- Wave 2.1: 5 hot-path compound indexes
-- Wave 2.2: atomic increment_sends_today() stored function (closes race
--           condition that could blow daily caps at 10x)

-- ── Wave 2.1: indexes ────────────────────────────────────────────────────
-- send_queue worker scans by status='queued' ordered by created_at every
-- minute. Without this index, every tick is a Seq Scan that gets worse as
-- the queue grows.
CREATE INDEX IF NOT EXISTS idx_send_queue_status_created
  ON send_queue (status, created_at);

-- Account routing by platform (warmup, health, etc.)
CREATE INDEX IF NOT EXISTS idx_accounts_platform
  ON accounts (platform);

-- Inbox + reply detection lookups (Phase 2 next-block work)
CREATE INDEX IF NOT EXISTS idx_messages_account_created
  ON messages (account_id, created_at DESC);

-- morning-digest scans 24h of send_log per account
CREATE INDEX IF NOT EXISTS idx_send_log_account_created
  ON send_log (account_id, created_at DESC);

-- cost-cap + sweep-stuck-runs scan workflow_runs by status
CREATE INDEX IF NOT EXISTS idx_workflow_runs_status_created
  ON workflow_runs (status, created_at DESC);

-- ── Wave 2.2: atomic sends_today increment ───────────────────────────────
-- Race-free counter. Cap check happens INSIDE the function so two parallel
-- callers can't both pass a stale read.
--
-- Returns the new sends_today value, or NULL if the cap would be exceeded.
-- Caller treats NULL as "skip — daily cap reached for this account."
CREATE OR REPLACE FUNCTION increment_sends_today(p_account_id UUID)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  new_count INT;
BEGIN
  UPDATE accounts
     SET sends_today = COALESCE(sends_today, 0) + 1,
         last_used_at = NOW()
   WHERE account_id = p_account_id
     AND COALESCE(sends_today, 0) + 1 <= COALESCE(daily_limit, 999)
   RETURNING sends_today INTO new_count;
  RETURN new_count;  -- NULL if cap would have been exceeded
END
$$;

-- Variant that uses TEXT account_id for callers that store account_id as text.
-- The codebase mixes both shapes; this overload keeps the call site simple.
CREATE OR REPLACE FUNCTION increment_sends_today_text(p_account_id TEXT)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  new_count INT;
BEGIN
  UPDATE accounts
     SET sends_today = COALESCE(sends_today, 0) + 1,
         last_used_at = NOW()
   WHERE account_id::TEXT = p_account_id
     AND COALESCE(sends_today, 0) + 1 <= COALESCE(daily_limit, 999)
   RETURNING sends_today INTO new_count;
  RETURN new_count;
END
$$;
