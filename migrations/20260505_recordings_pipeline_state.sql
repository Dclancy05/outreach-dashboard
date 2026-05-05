-- Phase D: real progress pipeline for the RecordingModal.
--
-- Adds three columns to the `recordings` table that the new
-- /api/recordings/[id]/pipeline-status endpoint reads, and that the three
-- pipeline routes (analyze → build-automation → self-test) update on entry/
-- exit so the UI can show truthful progress instead of the fake 200ms timer
-- that lived in the modal pre-Phase-D.
--
-- Columns:
--   pipeline_phase       text    -- "analyzing" | "building" | "self_testing"
--                                -- | "auto_repairing" | "active" | "needs_rerecording"
--   pipeline_percent     int     -- 0..100, monotonic per recording
--   pipeline_started_at  timestamptz  -- set when /stop kicks the pipeline off
--
-- Existing rows get NULL for all three (treated by the API as "phase unknown,
-- pipeline never ran" — the UI degrades to the legacy success view in that
-- case so backfilling old recordings is unnecessary).

ALTER TABLE recordings
  ADD COLUMN IF NOT EXISTS pipeline_phase       text,
  ADD COLUMN IF NOT EXISTS pipeline_percent     int,
  ADD COLUMN IF NOT EXISTS pipeline_started_at  timestamptz;

-- Index on pipeline_phase + updated_at so the Maintenance tab and the
-- pipeline-status poll endpoint can quickly fetch in-flight recordings
-- without scanning the full table.
CREATE INDEX IF NOT EXISTS idx_recordings_pipeline_phase
  ON recordings (pipeline_phase, updated_at DESC)
  WHERE pipeline_phase IS NOT NULL;

-- Sanity check: rollback path is `ALTER TABLE recordings DROP COLUMN ...` x3
-- + `DROP INDEX idx_recordings_pipeline_phase`. Safe to drop because nothing
-- in the existing app reads these columns until Phase D code merges.
