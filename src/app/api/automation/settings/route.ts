import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("business_id") || "default"

  const { data, error } = await supabase
    .from("outreach_settings")
    .select("*")
    .eq("business_id", businessId)
    .single()

  if (error) {
    // Try without business_id filter
    const { data: fallback } = await supabase
      .from("outreach_settings")
      .select("*")
      .limit(1)
      .single()
    return NextResponse.json({ data: fallback })
  }

  return NextResponse.json({ data })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const businessId = body.business_id || "default"

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  const fields = ["min_delay_seconds", "max_delay_seconds", "pause_after_n_sends", "pause_duration_minutes", "active_hours_start", "active_hours_end", "timezone"]

  for (const f of fields) {
    if (body[f] !== undefined) updates[f] = body[f]
  }

  const { error } = await supabase
    .from("outreach_settings")
    .update(updates)
    .eq("business_id", businessId)

  if (error) {
    // Upsert if doesn't exist
    const { error: upsertErr } = await supabase.from("outreach_settings").upsert({
      id: `os_${Date.now().toString(36)}`,
      business_id: businessId,
      ...updates,
    })
    if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
