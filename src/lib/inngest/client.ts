// Inngest client — single shared instance. The signing/event keys come from
// env (see .env.example). On Vercel, Inngest discovers our functions via the
// /api/inngest endpoint (see src/app/api/inngest/route.ts).

import { Inngest } from "inngest"

export const inngest = new Inngest({
  id: "outreach-os",
  eventKey: process.env.INNGEST_EVENT_KEY,
})

// ─── Event names (kept in one place so producers + consumers stay in sync) ──
export const EVENT_RUN_QUEUED   = "workflow/run.queued"   as const
export const EVENT_RUN_APPROVAL = "workflow/run.approval" as const
export const EVENT_RUN_PAUSED   = "workflow/run.paused"   as const
export const EVENT_RUN_RESUMED  = "workflow/run.resumed"  as const
export const EVENT_RUN_ABORTED  = "workflow/run.aborted"  as const

export interface RunQueuedEvent {
  data: {
    run_id: string
    workflow_id: string
    input: Record<string, unknown>
    dry_run?: boolean
  }
}

export interface RunApprovalEvent {
  data: {
    run_id: string
    step_id: string
    decision: "approve" | "reject"
    note?: string
  }
}
