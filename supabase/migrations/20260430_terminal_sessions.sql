-- ============================================================
-- Terminal Sessions — Persistent Multi-Terminal Workspace
-- ============================================================
-- Backs the /agency/terminals workspace. Each row is one tmux
-- session running on the VPS terminal-server. The server inserts
-- on create, updates last_activity_at via heartbeat, and flips
-- status to 'stopped'|'crashed' on exit. The dashboard reads this
-- to render the session list + activity feed without needing a
-- direct call to the VPS for state queries.
--
-- Source of truth for "is this session alive" is `tmux has-session`
-- on the VPS — this table is a fast-read mirror, not authoritative.
--
-- Apply via: psql / Supabase dashboard / supabase db push
-- ============================================================

CREATE TABLE IF NOT EXISTS terminal_sessions (
  id                  UUID PRIMARY KEY,
  title               TEXT NOT NULL,
  status              TEXT NOT NULL CHECK (status IN ('starting','running','idle','stopped','crashed','paused'))
                                    DEFAULT 'starting',
  -- Git state — each session works on its own branch in its own worktree.
  branch              TEXT,
  worktree_path       TEXT,
  -- Self-reported coordination state (Phase 2 fills these in).
  current_task        TEXT,
  files_touched       TEXT[] DEFAULT '{}',
  -- Cost / token telemetry (parsed from claude --output-format=json by the
  -- terminal-server's session-end hook).
  cost_usd            NUMERIC(10,4) DEFAULT 0,
  total_tokens        INTEGER DEFAULT 0,
  -- Telegram link — set when /spawn was used so notifications back to that
  -- chat (approval prompts, completion) thread correctly.
  telegram_chat_id    TEXT,
  -- UI state.
  hidden              BOOLEAN DEFAULT FALSE,
  -- Lifecycle timestamps.
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at         TIMESTAMPTZ
);

-- Common queries: list active sessions ordered by recency.
CREATE INDEX IF NOT EXISTS idx_terminal_sessions_status_activity
  ON terminal_sessions (status, last_activity_at DESC);

-- Common query: "find sessions touching this file" — used by the awareness
-- block that ships in Phase 2. GIN index on the array makes it fast.
CREATE INDEX IF NOT EXISTS idx_terminal_sessions_files_touched
  ON terminal_sessions USING GIN (files_touched);

-- updated_at-style trigger: bump last_activity_at on any update so heartbeats
-- aren't the only thing keeping it fresh.
CREATE OR REPLACE FUNCTION touch_terminal_session_activity()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.last_activity_at = OLD.last_activity_at THEN
    NEW.last_activity_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_terminal_sessions_touch ON terminal_sessions;
CREATE TRIGGER trg_terminal_sessions_touch
  BEFORE UPDATE ON terminal_sessions
  FOR EACH ROW EXECUTE FUNCTION touch_terminal_session_activity();

-- RLS off — service role only writes here from the VPS terminal-server, and
-- the dashboard reads via the service-role client. No user-facing RLS needed.
ALTER TABLE terminal_sessions DISABLE ROW LEVEL SECURITY;
