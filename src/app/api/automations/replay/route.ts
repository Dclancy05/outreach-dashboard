import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getSecret } from "@/lib/secrets"

/**
 * POST /api/automations/replay
 *
 * Collection-level replay endpoint that supports a `dryRun` flag.
 *
 * Why a separate route from /api/automations/[id]/replay?
 *   - The per-id route persists `automation_runs` rows + flips automation
 *     status on failure. Dry runs MUST NOT do that — they're a debugging
 *     tool, not real exercise. Keeping them on a different route makes
 *     the "no side effects" contract explicit and easy to audit.
 *   - Dry runs need a different UI affordance (selector-level info,
 *     match counts) so the response shape diverges slightly.
 *
 * Body:
 *   {
 *     automation_id: string,        // required
 *     dryRun?: boolean,             // default true on this route
 *     target_url?: string,          // override the {{target_url}} variable
 *     variables?: Record<string,string>,
 *   }
 *
 * Response:
 *   {
 *     ok: boolean,
 *     automation_name?: string,
 *     overall?: "passed" | "failed",
 *     steps: Array<{ index, description, status, selector_matched?, match_count?, detail? }>,
 *     note?: string,
 *     error?: string,
 *   }
 *
 * NOTE: This route does NOT call the campaign-worker / send pipeline. It
 * only forwards `steps` + `dryRun: true` to the VPS /replay endpoint. If
 * the VPS endpoint doesn't yet honor `dryRun`, the dashboard still
 * surfaces the response — and you can patch the VPS service separately
 * without touching this code.
 */

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
export const maxDuration = 60

interface StepPayload {
  index?: number
  description?: string
  kind?: string
  url?: string
  value?: string | null
  selectors?: { css?: string | null; xpath?: string | null }
  [k: string]: unknown
}

interface VpsStepResult {
  index?: number
  description?: string
  status?: string
  detail?: string
  selector_matched?: boolean
  selectorMatched?: boolean
  match_count?: number
  matchCount?: number
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as {
    automation_id?: string
    dryRun?: boolean
    target_url?: string
    variables?: Record<string, string>
  }

  if (!body.automation_id) {
    return NextResponse.json({ ok: false, error: "automation_id is required" }, { status: 400 })
  }

  // Default to dryRun=true on this route — the per-id route is the
  // place to do destructive replays.
  const dryRun = body.dryRun !== false

  const { data: automation, error } = await supabase
    .from("automations")
    .select("id, name, platform, status, steps, variables")
    .eq("id", body.automation_id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  if (!automation) {
    return NextResponse.json({ ok: false, error: "Automation not found" }, { status: 404 })
  }

  const steps: StepPayload[] = Array.isArray(automation.steps) ? (automation.steps as StepPayload[]) : []
  if (!steps.length) {
    return NextResponse.json({
      ok: true,
      automation_name: automation.name,
      overall: "failed",
      steps: [],
      note: "Automation has no steps to inspect.",
    })
  }

  // Variable resolution mirrors the per-id route so behavior stays
  // identical between dry and real replays.
  const variables: Record<string, string> = {
    ...((automation.variables as Record<string, string> | null) || {}),
    ...(body.variables || {}),
  }
  if (body.target_url && !variables.target_url) variables.target_url = body.target_url
  if (!variables.username) {
    try {
      const u = new URL(body.target_url || steps[0]?.url || "")
      const guess = u.pathname.split("/").filter(Boolean)[0]
      if (guess) variables.username = guess
    } catch {}
    if (!variables.username) variables.username = "mrbeast"
  }
  if (!variables.message) variables.message = "Dry run — no message will actually be sent"

  const VPS_URL =
    (await getSecret("VPS_URL")) ||
    (await getSecret("RECORDING_SERVER_URL")) ||
    "https://srv1197943.taild42583.ts.net:10000"

  let stepResults: VpsStepResult[] = []
  let overall: "passed" | "failed" = "failed"
  let note: string | null = null
  let serviceError: string | null = null

  try {
    const res = await fetch(`${VPS_URL}/replay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ steps, variables, dryRun }),
      signal: AbortSignal.timeout(55000),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data?.ok) {
      serviceError = data?.error || `Replay service returned ${res.status}`
    } else {
      stepResults = Array.isArray(data.steps) ? data.steps : []
      overall = data.overall === "passed" ? "passed" : "failed"
      note = data.note || data.lastError || null
    }
  } catch (e) {
    serviceError = (e as Error).message
  }

  // Normalize VPS field aliases (camelCase or snake_case) into a stable
  // shape the modal can render without branching.
  const normalizedSteps = stepResults.map((r, i) => ({
    index: typeof r.index === "number" ? r.index : i,
    description: r.description || `Step ${i + 1}`,
    status: (r.status === "passed" || r.status === "failed" || r.status === "skipped")
      ? r.status
      : ("skipped" as "passed" | "failed" | "skipped"),
    selector_matched: typeof r.selector_matched === "boolean"
      ? r.selector_matched
      : typeof r.selectorMatched === "boolean"
        ? r.selectorMatched
        : undefined,
    match_count: typeof r.match_count === "number"
      ? r.match_count
      : typeof r.matchCount === "number"
        ? r.matchCount
        : undefined,
    detail: r.detail,
  }))

  // If the VPS errored, fall back to a synthesized "skipped for every
  // step" payload so the dashboard always renders a useful trace.
  if (serviceError && normalizedSteps.length === 0) {
    return NextResponse.json({
      ok: false,
      automation_name: automation.name,
      overall: "failed",
      steps: steps.map((s, i) => ({
        index: i,
        description: typeof s.description === "string" ? s.description : `Step ${i + 1}`,
        status: "skipped" as const,
        detail: "Replay service unreachable — selectors not evaluated.",
      })),
      error: serviceError,
      note: "Could not reach the replay service. Check VPS_URL or recording-service health.",
    })
  }

  return NextResponse.json({
    ok: true,
    automation_name: automation.name,
    overall,
    steps: normalizedSteps,
    note: serviceError ? serviceError : (note ?? (dryRun ? "Dry run — no clicks fired." : "Replay complete.")),
  })
}
