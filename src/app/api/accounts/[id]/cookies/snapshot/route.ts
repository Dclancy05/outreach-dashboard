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

  if (!Array.isArray(cookies)) {
    return NextResponse.json(
      { error: "cookies must be an array" },
      { status: 400 }
    )
  }

  const now = new Date().toISOString()

  // 1. Insert snapshot
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
    })
    .select("id")
    .single()

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  // 2. Bump accounts.cookies_updated_at (+ mirror cookies onto accounts.session_cookie
  // so existing code paths that already read session_cookie stay in sync)
  const { error: updateErr } = await supabase
    .from("accounts")
    .update({
      cookies_updated_at: now,
      cookies_health: computeHealthFromCookies(cookies),
      cookies_last_check: now,
      last_successful_login: now,
      session_cookie: JSON.stringify(cookies),
    })
    .eq("account_id", account_id)

  if (updateErr) {
    // Non-fatal — snapshot still saved. Return a warning.
    return NextResponse.json({
      success: true,
      snapshot_id: snap.id,
      warn: updateErr.message,
    })
  }

  return NextResponse.json({
    success: true,
    snapshot_id: snap.id,
    cookie_count: cookies.length,
    captured_at: now,
  })
}

function computeHealthFromCookies(cookies: any[]): string {
  if (!Array.isArray(cookies) || cookies.length === 0) return "expired"
  const hasSession = cookies.some(
    (c) =>
      c &&
      (c.name === "sessionid" ||
        c.name === "c_user" ||
        c.name === "li_at" ||
        c.name === "auth_token")
  )
  return hasSession ? "healthy" : "stale"
}
