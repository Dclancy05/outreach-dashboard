-- Warmup automation columns
-- Tracks which accounts are under auto-warmup so a cron job can tick them
-- through days 1..N of their assigned warmup_sequence without VA input.
--
-- warmup_day advances by 1 at 00:00 UTC on days where warmup_last_sent_at is
-- set (i.e. the account actually sent its quota the day before).
-- warmup_paused blocks the ticker for flagged / banned / manually-held accounts.
-- warmup_started_at snapshots when the ramp began so we can compute expected
-- vs actual progress on the warmup dashboard.

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS warmup_day integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS warmup_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS warmup_last_ticked_at timestamptz,
  ADD COLUMN IF NOT EXISTS warmup_last_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS warmup_paused boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS session_cookie_imported_at timestamptz;

CREATE INDEX IF NOT EXISTS accounts_warmup_active_idx
  ON accounts (warmup_sequence_id, warmup_paused, status)
  WHERE warmup_sequence_id IS NOT NULL AND warmup_paused = false;

-- Cron run log — one row per tick, lets us debug slow ramps
CREATE TABLE IF NOT EXISTS warmup_tick_log (
  id bigserial PRIMARY KEY,
  ran_at timestamptz NOT NULL DEFAULT now(),
  accounts_advanced integer NOT NULL DEFAULT 0,
  accounts_skipped integer NOT NULL DEFAULT 0,
  notes text
);
