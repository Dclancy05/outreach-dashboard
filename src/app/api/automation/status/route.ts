import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET() {
  const { data, error } = await supabase
    .from("automation_status")
    .select("*")
    .order("platform")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { platform, action } = body

  if (!platform || !action) {
    return NextResponse.json({ error: "Missing platform or action" }, { status: 400 })
  }

  const validActions: Record<string, string> = {
    pause: "paused",
    resume: "running",
    stop: "stopped",
    reset_errors: "stopped",
  }

  const newStatus = validActions[action]
  if (!newStatus) {
    return NextResponse.json({ error: "Invalid action. Use: pause, resume, stop, reset_errors" }, { status: 400 })
  }

  const updates: Record<string, unknown> = {
    status: newStatus,
    updated_at: new Date().toISOString(),
  }

  if (action === "reset_errors") {
    updates.error_count = 0
    updates.last_error = ""
  }

  const { error } = await supabase
    .from("automation_status")
    .update(updates)
    .eq("platform", platform)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, platform, status: newStatus })
}
