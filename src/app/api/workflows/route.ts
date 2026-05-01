// /api/workflows — list (GET) + create (POST).

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { EMPTY_GRAPH } from "@/lib/workflow/graph"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const status = sp.get("status")
  const templatesOnly = sp.get("templates_only") === "true"

  let q = supabase.from("workflows").select("*").order("updated_at", { ascending: false })
  if (status) {
    q = q.eq("status", status)
  } else {
    // Default: hide archived rows. /api/workflows/[id] DELETE is a soft-delete
    // that flips status to "archived"; without this filter every "deleted"
    // workflow still showed up on the cards. Pass ?status=archived to see them.
    q = q.neq("status", "archived")
  }
  if (templatesOnly) q = q.eq("is_template", true)
  else q = q.eq("is_template", false)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data || [] })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { name?: string; description?: string; emoji?: string; from_template_id?: string } | null
  if (!body?.name) return NextResponse.json({ error: "name required" }, { status: 400 })

  let graph = EMPTY_GRAPH
  let entry_node_id: string | null = null
  if (body.from_template_id) {
    const { data: tpl } = await supabase
      .from("workflows").select("graph, entry_node_id")
      .eq("id", body.from_template_id).eq("is_template", true).single()
    if (tpl) {
      graph = tpl.graph
      entry_node_id = tpl.entry_node_id
    }
  }

  const { data, error } = await supabase.from("workflows").insert({
    name: body.name,
    description: body.description || null,
    emoji: body.emoji || null,
    graph,
    entry_node_id,
    status: "draft",
    is_template: false,
  }).select("*").single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
