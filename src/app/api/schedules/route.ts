// /api/schedules — list (GET) + create (POST).
// next_fire_at is computed from cron + timezone using cron-parser.

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { parseExpression as parseCronExpression } from "cron-parser"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const workflowId = sp.get("workflow_id")
  const enabled = sp.get("enabled")

  let q = supabase.from("schedules").select("*").order("next_fire_at", { ascending: true })
  if (workflowId) q = q.eq("workflow_id", workflowId)
  if (enabled === "true")  q = q.eq("enabled", true)
  if (enabled === "false") q = q.eq("enabled", false)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data || [] })
}

interface CreateScheduleInput {
  workflow_id: string
  name?: string
  cron: string
  timezone?: string
  payload?: Record<string, unknown>
  enabled?: boolean
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as CreateScheduleInput | null
  if (!body?.workflow_id || !body?.cron) {
    return NextResponse.json({ error: "workflow_id and cron required" }, { status: 400 })
  }

  const tz = body.timezone || "America/New_York"
  let next: string | null = null
  try {
    const it = parseCronExpression(body.cron, { tz })
    next = it.next().toDate().toISOString()
  } catch (e) {
    return NextResponse.json({ error: `invalid cron: ${(e as Error).message}` }, { status: 400 })
  }

  const { data, error } = await supabase.from("schedules").insert({
    workflow_id: body.workflow_id,
    name: body.name || null,
    cron: body.cron,
    timezone: tz,
    payload: body.payload || {},
    enabled: body.enabled ?? true,
    next_fire_at: next,
  }).select("*").single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
