-- =====================================================================
-- RLS Lockdown — APPLIED 2026-04-23
-- =====================================================================
-- Browser-side Supabase reads were moved into API routes that use the
-- SUPABASE_SERVICE_ROLE_KEY (commit 37c54e9). The live migration actually
-- applied is the guarded `20260423_rls_lockdown_apply.sql` variant, which
-- skips tables that don't exist in this DB (sent_dms) and uses DO blocks
-- with pg_tables existence checks so it's safely re-runnable.
-- Rollback lives at `20260423_rls_rollback.sql`.
-- =====================================================================

-- ------------------------------------------------
-- 1. Drop the existing wide-open "anon" policies
-- ------------------------------------------------
-- Schema reference: scripts/schema.sql:175-185

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    -- originally wide-open in schema.sql
    'leads',
    'messages',
    'sequences',
    'accounts',
    'ab_tests',
    'approaches',
    'smart_lists',
    'activity',
    'outreach_log',
    'settings',
    -- additional high-risk tables from later migrations
    'outreach_accounts',
    'sent_dms',
    'responses',
    'account_cookie_snapshots',
    'account_fingerprints',
    'proxy_groups',
    'automations',
    'automation_runs',
    'team_members',
    'onboarding_status'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- Drop any legacy wide-open policies if they exist
    EXECUTE format('DROP POLICY IF EXISTS "Allow all for anon" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Allow all" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "anon all" ON %I', t);
  END LOOP;
END$$;

-- ------------------------------------------------
-- 2. Ensure RLS enabled on every sensitive table
-- ------------------------------------------------
ALTER TABLE leads                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequences                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ab_tests                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE approaches                ENABLE ROW LEVEL SECURITY;
ALTER TABLE smart_lists               ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_log              ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_accounts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE sent_dms                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE responses                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_cookie_snapshots  ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_fingerprints      ENABLE ROW LEVEL SECURITY;
ALTER TABLE proxy_groups              ENABLE ROW LEVEL SECURITY;
ALTER TABLE automations               ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_runs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members              ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_status         ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------
-- 3. Service-role-only write (+ read) policies
-- ------------------------------------------------
-- service_role bypasses RLS by default in Supabase, but an explicit policy
-- makes the intent reviewable and survives any future "force RLS" changes.

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'leads','messages','sequences','accounts','ab_tests','approaches',
    'smart_lists','activity','outreach_log','settings',
    'outreach_accounts','sent_dms','responses',
    'account_cookie_snapshots','account_fingerprints','proxy_groups',
    'automations','automation_runs','team_members','onboarding_status'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format(
      'CREATE POLICY "service_role full access" ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      t
    );
  END LOOP;
END$$;

-- ------------------------------------------------
-- 4. (Optional) temporary authenticated-read policies
-- ------------------------------------------------
-- Uncomment individual tables once the browser stops using the anon key
-- for that table, and real Supabase Auth users exist. Without this, the
-- anon-key browser queries will return [] after migration.
--
-- CREATE POLICY "authenticated read" ON leads
--   FOR SELECT TO authenticated USING (true);
-- CREATE POLICY "authenticated read" ON sequences
--   FOR SELECT TO authenticated USING (true);
-- ... etc.

-- ------------------------------------------------
-- 5. Revoke anon grants (belt + suspenders)
-- ------------------------------------------------
-- The policies above already block anon; this removes the underlying GRANTs
-- so attackers can't exploit a mis-configured future policy.
REVOKE ALL ON leads, messages, sequences, accounts, ab_tests, approaches,
             smart_lists, activity, outreach_log, settings,
             outreach_accounts, sent_dms, responses,
             account_cookie_snapshots, account_fingerprints, proxy_groups,
             automations, automation_runs, team_members, onboarding_status
  FROM anon;

-- =====================================================================
-- END DRAFT
-- =====================================================================
