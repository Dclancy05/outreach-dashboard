-- Phase 1A Batch 2: add hashed PIN column to team_members.
-- Leaves plaintext `pin` column in place for transition. A FOLLOW-UP migration
-- will drop `pin` once all rows have `pin_hash` and login is confirmed working.

ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS pin_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_team_members_pin_hash ON team_members(pin_hash);
