-- Video Generations Table for AI Video Content Generator
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/yfufocegjhxxffqtkvkr/sql/new

CREATE TABLE IF NOT EXISTS video_generations (
  id text PRIMARY KEY,
  prompt text NOT NULL,
  style text DEFAULT 'promo',
  duration integer DEFAULT 10,
  aspect_ratio text DEFAULT '9:16',
  status text DEFAULT 'queued',
  provider text DEFAULT 'manual',
  provider_task_id text DEFAULT '',
  video_url text DEFAULT '',
  thumbnail_url text DEFAULT '',
  error_message text DEFAULT '',
  content_id text DEFAULT '',
  business_id text DEFAULT 'default',
  created_at text DEFAULT '',
  updated_at text DEFAULT '',
  completed_at text DEFAULT ''
);

-- Enable RLS
ALTER TABLE video_generations ENABLE ROW LEVEL SECURITY;

-- Allow all access (service role)
CREATE POLICY video_generations_all ON video_generations FOR ALL USING (true);
