import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export const dynamic = "force-dynamic"

/**
 * GET /api/automations/:id — fetches a single automation (used by the Edit
 * modal to pre-populate name/steps/tag without re-fetching the full list).
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { data, error } = await supabase
    .from("automations")
    .select("*")
    .eq("id", params.id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 })
  return NextResponse.json({ data })
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
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}))
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
 * DELETE /api/automations/:id — hard delete (cards use a confirm dialog on
 * the client, so no soft-delete sugar needed). Runs cascade because of the
 * on-delete policy we'll set once the FK is added; for now we also clear
 * runs manually to avoid orphans if the FK isn't in place yet.
 */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  // Best-effort: clear child runs first so a missing FK doesn't leave
  // orphan rows. Errors here are non-fatal.
  await supabase.from("automation_runs").delete().eq("automation_id", params.id)

  const { error } = await supabase
    .from("automations")
    .delete()
    .eq("id", params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
