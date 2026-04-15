-- Outreach Dashboard Schema for Supabase
-- Run this via Supabase SQL Editor or REST API

-- ─── Leads ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leads (
  lead_id TEXT PRIMARY KEY,
  name TEXT DEFAULT '',
  city TEXT DEFAULT '',
  state TEXT DEFAULT '',
  business_type TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  all_emails TEXT DEFAULT '',
  all_contacts TEXT DEFAULT '[]',
  website TEXT DEFAULT '',
  instagram_url TEXT DEFAULT '',
  facebook_url TEXT DEFAULT '',
  linkedin_url TEXT DEFAULT '',
  total_score TEXT DEFAULT '0',
  ranking_tier TEXT DEFAULT 'COLD',
  status TEXT DEFAULT 'new',
  sequence_id TEXT DEFAULT '',
  current_step TEXT DEFAULT '',
  next_action_date TEXT DEFAULT '',
  last_platform_sent TEXT DEFAULT '',
  scraped_at TEXT DEFAULT '',
  messages_generated TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  _raw_scrape_data TEXT DEFAULT '',
  message_count TEXT DEFAULT '',
  is_chain TEXT DEFAULT '',
  location_count TEXT DEFAULT '',
  dedup_method TEXT DEFAULT '',
  tags TEXT DEFAULT '',
  smart_list TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_smart_list ON leads(smart_list);
CREATE INDEX IF NOT EXISTS idx_leads_ranking_tier ON leads(ranking_tier);
CREATE INDEX IF NOT EXISTS idx_leads_business_type ON leads(business_type);

-- ─── Messages ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  message_id TEXT PRIMARY KEY,
  lead_id TEXT DEFAULT '',
  business_name TEXT DEFAULT '',
  sequence_id TEXT DEFAULT '',
  step_number TEXT DEFAULT '',
  platform TEXT DEFAULT '',
  action TEXT DEFAULT '',
  subject TEXT DEFAULT '',
  body TEXT DEFAULT '',
  generated_at TEXT DEFAULT '',
  status TEXT DEFAULT '',
  char_count TEXT DEFAULT '',
  warnings TEXT DEFAULT '',
  approach_id TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_messages_lead_id ON messages(lead_id);

-- ─── Sequences ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sequences (
  sequence_id TEXT PRIMARY KEY,
  sequence_name TEXT DEFAULT '',
  steps JSONB DEFAULT '{}'::jsonb
);

-- ─── Accounts ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS accounts (
  account_id TEXT PRIMARY KEY,
  platform TEXT DEFAULT '',
  display_name TEXT DEFAULT '',
  username TEXT DEFAULT '',
  session_cookie TEXT DEFAULT '',
  proxy TEXT DEFAULT '',
  daily_limit TEXT DEFAULT '0',
  sends_today TEXT DEFAULT '0',
  status TEXT DEFAULT '',
  last_used_at TEXT DEFAULT '',
  cooldown_until TEXT DEFAULT '',
  notes TEXT DEFAULT ''
);

-- ─── AB Tests ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ab_tests (
  test_id TEXT PRIMARY KEY,
  test_name TEXT DEFAULT '',
  test_type TEXT DEFAULT '',
  status TEXT DEFAULT '',
  variant_a_name TEXT DEFAULT '',
  variant_a_config TEXT DEFAULT '',
  variant_b_name TEXT DEFAULT '',
  variant_b_config TEXT DEFAULT '',
  variant_a_leads TEXT DEFAULT '0',
  variant_b_leads TEXT DEFAULT '0',
  variant_a_responses TEXT DEFAULT '0',
  variant_b_responses TEXT DEFAULT '0',
  variant_a_rate TEXT DEFAULT '0',
  variant_b_rate TEXT DEFAULT '0',
  winner TEXT DEFAULT '',
  created_at TEXT DEFAULT '',
  ended_at TEXT DEFAULT ''
);

-- ─── Approaches ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS approaches (
  approach_id TEXT PRIMARY KEY,
  name TEXT DEFAULT '',
  description TEXT DEFAULT '',
  prompt_file TEXT DEFAULT '',
  version TEXT DEFAULT '1',
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT '',
  updated_at TEXT DEFAULT ''
);

-- ─── Smart Lists ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS smart_lists (
  list_id TEXT PRIMARY KEY,
  name TEXT DEFAULT '',
  description TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  color TEXT DEFAULT 'purple',
  created_at TEXT DEFAULT ''
);

-- ─── Activity ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity (
  activity_id TEXT PRIMARY KEY,
  type TEXT DEFAULT '',
  status TEXT DEFAULT '',
  summary TEXT DEFAULT '',
  details TEXT DEFAULT '',
  lead_count TEXT DEFAULT '0',
  created_at TEXT DEFAULT '',
  completed_at TEXT DEFAULT ''
);

-- ─── Outreach Log ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS outreach_log (
  log_id TEXT PRIMARY KEY,
  lead_id TEXT DEFAULT '',
  business_name TEXT DEFAULT '',
  sequence_step TEXT DEFAULT '',
  platform TEXT DEFAULT '',
  action TEXT DEFAULT '',
  status TEXT DEFAULT '',
  sent_at TEXT DEFAULT '',
  error_note TEXT DEFAULT '',
  account_id TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_outreach_log_lead_id ON outreach_log(lead_id);

-- ─── Settings ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  setting_name TEXT PRIMARY KEY,
  setting_value TEXT DEFAULT ''
);

-- ─── Enable RLS but allow all for anon (dashboard is private/internal) ──
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ab_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE approaches ENABLE ROW LEVEL SECURITY;
ALTER TABLE smart_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Allow full access for authenticated and anon users (internal tool)
CREATE POLICY "Allow all for anon" ON leads FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON messages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON sequences FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON accounts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON ab_tests FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON approaches FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON smart_lists FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON activity FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON outreach_log FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON settings FOR ALL USING (true) WITH CHECK (true);
