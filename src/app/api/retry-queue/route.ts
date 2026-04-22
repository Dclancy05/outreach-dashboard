import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { nextRetryDelay } from "@/lib/retry-queue"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const status = searchParams.get("status") || "pending"
  const limit = parseInt(searchParams.get("limit") || "50")

  const query = supabase
    .from("retry_queue")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit)

  if (status !== "all") query.eq("status", status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message, data: [] }, { status: 500 })

  // Summary counts
  const { data: summary } = await supabase
    .from("retry_queue")
    .select("status")
    .limit(10000)

  const counts = (summary || []).reduce((acc: Record<string, number>, r: any) => {
    acc[r.status] = (acc[r.status] || 0) + 1
    return acc
  }, {})

  return NextResponse.json({ data: data || [], counts })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action_type, payload, max_attempts, account_id, lead_id, error_message } = body

  if (!action_type || !payload) {
    return NextResponse.json({ error: "Missing action_type or payload" }, { status: 400 })
  }

  const delaySec = nextRetryDelay(0)
  const nextAt = new Date(Date.now() + delaySec * 1000).toISOString()

  const { data, error } = await supabase
    .from("retry_queue")
    .insert({
      action_type,
      payload,
      max_attempts: max_attempts || 5,
      next_retry_at: nextAt,
      account_id: account_id || null,
      lead_id: lead_id || null,
      error_message: error_message || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, data })
}
