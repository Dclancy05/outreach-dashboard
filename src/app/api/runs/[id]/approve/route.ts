// POST /api/runs/[id]/approve { step_id, decision: 'approve' | 'reject', note? }
// Emits the approval event the runWorkflow function is `step.waitForEvent`-ing.

import { NextRequest, NextResponse } from "next/server"
import { inngest, EVENT_RUN_APPROVAL } from "@/lib/inngest/client"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const body = await req.json().catch(() => ({})) as { step_id?: string; decision?: "approve" | "reject"; note?: string }
  if (!body.step_id || !body.decision) {
    return NextResponse.json({ error: "step_id and decision required" }, { status: 400 })
  }
  if (!["approve", "reject"].includes(body.decision)) {
    return NextResponse.json({ error: "decision must be approve|reject" }, { status: 400 })
  }

  await inngest.send({
    name: EVENT_RUN_APPROVAL,
    data: { run_id: id, step_id: body.step_id, decision: body.decision, note: body.note },
  })

  return NextResponse.json({ ok: true })
}
