// /api/schedules/[id] — GET, PATCH, DELETE.

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { parseExpression as parseCronExpression } from "cron-parser"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const { data, error } = await supabase.from("schedules").select("*").eq("id", id).single()
  if (error || !data) return NextResponse.json({ error: error?.message || "not found" }, { status: 404 })
  return NextResponse.json({ data })
}

const PATCHABLE = new Set(["name", "cron", "timezone", "payload", "enabled"])

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const patch: Record<string, unknown> = {}
  for (const k of Object.keys(body)) if (PATCHABLE.has(k)) patch[k] = body[k]

  // Recompute next_fire_at if cron or timezone changed
  if (patch.cron || patch.timezone) {
    const { data: cur } = await supabase.from("schedules").select("cron, timezone").eq("id", id).single()
    const cron = (patch.cron as string) || cur?.cron || ""
    const tz = (patch.timezone as string) || cur?.timezone || "America/New_York"
    try {
      patch.next_fire_at = parseCronExpression(cron, { tz }).next().toDate().toISOString()
    } catch (e) {
      return NextResponse.json({ error: `invalid cron: ${(e as Error).message}` }, { status: 400 })
    }
  }

  const { data, error } = await supabase.from("schedules").update(patch).eq("id", id).select("*").single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params
  await supabase.from("schedules").delete().eq("id", id)
  return NextResponse.json({ ok: true })
}
