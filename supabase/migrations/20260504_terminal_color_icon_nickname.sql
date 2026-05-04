-- ============================================================
-- Terminal Sessions — Per-session color, icon, nickname
-- ============================================================
-- Phase 4 #7 of the enterprise-quality terminals overhaul.
--
-- Lets each terminal pick from a small fixed palette of colors and
-- a small fixed set of icons, plus a free-form nickname (an alias
-- shown alongside title/branch in headers, sidebar rows, activity
-- feed lines, and Telegram notifications).
--
-- Three plain TEXT columns rather than enums — the UI guards the
-- valid set, and Postgres CHECK constraints are skipped to keep
-- iteration cheap (we may add more colors/icons over time without
-- migrations).
--
-- Apply via: Supabase Management API or supabase db push.
-- ============================================================

ALTER TABLE terminal_sessions
  ADD COLUMN IF NOT EXISTS color    TEXT,   -- e.g. "cyan", "amber", "rose"
  ADD COLUMN IF NOT EXISTS icon     TEXT,   -- e.g. "terminal", "rocket", "bug"
  ADD COLUMN IF NOT EXISTS nickname TEXT;   -- short user-chosen alias
