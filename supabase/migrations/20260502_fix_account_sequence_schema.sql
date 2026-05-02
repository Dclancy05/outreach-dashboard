-- Wave 9.p hotfix — align deployed schema with what the API write paths
-- actually send. Two production 500s caught by the real-browser tester:
--
--   1) POST /api/sequences blew up because the route writes `is_active`
--      but the live `sequences` table never had that column. Sequence
--      enable/disable (Step 3 of the /outreach wizard) is a real product
--      feature, so we ADD the column rather than strip it from the API.
--
--   2) POST /api/accounts blew up on `email_login_password`,
--      `email_login_username`, and `twofa_backup_codes`. Those names are
--      LEGACY route renames of the canonical schema columns
--      (`email_password`, `email_username`, `tfa_codes`). We do NOT add
--      duplicate columns — the route is patched separately to write the
--      canonical names. Tracked here only as a comment so future readers
--      don't get confused if they see those names referenced in code.
--
--   3) The legacy /api/dashboard `create_account` action wrote
--      `chrome_profile_name`, `chrome_profile_path`, and `created_at` —
--      none of which exist on the `accounts` table. They are
--      recording-service-era fields that the modern dashboard does not
--      use. Removed from the action's payload (code fix). No DDL needed.
--
-- Strict ADD-only DDL — no DROP, no ALTER TYPE, no destructive change.
-- After this migration runs, PostgREST is told to reload its schema cache
-- so the new column is visible immediately to API writers.

-- 1) sequences.is_active — sequence enable/disable for the wizard.
ALTER TABLE sequences
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN sequences.is_active IS
  'Whether this sequence is currently enabled. Disabled sequences stay in the list but are skipped by the campaign worker. Added 2026-05-02 to fix POST /api/sequences schema-cache 500.';

-- 2) Reload PostgREST schema cache so the new column is visible without
-- waiting for the periodic refresh.
NOTIFY pgrst, 'reload schema';
