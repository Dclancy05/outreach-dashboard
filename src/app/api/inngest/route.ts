// Inngest discovery endpoint — Inngest hits this to register/invoke functions.
// One handler per function, exported as the serve() second arg.

import { serve } from "inngest/next"
import { inngest } from "@/lib/inngest/client"
import { runWorkflow, summarizeRun } from "@/lib/inngest/functions/run-workflow"
import { costCapCheck, morningDigest } from "@/lib/inngest/functions/scheduled"

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [runWorkflow, summarizeRun, costCapCheck, morningDigest],
})

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 300
