import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const leadId = url.searchParams.get("lead_id")
    const limit = Number(url.searchParams.get("limit")) || 50
    
    if (!leadId) return NextResponse.json({ error: "Missing lead_id" }, { status: 400 })
    
    const { data, error } = await supabase
      .from("lead_activity")
      .select("*")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(limit)
    
    if (error) throw new Error(error.message)
    return NextResponse.json({ success: true, data: data || [] })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { lead_id, activity_type, content, account_used, va_name, business_id } = body
    
    if (!lead_id || !activity_type) {
      return NextResponse.json({ error: "Missing lead_id or activity_type" }, { status: 400 })
    }
    
    const { data, error } = await supabase.from("lead_activity").insert({
      lead_id,
      activity_type,
      content: content || "",
      account_used: account_used || "",
      va_name: va_name || "",
      business_id: business_id || "default",
    }).select().single()
    
    if (error) throw new Error(error.message)
    return NextResponse.json({ success: true, data })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
