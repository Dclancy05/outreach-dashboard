import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("business_id") || "default"

  const { data, error } = await supabase
    .from("proxy_groups")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action } = body

  if (action === "create") {
    const id = `pg_${Date.now().toString(36)}`
    const row = {
      id,
      name: body.name || body.location_city || body.ip || "New Group",
      provider: body.provider || "",
      ip: body.ip || "",
      port: body.port || "",
      username: body.username || "",
      password: body.password || "",
      location_city: body.location_city || "",
      location_state: body.location_state || "",
      location_country: body.location_country || "US",
      status: "active",
      monthly_cost: body.monthly_cost || 0,
      business_id: body.business_id || "default",
    }
    const { error } = await supabase.from("proxy_groups").insert(row)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data: row })
  }

  if (action === "update") {
    const { id, ...updates } = body
    delete updates.action
    updates.health_check_at = new Date().toISOString()
    const { error } = await supabase.from("proxy_groups").update(updates).eq("id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (action === "rename") {
    const { id, name } = body
    if (!id || !name) return NextResponse.json({ error: "Missing id or name" }, { status: 400 })
    const { error } = await supabase.from("proxy_groups").update({ name, updated_at: new Date().toISOString() }).eq("id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (action === "delete") {
    // Unassign all accounts from this proxy group before deleting
    await supabase.from("accounts").update({ proxy_group_id: "" }).eq("proxy_group_id", body.id)
    const { error } = await supabase.from("proxy_groups").delete().eq("id", body.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (action === "health_check") {
    // Simple health check - just mark as checked
    const { error } = await supabase
      .from("proxy_groups")
      .update({ health_check_at: new Date().toISOString() })
      .eq("id", body.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, healthy: true })
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}
