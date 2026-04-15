import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const match_id = searchParams.get("match_id")
  const status = searchParams.get("status")
  const limit = parseInt(searchParams.get("limit") || "50")

  let query = supabase.from("scout_replies").select("*").order("created_at", { ascending: false }).limit(limit)
  if (match_id) query = query.eq("match_id", match_id)
  if (status) query = query.eq("status", status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { data, error } = await supabase
    .from("scout_replies")
    .insert({
      match_id: body.match_id,
      account_id: body.account_id || null,
      reply_text: body.reply_text,
      ai_generated: body.ai_generated ?? true,
      edited_by_human: body.edited_by_human ?? false,
      status: body.status || "draft",
      feedback_notes: body.feedback_notes || null,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })
  
  if (updates.status === "approved") {
    updates.edited_by_human = true
  }
  if (updates.status === "sent") {
    updates.sent_at = new Date().toISOString()
    // Also update match status
    const { data: reply } = await supabase.from("scout_replies").select("match_id").eq("id", id).single()
    if (reply) {
      await supabase.from("scout_matches").update({ status: "sent" }).eq("id", reply.match_id)
    }
    // Increment campaign reply_count
  }

  const { data, error } = await supabase.from("scout_replies").update(updates).eq("id", id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
