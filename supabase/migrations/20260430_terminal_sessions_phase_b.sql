-- ============================================================
-- Terminal Sessions — Phase B follow-up
-- ============================================================
-- Adds the columns the terminal-server's watcher loops need to
-- enforce per-session cost caps, wallclock caps, crash recovery,
-- and Memory Vault transcript autosave.
--
-- Apply via: psql / Supabase dashboard / supabase db push
-- ============================================================

ALTER TABLE terminal_sessions
  -- Per-session cost cap. Defaults to $5; the cost watcher trips when
  -- cost_usd >= cost_cap_usd, sends a SIGINT (Ctrl-C) to the tmux pane,
  -- flips status='paused', and pings Telegram.
  ADD COLUMN IF NOT EXISTS cost_cap_usd NUMERIC(10,4) DEFAULT 5.00,

  -- Per-session wallclock cap in minutes. Defaults to 4 hours. The
  -- wallclock watcher pings Telegram once when crossed (then sets
  -- wallclock_warned_at to avoid spamming).
  ADD COLUMN IF NOT EXISTS wallclock_cap_minutes INTEGER DEFAULT 240,
  ADD COLUMN IF NOT EXISTS wallclock_warned_at TIMESTAMPTZ,

  -- Crash counter. The crash watcher detects when a tmux session vanishes
  -- without a graceful kill, increments this, respawns with --continue
  -- on the first crash, pings Telegram + stops respawning on the second.
  ADD COLUMN IF NOT EXISTS crashes INTEGER DEFAULT 0,

  -- Why the session is paused (cost / wallclock / approval / etc.). UI
  -- shows this as a badge on the session card.
  ADD COLUMN IF NOT EXISTS paused_reason TEXT,

  -- Path inside /root/memory-vault/ where killSession dumped the final
  -- tmux scrollback. Used by the Conversations tab to link transcripts.
  ADD COLUMN IF NOT EXISTS transcript_path TEXT;
