-- 2026-04-27 — recompute_proxy_group_status() function + accounts trigger
--
-- Companion to 20260427_proxy_groups_status.sql. That migration added the
-- proxy_groups.status column and did a one-time backfill. This migration
-- keeps the column in sync going forward by:
--
--   1. Defining recompute_proxy_group_status(group_id TEXT) which applies
--      the same rules as the backfill to a single group and writes the
--      result back to proxy_groups.status.
--
--   2. Installing an AFTER INSERT/UPDATE/DELETE trigger on accounts that
--      calls the function for every affected group. Critically, when an
--      account moves between groups (UPDATE changes proxy_group_id) we
--      recompute BOTH the old group and the new group, since the move
--      changes the membership of both.
--
-- The function and trigger are SECURITY DEFINER so they execute with the
-- table owner's privileges. This matters because the rest of the system
-- runs queries via the service role key but Row-Level Security policies
-- on accounts/proxy_groups (see 20260423_rls_lockdown_apply.sql) could
-- otherwise block the trigger from updating proxy_groups when a non-owner
-- change occurs.
--
-- Status rules (must match the backfill in 20260427_proxy_groups_status.sql):
--   1. zero accounts                              → 'no_accounts'
--   2. any pending_setup OR cookies_health='expired' → 'needs_signin'
--   3. all active/warming AND cookies_health in (healthy, stale)
--                                                 → 'active'
--   4. otherwise                                  → leave existing value
--                                                   ('error' is reserved
--                                                    for explicit ops)
--
-- Idempotent: CREATE OR REPLACE FUNCTION, DROP TRIGGER IF EXISTS + CREATE.

-- ─── core recompute function ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION recompute_proxy_group_status(group_id TEXT)
RETURNS void AS $$
DECLARE
  v_total           INTEGER;
  v_needs_signin    INTEGER;
  v_healthy_active  INTEGER;
  v_new_status      TEXT;
  v_current_status  TEXT;
BEGIN
  IF group_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (
      WHERE status = 'pending_setup'
         OR cookies_health = 'expired'
    ),
    COUNT(*) FILTER (
      WHERE status IN ('active', 'warming')
        AND cookies_health IN ('healthy', 'stale')
    )
    INTO v_total, v_needs_signin, v_healthy_active
    FROM accounts
   WHERE proxy_group_id = group_id;

  SELECT status INTO v_current_status
    FROM proxy_groups
   WHERE id = group_id;

  -- Group row may not exist (e.g. account pointing at a stale id) — bail.
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_total = 0 THEN
    v_new_status := 'no_accounts';
  ELSIF v_needs_signin > 0 THEN
    v_new_status := 'needs_signin';
  ELSIF v_healthy_active = v_total THEN
    v_new_status := 'active';
  ELSE
    -- Mixed / partial state — leave whatever's currently there. We never
    -- auto-promote to 'error'; that's reserved for explicit ops actions
    -- (proxy dead, account banned, etc.).
    v_new_status := v_current_status;
  END IF;

  IF v_new_status IS DISTINCT FROM v_current_status THEN
    UPDATE proxy_groups
       SET status = v_new_status
     WHERE id = group_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── trigger handler on accounts ────────────────────────────────────────
-- Fires after every INSERT / UPDATE / DELETE on accounts. Recomputes the
-- affected group(s). When proxy_group_id changes we recompute both the
-- old and new groups so neither gets stuck on a stale count.

CREATE OR REPLACE FUNCTION accounts_recompute_group_status_trg()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM recompute_proxy_group_status(NEW.proxy_group_id);
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    -- If the group changed, both old and new need a recompute.
    IF NEW.proxy_group_id IS DISTINCT FROM OLD.proxy_group_id THEN
      PERFORM recompute_proxy_group_status(OLD.proxy_group_id);
      PERFORM recompute_proxy_group_status(NEW.proxy_group_id);
    ELSE
      PERFORM recompute_proxy_group_status(NEW.proxy_group_id);
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    PERFORM recompute_proxy_group_status(OLD.proxy_group_id);
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_accounts_recompute_group_status ON accounts;
CREATE TRIGGER trg_accounts_recompute_group_status
  AFTER INSERT OR UPDATE OR DELETE ON accounts
  FOR EACH ROW
  EXECUTE FUNCTION accounts_recompute_group_status_trg();
