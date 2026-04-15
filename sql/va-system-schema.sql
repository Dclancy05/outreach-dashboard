-- VA Outreach System Schema
-- Run this in your Supabase SQL editor

-- Outreach Accounts (IG accounts for VAs to use)
CREATE TABLE IF NOT EXISTS outreach_accounts (
  account_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL,
  password TEXT DEFAULT '',
  email TEXT DEFAULT '',
  email_password TEXT DEFAULT '',
  proxy_host TEXT DEFAULT '',
  proxy_port TEXT DEFAULT '',
  proxy_username TEXT DEFAULT '',
  proxy_password TEXT DEFAULT '',
  status TEXT DEFAULT 'warming' CHECK (status IN ('active', 'warming', 'paused', 'logged_out', 'banned')),
  daily_limit INTEGER DEFAULT 5,
  sends_today INTEGER DEFAULT 0,
  warmup_start_date DATE DEFAULT CURRENT_DATE,
  warmup_day INTEGER DEFAULT 1,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT DEFAULT ''
);

-- VA Sessions
CREATE TABLE IF NOT EXISTS va_sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  va_name TEXT NOT NULL,
  pin TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- VA Send Log
CREATE TABLE IF NOT EXISTS va_send_log (
  log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id TEXT NOT NULL,
  account_id UUID REFERENCES outreach_accounts(account_id),
  va_session_id UUID REFERENCES va_sessions(session_id),
  status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'skipped', 'warning', 'response', 'logged_out')),
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- Lead Responses (reported by VA)
CREATE TABLE IF NOT EXISTS lead_responses (
  response_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id TEXT NOT NULL,
  account_id UUID REFERENCES outreach_accounts(account_id),
  reported_by_va TEXT DEFAULT '',
  reported_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT DEFAULT ''
);

-- Index for fast daily queries
CREATE INDEX IF NOT EXISTS idx_va_send_log_sent_at ON va_send_log(sent_at);
CREATE INDEX IF NOT EXISTS idx_va_send_log_account ON va_send_log(account_id);
CREATE INDEX IF NOT EXISTS idx_outreach_accounts_status ON outreach_accounts(status);
