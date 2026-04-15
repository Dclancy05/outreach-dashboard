-- ============================================================
-- Outreach Platform V3 — Full Database Migration
-- Run in Supabase SQL Editor
-- ============================================================

-- VNC Sessions: tracks active Chrome/VNC displays per proxy group
CREATE TABLE IF NOT EXISTS vnc_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proxy_group_id TEXT REFERENCES proxy_groups(id),
  display_number INTEGER NOT NULL,
  vnc_port INTEGER NOT NULL,
  websocket_port INTEGER NOT NULL,
  chrome_profile_path TEXT,
  chrome_pid INTEGER,
  status TEXT DEFAULT 'idle',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vnc_sessions_proxy ON vnc_sessions(proxy_group_id);
CREATE INDEX IF NOT EXISTS idx_vnc_sessions_status ON vnc_sessions(status);

-- Account Sessions: cookies/localStorage captured from noVNC login
CREATE TABLE IF NOT EXISTS account_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id TEXT NOT NULL,
  proxy_group_id TEXT REFERENCES proxy_groups(id),
  cookies JSONB,
  local_storage JSONB,
  session_tokens JSONB,
  browser_fingerprint JSONB,
  last_verified_at TIMESTAMPTZ,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_account_sessions_account ON account_sessions(account_id);
CREATE INDEX IF NOT EXISTS idx_account_sessions_proxy ON account_sessions(proxy_group_id);
CREATE INDEX IF NOT EXISTS idx_account_sessions_status ON account_sessions(status);

-- Campaign Safety Settings: per-campaign, per-platform, persisted forever
CREATE TABLE IF NOT EXISTS campaign_safety_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID,
  platform TEXT,
  delay_between_dms_min INTEGER DEFAULT 300,
  delay_between_dms_max INTEGER DEFAULT 480,
  batch_pause_after INTEGER DEFAULT 10,
  batch_pause_duration INTEGER DEFAULT 15,
  active_hours_start TEXT DEFAULT '09:00',
  active_hours_end TEXT DEFAULT '21:00',
  typing_speed_min INTEGER DEFAULT 50,
  typing_speed_max INTEGER DEFAULT 200,
  mouse_speed TEXT DEFAULT 'natural',
  random_scroll BOOLEAN DEFAULT true,
  random_page_visit BOOLEAN DEFAULT false,
  profile_view_before_dm BOOLEAN DEFAULT true,
  profile_view_duration_min INTEGER DEFAULT 3,
  profile_view_duration_max INTEGER DEFAULT 8,
  like_before_dm_pct INTEGER DEFAULT 0,
  session_max_duration INTEGER DEFAULT 120,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_safety_campaign ON campaign_safety_settings(campaign_id);

-- Account-Lead Affinity: once an account DMs a lead, it owns that relationship
CREATE TABLE IF NOT EXISTS account_lead_affinity (
  account_id TEXT NOT NULL,
  lead_id UUID NOT NULL,
  platform TEXT NOT NULL,
  first_contact_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (account_id, lead_id, platform)
);

