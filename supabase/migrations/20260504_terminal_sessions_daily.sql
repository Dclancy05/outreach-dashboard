-- ============================================================
-- Terminal Sessions — per-day cost rollup view
-- ============================================================
-- Phase 4 #3 of the enterprise-quality terminals overhaul.
--
-- Surfaces "what did I spend today across all sessions?" in a single
-- query. The dashboard's TerminalPane reads this for the per-day
-- counter strip ("$X.XX / $Y.YY today").
--
-- Single global rollup per day (we don't have per-user terminals on
-- the dashboard yet — every admin shares the workspace). When user
-- scoping arrives, replace the GROUP BY with `created_at::date, user_id`.
--
-- Apply via: Supabase Management API or supabase db push.
-- ============================================================

CREATE OR REPLACE VIEW terminal_sessions_daily AS
SELECT
  date_trunc('day', created_at)::date     AS day,
  COUNT(*)                                AS session_count,
  COALESCE(SUM(cost_usd), 0)::NUMERIC(12,4) AS cost_usd_total,
  COALESCE(SUM(total_tokens), 0)::BIGINT  AS tokens_total
FROM terminal_sessions
GROUP BY date_trunc('day', created_at);
