import { NextResponse } from "next/server"

export async function POST() {
  // This returns the SQL that needs to be run in the Supabase SQL Editor
  // Can't run ALTER TABLE through the REST API
  const sql = `
ALTER TABLE leads ADD COLUMN IF NOT EXISTS linkedin_personal_url TEXT DEFAULT '';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS enrichment_status TEXT DEFAULT 'pending';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS enrichment_data TEXT DEFAULT '';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS enriched_at TEXT DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_leads_enrichment_status ON leads (enrichment_status);
  `.trim()

  return NextResponse.json({
    message: "Run this SQL in your Supabase SQL Editor to add enrichment columns. The pipeline works without them (uses platform_profile as fallback) but it's cleaner with dedicated columns.",
    sql,
    dashboard_url: "https://supabase.com/dashboard/project/yfufocegjhxxffqtkvkr/sql/new",
  })
}
