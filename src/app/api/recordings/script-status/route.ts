import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const platform = searchParams.get("platform")
  const actionType = searchParams.get("action_type")

  if (!platform || !actionType) {
    return NextResponse.json({ error: "platform and action_type required" }, { status: 400 })
  }

  // Get the latest automation script for this platform/action
  const { data, error } = await supabase
    .from("automation_scripts")
    .select("id, status, test_attempts, last_test_at, last_test_result, last_error, created_at")
    .eq("platform", platform)
    .eq("action_type", actionType)
    .order("created_at", { ascending: false })
    .limit(1)
    .single()

  if (error || !data) {
    return NextResponse.json({ status: "unknown", message: "No script found" })
  }

  return NextResponse.json({
    script_id: data.id,
    status: data.status,
    test_attempts: data.test_attempts,
    last_test_at: data.last_test_at,
    last_test_result: data.last_test_result,
    last_error: data.last_error,
  })
}
