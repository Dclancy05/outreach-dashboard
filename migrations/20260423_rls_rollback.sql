-- =====================================================================
-- ROLLBACK for 20260423_rls_lockdown_apply.sql
-- =====================================================================
-- Restores wide-open "Allow all for anon" ALL policies + anon GRANTs.
-- Only run this if the lockdown breaks browser reads somewhere that
-- wasn't migrated to an API route yet.
-- =====================================================================

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
    EXECUTE format('DROP POLICY IF EXISTS "service_role full access" ON %I', t);
    EXECUTE format(
      'CREATE POLICY "Allow all for anon" ON %I FOR ALL TO public USING (true) WITH CHECK (true)',
      t
    );
  END LOOP;
END$$;

GRANT ALL ON leads, messages, sequences, accounts, ab_tests, approaches,
             smart_lists, activity, outreach_log, settings,
             outreach_accounts, sent_dms, responses,
             account_cookie_snapshots, account_fingerprints, proxy_groups,
             automations, automation_runs, team_members, onboarding_status
  TO anon;
