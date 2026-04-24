-- =====================================================================
-- RLS Lockdown — APPLIED 2026-04-23
-- =====================================================================
-- Browser-side Supabase reads have been moved into API routes that use
-- the SUPABASE_SERVICE_ROLE_KEY (commit 37c54e9). We are now safe to drop
-- the wide-open "anon" policies and lock these tables to service_role.
--
-- NOTE: sent_dms is in the original draft list but does not exist in this
-- database. It has been removed from the arrays below.
-- =====================================================================

-- ------------------------------------------------
-- 1. Drop the existing wide-open "anon" policies
-- ------------------------------------------------
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
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
    'outreach_accounts',
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
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=t) THEN
      EXECUTE format('DROP POLICY IF EXISTS "Allow all for anon" ON %I', t);
      EXECUTE format('DROP POLICY IF EXISTS "Allow all" ON %I', t);
      EXECUTE format('DROP POLICY IF EXISTS "anon all" ON %I', t);
      EXECUTE format('DROP POLICY IF EXISTS "Allow all for authenticated" ON %I', t);
      EXECUTE format('DROP POLICY IF EXISTS "Allow all access to responses" ON %I', t);
      EXECUTE format('DROP POLICY IF EXISTS "Allow all operations on responses" ON %I', t);
      EXECUTE format('DROP POLICY IF EXISTS "allow_all_anon" ON %I', t);
    END IF;
  END LOOP;
END$$;

-- ------------------------------------------------
-- 2. Ensure RLS enabled on every sensitive table
-- ------------------------------------------------
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'leads','messages','sequences','accounts','ab_tests','approaches',
    'smart_lists','activity','outreach_log','settings',
    'outreach_accounts','responses',
    'account_cookie_snapshots','account_fingerprints','proxy_groups',
    'automations','automation_runs','team_members','onboarding_status'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=t) THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END$$;

-- ------------------------------------------------
-- 3. Service-role-only write (+ read) policies
-- ------------------------------------------------
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'leads','messages','sequences','accounts','ab_tests','approaches',
    'smart_lists','activity','outreach_log','settings',
    'outreach_accounts','responses',
    'account_cookie_snapshots','account_fingerprints','proxy_groups',
    'automations','automation_runs','team_members','onboarding_status'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=t) THEN
      EXECUTE format('DROP POLICY IF EXISTS "service_role full access" ON %I', t);
      EXECUTE format(
        'CREATE POLICY "service_role full access" ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)',
        t
      );
    END IF;
  END LOOP;
END$$;

-- ------------------------------------------------
-- 4. Revoke anon grants (belt + suspenders)
-- ------------------------------------------------
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'leads','messages','sequences','accounts','ab_tests','approaches',
    'smart_lists','activity','outreach_log','settings',
    'outreach_accounts','responses',
    'account_cookie_snapshots','account_fingerprints','proxy_groups',
    'automations','automation_runs','team_members','onboarding_status'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=t) THEN
      EXECUTE format('REVOKE ALL ON %I FROM anon', t);
    END IF;
  END LOOP;
END$$;
