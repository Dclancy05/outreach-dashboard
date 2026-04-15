import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  let query = supabase.from("seo_fixes").select("*")

  const fixType = searchParams.get("fix_type")
  const status = searchParams.get("status")
  const pageId = searchParams.get("page_id")

  if (fixType) query = query.eq("fix_type", fixType)
  if (status) query = query.eq("status", status)
  if (pageId) query = query.eq("page_id", pageId)

  const { data, error } = await query.order("applied_at", { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { data, error } = await supabase.from("seo_fixes").insert(body).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