-- Campaign Schedule: pre-scheduled sends (calendar events)
CREATE TABLE IF NOT EXISTS campaign_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID,
  account_id TEXT,
  lead_id UUID,
  sequence_step_id UUID,
  platform TEXT NOT NULL,
  scheduled_date DATE NOT NULL,
  scheduled_time TIME,
  status TEXT DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_schedule_campaign ON campaign_schedule(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_schedule_account ON campaign_schedule(account_id);
CREATE INDEX IF NOT EXISTS idx_campaign_schedule_date ON campaign_schedule(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_campaign_schedule_status ON campaign_schedule(status);

-- Automation Definitions: reusable patterns from recordings
CREATE TABLE IF NOT EXISTS automation_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL,
  action_type TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  recording_id UUID,
  steps JSONB NOT NULL DEFAULT '[]',
  variables JSONB,
  status TEXT DEFAULT 'needs_recording',
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_defs_platform ON automation_definitions(platform);
CREATE INDEX IF NOT EXISTS idx_automation_defs_action ON automation_definitions(action_type);
CREATE INDEX IF NOT EXISTS idx_automation_defs_status ON automation_definitions(status);

-- AI Agent Solutions: learned problem-solving patterns
CREATE TABLE IF NOT EXISTS ai_agent_solutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL,
  problem_type TEXT NOT NULL,
  problem_signature TEXT,
  screenshot_url TEXT,
  solution_steps JSONB NOT NULL DEFAULT '[]',
  success BOOLEAN DEFAULT true,
  times_applied INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_solutions_platform ON ai_agent_solutions(platform);
CREATE INDEX IF NOT EXISTS idx_ai_solutions_type ON ai_agent_solutions(problem_type);

-- AI Agent Activity Log
CREATE TABLE IF NOT EXISTS ai_agent_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vnc_session_id UUID REFERENCES vnc_sessions(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  platform TEXT,
  details JSONB,
  screenshot_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_log_session ON ai_agent_log(vnc_session_id);
CREATE INDEX IF NOT EXISTS idx_ai_log_created ON ai_agent_log(created_at DESC);

-- Campaigns table (if not exists) with enhanced fields
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  business_id TEXT DEFAULT 'default',
  status TEXT DEFAULT 'draft',
  accounts JSONB DEFAULT '[]',
  lead_ids JSONB DEFAULT '[]',
  lead_count INTEGER DEFAULT 0,
  sequence_id UUID,
  safety_preset TEXT DEFAULT 'standard',
  total_scheduled INTEGER DEFAULT 0,
  total_sent INTEGER DEFAULT 0,
  total_failed INTEGER DEFAULT 0,
  response_rate NUMERIC DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_business ON campaigns(business_id);

-- Seed default automation definitions for all platforms
INSERT INTO automation_definitions (platform, action_type, name, description, status) VALUES
  ('instagram', 'send_dm', 'Instagram DM', 'Send a direct message on Instagram', 'needs_recording'),
  ('instagram', 'follow', 'Instagram Follow', 'Follow a user on Instagram', 'needs_recording'),
  ('instagram', 'unfollow', 'Instagram Unfollow', 'Unfollow a user on Instagram', 'needs_recording'),
  ('instagram', 'like_post', 'Instagram Like', 'Like a post on Instagram', 'needs_recording'),
  ('instagram', 'comment', 'Instagram Comment', 'Comment on a post on Instagram', 'needs_recording'),
  ('instagram', 'view_profile', 'Instagram View Profile', 'View a profile on Instagram', 'needs_recording'),
  ('facebook', 'send_dm', 'Facebook Message', 'Send a message on Facebook', 'needs_recording'),
  ('facebook', 'follow', 'Facebook Follow', 'Follow a page on Facebook', 'needs_recording'),
  ('facebook', 'unfollow', 'Facebook Unfollow', 'Unfollow a page on Facebook', 'needs_recording'),
  ('facebook', 'like_post', 'Facebook Like', 'Like a post on Facebook', 'needs_recording'),
  ('facebook', 'comment', 'Facebook Comment', 'Comment on a post on Facebook', 'needs_recording'),
  ('facebook', 'friend_request', 'Facebook Friend Request', 'Send a friend request on Facebook', 'needs_recording'),
  ('linkedin', 'send_dm', 'LinkedIn Message', 'Send a message on LinkedIn', 'needs_recording'),
  ('linkedin', 'connect', 'LinkedIn Connect', 'Send a connection request on LinkedIn', 'needs_recording'),
  ('linkedin', 'connect_note', 'LinkedIn Connect + Note', 'Send a connection request with a note', 'needs_recording'),
  ('linkedin', 'follow', 'LinkedIn Follow', 'Follow a user on LinkedIn', 'needs_recording'),
  ('linkedin', 'like_post', 'LinkedIn Like', 'Like a post on LinkedIn', 'needs_recording'),
  ('linkedin', 'comment', 'LinkedIn Comment', 'Comment on a post on LinkedIn', 'needs_recording'),
  ('linkedin', 'view_profile', 'LinkedIn View Profile', 'View a profile on LinkedIn', 'needs_recording'),
  ('tiktok', 'send_dm', 'TikTok DM', 'Send a direct message on TikTok', 'needs_recording'),
  ('tiktok', 'follow', 'TikTok Follow', 'Follow a user on TikTok', 'needs_recording'),
  ('tiktok', 'like_post', 'TikTok Like', 'Like a video on TikTok', 'needs_recording'),
  ('tiktok', 'comment', 'TikTok Comment', 'Comment on a video on TikTok', 'needs_recording'),
  ('youtube', 'send_dm', 'YouTube Message', 'Send a message on YouTube', 'needs_recording'),
  ('youtube', 'follow', 'YouTube Subscribe', 'Subscribe to a channel on YouTube', 'needs_recording'),
  ('youtube', 'like_post', 'YouTube Like', 'Like a video on YouTube', 'needs_recording'),
  ('youtube', 'comment', 'YouTube Comment', 'Comment on a video on YouTube', 'needs_recording'),
  ('snapchat', 'send_dm', 'Snapchat Message', 'Send a message on Snapchat', 'needs_recording'),
  ('snapchat', 'follow', 'Snapchat Add Friend', 'Add a friend on Snapchat', 'needs_recording'),
  ('x', 'send_dm', 'X/Twitter DM', 'Send a direct message on X', 'needs_recording'),
  ('x', 'follow', 'X/Twitter Follow', 'Follow a user on X', 'needs_recording'),
  ('x', 'like_post', 'X/Twitter Like', 'Like a post on X', 'needs_recording'),
  ('x', 'comment', 'X/Twitter Reply', 'Reply to a post on X', 'needs_recording'),
  ('pinterest', 'send_dm', 'Pinterest Message', 'Send a message on Pinterest', 'needs_recording'),
  ('pinterest', 'follow', 'Pinterest Follow', 'Follow a user on Pinterest', 'needs_recording')
ON CONFLICT DO NOTHING;
