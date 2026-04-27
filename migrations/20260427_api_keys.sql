-- Centralized API key store: one source of truth for every secret the app reads
-- at runtime via getSecret(env_var). Rows are admin-only (RLS service_role policy);
-- the legacy system_settings.integration_key_* shape stays alive as a fallback so
-- existing deploys don't break during rollout.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS api_keys (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  provider     TEXT NOT NULL,
  env_var      TEXT NOT NULL,
  value        TEXT NOT NULL,
  expires_at   TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS api_keys_env_var_idx
  ON api_keys (env_var);

CREATE INDEX IF NOT EXISTS api_keys_env_updated_desc_idx
  ON api_keys (env_var, updated_at DESC);

CREATE INDEX IF NOT EXISTS api_keys_expires_idx
  ON api_keys (expires_at)
  WHERE expires_at IS NOT NULL;

CREATE OR REPLACE FUNCTION api_keys_touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_api_keys_touch ON api_keys;
CREATE TRIGGER trg_api_keys_touch
  BEFORE UPDATE ON api_keys
  FOR EACH ROW EXECUTE FUNCTION api_keys_touch_updated_at();

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON api_keys FROM anon;
REVOKE ALL ON api_keys FROM authenticated;

DROP POLICY IF EXISTS "api_keys service role only" ON api_keys;
CREATE POLICY "api_keys service role only"
  ON api_keys
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
