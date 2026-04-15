-- ============================================================
-- Unified Queue System Migration
-- ============================================================

-- VA Queue State: persists where each VA left off
CREATE TABLE IF NOT EXISTS va_queue_state (
  id BIGSERIAL PRIMARY KEY,
  va_id TEXT NOT NULL,
  queue_type TEXT NOT NULL DEFAULT 'content', -- 'content' or 'dm'
  current_step TEXT NOT NULL DEFAULT 'content', -- 'content' or 'dm'
  current_account_idx INTEGER NOT NULL DEFAULT 0,
  current_lead_idx INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(va_id)
);

-- DM Send Log: tracks every DM attempt with account mapping
CREATE TABLE IF NOT EXISTS dm_send_log (
  id BIGSERIAL PRIMARY KEY,
  lead_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  va_id TEXT NOT NULL,
  message_sent TEXT,
  status TEXT NOT NULL DEFAULT 'sent', -- sent, user_not_found, not_sent, account_issue
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_dm_send_log_lead ON dm_send_log(lead_id);
CREATE INDEX IF NOT EXISTS idx_dm_send_log_account ON dm_send_log(account_id);
CREATE INDEX IF NOT EXISTS idx_dm_send_log_va ON dm_send_log(va_id);
CREATE INDEX IF NOT EXISTS idx_dm_send_log_date ON dm_send_log(sent_at);

-- Content Post Log: tracks content posting per account
CREATE TABLE IF NOT EXISTS content_post_log (
  id BIGSERIAL PRIMARY KEY,
  account_id TEXT NOT NULL,
  va_id TEXT NOT NULL,
  content_id TEXT,
  posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'posted' -- posted, failed, skipped
);

CREATE INDEX IF NOT EXISTS idx_content_post_log_account ON content_post_log(account_id);
CREATE INDEX IF NOT EXISTS idx_content_post_log_va ON content_post_log(va_id);
CREATE INDEX IF NOT EXISTS idx_content_post_log_date ON content_post_log(posted_at);

-- Account-Lead mapping: ensures follow-ups use the same account
CREATE TABLE IF NOT EXISTS account_lead_mapping (
  id BIGSERIAL PRIMARY KEY,
  lead_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  first_contact_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(lead_id)
);

CREATE INDEX IF NOT EXISTS idx_account_lead_mapping_account ON account_lead_mapping(account_id);
