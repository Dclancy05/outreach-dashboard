-- ============================================================
-- Terminal Sessions — Explicit 6-state lifecycle column
-- ============================================================
-- Phase 4 #11 of the enterprise-quality terminals overhaul.
--
-- The existing `status` column is a 6-value enum used by older
-- watchers (starting / running / idle / stopped / crashed / paused).
-- We add a parallel `lifecycle_state` column with a slightly
-- different vocabulary aligned to the new dashboard surface:
--
--   starting        — tmux spawning, bootstrap script not done
--   running         — last assistant message under 30s ago
--   awaiting-input  — Claude is waiting on the user (idle prompt)
--   paused          — cost cap / wallclock cap / approval pending
--   errored         — crash watcher tripped, cost cap hit, etc.
--   done            — graceful exit (claude --resume succeeded, /quit)
--
-- Derived from existing watcher signals:
--   - Cost watcher: when cost_usd >= cost_cap_usd → 'errored'
--   - Crash watcher: tmux gone + crashes>=2 → 'errored', else 'done'
--   - Default for a live row: 'running'
--   - Override 'awaiting-input' from the 30s siblings watcher (Phase 5)
--
-- We keep `status` for backwards compatibility — old code paths still
-- read it. New UI reads `lifecycle_state` and falls back to `status`
-- if NULL (e.g. for rows from before the migration).
--
-- Apply via: Supabase Management API or supabase db push.
-- ============================================================

ALTER TABLE terminal_sessions
  ADD COLUMN IF NOT EXISTS lifecycle_state TEXT
    CHECK (lifecycle_state IS NULL OR lifecycle_state IN (
      'starting','running','awaiting-input','paused','errored','done'
    ));

-- Backfill: derive a reasonable lifecycle_state from existing status.
UPDATE terminal_sessions SET lifecycle_state = CASE
  WHEN status = 'starting' THEN 'starting'
  WHEN status = 'running'  THEN 'running'
  WHEN status = 'idle'     THEN 'awaiting-input'
  WHEN status = 'paused'   THEN 'paused'
  WHEN status = 'crashed'  THEN 'errored'
  WHEN status = 'stopped'  THEN 'done'
  ELSE NULL
END
WHERE lifecycle_state IS NULL;
