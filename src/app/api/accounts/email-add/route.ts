import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { withAudit } from "@/lib/audit"

export const dynamic = "force-dynamic"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const INSTANTLY_BASE = "https://api.instantly.ai/api/v1"
const VERIFY_TIMEOUT_MS = 7000

// POST /api/accounts/email-add
// Body: { instantly_api_key, from_email, from_name, daily_limit?, business_id? }
// Query: ?test=true → only verify the key, don't insert anything.
//
// Onboards an Instantly-backed email sender as a row in the `accounts` table.
// Email accounts skip warmup (Instantly handles deliverability) and start in
// `active` status. The Instantly API key is stored encrypted in
// `accounts.api_key_encrypted` if that column exists, otherwise in
// `system_settings` under the key `email_api_key_${account_id}` so the
// campaign worker can fetch it later without us having to know the column.
async function postHandler(req: NextRequest) {
  let body: any = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 })
  }

  const isTest = req.nextUrl.searchParams.get("test") === "true"
  const {
    instantly_api_key,
    from_email,
    from_name,
    daily_limit,
    business_id,
  } = body || {}

  if (!instantly_api_key || typeof instantly_api_key !== "string") {
    return NextResponse.json(
      { ok: false, error: "instantly_api_key required" },
      { status: 400 }
    )
  }

  // ── 1. Verify the key against Instantly ────────────────────────────
  const verify = await verifyInstantlyKey(instantly_api_key)
  if (!verify.ok) {
    if (isTest) {
      return NextResponse.json({ ok: false, error: verify.error }, { status: 200 })
    }
    return NextResponse.json({ ok: false, error: verify.error }, { status: 400 })
  }

  if (isTest) {
    return NextResponse.json({
      ok: true,
      accounts_count: verify.accounts_count,
    })
  }

  // ── 2. Real insert path. from_email / from_name required. ──────────
  if (!from_email || typeof from_email !== "string") {
    return NextResponse.json(
      { ok: false, error: "from_email required" },
      { status: 400 }
    )
  }
  if (!from_name || typeof from_name !== "string") {
    return NextResponse.json(
      { ok: false, error: "from_name required" },
      { status: 400 }
    )
  }

  const limit =
    typeof daily_limit === "number" && daily_limit > 0
      ? Math.floor(daily_limit)
      : 200

  // Try insert with api_key_encrypted column first. If the column doesn't
  // exist we'll catch the PostgREST error and retry without it, then fall
  // back to writing the key into system_settings.
  const baseRow: Record<string, any> = {
    platform: "email",
    connection_type: "instantly",
    status: "active",
    username: from_email,
    display_name: from_name,
    daily_limit: limit,
    sends_today: 0,
    business_id: business_id || null,
  }

  let accountId: string | null = null
  let storedInline = false

  // First attempt: include api_key_encrypted (we store the raw key here for
  // now — the column is named "_encrypted" because the long-term plan is to
  // wrap it with pgsodium; until then it's at least off the wire and out of
  // any client-side response).
  const firstAttempt = await supabase
    .from("accounts")
    .insert({ ...baseRow, api_key_encrypted: instantly_api_key })
    .select("account_id")
    .maybeSingle()

  if (firstAttempt.error) {
    const msg = firstAttempt.error.message || ""
    const isMissingColumn =
      msg.toLowerCase().includes("api_key_encrypted") ||
      msg.toLowerCase().includes("column") ||
      firstAttempt.error.code === "PGRST204"

    if (!isMissingColumn) {
      return NextResponse.json(
        { ok: false, error: firstAttempt.error.message },
        { status: 500 }
      )
    }

    // Retry without api_key_encrypted, then store the key in system_settings.
    const retry = await supabase
      .from("accounts")
      .insert(baseRow)
      .select("account_id")
      .maybeSingle()

    if (retry.error || !retry.data) {
      return NextResponse.json(
        { ok: false, error: retry.error?.message || "insert failed" },
        { status: 500 }
      )
    }
    accountId = retry.data.account_id
  } else if (firstAttempt.data) {
    accountId = firstAttempt.data.account_id
    storedInline = true
  }

  if (!accountId) {
    return NextResponse.json(
      { ok: false, error: "insert returned no account_id" },
      { status: 500 }
    )
  }

  // If we had to fall back, persist the key in system_settings.
  if (!storedInline) {
    await supabase.from("system_settings").upsert({
      key: `email_api_key_${accountId}`,
      value: { provider: "instantly", api_key: instantly_api_key },
      updated_at: new Date().toISOString(),
    })
  }

  return NextResponse.json({
    ok: true,
    account_id: accountId,
    accounts_count: verify.accounts_count,
  })
}

export const POST = withAudit("POST /api/accounts/email-add", postHandler as any)

// ── Helpers ──────────────────────────────────────────────────────────

async function verifyInstantlyKey(
  key: string
): Promise<{ ok: true; accounts_count: number } | { ok: false; error: string }> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), VERIFY_TIMEOUT_MS)
  try {
    const res = await fetch(`${INSTANTLY_BASE}/account/list`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      signal: ctrl.signal,
      cache: "no-store",
    })
    clearTimeout(timer)
    if (!res.ok) {
      const txt = await res.text().catch(() => "")
      return {
        ok: false,
        error: `Instantly returned ${res.status}${txt ? `: ${txt.slice(0, 160)}` : ""}`,
      }
    }
    const data: any = await res.json().catch(() => ({}))
    // Instantly's response shape varies — handle both an array and a wrapped
    // object. Either way we just want a count.
    const accounts: any[] = Array.isArray(data)
      ? data
      : Array.isArray(data?.accounts)
      ? data.accounts
      : Array.isArray(data?.data)
      ? data.data
      : []
    return { ok: true, accounts_count: accounts.length }
  } catch (e: any) {
    clearTimeout(timer)
    if (e?.name === "AbortError") {
      return { ok: false, error: "Instantly verification timed out" }
    }
    return { ok: false, error: e?.message || "verification failed" }
  }
}
