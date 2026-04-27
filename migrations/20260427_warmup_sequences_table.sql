-- 2026-04-27 — warmup_sequences table (catch-up migration)
--
-- This table already exists in production but was never captured as a
-- migration. We define it here so a fresh Supabase project can be brought
-- up cleanly, and so future schema changes have a baseline to ALTER from.
--
-- Used by:
--   * src/app/api/warmup/route.ts (full CRUD: list / create / update /
--     delete / assign-to-account)
--   * accounts.warmup_sequence_id references rows here (loose ref — text
--     id, no FK because old accounts may still point at deleted sequences
--     and we'd rather null-out via app code than ON DELETE CASCADE).
--
-- Column shape mirrors the row that route.ts writes:
--   { id, name, platform, business_id, steps, created_at, updated_at }
-- where `steps` is an array of { day_start, day_end, daily_limit } objects
-- describing how a fresh account ramps up its daily send cap.
--
-- Idempotent: CREATE TABLE / CREATE INDEX use IF NOT EXISTS, the trigger
-- function is OR REPLACE, and trigger creation is wrapped in DROP+CREATE.

CREATE TABLE IF NOT EXISTS warmup_sequences (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  platform    TEXT,
  business_id TEXT NOT NULL DEFAULT 'default',
  steps       JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS warmup_sequences_business_idx
  ON warmup_sequences (business_id);

CREATE INDEX IF NOT EXISTS warmup_sequences_platform_idx
  ON warmup_sequences (platform);

-- ─── auto-update updated_at ──────────────────────────────────────────────
-- Reuses the same trigger pattern as 008_memory_system.sql. We define a
-- local function (warmup_sequences_touch_updated_at) instead of reusing
-- memory_touch_updated_at so this file stays self-contained and can ship
-- before/after the memory migration without ordering issues.

CREATE OR REPLACE FUNCTION warmup_sequences_touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_warmup_sequences_touch ON warmup_sequences;
CREATE TRIGGER trg_warmup_sequences_touch
  BEFORE UPDATE ON warmup_sequences
  FOR EACH ROW EXECUTE FUNCTION warmup_sequences_touch_updated_at();
