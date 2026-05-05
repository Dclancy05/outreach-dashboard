-- Phase D: unblock Phase E (auto-repair attribution).
--
-- automation_test_log has had `script_id uuid` (legacy `automation_scripts`
-- foreign key) since migration 007, but the new Phase-2 `automations` table
-- has no FK back into the log. Self-test currently writes script_id=NULL
-- when running against an `automations` row, which makes it impossible to
-- aggregate "all attempts for automation X" — Phase E's auto-repair badge
-- on the Maintenance tab depends on this.
--
-- Adding a nullable automation_id column with ON DELETE SET NULL keeps
-- existing rows valid (script_id stays populated for legacy script tests)
-- while letting new tests attribute to the unified automations table.

ALTER TABLE automation_test_log
  ADD COLUMN IF NOT EXISTS automation_id uuid
    REFERENCES automations(id) ON DELETE SET NULL;

-- Index for the most common query: "fetch the last N attempts for this
-- automation" (used by the failure card in RecordingModal + the auto-repair
-- side-sheet in MaintenanceTab).
CREATE INDEX IF NOT EXISTS idx_test_log_automation_id_created
  ON automation_test_log (automation_id, created_at DESC)
  WHERE automation_id IS NOT NULL;

-- Rollback: ALTER TABLE automation_test_log DROP COLUMN automation_id;
