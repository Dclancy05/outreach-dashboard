import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  let query = supabase.from("keyword_rankings").select("*, ranking_history(*)")

  const cluster = searchParams.get("cluster")
  const niche = searchParams.get("niche")
  const service = searchParams.get("service")
  const status = searchParams.get("status")

  if (cluster) query = query.eq("cluster", cluster)
  if (niche) query = query.eq("niche", niche)
  if (service) query = query.eq("service", service)
  if (status) query = query.eq("status", status)

  const { data, error } = await query.order("created_at", { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Trim ranking_history to last 30 entries per keyword
  const trimmed = data?.map((kw: Record<string, unknown>) => ({
    ...kw,
    ranking_history: Array.isArray(kw.ranking_history)
      ? (kw.ranking_history as Record<string, unknown>[]).slice(-30)
      : [],
  }))

  return NextResponse.json({ data: trimmed })
}

export async function POST(req: NextRequest) {
  const { keywords } = await req.json()
  if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
    return NextResponse.json({ error: "Missing keywords array" }, { status: 400 })
  }
  const { data, error } = await supabase.from("keyword_rankings").insert(keywords).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function PUT(req: NextRequest) {
  const body = await req.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })
  const { data, error } = await supabase.from("keyword_rankings").update(updates).eq("id", id).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id")
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })
  const { error } = await supabase.from("keyword_rankings").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
