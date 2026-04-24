import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

// CRITICAL: Next.js extends global fetch with response caching. The
// supabase-js client uses fetch internally, so without `cache: "no-store"`
// every Supabase query response gets cached by Next.js and served stale.
// This caused the "deleted automations come back 2 minutes later" bug — the
// row really was deleted from Postgres, but the warm serverless function
// kept handing the client the cached list from before the delete.
// Passing a custom fetch that disables Next.js's cache fixes that.
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
 * This route returns a response shape that is a SUPERSET of the old
 * /api/automations route so the /automations page can swap fetch URLs
 * and render both dashboard-native and extension-recorded automations
 * without any further refactor. Every row has a `source` field so the
 * UI can badge extension rows.
 *
 * Response:
 *   {
 *     data: Automation[],   // UNIONed, normalized
 *     runs: Run[],          // latest 50 automation_runs (dashboard only)
 *     counts: {
 *       total, dashboard, extension,
 *       draft, active, needs_rerecording, needs_recording, fixing, broken,
 *       recent_runs,
 *     },
 *     success_rate: number | null,
 *     last_run: string | null,
 *     errors: { ... },
 *   }
 */

type NormalizedAutomation = {
  id: string
  source: "dashboard" | "extension"
  name: string
  platform: string
  status: string
  tag: string | null
  description: string | null
  steps: Array<Record<string, unknown>>
  health_score: number
  created_at: string | null
  updated_at: string | null
  last_tested_at: string | null
  last_error: string | null
  account_id: string | null
}

// Map extension platform strings to the dashboard's canonical set so the
// platform-group renderer picks them up. Extension often stores 'ig',
// 'facebook', 'linkedin.com', etc. Normalize to dashboard DB vocabulary.
function normalizeExtensionPlatform(p: string | null | undefined): string {
  if (!p) return "instagram"
  const s = String(p).toLowerCase().trim()
  if (s.includes("instagram") || s === "ig") return "instagram"
  if (s.includes("facebook") || s === "fb") return "facebook"
  if (s.includes("linkedin") || s === "li") return "linkedin"
  if (s.includes("tiktok") || s === "tt") return "tiktok"
  if (s.includes("youtube") || s === "yt") return "youtube"
  if (s.includes("twitter") || s === "x.com" || s === "x") return "twitter"
  if (s.includes("snapchat") || s === "snap") return "snapchat"
  if (s.includes("pinterest") || s === "pin") return "pinterest"
  return s
}

export async function GET(req: NextRequest) {
  const tagFilter = req.nextUrl.searchParams.get("tag")

  // NOTE: we keep the filter on the dashboard side only — extension rows
  // have a derived `tag` computed from `category`, which we can apply in
  // JS after normalization.
  let dashQuery = supabase
    .from("automations")
    .select("id, name, platform, status, tag, description, steps, created_at, updated_at, last_tested_at, last_error, health_score, account_id")

  if (tagFilter) {
    dashQuery = dashQuery.eq("tag", tagFilter)
  }

  const [dashRes, extRes, stepsRes, runsRes] = await Promise.all([
    dashQuery,
    supabase
      .from("autobot_automations")
      .select("id, name, platform, category, status, created_at, last_run_at"),
    supabase
      .from("autobot_steps")
      .select("automation_id, sort_order, type, description, selector, url, value"),
    supabase
      .from("automation_runs")
      .select("id, automation_id, run_type, status, started_at, finished_at, error, steps_completed")
      .order("started_at", { ascending: false })
      .limit(50),
  ])

  const dashboardRows = dashRes.error ? [] : (dashRes.data || [])
  const extensionRows = extRes.error ? [] : (extRes.data || [])
  const allSteps = stepsRes.error ? [] : (stepsRes.data || [])
  const runs = runsRes.error ? [] : (runsRes.data || [])

  // Group extension steps by their parent automation so we can inline them
  // into the normalized shape (matching dashboard's `steps jsonb` layout).
  const stepsByAutomation = new Map<string, typeof allSteps>()
  for (const s of allSteps) {
    const list = stepsByAutomation.get(s.automation_id) || []
    list.push(s)
    stepsByAutomation.set(s.automation_id, list)
  }

  // ── Dashboard rows → normalized (keep ALL old fields so the page UI
  //    that currently binds to /api/automations still works 1:1) ──
  const dashNormalized: NormalizedAutomation[] = dashboardRows.map((r: any) => ({
    id: r.id,
    source: "dashboard" as const,
    name: r.name,
    platform: r.platform,
    status: r.status,
    tag: r.tag ?? null,
    description: r.description ?? null,
    // Keep the original jsonb step objects intact so the recorder /
    // editor round-trip works unchanged.
    steps: Array.isArray(r.steps) ? r.steps : [],
    health_score: typeof r.health_score === "number" ? r.health_score : 100,
    created_at: r.created_at,
    updated_at: r.updated_at,
    last_tested_at: r.last_tested_at ?? null,
    last_error: r.last_error ?? null,
    account_id: r.account_id ?? null,
  }))

  // ── Extension rows → normalized ──
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
      source: "extension" as const,
      name: r.name,
      platform: normalizeExtensionPlatform(r.platform),
      status,
      tag,
      description: null,
      // Reshape autobot step rows into objects that look close enough to
      // dashboard `steps jsonb` that the edit-modal pre-fill works.
      steps: rawSteps.map((s: any, i: number) => ({
        index: i,
        description: s.description ?? null,
        kind: s.type ?? "pending",
        selectors: s.selector ? { css: s.selector } : {},
        selector: s.selector ?? null,
        url: s.url ?? null,
        value: s.value ?? null,
        coords: null,
      })),
      // Extension doesn't track health_score; default to 100 unless status is failing.
      health_score: r.status === "failing" ? 50 : 100,
      created_at: r.created_at,
      updated_at: r.last_run_at || r.created_at,
      last_tested_at: r.last_run_at || null,
      last_error: null,
      account_id: null,
    }
  }).filter(a => !tagFilter || a.tag === tagFilter)

  const data = [...dashNormalized, ...extNormalized].sort((a, b) => {
    const at = a.updated_at ? Date.parse(a.updated_at) : 0
    const bt = b.updated_at ? Date.parse(b.updated_at) : 0
    return bt - at
  })

  // Success rate = (passed + healed) / finished runs. Matches the old
  // /api/automations semantics exactly.
  const finished = runs.filter(r => r.status === "passed" || r.status === "failed" || r.status === "healed")
  const succeeded = finished.filter(r => r.status === "passed" || r.status === "healed").length
  const success_rate = finished.length === 0 ? null : Math.round((succeeded / finished.length) * 100)
  const last_run = runs[0]?.started_at || null

  const counts = {
    total: data.length,
    dashboard: dashNormalized.length,
    extension: extNormalized.length,
    draft: data.filter(a => a.status === "draft").length,
    needs_recording: data.filter(a => a.status === "needs_recording").length,
    active: data.filter(a => a.status === "active").length,
    needs_rerecording: data.filter(a => a.status === "needs_rerecording").length,
    fixing: data.filter(a => a.status === "fixing").length,
    broken: data.filter(a => a.status === "broken").length,
    recent_runs: runs.length,
  }

  return NextResponse.json({
    data,
    runs,
    counts,
    success_rate,
    last_run,
    errors: {
      dashboard: dashRes.error?.message || null,
      extension: extRes.error?.message || null,
      extension_steps: stepsRes.error?.message || null,
      runs: runsRes.error?.message || null,
    },
  })
}
