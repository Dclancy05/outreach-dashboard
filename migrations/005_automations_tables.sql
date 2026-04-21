-- Automations platform tables (P2.0)
-- Source of truth spec: /outreach-dashboard/automations-page-spec.md
--
-- NOTE: `automations`, `automation_runs`, and `automation_dummy_selection`
-- already existed in this project with an earlier (looser) schema. This
-- migration is additive: it creates the tables if they don't exist and
-- ADDs any missing columns / indexes the spec requires, so we don't drop
-- data from prior iterations.
--
-- Tables produced:
--   automations                 (id, name, platform, status, tag, description,
--                                steps, timestamps, last_tested_at, last_error,
--                                health_score, account_id)
--   automation_runs             (id, automation_id, run_type, status, timing,
--                                error, steps_completed, screenshot_urls,
--                                healed_step_index)
--   automation_dummy_selection  (proxy_group_id pk/fk, account_id fk, updated_at)
--
-- Status semantics:
--   draft / needs_recording / active / needs_rerecording / fixing / broken
--
-- Tag routes automations into the right surface:
--   outreach_action / lead_enrichment / utility

-- ─── automations ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS automations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  platform        text NOT NULL,
  status          text NOT NULL DEFAULT 'draft',
  tag             text,
  description     text,
  steps           jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  last_tested_at  timestamptz,
  last_error      text,
  health_score    integer NOT NULL DEFAULT 100,
  account_id      uuid
);

-- Backfill any columns missing from a pre-existing table.
ALTER TABLE automations
  ADD COLUMN IF NOT EXISTS tag            text,
  ADD COLUMN IF NOT EXISTS last_tested_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error     text,
  ADD COLUMN IF NOT EXISTS health_score   integer DEFAULT 100,
  ADD COLUMN IF NOT EXISTS account_id     uuid;

-- Drop any old spec-mismatched check constraints, then install the
-- status + tag checks this spec requires.
ALTER TABLE automations DROP CONSTRAINT IF EXISTS automations_status_check;
ALTER TABLE automations
  ADD CONSTRAINT automations_status_check
  CHECK (status IN ('draft','needs_recording','active','needs_rerecording','fixing','broken'));

ALTER TABLE automations DROP CONSTRAINT IF EXISTS automations_tag_check;
ALTER TABLE automations
  ADD CONSTRAINT automations_tag_check
  CHECK (tag IS NULL OR tag IN ('outreach_action','lead_enrichment','utility'));

CREATE INDEX IF NOT EXISTS automations_status_idx
  ON automations (status);

-- ─── automation_runs ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS automation_runs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id       uuid NOT NULL,
  run_type            text NOT NULL,
  status              text NOT NULL,
  started_at          timestamptz NOT NULL DEFAULT now(),
  finished_at         timestamptz,
  error               text,
  steps_completed     integer,
  screenshot_urls     jsonb,
  healed_step_index   integer
);

ALTER TABLE automation_runs
  ADD COLUMN IF NOT EXISTS run_type          text,
  ADD COLUMN IF NOT EXISTS finished_at       timestamptz,
  ADD COLUMN IF NOT EXISTS error             text,
  ADD COLUMN IF NOT EXISTS steps_completed   integer,
  ADD COLUMN IF NOT EXISTS screenshot_urls   jsonb,
  ADD COLUMN IF NOT EXISTS healed_step_index integer;

ALTER TABLE automation_runs DROP CONSTRAINT IF EXISTS automation_runs_run_type_check;
ALTER TABLE automation_runs
  ADD CONSTRAINT automation_runs_run_type_check
  CHECK (run_type IS NULL OR run_type IN ('manual','maintenance','campaign','replay'));

ALTER TABLE automation_runs DROP CONSTRAINT IF EXISTS automation_runs_status_check;
ALTER TABLE automation_runs
  ADD CONSTRAINT automation_runs_status_check
  CHECK (status IN ('running','passed','failed','healed'));

CREATE INDEX IF NOT EXISTS automation_runs_automation_started_idx
  ON automation_runs (automation_id, started_at DESC);

-- ─── automation_dummy_selection ─────────────────────────────────────
-- proxy_groups.id and accounts.account_id are TEXT in this schema, so the
-- FK columns here are TEXT to match.
CREATE TABLE IF NOT EXISTS automation_dummy_selection (
  proxy_group_id  text PRIMARY KEY,
  account_id      text,
  updated_at      timestamptz NOT NULL DEFAULT now()
);
