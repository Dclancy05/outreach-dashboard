-- Reliability & Safety Layer
-- Created: 2026-04-22

-- 1. Retry Queue for failed sends + other actions
CREATE TABLE IF NOT EXISTS retry_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type TEXT NOT NULL, -- "send", "recording.start", etc
  payload JSONB NOT NULL,
  attempt_count INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  next_retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'pending', -- pending, in_progress, resolved, failed, gave_up
  error_message TEXT,
  account_id TEXT,
  lead_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_retry_queue_pending ON retry_queue(status, next_retry_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_retry_queue_account ON retry_queue(account_id);

-- 2. System-wide settings (key/value JSON bag)
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed defaults (idempotent)
INSERT INTO system_settings (key, value) VALUES
  ('deadman_switch', '{"enabled": false, "silence_hours": 6, "alert_method": "in_app", "telegram_chat_id": "", "last_fired_at": null}'::jsonb),
  ('auto_cooldown', '{"enabled": true, "error_threshold": 3, "error_window_minutes": 10, "cooldown_hours": 24}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 3. Account cooldown fields
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS cooldown_until TIMESTAMPTZ;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS cooldown_reason TEXT;
