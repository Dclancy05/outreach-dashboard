-- 20260423_audit_log.sql
-- Greenfield audit log + rate-limit buckets. Service-role only — no browser reads.

-- ── audit_log ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id          bigserial PRIMARY KEY,
  user_id     text,
  action      text,
  resource    text,
  payload     jsonb,
  ip          inet,
  ua          text,
  ts          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_ts_desc_idx
  ON audit_log (ts DESC);

CREATE INDEX IF NOT EXISTS audit_log_user_ts_idx
  ON audit_log (user_id, ts DESC);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Revoke blanket access for anon + authenticated browser roles.
-- Only the service_role (used via SUPABASE_SERVICE_ROLE_KEY from API routes) can touch it.
REVOKE ALL ON audit_log FROM anon;
REVOKE ALL ON audit_log FROM authenticated;

DROP POLICY IF EXISTS "audit_log service role only" ON audit_log;
CREATE POLICY "audit_log service role only"
  ON audit_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── rate_limit_buckets ──────────────────────────────────────────────
-- Simple token-bucket-lite: one row per (key, window_start).
-- Expired rows pruned opportunistically on write.
CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  key          text NOT NULL,
  window_start timestamptz NOT NULL,
  count        integer NOT NULL DEFAULT 0,
  reset_at     timestamptz NOT NULL,
  PRIMARY KEY (key, window_start)
);

CREATE INDEX IF NOT EXISTS rate_limit_buckets_reset_idx
  ON rate_limit_buckets (reset_at);

ALTER TABLE rate_limit_buckets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON rate_limit_buckets FROM anon;
REVOKE ALL ON rate_limit_buckets FROM authenticated;

DROP POLICY IF EXISTS "rate_limit_buckets service role only" ON rate_limit_buckets;
CREATE POLICY "rate_limit_buckets service role only"
  ON rate_limit_buckets
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Atomic increment via RPC. Returns the new count + reset_at.
-- Service-role only (see grants below).
CREATE OR REPLACE FUNCTION rate_limit_hit(
  p_key        text,
  p_window_ms  bigint,
  p_limit      integer
)
RETURNS TABLE(new_count integer, reset_at timestamptz, allowed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_now      timestamptz := now();
  v_window_s timestamptz := date_trunc('milliseconds', v_now) - (extract(epoch from v_now)::bigint * 1000 % p_window_ms) * interval '1 millisecond';
  v_reset    timestamptz := v_window_s + (p_window_ms * interval '1 millisecond');
  v_count    integer;
BEGIN
  -- Prune old buckets (cheap — indexed).
  DELETE FROM rate_limit_buckets WHERE reset_at < v_now - interval '1 hour';

  INSERT INTO rate_limit_buckets (key, window_start, count, reset_at)
  VALUES (p_key, v_window_s, 1, v_reset)
  ON CONFLICT (key, window_start)
  DO UPDATE SET count = rate_limit_buckets.count + 1
  RETURNING count INTO v_count;

  RETURN QUERY SELECT v_count, v_reset, (v_count <= p_limit);
END;
$$;

REVOKE ALL ON FUNCTION rate_limit_hit(text, bigint, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION rate_limit_hit(text, bigint, integer) FROM anon;
REVOKE ALL ON FUNCTION rate_limit_hit(text, bigint, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION rate_limit_hit(text, bigint, integer) TO service_role;
