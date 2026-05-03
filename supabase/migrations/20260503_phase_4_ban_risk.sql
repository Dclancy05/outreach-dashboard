-- Phase 4 — under-the-radar / ban-risk hardening

-- Wave 4.2 — accounts.timezone for proper send-window enforcement
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/New_York';

-- Wave 4.3 — counter columns for account-health auto-pause
-- We use rolling windows (recent_429, etc.) reset by /api/cron/rate-limit-reset
-- on a daily tick; auto-pause fires when any counter crosses threshold.
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS recent_429       INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recent_login_required INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recent_shadowban INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS auto_paused_reason TEXT,
  ADD COLUMN IF NOT EXISTS auto_paused_at TIMESTAMPTZ;

-- The status field stays TEXT (free-form) for back-compat with existing
-- rows. We document the canonical values in code (account-health-monitor.ts):
--   'active' | 'warmup' | 'paused_health' | 'paused_reply' | 'paused_user' | 'banned'
-- A future migration can convert to a CHECK or enum once all callers agree.

-- Wave 4.1 — make sure every existing campaign has safety settings populated
-- with conservative defaults. New campaigns must include them on create
-- (UI work, separate PR).
INSERT INTO campaign_safety_settings (campaign_id, platform, delay_between_dms_min, delay_between_dms_max, active_hours_start, active_hours_end)
SELECT c.id, COALESCE(c.platform, 'instagram'), 30, 90, '09:00', '21:00'
FROM campaigns c
WHERE NOT EXISTS (
  SELECT 1 FROM campaign_safety_settings s
  WHERE s.campaign_id = c.id
)
ON CONFLICT (campaign_id, platform) DO NOTHING;
