import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET() {
  const { data: members, error } = await supabase
    .from("team_members")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Get business access and page permissions for each member
  const enriched = await Promise.all(
    (members || []).map(async (m) => {
      const [access, perms] = await Promise.all([
        supabase.from("team_business_access").select("business_id").eq("team_member_id", m.id),
        supabase.from("team_page_permissions").select("page_name, allowed").eq("team_member_id", m.id),
      ])
      return {
        ...m,
        business_ids: (access.data || []).map((a: { business_id: string }) => a.business_id),
        permissions: (perms.data || []).reduce((acc: Record<string, boolean>, p: { page_name: string; allowed: boolean }) => {
          acc[p.page_name] = p.allowed
          return acc
        }, {}),
      }
    })
  )

  return NextResponse.json({ data: enriched })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action, ...rest } = body

  if (action === "create") {
    const { data, error } = await supabase.from("team_members").insert({
      name: rest.name || "",
      pin: rest.pin || "",
      email: rest.email || "",
      phone: rest.phone || "",
      role: rest.role || "va",
    }).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Set business access
    if (rest.business_ids?.length) {
      await supabase.from("team_business_access").insert(
        rest.business_ids.map((bid: string) => ({ team_member_id: data.id, business_id: bid }))
      )
    }

    // Set page permissions
    if (rest.permissions) {
      const perms = Object.entries(rest.permissions).map(([page, allowed]) => ({
        team_member_id: data.id,
        page_name: page,
        allowed: allowed as boolean,
      }))
      if (perms.length) await supabase.from("team_page_permissions").insert(perms)
    }

    return NextResponse.json({ success: true, data })
  }

  if (action === "update") {
    const { id, business_ids, permissions, ...updates } = rest
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

    if (Object.keys(updates).length > 0) {
      await supabase.from("team_members").update(updates).eq("id", id)
    }

    if (business_ids !== undefined) {
      await supabase.from("team_business_access").delete().eq("team_member_id", id)
      if (business_ids.length) {
        await supabase.from("team_business_access").insert(
          business_ids.map((bid: string) => ({ team_member_id: id, business_id: bid }))
        )
      }
    }

    if (permissions !== undefined) {
      await supabase.from("team_page_permissions").delete().eq("team_member_id", id)
      const perms = Object.entries(permissions).map(([page, allowed]) => ({
        team_member_id: id,
        page_name: page,
        allowed: allowed as boolean,
      }))
      if (perms.length) await supabase.from("team_page_permissions").insert(perms)
    }

    return NextResponse.json({ success: true })
  }

  if (action === "delete") {
    const { error } = await supabase.from("team_members").delete().eq("id", rest.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (action === "login") {
    const { data, error } = await supabase
      .from("team_members")
      .select("*")
      .eq("pin", rest.pin)
      .eq("status", "active")
      .single()
    if (error || !data) return NextResponse.json({ error: "Invalid PIN" }, { status: 401 })

    const [access, perms] = await Promise.all([
      supabase.from("team_business_access").select("business_id").eq("team_member_id", data.id),
      supabase.from("team_page_permissions").select("page_name, allowed").eq("team_member_id", data.id),
    ])

    return NextResponse.json({
      success: true,
      data: {
        ...data,
        pin: undefined,
        business_ids: (access.data || []).map((a: { business_id: string }) => a.business_id),
        permissions: (perms.data || []).reduce((acc: Record<string, boolean>, p: { page_name: string; allowed: boolean }) => {
          acc[p.page_name] = p.allowed
          return acc
        }, {}),
      },
    })
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}
