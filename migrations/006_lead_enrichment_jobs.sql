-- Lead enrichment jobs queue (P6.x)
--
-- A request surface for the "Enrich Leads" modal on the Leads page. Each row
-- captures a submission: which fields to enrich, which leads it applies to,
-- which automation runs the enrichment. The actual enrichment worker (reads
-- `status='queued'` → flips to `running` → writes `done|failed`) lives in a
-- separate workstream; this table is the hand-off point.
--
-- Scope:
--   selected   → lead_ids is NOT NULL and holds the explicit set
--   missing    → lead_ids is NULL; worker picks all leads missing any of
--                the requested fields (within the business scope of the
--                creating user; business filtering TBD)

-- Note: leads.lead_id is TEXT in this project's schema (see 002_outreach_platform_v3),
-- so lead_ids here is TEXT[] to match. The spec originally called for UUID[]; we
-- chose the matching type so FK joins on lead_id work without casts.
CREATE TABLE IF NOT EXISTS lead_enrichment_jobs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope          text NOT NULL,
  lead_ids       text[],
  fields         text[] NOT NULL,
  automation_id  uuid,
  status         text NOT NULL DEFAULT 'queued',
  created_at     timestamptz NOT NULL DEFAULT now(),
  started_at     timestamptz,
  finished_at    timestamptz,
  error          text
);

-- Additive safety (in case an older version of this table exists)
ALTER TABLE lead_enrichment_jobs
  ADD COLUMN IF NOT EXISTS scope         text,
  ADD COLUMN IF NOT EXISTS lead_ids      text[],
  ADD COLUMN IF NOT EXISTS fields        text[],
  ADD COLUMN IF NOT EXISTS automation_id uuid,
  ADD COLUMN IF NOT EXISTS status        text,
  ADD COLUMN IF NOT EXISTS created_at    timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS started_at    timestamptz,
  ADD COLUMN IF NOT EXISTS finished_at   timestamptz,
  ADD COLUMN IF NOT EXISTS error         text;

ALTER TABLE lead_enrichment_jobs DROP CONSTRAINT IF EXISTS lead_enrichment_jobs_scope_check;
ALTER TABLE lead_enrichment_jobs
  ADD CONSTRAINT lead_enrichment_jobs_scope_check
  CHECK (scope IN ('selected','missing'));

ALTER TABLE lead_enrichment_jobs DROP CONSTRAINT IF EXISTS lead_enrichment_jobs_status_check;
ALTER TABLE lead_enrichment_jobs
  ADD CONSTRAINT lead_enrichment_jobs_status_check
  CHECK (status IN ('queued','running','done','failed'));

-- Worker picks the oldest queued job; this index keeps that scan cheap.
CREATE INDEX IF NOT EXISTS lead_enrichment_jobs_status_created_idx
  ON lead_enrichment_jobs (status, created_at);
