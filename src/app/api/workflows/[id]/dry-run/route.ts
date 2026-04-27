// POST /api/workflows/[id]/dry-run — same as /run but with dry_run=true so
// the agent runner returns mocked output instead of calling real LLMs.
// Lets Dylan iterate on a workflow without spending money.

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { inngest, EVENT_RUN_QUEUED } from "@/lib/inngest/client"

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

  const { data: run, error } = await supabase.from("workflow_runs").insert({
    workflow_id: id,
    trigger: "dry_run",
    status: "queued",
    input,
  }).select("id").single()
  if (error || !run) return NextResponse.json({ error: error?.message || "failed" }, { status: 500 })

  await inngest.send({
    name: EVENT_RUN_QUEUED,
    data: { run_id: run.id, workflow_id: id, input, dry_run: true },
  })

  return NextResponse.json({ run_id: run.id })
}
