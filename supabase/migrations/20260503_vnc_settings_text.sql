-- Hotfix for Wave 1.6 migration. The original 20260503_vnc_health_log.sql
-- declared account_vnc_settings.account_id as UUID, but the rest of the
-- codebase stores account_id as TEXT (e.g. "facebook_mo4wk9by"). Selecting
-- by a TEXT slug against a UUID column makes Postgres throw, which made
-- /api/accounts/[id]/vnc-settings return 500 on the popup-login flow.
--
-- Drop and recreate as TEXT. Safe because the table was just introduced
-- and has no data yet.

DROP TABLE IF EXISTS account_vnc_settings CASCADE;

CREATE TABLE IF NOT EXISTS account_vnc_settings (
  account_id  TEXT PRIMARY KEY,
  quality     INT NOT NULL DEFAULT 4 CHECK (quality BETWEEN 0 AND 9),
  compression INT NOT NULL DEFAULT 7 CHECK (compression BETWEEN 0 AND 9),
  adaptive    BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
