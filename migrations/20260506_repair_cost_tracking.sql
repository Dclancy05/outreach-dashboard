-- Phase E-2: per-call cost tracking for agent_repair attempts.
--
-- Adds cost_cents int to automation_test_log so we can aggregate per
-- automation and enforce a $2 cap before invoking the agent-runner.
-- Cents (not dollars) to dodge float precision issues — the cap is
-- compared as `SUM(cost_cents) >= 200`.
--
-- Existing rows get NULL (treated as 0 by the COALESCE in the SQL
-- aggregate), so backfilling old test runs is unnecessary.

ALTER TABLE automation_test_log
  ADD COLUMN IF NOT EXISTS cost_cents int;

-- Index for the cost-cap query: "sum cost_cents per automation_id where
-- the strategy was agent_repair." The partial index keeps it small —
-- 99% of test_log rows are deterministic strategies that won't hit it.
CREATE INDEX IF NOT EXISTS idx_test_log_repair_cost
  ON automation_test_log (automation_id)
  WHERE repaired_by_ai = true AND cost_cents IS NOT NULL;

-- Rollback:
--   DROP INDEX IF EXISTS idx_test_log_repair_cost;
--   ALTER TABLE automation_test_log DROP COLUMN cost_cents;
