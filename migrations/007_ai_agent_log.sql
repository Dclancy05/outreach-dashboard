-- Phase 4 — AI self-heal agent log
-- Source of truth: automations-page-spec.md (Dylan 2026-04-18/19)
--
-- An earlier `ai_agent_log` already exists in the DB from the old VNC-debug
-- scaffolding (columns: vnc_session_id, event_type, platform, details,
-- screenshot_url, created_at). That row set is empty in production, so this
-- migration is ADDITIVE — we attach the self-heal columns Phase 4 needs
-- without dropping the old shape (so nothing else that imports the table
-- breaks if it referenced the legacy columns).
--
-- Flow: automations emit `open` rows when a step fails → /api/ai-agent/scan
-- drafts a proposed_fix and flips to `proposed` → Dylan/UI can
-- apply/reject → `applied` / `rejected` (both set `resolved_at`).

CREATE TABLE IF NOT EXISTS ai_agent_log (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- automation_id / run_id are TEXT to match the live schema of automations.id
-- and automation_runs.id (both are text in production, not uuid as the 005
-- migration DDL implies — see migration note).
ALTER TABLE ai_agent_log
  ADD COLUMN IF NOT EXISTS automation_id        text,
  ADD COLUMN IF NOT EXISTS run_id               text,
  ADD COLUMN IF NOT EXISTS failed_step_index    integer,
  ADD COLUMN IF NOT EXISTS error                text,
  ADD COLUMN IF NOT EXISTS selectors_snapshot   jsonb,
  ADD COLUMN IF NOT EXISTS screenshot_url       text,
  ADD COLUMN IF NOT EXISTS proposed_fix         jsonb,
  ADD COLUMN IF NOT EXISTS status               text DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS resolved_at          timestamptz;

-- Status check: only the 4 states the spec defines. Legacy rows won't have
-- status set, so we allow NULL too (the routes always filter explicitly).
ALTER TABLE ai_agent_log DROP CONSTRAINT IF EXISTS ai_agent_log_status_check;
ALTER TABLE ai_agent_log
  ADD CONSTRAINT ai_agent_log_status_check
  CHECK (status IS NULL OR status IN ('open','proposed','applied','rejected'));

-- FK to automation_runs — nullable because production self-heal pushes rows
-- even before the run row is finalized (and older replay events don't have
-- a run_id).
ALTER TABLE ai_agent_log DROP CONSTRAINT IF EXISTS ai_agent_log_run_id_fkey;
ALTER TABLE ai_agent_log
  ADD CONSTRAINT ai_agent_log_run_id_fkey
  FOREIGN KEY (run_id) REFERENCES automation_runs(id) ON DELETE SET NULL;

-- Hot-path index: the scan endpoint always queries
--   WHERE status='open' ORDER BY created_at DESC LIMIT 10
CREATE INDEX IF NOT EXISTS ai_agent_log_status_created_idx
  ON ai_agent_log (status, created_at DESC);
