-- Wave 1.3 — VNC lag telemetry sink + Wave 1.5 — VNC events audit log
--
-- vnc_health_log    : every-5-second snapshot of FPS, ping, freeze ms during
--                     a noVNC session. Source for the observability sparkline
--                     widget and for cross-run lag-baseline comparisons.
-- vnc_observability : pre-existing event log (URL mismatch tracking).
--                     Extended here with index for fast session lookup.

CREATE TABLE IF NOT EXISTS vnc_health_log (
  id          BIGSERIAL PRIMARY KEY,
  session_id  TEXT,
  account_id  UUID,
  fps         INT,
  ping_ms     INT,
  freeze_ms   INT,
  quality     INT,
  compression INT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vnc_health_log_session_created
  ON vnc_health_log (session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vnc_health_log_created
  ON vnc_health_log (created_at DESC);

-- vnc_observability already exists (referenced by /api/observability/vnc
-- since at least 2026-04). Add an index in case it's missing.
CREATE TABLE IF NOT EXISTS vnc_observability (
  id                 BIGSERIAL PRIMARY KEY,
  kind               TEXT,
  requested_platform TEXT,
  expected_url       TEXT,
  actual_url         TEXT,
  session_id         TEXT,
  account_id         UUID,
  detail             JSONB,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vnc_observability_session_created
  ON vnc_observability (session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vnc_observability_kind_created
  ON vnc_observability (kind, created_at DESC);

-- Wave 1.6 — Per-account VNC display settings
CREATE TABLE IF NOT EXISTS account_vnc_settings (
  account_id  UUID PRIMARY KEY,
  quality     INT NOT NULL DEFAULT 4 CHECK (quality BETWEEN 0 AND 9),
  compression INT NOT NULL DEFAULT 7 CHECK (compression BETWEEN 0 AND 9),
  adaptive    BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
