-- Phase E: AI auto-repair attribution.
--
-- automation_test_log gains 3 columns so the failure card + Maintenance
-- side-sheet can show "this fix was proposed by George" and link back to
-- the agent-runner conversation that produced the new selector.
--
-- Columns:
--   repaired_by_ai   bool        -- true when the winning attempt came from /agents/run
--   repair_attempts  int         -- how many AI calls before this success/failure
--   repair_log_id    uuid        -- correlation id into agent-runner conversation log
--                                -- (matches the run_id agent-runner returns)
--
-- All columns are NULL by default; existing rows aren't backfilled because
-- pre-Phase-E test runs predate the auto-repair strategy.

ALTER TABLE automation_test_log
  ADD COLUMN IF NOT EXISTS repaired_by_ai   bool,
  ADD COLUMN IF NOT EXISTS repair_attempts  int,
  ADD COLUMN IF NOT EXISTS repair_log_id    uuid;

-- Helper view for the Maintenance "Repaired by AI" badge: rolls up the
-- last AI repair (if any) per automation. Cheaper than scanning the full
-- test log every render. Best-effort — if the underlying view fails
-- (e.g., column added but FK changed in a future migration) the badge
-- just doesn't render.
CREATE OR REPLACE VIEW v_automation_last_repair AS
  SELECT DISTINCT ON (automation_id)
    automation_id,
    created_at AS last_repair_at,
    repair_log_id,
    error_message AS last_repair_error,
    success AS last_repair_success
  FROM automation_test_log
  WHERE automation_id IS NOT NULL AND repaired_by_ai = true
  ORDER BY automation_id, created_at DESC;

-- Rollback:
--   DROP VIEW IF EXISTS v_automation_last_repair;
--   ALTER TABLE automation_test_log
--     DROP COLUMN IF EXISTS repair_log_id,
--     DROP COLUMN IF EXISTS repair_attempts,
--     DROP COLUMN IF EXISTS repaired_by_ai;
