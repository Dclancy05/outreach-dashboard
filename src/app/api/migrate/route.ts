import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST() {
  const results: string[] = []

  // 1. Create message_templates table via insert test (table must exist)
  // We'll use raw SQL via supabase-js rpc or just try creating via insert
  // Since we can't run DDL via PostgREST, we'll need to handle this differently

  // Actually, let's create an RPC function first, then use it
  // But we can't create functions via PostgREST either...

  // The workaround: use the Supabase client to test if tables exist,
  // and if not, return the SQL that needs to be run manually

  const tables = ["message_templates", "manual_sends", "outreach_settings"]
  for (const table of tables) {
    const { error } = await supabase.from(table).select("*").limit(0)
    if (error?.message?.includes("not found")) {
      results.push(`Table ${table} does NOT exist`)
    } else {
      results.push(`Table ${table} exists`)
    }
  }

  // Check leads columns
  const { error: colError } = await supabase.from("leads").select("email_status").limit(0)
  if (colError) {
    results.push(`leads.email_status column missing: ${colError.message}`)
  } else {
    results.push("leads.email_status exists")
  }

  return NextResponse.json({
    results,
    sql_needed: `
-- Run this in Supabase SQL Editor:

CREATE TABLE IF NOT EXISTS message_templates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  template_group text NOT NULL,
  platform text NOT NULL,
  label text NOT NULL,
  emoji text DEFAULT '💬',
  subject text DEFAULT '',
  body text NOT NULL,
  active boolean DEFAULT true,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS manual_sends (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id text NOT NULL,
  template_id uuid REFERENCES message_templates(id),
  platform text NOT NULL,
  message_text text NOT NULL,
  sent_at timestamptz DEFAULT now()
);

ALTER TABLE leads ADD COLUMN IF NOT EXISTS email_status text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS phone_type text;

CREATE TABLE IF NOT EXISTS outreach_settings (
  id text PRIMARY KEY DEFAULT 'default',
  daily_limits jsonb DEFAULT '{"instagram": 40, "facebook": 30, "linkedin": 20, "email": 50, "sms": 20}',
  updated_at timestamptz DEFAULT now()
);

INSERT INTO outreach_settings (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

ALTER TABLE sequences ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE sequences ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
    `
  })
}
