import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// POST /api/accounts/:id/cookies/snapshot
// Body: { cookies: Cookie[]; local_storage?: object; session_id?: string; captured_by?: string }
// Writes a full snapshot row and bumps accounts.cookies_updated_at so the
// health badge on the account card can show "Saved X min ago".
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const account_id = params.id
  if (!account_id) {
    return NextResponse.json({ error: "account_id required" }, { status: 400 })
  }

  let body: any = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const cookies = body?.cookies
  const local_storage = body?.local_storage ?? null
  const session_id = body?.session_id ?? null
  const captured_by = body?.captured_by || "user_login"
  const platform =
    typeof body?.platform === "string" && body.platform.trim()
      ? body.platform.trim().toLowerCase()
      : null

  if (!Array.isArray(cookies)) {
    return NextResponse.json(
      { error: "cookies must be an array" },
      { status: 400 }
    )
  }

  const now = new Date().toISOString()

  // 1. Insert snapshot. `platform` was added in migration
  // 20260424_cookie_snapshots_platform.sql — it's nullable so older callers
  // that don't pass it still work.
  const { data: snap, error: insertErr } = await supabase
    .from("account_cookie_snapshots")
    .insert({
      account_id,
      cookies_json: cookies,
      local_storage_json: local_storage,
      captured_at: now,
      captured_by,
      cookie_count: cookies.length,
      session_id,
      platform,
    })
    .select("id")
    .single()

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  // 2. Bump accounts.cookies_updated_at + mirror cookies onto accounts.session_cookie.
  const { health } = scoreCookies(cookies)
  const { error: updateErr } = await supabase
    .from("accounts")
    .update({
      cookies_updated_at: now,
      cookies_health: health,
      cookies_last_check: now,
      last_successful_login: now,
      session_cookie: JSON.stringify(cookies),
    })
    .eq("account_id", account_id)

  // 3. Refresh account_sessions: supersede the previous active row and insert a
  // new one with last_verified_at=now. This is the row get_accounts reads to
  // compute session_status (src/lib/api/accounts.ts:104-126) — without a fresh
  // row the badge stays "expired" forever, even though session_cookie is fresh.
  // Mirror what vnc-manager.captureSession does (server.js:1422-1442).
  let sessionsErr: string | null = null
  try {
    await supabase
      .from("account_sessions")
      .update({ status: "superseded" })
      .eq("account_id", account_id)
      .eq("status", "active")
    const { error: insErr } = await supabase
      .from("account_sessions")
      .insert({
        account_id,
        cookies,
        local_storage: local_storage || {},
        last_verified_at: now,
        status: "active",
      })
    if (insErr) sessionsErr = insErr.message
  } catch (e) {
    sessionsErr = (e as Error).message
  }

  if (updateErr || sessionsErr) {
    return NextResponse.json({
      success: true,
      snapshot_id: snap.id,
      warn: [updateErr?.message, sessionsErr].filter(Boolean).join(" · "),
    })
  }

  return NextResponse.json({
    success: true,
    snapshot_id: snap.id,
    cookie_count: cookies.length,
    captured_at: now,
  })
}

function scoreCookies(cookies: any[]): { health: string; hasAuthCookie: boolean } {
  if (!Array.isArray(cookies) || cookies.length === 0) {
    return { health: "expired", hasAuthCookie: false }
  }
  const hasSession = cookies.some(
    (c) =>
      c &&
      (c.name === "sessionid" ||
        c.name === "c_user" ||
        c.name === "li_at" ||
        c.name === "auth_token" ||
        c.name === "ds_user_id" ||
        c.name === "xs" ||
        c.name === "JSESSIONID" ||
        c.name === "sid_tt") &&
      typeof c.value === "string" &&
      c.value.length > 0
  )
  return { health: hasSession ? "healthy" : "stale", hasAuthCookie: hasSession }
}
