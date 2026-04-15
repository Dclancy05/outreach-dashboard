import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("business_id") || ""

  let query = supabase.from("warmup_sequences").select("*").order("created_at", { ascending: false })
  if (businessId) query = query.or(`business_id.eq.${businessId},business_id.eq.default`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action } = body

  if (action === "create") {
    const id = `ws_${Date.now().toString(36)}`
    const row = {
      id,
      name: body.name || "New Sequence",
      platform: body.platform || "",
      business_id: body.business_id || "default",
      steps: body.steps || [],
    }
    const { error } = await supabase.from("warmup_sequences").insert(row)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data: row })
  }

  if (action === "update") {
    const { id, ...updates } = body
    delete updates.action
    const { error } = await supabase.from("warmup_sequences").update(updates).eq("id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (action === "delete") {
    const { error } = await supabase.from("warmup_sequences").delete().eq("id", body.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (action === "assign") {
    // Assign warmup sequence to an account
    const { account_id, warmup_sequence_id } = body
    if (!account_id) return NextResponse.json({ error: "Missing account_id" }, { status: 400 })

    const { error } = await supabase
      .from("accounts")
      .update({ warmup_sequence_id: warmup_sequence_id || "", warmup_day: 1 })
      .eq("account_id", account_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}
