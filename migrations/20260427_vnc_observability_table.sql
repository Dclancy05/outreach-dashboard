-- 2026-04-27 — vnc_observability table (catch-up migration)
--
-- Lightweight client/server logging sink for the embedded noVNC login flow.
-- The route at src/app/api/observability/vnc/route.ts (line 37) inserts a
-- row every time the VNC tab observes an unexpected URL — e.g. the
-- "I asked for Instagram login but the tab opened LinkedIn" misroute bug.
-- The route already wraps the insert in try/catch so a missing table is a
-- no-op, but we want the table to actually exist so we can query
-- systemic misroutes from the dashboard instead of tailing browser logs.
--
-- Idempotent: CREATE TABLE / CREATE INDEX use IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS vnc_observability (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind                TEXT NOT NULL DEFAULT 'vnc_event',
  requested_platform  TEXT,
  expected_url        TEXT,
  actual_url          TEXT,
  session_id          TEXT,
  account_id          TEXT,
  detail              JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vnc_observability_session_idx
  ON vnc_observability (session_id);

CREATE INDEX IF NOT EXISTS vnc_observability_account_idx
  ON vnc_observability (account_id);

CREATE INDEX IF NOT EXISTS vnc_observability_created_idx
  ON vnc_observability (created_at DESC);
