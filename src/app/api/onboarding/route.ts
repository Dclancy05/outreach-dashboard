import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const DEFAULT_KEY = "dylan"

// GET /api/onboarding — returns current step + completion timestamp.
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") || DEFAULT_KEY
  const { data, error } = await supabase
    .from("onboarding_status")
    .select("*")
    .eq("id", id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(
    data || { id, completed_at: null, current_step: 0 }
  )
}

// POST /api/onboarding — update step / mark complete.
export async function POST(req: NextRequest) {
  let body: any = {}
  try {
    body = await req.json()
  } catch {}
  const id = body?.id || DEFAULT_KEY
  const step = typeof body?.step === "number" ? body.step : undefined
  const completed = !!body?.completed

  const row: any = {
    id,
    updated_at: new Date().toISOString(),
  }
  if (typeof step === "number") row.current_step = step
  if (completed) row.completed_at = new Date().toISOString()

  const { data, error } = await supabase
    .from("onboarding_status")
    .upsert(row, { onConflict: "id" })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
