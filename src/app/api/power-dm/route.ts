import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get("action")

  if (action === "get_queue") {
    const { data, error } = await supabase
      .from("va_tasks")
      .select("*")
      .eq("task_type", "dm")
      .eq("status", "pending")
      .order("created_at", { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action } = body

  if (action === "update_task") {
    const { task_id, status, notes } = body
    const { error } = await supabase
      .from("va_tasks")
      .update({ status, notes, updated_at: new Date().toISOString() })
      .eq("id", task_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (action === "log_dm") {
    const { lead_id, account_id, platform, message, status } = body
    const { error } = await supabase
      .from("dm_send_log")
      .insert({ lead_id, account_id, platform, message, status, sent_at: new Date().toISOString() })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}
