-- 2026-04-27 — One account per platform per Group (spec line 47)
--
-- Spec rule (Accounts & Proxies.md line 47):
--   "A Group can hold at most one account per platform — never two
--    Instagrams in the same group, never two Facebooks."
--
-- Application code already tries to enforce this on insert/move, but a
-- partial unique index gives us a hard DB-level guarantee. The index is
-- partial because:
--   * archived / banned / paused / pending_setup accounts shouldn't block
--     a fresh account taking the same slot (e.g. an old IG got banned —
--     we want to add a new IG into that same group).
--   * accounts not yet assigned to a group (proxy_group_id IS NULL) live
--     in the unassigned bucket and can sit there freely.
--
-- Safe to re-run: CREATE UNIQUE INDEX IF NOT EXISTS.
-- Idempotent.

CREATE UNIQUE INDEX IF NOT EXISTS one_account_per_platform_per_group_active
  ON accounts (proxy_group_id, platform)
  WHERE status IN ('active', 'warming') AND proxy_group_id IS NOT NULL;

-- ─── DEDUPE PASS ──────────────────────────────────────────────────────────
-- If the index creation above fails because pre-existing duplicates already
-- violate the rule, run the query below first to find offenders, then keep
-- the canonical row in each (group, platform) pair and either re-assign or
-- archive the rest before retrying this migration.
--
-- Uncomment to detect duplicates:
--
-- SELECT proxy_group_id, platform, COUNT(*)
--   FROM accounts
--  WHERE status IN ('active','warming')
--    AND proxy_group_id IS NOT NULL
--  GROUP BY 1, 2
--  HAVING COUNT(*) > 1;
--
-- ──────────────────────────────────────────────────────────────────────────
