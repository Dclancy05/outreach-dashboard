-- 2026-05-04 — PR #91 — chrome_login_probes
--
-- Caches the result of `${VPS_URL}/login-status` so the dashboard's
-- accounts read path (src/lib/api/accounts.ts:get_accounts) can downgrade
-- a falsely-Active badge in <10ms without firing a fresh probe per render.
--
-- One row per (chrome_session_id, platform). Today there's a single shared
-- Chrome ("main"), but the schema future-proofs per-account Chrome sessions.
--
-- Live-probe is treated as a NEGATIVE signal only: if logged_in=false here,
-- the dashboard flips Active → Needs Sign-In. logged_in=true never UPGRADES
-- (because the VPS probe currently uses lax cookies for some platforms,
-- e.g. JSESSIONID for LinkedIn — we don't want it to undo PR #90's strict
-- li_at check).

CREATE TABLE IF NOT EXISTS chrome_login_probes (
  chrome_session_id TEXT NOT NULL DEFAULT 'main',
  platform          TEXT NOT NULL,
  logged_in         BOOLEAN,
  reason            TEXT,
  probed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chrome_session_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_chrome_login_probes_probed_at
  ON chrome_login_probes (probed_at DESC);
