import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export const dynamic = "force-dynamic"

/**
 * GET /api/automations/:id
 *
 * Fetches a single automation. Tries the dashboard-native `automations`
 * table first, then falls back to the extension's `autobot_automations`
 * (plus `autobot_steps`) so IDs from AutoBot-recorded automations
 * resolve cleanly via the unified `/api/automations/list` endpoint.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { data: dashRow, error: dashErr } = await supabase
    .from("automations")
    .select("*")
    .eq("id", params.id)
    .maybeSingle()

  if (dashErr && dashErr.code !== "PGRST116") {
    // Unknown error (not "no rows")
    return NextResponse.json({ error: dashErr.message }, { status: 500 })
  }

  if (dashRow) {
    return NextResponse.json({ data: { ...dashRow, source: "dashboard" } })
  }

  // Fall back to the extension's tables. We join `autobot_steps` manually
  // and reshape to match the dashboard row contract so the edit modal
  // pre-fill works without any client-side branching.
  const [extRes, stepsRes] = await Promise.all([
    supabase
      .from("autobot_automations")
      .select("id, name, platform, category, status, created_at, last_run_at")
      .eq("id", params.id)
      .maybeSingle(),
    supabase
      .from("autobot_steps")
      .select("sort_order, type, description, selector, url, value")
      .eq("automation_id", params.id)
      .order("sort_order", { ascending: true }),
  ])

  if (!extRes.data) {
    return NextResponse.json({ error: "not found" }, { status: 404 })
  }

  const r: any = extRes.data
  const rawSteps: any[] = stepsRes.data || []

  const tag =
    r.category === "outreach" ? "outreach_action" :
    r.category === "scrape"   ? "lead_enrichment" :
    null

  const status =
    r.status === "failing" ? "broken" :
    r.status === "idle"    ? "active" :
    r.status || "active"

  const shaped = {
    id: r.id,
    name: r.name,
    platform: r.platform,
    status,
    tag,
    description: null,
    steps: rawSteps.map((s, i) => ({
      index: i,
      description: s.description ?? null,
      kind: s.type ?? "pending",
      selectors: s.selector ? { css: s.selector } : {},
      selector: s.selector ?? null,
      url: s.url ?? null,
      value: s.value ?? null,
      coords: null,
    })),
    created_at: r.created_at,
    updated_at: r.last_run_at || r.created_at,
    last_tested_at: r.last_run_at || null,
    last_error: null,
    health_score: r.status === "failing" ? 50 : 100,
    account_id: null,
    source: "extension",
  }

  return NextResponse.json({ data: shaped })
}

/**
 * PATCH /api/automations/:id
 *
 * Partial update. Used by:
 *   - Rename (body: { name })
 *   - Edit modal save (body: { name, steps, tag, description })
 *   - Status transitions from the recorder (body: { status })
 *
 * Steps get the same newline-split treatment as POST when sent as a string.
 *
 * If the ID belongs to an extension-recorded automation (`autobot_automations`),
 * we only propagate the `name` change to that table — everything else
 * (steps, tag, description) lives in the extension's own schema and must
 * be edited via the extension UI. Returning the reshaped row keeps the
 * dashboard UI in sync.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}))

  // Detect extension rows up-front so we don't accidentally create an
  // empty dashboard row on update.
  const { data: extCheck } = await supabase
    .from("autobot_automations")
    .select("id")
    .eq("id", params.id)
    .maybeSingle()

  if (extCheck) {
    // Only `name` is safe to propagate — the extension schema doesn't have
    // tag / description / status columns that map 1:1.
    if (typeof body.name === "string") {
      const { error: renameErr } = await supabase
        .from("autobot_automations")
        .update({ name: body.name })
        .eq("id", params.id)
      if (renameErr) return NextResponse.json({ error: renameErr.message }, { status: 500 })
    }

    // Re-read + reshape via the same pipeline as GET so the client keeps
    // working with a dashboard-shaped row.
    const get = await fetch(req.nextUrl.origin + `/api/automations/${params.id}`, { cache: "no-store" })
    const j = await get.json()
    return NextResponse.json(j)
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (typeof body.name === "string") updates.name = body.name
  if (typeof body.description === "string") updates.description = body.description
  if (typeof body.platform === "string") updates.platform = body.platform
  if (typeof body.tag === "string" || body.tag === null) {
    if (body.tag && !["outreach_action", "lead_enrichment", "utility"].includes(body.tag)) {
      return NextResponse.json({ error: "invalid tag" }, { status: 400 })
    }
    updates.tag = body.tag
  }
  if (typeof body.status === "string") {
    const allowed = ["draft", "needs_recording", "active", "needs_rerecording", "fixing", "broken"]
    if (!allowed.includes(body.status)) {
      return NextResponse.json({ error: "invalid status" }, { status: 400 })
    }
    updates.status = body.status
  }
  if (body.steps !== undefined) {
    if (typeof body.steps === "string") {
      updates.steps = body.steps
        .split(/\r?\n/)
        .map((s: string) => s.trim())
        .filter(Boolean)
        .map((line: string, i: number) => ({ index: i, description: line, kind: "pending", selectors: {}, coords: null }))
    } else if (Array.isArray(body.steps)) {
      updates.steps = body.steps
    }
  }

  const { data, error } = await supabase
    .from("automations")
    .update(updates)
    .eq("id", params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

/**
 * DELETE /api/automations/:id — hard delete.
 *
 * Dashboard rows: also clears child `automation_runs` first so a missing
 * FK doesn't leave orphans.
 *
 * Extension rows: delete from `autobot_automations`; `autobot_steps` is
 * expected to have ON DELETE CASCADE (see migration 20260422...).
 */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  // Try extension first — cheap check.
  const { data: extCheck } = await supabase
    .from("autobot_automations")
    .select("id")
    .eq("id", params.id)
    .maybeSingle()

  if (extCheck) {
    // Best-effort clean-up in case the FK cascade isn't in place.
    await supabase.from("autobot_steps").delete().eq("automation_id", params.id)
    const { error } = await supabase.from("autobot_automations").delete().eq("id", params.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  // Dashboard path.
  await supabase.from("automation_runs").delete().eq("automation_id", params.id)

  const { error } = await supabase
    .from("automations")
    .delete()
    .eq("id", params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
