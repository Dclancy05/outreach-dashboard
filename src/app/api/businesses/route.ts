import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET() {
  const { data, error } = await supabase
    .from("businesses")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Get stats for each business
  const enriched = await Promise.all(
    (data || []).map(async (biz) => {
      // Count leads: for "default" business, count leads with business_id = "default" OR empty/null
      const leadsQuery = supabase.from("leads").select("*", { count: "exact", head: true })
      if (biz.id === "default") {
        leadsQuery.or("business_id.eq.default,business_id.eq.,business_id.is.null")
      } else {
        leadsQuery.eq("business_id", biz.id)
      }
      const accountsQuery = supabase.from("accounts").select("*", { count: "exact", head: true })
      if (biz.id === "default") {
        accountsQuery.or("business_id.eq.default,business_id.eq.,business_id.is.null")
      } else {
        accountsQuery.eq("business_id", biz.id)
      }
      const messagesQ = supabase.from("messages").select("*", { count: "exact", head: true })
      if (biz.id === "default") {
        messagesQ.or("business_id.eq.default,business_id.eq.,business_id.is.null")
      } else {
        messagesQ.eq("business_id", biz.id)
      }
      const [leads, accounts, messages] = await Promise.all([
        leadsQuery,
        accountsQuery,
        messagesQ,
      ])
      return {
        ...biz,
        leads_count: leads.count || 0,
        accounts_count: accounts.count || 0,
        messages_sent: messages.count || 0,
      }
    })
  )

  return NextResponse.json({ data: enriched })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action, ...rest } = body

  if (action === "create") {
    const id = `biz_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const { error } = await supabase.from("businesses").insert({
      id,
      name: rest.name || "New Business",
      description: rest.description || "",
      service_type: rest.service_type || "",
      color: rest.color || "#8B5CF6",
      icon: rest.icon || "🏪",
      status: "active",
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, id })
  }

  if (action === "update") {
    const { id, ...updates } = rest
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })
    updates.updated_at = new Date().toISOString()
    const { error } = await supabase.from("businesses").update(updates).eq("id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (action === "archive") {
    const { error } = await supabase.from("businesses").update({ status: "archived" }).eq("id", rest.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (action === "delete") {
    if (!rest.id) return NextResponse.json({ error: "Missing id" }, { status: 400 })
    const { error } = await supabase.from("businesses").delete().eq("id", rest.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}
