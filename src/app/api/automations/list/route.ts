import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export const dynamic = "force-dynamic"

/**
 * GET /api/automations/list
 *
 * Unified view of the two automation ecosystems that currently exist:
 *
 *   1. `automations` (the dashboard's Phase-2 catalog — what the rebuilt
 *      /automations page writes to. Steps stored inline as jsonb.)
 *
 *   2. `autobot_automations` + `autobot_steps` (what the AutoBot Chrome
 *      extension writes to when a user hits Record. One header row plus
 *      N step rows in a child table.)
 *
 * Until the two ecosystems are fully merged at the DB layer, this route
 * does the union in application code and returns a normalized shape so
 * the UI can render everything in a single list without caring which
 * table a row originated from.
 *
 * Response shape:
 *   { data: Array<NormalizedAutomation>, errors?: {...} }
 *
 * Each NormalizedAutomation:
 *   id, source: 'dashboard'|'extension',
 *   name, platform, status, tag (nullable),
 *   steps: Array<{ index, description, kind, selector, url, value }>,
 *   health_score (0-100), created_at, updated_at
 *
 * Does NOT mutate either table. This is a read-only bridge.
 */

type NormalizedAutomation = {
  id: string
  source: "dashboard" | "extension"
  name: string
  platform: string
  status: string
  tag: string | null
  steps: Array<{
    index: number
    description: string | null
    kind: string | null
    selector: string | null
    url: string | null
    value: string | null
  }>
  health_score: number
  created_at: string | null
  updated_at: string | null
}

export async function GET(_req: NextRequest) {
  const [dashRes, extRes, stepsRes] = await Promise.all([
    supabase
      .from("automations")
      .select("id, name, platform, status, tag, steps, health_score, created_at, updated_at"),
    supabase
      .from("autobot_automations")
      .select("id, name, platform, category, status, created_at, last_run_at"),
    supabase
      .from("autobot_steps")
      .select("automation_id, sort_order, type, description, selector, url, value"),
  ])

  const dashboardRows = dashRes.error ? [] : (dashRes.data || [])
  const extensionRows = extRes.error ? [] : (extRes.data || [])
  const allSteps = stepsRes.error ? [] : (stepsRes.data || [])

  // Group extension steps by their parent automation so we can inline them
  // into the normalized shape (matching dashboard's `steps jsonb` layout).
  const stepsByAutomation = new Map<string, typeof allSteps>()
  for (const s of allSteps) {
    const list = stepsByAutomation.get(s.automation_id) || []
    list.push(s)
    stepsByAutomation.set(s.automation_id, list)
  }

  // ── Dashboard rows → normalized ──
  const dashNormalized: NormalizedAutomation[] = dashboardRows.map((r: any) => ({
    id: r.id,
    source: "dashboard",
    name: r.name,
    platform: r.platform,
    status: r.status,
    tag: r.tag ?? null,
    // dashboard stores steps inline as jsonb — already an array of step objects
    steps: Array.isArray(r.steps)
      ? r.steps.map((s: any, i: number) => ({
          index: typeof s.index === "number" ? s.index : i,
          description: s.description ?? null,
          kind: s.kind ?? null,
          selector: s.selectors?.css ?? s.selector ?? null,
          url: s.url ?? null,
          value: s.value ?? null,
        }))
      : [],
    health_score: typeof r.health_score === "number" ? r.health_score : 100,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }))

  // ── Extension rows → normalized ──
  // Extension uses `category` (scrape/outreach) vs dashboard `tag`. We map:
  //   outreach → outreach_action
  //   scrape   → lead_enrichment
  // so the UI can render them under the same tag filters.
  const extNormalized: NormalizedAutomation[] = extensionRows.map((r: any) => {
    const rawSteps = (stepsByAutomation.get(r.id) || [])
      .slice()
      .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

    const tag =
      r.category === "outreach" ? "outreach_action" :
      r.category === "scrape"   ? "lead_enrichment" :
      null

    // Extension uses `idle`/`failing`/`active` — normalize to the
    // dashboard's status vocabulary so pill colors work uniformly.
    const status =
      r.status === "failing" ? "broken" :
      r.status === "idle"    ? "active" :
      r.status || "active"

    return {
      id: r.id,
      source: "extension",
      name: r.name,
      platform: r.platform,
      status,
      tag,
      steps: rawSteps.map((s: any, i: number) => ({
        index: i,
        description: s.description ?? null,
        kind: s.type ?? null,
        selector: s.selector ?? null,
        url: s.url ?? null,
        value: s.value ?? null,
      })),
      // Extension doesn't track health_score; default to 100 unless status is failing.
      health_score: r.status === "failing" ? 50 : 100,
      created_at: r.created_at,
      updated_at: r.last_run_at || r.created_at,
    }
  })

  const data = [...dashNormalized, ...extNormalized].sort((a, b) => {
    const at = a.updated_at ? Date.parse(a.updated_at) : 0
    const bt = b.updated_at ? Date.parse(b.updated_at) : 0
    return bt - at
  })

  return NextResponse.json({
    data,
    counts: {
      total: data.length,
      dashboard: dashNormalized.length,
      extension: extNormalized.length,
    },
    errors: {
      dashboard: dashRes.error?.message || null,
      extension: extRes.error?.message || null,
      extension_steps: stepsRes.error?.message || null,
    },
  })
}
