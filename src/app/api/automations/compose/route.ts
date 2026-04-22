import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export const dynamic = "force-dynamic"

/**
 * POST /api/automations/compose
 *
 * Creates a brand new automation row composed from pre-existing automation
 * steps (Phase 3 / Your Selectors drag-and-drop builder). The payload is the
 * same shape as /api/automations POST except each step can carry a
 * `composed_from: { automation_id, step_index }` pointer back to the step it
 * was copied from. That pointer is kept so future maintenance can rebuild a
 * composed workflow if the source automation's selectors get re-recorded.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { name, platform, tag, steps, description } = body

  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "name is required" }, { status: 400 })
  }
  if (!platform || typeof platform !== "string") {
    return NextResponse.json({ error: "platform is required" }, { status: 400 })
  }
  if (tag && !["outreach_action", "lead_enrichment", "utility"].includes(tag)) {
    return NextResponse.json({ error: "invalid tag" }, { status: 400 })
  }
  if (!Array.isArray(steps) || steps.length === 0) {
    return NextResponse.json({ error: "at least one step is required" }, { status: 400 })
  }

  const normalized = steps.map((s: Record<string, unknown>, i: number) => ({
    index: i,
    description: typeof s?.description === "string" ? s.description : "",
    kind: typeof s?.kind === "string" ? s.kind : "pending",
    selectors: (s?.selectors && typeof s.selectors === "object") ? s.selectors : {},
    coords: s?.coords ?? null,
    composed_from: (s?.composed_from && typeof s.composed_from === "object") ? s.composed_from : null,
  }))

  const { data, error } = await supabase
    .from("automations")
    .insert({
      name: name.trim(),
      platform,
      tag: tag || "utility",
      description: description || "Composed workflow from Your Selectors",
      steps: normalized,
      status: "draft",
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
