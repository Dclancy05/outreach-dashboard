import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST() {
  const results: string[] = []

  // Create recording_actions table by inserting a seed row then deleting
  // We use Supabase's auto-schema detection — but actually Supabase doesn't auto-create tables
  // We need to use the SQL approach via pg connection

  // Check if tables exist
  const tables = ['recording_actions', 'automation_scripts', 'automation_test_log']
  for (const table of tables) {
    const { error } = await supabase.from(table).select("id").limit(0)
    if (error?.message?.includes("not found")) {
      results.push(`${table}: MISSING`)
    } else {
      results.push(`${table}: EXISTS`)
    }
  }

  // Check recordings table
  const { error: recErr } = await supabase.from("recordings").select("id").limit(0)
  if (recErr?.message?.includes("not found")) {
    results.push("recordings: MISSING")
  } else {
    results.push("recordings: EXISTS")
  }

  const allExist = results.every(r => r.includes("EXISTS"))

  return NextResponse.json({
    tables: results,
    allExist,
    message: allExist
      ? "All tables exist"
      : "Some tables are missing. Run the SQL below in Supabase SQL Editor.",
    sql: `
CREATE TABLE IF NOT EXISTS recording_actions (
  id text PRIMARY KEY DEFAULT 'ra_' || substr(md5(random()::text), 1, 12),
  recording_id text NOT NULL,
  step_number int,
  action_type text,
  target_selector text,
  target_text text,
  typed_text text,
  url text,
  coordinates jsonb,
  timestamp_ms bigint,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS automation_scripts (
  id text PRIMARY KEY DEFAULT 'as_' || substr(md5(random()::text), 1, 12),
  recording_id text,
  platform text,
  action_type text,
  script_json jsonb,
  selectors jsonb,
  status text DEFAULT 'testing',
  test_attempts int DEFAULT 0,
  last_test_at timestamptz,
  last_test_result jsonb,
  last_error text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS automation_test_log (
  id text PRIMARY KEY DEFAULT 'atl_' || substr(md5(random()::text), 1, 12),
  script_id text,
  attempt_number int,
  strategy text,
  test_target text,
  success boolean,
  error_message text,
  screenshot_url text,
  duration_ms int,
  created_at timestamptz DEFAULT now()
);
`
  })
}

export async function GET() {
  return POST()
}
