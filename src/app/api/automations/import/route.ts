import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export const dynamic = "force-dynamic"

/**
 * POST /api/automations/import — P9.5
 *
 * Accepts a payload produced by /api/automations/export and inserts each
 * entry as a fresh `automations` row. Skips rows missing required fields
 * instead of failing the whole batch, and returns a summary of what was
 * imported vs. skipped so the UI can render a clean report.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const list = Array.isArray(body?.automations) ? body.automations : []
  if (!list.length) {
    return NextResponse.json({ error: "No automations in payload" }, { status: 400 })
  }

  const rows: Array<Record<string, unknown>> = []
  const skipped: Array<{ reason: string; name?: string }> = []

  for (const raw of list) {
    const name = typeof raw?.name === "string" ? raw.name.trim() : ""
    const platform = typeof raw?.platform === "string" ? raw.platform.trim() : ""
    if (!name || !platform) {
      skipped.push({ reason: "missing name or platform", name: raw?.name })
      continue
    }
    const tag = raw?.tag && ["outreach_action", "lead_enrichment", "utility"].includes(raw.tag)
      ? raw.tag : null
    const steps = Array.isArray(raw?.steps) ? raw.steps : []

    rows.push({
      name,
      platform,
      tag,
      description: raw?.description || null,
      steps,
      status: "draft",
      health_score: typeof raw?.health_score === "number" ? raw.health_score : 100,
    })
  }

  if (!rows.length) {
    return NextResponse.json({
      imported: 0, skipped: skipped.length, skip_reasons: skipped,
    })
  }

  const { data, error } = await supabase.from("automations").insert(rows).select("id, name")
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    imported: data?.length || 0,
    skipped: skipped.length,
    skip_reasons: skipped,
    created: data || [],
  })
}
