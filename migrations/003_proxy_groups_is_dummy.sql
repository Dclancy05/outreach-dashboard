-- Add is_dummy flag to proxy_groups so exactly one group can be designated
-- as the global "dummy" group used by the Automations Live View / recording flow.
-- Application code enforces the uniqueness, but we add a partial unique index
-- as a safety net so only one row can ever have is_dummy = true.

ALTER TABLE proxy_groups
  ADD COLUMN IF NOT EXISTS is_dummy BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS proxy_groups_single_dummy_idx
  ON proxy_groups ((is_dummy))
  WHERE is_dummy = true;
