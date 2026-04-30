-- ============================================================
-- Terminal Sessions — Phase C: events for the activity feed
-- ============================================================
-- A small append-only log so the right-rail Activity Feed has a
-- single ordered stream to read. Insert paths:
--   - terminal-server: cost_cap_tripped, crash, respawn, wallclock_warning,
--     file_changed (from git status diff in the sibling-writer loop)
--   - Future: PreToolUse hooks emitting tool_call events
--
-- Apply via: psql / Supabase dashboard / supabase db push
-- ============================================================

CREATE TABLE IF NOT EXISTS terminal_events (
  id          BIGSERIAL PRIMARY KEY,
  session_id  UUID NOT NULL REFERENCES terminal_sessions(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  -- Free-form event details (file path, cost amount, error text, etc.).
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Recent-events query: show the last N for the workspace feed.
CREATE INDEX IF NOT EXISTS idx_terminal_events_created_at
  ON terminal_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_terminal_events_session
  ON terminal_events (session_id, created_at DESC);

ALTER TABLE terminal_events DISABLE ROW LEVEL SECURITY;
