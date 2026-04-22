import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const key = searchParams.get("key")

  if (key) {
    const { data, error } = await supabase
      .from("system_settings")
      .select("*")
      .eq("key", key)
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data || { key, value: null })
  }

  const { data, error } = await supabase
    .from("system_settings")
    .select("*")
    .order("key")
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const byKey: Record<string, any> = {}
  for (const row of data || []) byKey[row.key] = row.value
  return NextResponse.json({ data: data || [], byKey })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { key, value } = body
  if (!key) return NextResponse.json({ error: "key required" }, { status: 400 })

  const { data, error } = await supabase
    .from("system_settings")
    .upsert({ key, value, updated_at: new Date().toISOString() })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data })
}
