-- Content System Tables for Outreach Dashboard
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/yfufocegjhxxffqtkvkr/sql/new

-- Content Personas
CREATE TABLE IF NOT EXISTS content_personas (
  persona_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text DEFAULT '',
  niche text DEFAULT '',
  tone text DEFAULT '',
  content_types text DEFAULT 'reels,images',
  hashtag_groups text DEFAULT '',
  posting_frequency integer DEFAULT 5,
  created_at timestamptz DEFAULT now()
);

-- Content Calendar
CREATE TABLE IF NOT EXISTS content_calendar (
  content_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id text,
  persona_id uuid REFERENCES content_personas(persona_id) ON DELETE SET NULL,
  title text DEFAULT '',
  caption text DEFAULT '',
  hashtags text DEFAULT '',
  content_type text DEFAULT 'image',
  media_url text DEFAULT '',
  media_status text DEFAULT 'pending',
  post_status text DEFAULT 'draft',
  scheduled_for timestamptz,
  posted_at timestamptz,
  ai_prompt text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- Content Templates
CREATE TABLE IF NOT EXISTS content_templates (
  template_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id uuid REFERENCES content_personas(persona_id) ON DELETE SET NULL,
  name text DEFAULT '',
  content_type text DEFAULT 'image',
  prompt_template text DEFAULT '',
  caption_template text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- Add ig_access_token and persona_id to outreach_accounts if not exists
DO $$ BEGIN
  ALTER TABLE outreach_accounts ADD COLUMN IF NOT EXISTS ig_access_token text DEFAULT '';
  ALTER TABLE outreach_accounts ADD COLUMN IF NOT EXISTS persona_id uuid;
  ALTER TABLE outreach_accounts ADD COLUMN IF NOT EXISTS ig_user_id text DEFAULT '';
  ALTER TABLE outreach_accounts ADD COLUMN IF NOT EXISTS fb_page_id text DEFAULT '';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Enable RLS
ALTER TABLE content_personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_templates ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role full access" ON content_personas FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON content_calendar FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON content_templates FOR ALL USING (true) WITH CHECK (true);

-- Insert example personas
INSERT INTO content_personas (name, description, niche, tone, content_types, hashtag_groups, posting_frequency)
VALUES 
  ('College Marketing Student', 'A college student sharing marketing tips, AI tools, and hustle content. Relatable, authentic, learning-in-public vibe.', 'marketing tips', 'casual, gen-z, educational', 'reels,carousels,stories', '#marketingtips #digitalmarketing #sidehustle #collegelife #AItools #growthhacking', 5),
  ('NYC Digital Agency', 'A professional NYC-based digital marketing agency sharing client results, industry insights, and behind-the-scenes.', 'agency', 'professional, confident, results-driven', 'reels,carousels,images', '#digitalagency #NYCmarketing #clientresults #marketingagency #socialmediamarketing', 4),
  ('Entrepreneur Lifestyle', 'An entrepreneur sharing motivational content, day-in-the-life, business tips, and mindset content.', 'entrepreneurship', 'motivational, aspirational, authentic', 'reels,stories,images', '#entrepreneur #hustle #businesstips #motivation #ceolife #grindset', 6)
ON CONFLICT DO NOTHING;
