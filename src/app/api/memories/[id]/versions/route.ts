import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { data, error } = await supabase
    .from("memory_versions")
    .select("*")
    .eq("memory_id", params.id)
    .order("created_at", { ascending: false })
    .limit(100)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data || [] })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json()
  const action = body.action as string

  if (action === "restore") {
    const { version_id } = body
    if (!version_id) return NextResponse.json({ error: "version_id required" }, { status: 400 })
    const { data: v, error: e1 } = await supabase
      .from("memory_versions")
      .select("*")
      .eq("id", version_id)
      .single()
    if (e1 || !v) return NextResponse.json({ error: e1?.message || "not found" }, { status: 404 })

    const { data, error } = await supabase
      .from("memories")
      .update({
        title: v.title,
        body: v.body,
        description: v.description,
        emoji: v.emoji,
        tags: v.tags || [],
      })
      .eq("id", params.id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}
