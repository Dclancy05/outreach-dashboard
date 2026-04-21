import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/**
 * POST /api/ai-agent/scan
 *
 * The 24/7 self-heal loop. Pulls up to 10 open ai_agent_log rows (oldest
 * failures first — FIFO so a single stuck selector doesn't starve a newer
 * one forever) and drafts a `proposed_fix` for each. Flips `status` to
 * `proposed` so the UI (and a future human-review queue) can pick them up.
 *
 * Currently the LLM call is STUBBED. When the replay engine + vision
 * fallback land, the `draftFix()` function is the only thing that needs to
 * swap out — everything else (scheduling, auth, DB plumbing) stays.
 *
 * Triggered by:
 *   1. Vercel Cron every 15 min (vercel.json)
 *   2. Replay-engine failure webhooks (not yet wired)
 *
 * Auth: shared CRON_SECRET bearer.
 */
async function handle(req: NextRequest) {
  const auth = req.headers.get("authorization") || ""
  const expected = process.env.CRON_SECRET || ""
  if (!expected) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 })
  }
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const BATCH = 10
  const { data: openRows, error } = await supabase
    .from("ai_agent_log")
    .select("id, automation_id, failed_step_index, error, selectors_snapshot")
    .eq("status", "open")
    .order("created_at", { ascending: true })
    .limit(BATCH)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const picked = openRows || []
  const processed: string[] = []
  const failures: { id: string; error: string }[] = []

  for (const row of picked) {
    const proposed = draftFix(row)
    const { error: upErr } = await supabase
      .from("ai_agent_log")
      .update({
        status: "proposed",
        proposed_fix: proposed,
      })
      .eq("id", row.id)
    if (upErr) {
      failures.push({ id: row.id, error: upErr.message })
    } else {
      processed.push(row.id)
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: picked.length,
    proposed: processed.length,
    failures,
  })
}

// STUB — the real version will:
//   - fetch the automation's step (selectors, screenshot_before)
//   - call the LLM (vision + selectors) to pick a new selector
//   - populate confidence from the model's logprobs / vision score
// For now: deterministic placeholder so the control path is testable.
function draftFix(_row: any) {
  return {
    new_selector: "<needs-vision-fallback>",
    confidence: 0.0,
    rationale: "stub — no LLM call yet",
  }
}

export async function POST(req: NextRequest) {
  return handle(req)
}

// Vercel Cron sends GET by default; accept both.
export async function GET(req: NextRequest) {
  return handle(req)
}
