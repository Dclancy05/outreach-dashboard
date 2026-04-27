// POST /api/runs/[id]/control { action: 'pause' | 'resume' | 'abort' }
// Emits an Inngest event the runWorkflow function listens for.

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { inngest, EVENT_RUN_PAUSED, EVENT_RUN_RESUMED, EVENT_RUN_ABORTED } from "@/lib/inngest/client"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const body = await req.json().catch(() => ({})) as { action?: "pause" | "resume" | "abort" }
  const action = body.action
  if (!action || !["pause", "resume", "abort"].includes(action)) {
    return NextResponse.json({ error: "action must be pause|resume|abort" }, { status: 400 })
  }

  const eventName =
    action === "pause"  ? EVENT_RUN_PAUSED  :
    action === "resume" ? EVENT_RUN_RESUMED :
                          EVENT_RUN_ABORTED

  await inngest.send({ name: eventName, data: { run_id: id } })

  if (action === "abort") {
    await supabase.from("workflow_runs").update({
      status: "aborted",
      finished_at: new Date().toISOString(),
    }).eq("id", id)
  } else if (action === "pause") {
    await supabase.from("workflow_runs").update({ status: "paused" }).eq("id", id)
  }

  return NextResponse.json({ ok: true, action })
}
