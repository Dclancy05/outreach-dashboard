-- VA Users table (extends team_members if not using it directly)
-- This migration creates a dedicated va_users table for VA authentication
-- Run against your Supabase project

CREATE TABLE IF NOT EXISTS va_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  pin TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'va',
  assigned_accounts TEXT[] DEFAULT '{}',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast PIN lookups
CREATE INDEX IF NOT EXISTS idx_va_users_pin ON va_users(pin);
CREATE INDEX IF NOT EXISTS idx_va_users_active ON va_users(active);

-- RLS policies
ALTER TABLE va_users ENABLE ROW LEVEL SECURITY;

-- Only service role can read/write va_users
CREATE POLICY "Service role full access" ON va_users
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
