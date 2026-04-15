-- Content Brands & Ideas tables for the Content Hub
-- Run this against your Supabase database

CREATE TABLE IF NOT EXISTS content_brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  niche TEXT NOT NULL,
  tone TEXT DEFAULT 'professional',
  emoji TEXT DEFAULT '🎯',
  gradient_from TEXT DEFAULT '#a855f7',
  gradient_to TEXT DEFAULT '#7c3aed',
  account_count INTEGER DEFAULT 0,
  business_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS content_ideas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID REFERENCES content_brands(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  source_url TEXT,
  content_type TEXT DEFAULT 'image', -- reel, image, carousel
  status TEXT DEFAULT 'pending', -- pending, approved, rejected, created
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_ideas_brand ON content_ideas(brand_id);
CREATE INDEX IF NOT EXISTS idx_content_ideas_status ON content_ideas(status);
