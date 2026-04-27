// POST /api/workflows/[id]/run — queue a real workflow run.

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { inngest, EVENT_RUN_QUEUED } from "@/lib/inngest/client"
import { checkGlobalDailyBudget, BudgetExceededError } from "@/lib/workflow/cost-guards"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const body = await req.json().catch(() => ({})) as { input?: Record<string, unknown> }
  const input = body.input || {}

  try {
    await checkGlobalDailyBudget()
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      return NextResponse.json({ error: err.message, layer: err.layer }, { status: 402 })
    }
    throw err
  }

  const { data: run, error } = await supabase.from("workflow_runs").insert({
    workflow_id: id,
    trigger: "manual",
    status: "queued",
    input,
  }).select("id").single()
  if (error || !run) return NextResponse.json({ error: error?.message || "failed" }, { status: 500 })

  await inngest.send({
    name: EVENT_RUN_QUEUED,
    data: { run_id: run.id, workflow_id: id, input },
  })

  return NextResponse.json({ run_id: run.id })
}
