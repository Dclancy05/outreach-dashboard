import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

// Disable Next.js fetch cache — see /api/automations/list/route.ts for
// why this matters (stale reads after delete / update).
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    global: {
      fetch: (url, init) => fetch(url, { ...init, cache: "no-store" }),
    },
  }
)

export const dynamic = "force-dynamic"
export const revalidate = 0

/**
 * GET /api/automations
 *
 * Returns the Phase-2 automation catalog (the new `automations` table the
 * Automations page rebuild writes to), derived Overview counts, and the
 * most-recent `automation_runs` rows so the Overview / Maintenance tabs can
 * render a success-rate + recent activity summary without extra round trips.
 *
 * Everything degrades gracefully: if a table doesn't exist yet (migration not
 * applied) we return empty data instead of 500-ing the whole page.
 */
export async function GET(req: NextRequest) {
  // Optional `?tag=lead_enrichment` filter so callers (e.g. the Enrich Leads
  // modal) can get only the automations relevant to their surface. When
  // omitted, all automations come back.
  const tagFilter = req.nextUrl.searchParams.get("tag")

  let autoQuery = supabase
    .from("automations")
    .select("id, name, platform, status, tag, description, steps, created_at, updated_at, last_tested_at, last_error, health_score, account_id")
    .order("updated_at", { ascending: false })

  if (tagFilter) {
    autoQuery = autoQuery.eq("tag", tagFilter)
  }

  const [autoRes, runsRes] = await Promise.all([
    autoQuery,
    supabase
      .from("automation_runs")
      .select("id, automation_id, run_type, status, started_at, finished_at, error, steps_completed")
      .order("started_at", { ascending: false })
      .limit(50),
  ])

  const automations = autoRes.error ? [] : (autoRes.data || [])
  const runs = runsRes.error ? [] : (runsRes.data || [])

  // Overview counts — straight tallies off the catalog.
  const counts = {
    total: automations.length,
    draft: automations.filter(a => a.status === "draft").length,
    needs_recording: automations.filter(a => a.status === "needs_recording").length,
    active: automations.filter(a => a.status === "active").length,
    needs_rerecording: automations.filter(a => a.status === "needs_rerecording").length,
    fixing: automations.filter(a => a.status === "fixing").length,
    broken: automations.filter(a => a.status === "broken").length,
    recent_runs: runs.length,
  }

  // Success rate = (passed + healed) / finished runs. We only count runs that
  // actually finished (passed/failed/healed) so in-flight runs don't distort
  // the ratio.
  const finished = runs.filter(r => r.status === "passed" || r.status === "failed" || r.status === "healed")
  const succeeded = finished.filter(r => r.status === "passed" || r.status === "healed").length
  const success_rate = finished.length === 0 ? null : Math.round((succeeded / finished.length) * 100)

  const last_run = runs[0]?.started_at || null

  return NextResponse.json({
    data: automations,
    runs,
    counts,
    success_rate,
    last_run,
    errors: {
      automations: autoRes.error?.message || null,
      runs: runsRes.error?.message || null,
    },
  })
}

/**
 * POST /api/automations
 *
 * Creates a new draft automation row from the "Add {Platform} Automation"
 * modal in the Your Automations tab. The steps string from the textarea is
 * stored verbatim on the row (split by newline → array of {description}) so
 * the CDP recorder can fill in selector data later without losing Dylan's
 * intent copy.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { name, platform, steps, tag, description } = body

  if (!name || !platform) {
    return NextResponse.json({ error: "name and platform are required" }, { status: 400 })
  }
  if (tag && !["outreach_action", "lead_enrichment", "utility"].includes(tag)) {
    return NextResponse.json({ error: "invalid tag" }, { status: 400 })
  }

  // steps is a multi-line string from the textarea. We store structured step
  // skeletons so the recorder only has to fill in selectors/coords later.
  const stepsArray = typeof steps === "string"
    ? steps
        .split(/\r?\n/)
        .map(s => s.trim())
        .filter(Boolean)
        .map((line, i) => ({ index: i, description: line, kind: "pending", selectors: {}, coords: null }))
    : Array.isArray(steps) ? steps : []

  const { data, error } = await supabase
    .from("automations")
    .insert({
      name,
      platform,
      tag: tag || null,
      description: description || null,
      steps: stepsArray,
      status: "draft",
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
