-- ============================================================================
-- Content System Migration
-- Run this in Supabase SQL Editor
-- ============================================================================

-- ─── Content Posts ──────────────────────────────────────────────────────────
-- Main content items (posts, reels, stories, carousels)
CREATE TABLE IF NOT EXISTS content_posts (
  id TEXT PRIMARY KEY DEFAULT ('cp_' || extract(epoch from now())::text || '_' || substr(md5(random()::text), 1, 6)),
  title TEXT NOT NULL DEFAULT '',
  caption TEXT NOT NULL DEFAULT '',
  hashtags TEXT NOT NULL DEFAULT '',
  content_type TEXT NOT NULL DEFAULT 'image' CHECK (content_type IN ('image', 'reel', 'carousel', 'story')),
  media_url TEXT NOT NULL DEFAULT '',
  media_status TEXT NOT NULL DEFAULT 'pending' CHECK (media_status IN ('pending', 'generating', 'ready', 'failed')),
  post_status TEXT NOT NULL DEFAULT 'draft' CHECK (post_status IN ('draft', 'scheduled', 'posted', 'failed')),
  ai_prompt TEXT NOT NULL DEFAULT '',
  persona_id TEXT REFERENCES content_personas(persona_id) ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ,
  posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_content_posts_status ON content_posts(post_status);
CREATE INDEX IF NOT EXISTS idx_content_posts_scheduled ON content_posts(scheduled_at) WHERE scheduled_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_content_posts_persona ON content_posts(persona_id) WHERE persona_id IS NOT NULL;

-- ─── Content Assignments ────────────────────────────────────────────────────
-- Links content to accounts for multi-account posting
CREATE TABLE IF NOT EXISTS content_assignments (
  id TEXT PRIMARY KEY DEFAULT ('ca_' || extract(epoch from now())::text || '_' || substr(md5(random()::text), 1, 6)),
  content_id TEXT NOT NULL REFERENCES content_posts(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'scheduled', 'posted', 'failed', 'skipped')),
  posted_at TIMESTAMPTZ,
  va_id TEXT,
  ig_media_id TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(content_id, account_id)
);

CREATE INDEX IF NOT EXISTS idx_content_assignments_account ON content_assignments(account_id);
CREATE INDEX IF NOT EXISTS idx_content_assignments_va ON content_assignments(va_id) WHERE va_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_content_assignments_status ON content_assignments(status);

-- ─── VA Tasks ───────────────────────────────────────────────────────────────
-- Queue of tasks for VAs (posting content, etc.)
CREATE TABLE IF NOT EXISTS va_tasks (
  id TEXT PRIMARY KEY DEFAULT ('vt_' || extract(epoch from now())::text || '_' || substr(md5(random()::text), 1, 6)),
  content_id TEXT REFERENCES content_posts(id) ON DELETE SET NULL,
  account_id TEXT NOT NULL,
  va_id TEXT,
  task_type TEXT NOT NULL DEFAULT 'post_content' CHECK (task_type IN ('post_content', 'engage', 'dm', 'comment', 'story')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled')),
  instructions TEXT NOT NULL DEFAULT '',
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_va_tasks_va ON va_tasks(va_id) WHERE va_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_va_tasks_status ON va_tasks(status);

-- ─── Video Generations ──────────────────────────────────────────────────────
-- AI video generation queue (Kling AI)
CREATE TABLE IF NOT EXISTS video_generations (
  id TEXT PRIMARY KEY,
  prompt TEXT NOT NULL DEFAULT '',
  style TEXT NOT NULL DEFAULT 'promo',
  duration INTEGER NOT NULL DEFAULT 10,
  aspect_ratio TEXT NOT NULL DEFAULT '9:16',
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'generating', 'completed', 'failed')),
  provider TEXT NOT NULL DEFAULT 'manual',
  provider_task_id TEXT NOT NULL DEFAULT '',
  video_url TEXT NOT NULL DEFAULT '',
  thumbnail_url TEXT NOT NULL DEFAULT '',
  error_message TEXT NOT NULL DEFAULT '',
  content_id TEXT NOT NULL DEFAULT '',
  business_id TEXT NOT NULL DEFAULT 'default',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_video_generations_status ON video_generations(status);

-- ─── Content Personas (if not exists) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS content_personas (
  persona_id TEXT PRIMARY KEY DEFAULT ('persona_' || extract(epoch from now())::text || '_' || substr(md5(random()::text), 1, 6)),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  niche TEXT NOT NULL DEFAULT '',
  tone TEXT NOT NULL DEFAULT '',
  content_types TEXT NOT NULL DEFAULT 'reels,images',
  hashtag_groups TEXT NOT NULL DEFAULT '',
  posting_frequency INTEGER NOT NULL DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── RLS Policies (optional — enable if using Supabase Auth) ────────────────
-- ALTER TABLE content_posts ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE content_assignments ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE va_tasks ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE video_generations ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE content_personas ENABLE ROW LEVEL SECURITY;

-- ─── Updated_at trigger ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_content_posts_updated_at') THEN
    CREATE TRIGGER update_content_posts_updated_at BEFORE UPDATE ON content_posts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_content_assignments_updated_at') THEN
    CREATE TRIGGER update_content_assignments_updated_at BEFORE UPDATE ON content_assignments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_va_tasks_updated_at') THEN
    CREATE TRIGGER update_va_tasks_updated_at BEFORE UPDATE ON va_tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
