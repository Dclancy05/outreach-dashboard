import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const limit = parseInt(searchParams.get("limit") || "20")
  const unreadOnly = searchParams.get("unread") === "true"

  let query = supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit)

  if (unreadOnly) {
    query = query.eq("read", false)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Get unread count
  const { count } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("read", false)

  return NextResponse.json({ data, unread_count: count || 0 })
}

export async function POST(req: NextRequest) {
  const body = await req.json()

  if (body.action === "mark_read") {
    if (body.id) {
      await supabase.from("notifications").update({ read: true }).eq("id", body.id)
    } else if (body.mark_all) {
      await supabase.from("notifications").update({ read: true }).eq("read", false)
    }
    return NextResponse.json({ success: true })
  }

  if (body.action === "create") {
    const { error } = await supabase.from("notifications").insert({
      type: body.type || "system",
      title: body.title,
      message: body.message,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}
