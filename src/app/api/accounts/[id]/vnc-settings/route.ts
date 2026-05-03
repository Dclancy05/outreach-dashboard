import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { extractAdminId, withAudit } from "@/lib/audit"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// GET  /api/accounts/[id]/vnc-settings
//   Returns { quality, compression, adaptive } for the account, or sensible
//   defaults when no row exists.
//
// PATCH /api/accounts/[id]/vnc-settings
//   Body: { quality?: 0-9, compression?: 0-9, adaptive?: boolean }
//   Upserts into account_vnc_settings; per Wave 1.6 plan.

const DEFAULTS = { quality: 4, compression: 7, adaptive: true }

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const adminId = extractAdminId(req.headers.get("cookie"))
  if (!adminId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
  const { id } = await ctx.params

  const { data, error } = await supabase
    .from("account_vnc_settings")
    .select("quality, compression, adaptive")
    .eq("account_id", id)
    .maybeSingle()
  // Soft-fail on schema mismatch / type errors. The codebase uses TEXT slugs
  // for account_id (e.g. "facebook_mo4wk9by") in some tables and UUIDs in
  // others; this endpoint should never 500 on a valid request — it should
  // just return defaults so the viewer can still mount.
  if (error && error.code !== "PGRST116") {
    console.warn("[vnc-settings] read error, returning defaults:", error.message)
    return NextResponse.json({ ok: true, settings: DEFAULTS, _note: "fallback_defaults" })
  }
  return NextResponse.json({ ok: true, settings: data || DEFAULTS })
}

async function patchHandler(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const adminId = extractAdminId(req.headers.get("cookie"))
  if (!adminId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
  const { id } = await ctx.params
  let body: any = {}
  try { body = await req.json() } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 })
  }
  const update: Record<string, unknown> = { account_id: id, updated_at: new Date().toISOString() }
  if (typeof body.quality === "number" && body.quality >= 0 && body.quality <= 9) update.quality = body.quality
  if (typeof body.compression === "number" && body.compression >= 0 && body.compression <= 9) update.compression = body.compression
  if (typeof body.adaptive === "boolean") update.adaptive = body.adaptive

  const { error } = await supabase.from("account_vnc_settings").upsert(update, { onConflict: "account_id" })
  if (error) {
    console.warn("[vnc-settings] write error:", error.message)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

export const PATCH = withAudit("PATCH /api/accounts/[id]/vnc-settings", patchHandler as any)
