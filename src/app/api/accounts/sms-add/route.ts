import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const GHL_BASE = "https://services.leadconnectorhq.com"
const GHL_API_VERSION = "2021-07-28"
const VERIFY_TIMEOUT_MS = 7000

// POST /api/accounts/sms-add
// Body: { ghl_subaccount_id, ghl_api_key, from_number, daily_limit?, business_id? }
// Query: ?test=true → only verify the key, don't insert anything.
//
// Mirrors email-add but for SMS via GoHighLevel / LeadConnector. The "from
// number" is the Twilio (or GHL-provisioned) number that will appear as the
// sender. Like email, SMS has no warmup ramp — GHL handles delivery.
export async function POST(req: NextRequest) {
  let body: any = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 })
  }

  const isTest = req.nextUrl.searchParams.get("test") === "true"
  const {
    ghl_subaccount_id,
    ghl_api_key,
    from_number,
    daily_limit,
    business_id,
  } = body || {}

  if (!ghl_subaccount_id || typeof ghl_subaccount_id !== "string") {
    return NextResponse.json(
      { ok: false, error: "ghl_subaccount_id required" },
      { status: 400 }
    )
  }
  if (!ghl_api_key || typeof ghl_api_key !== "string") {
    return NextResponse.json(
      { ok: false, error: "ghl_api_key required" },
      { status: 400 }
    )
  }

  // ── 1. Verify the key against the GHL location endpoint ────────────
  const verify = await verifyGhlKey(ghl_subaccount_id, ghl_api_key)
  if (!verify.ok) {
    if (isTest) {
      return NextResponse.json({ ok: false, error: verify.error }, { status: 200 })
    }
    return NextResponse.json({ ok: false, error: verify.error }, { status: 400 })
  }

  if (isTest) {
    return NextResponse.json({
      ok: true,
      location_name: verify.location_name,
    })
  }

  // ── 2. Real insert path. from_number required. ─────────────────────
  if (!from_number || typeof from_number !== "string") {
    return NextResponse.json(
      { ok: false, error: "from_number required" },
      { status: 400 }
    )
  }

  const limit =
    typeof daily_limit === "number" && daily_limit > 0
      ? Math.floor(daily_limit)
      : 200

  const baseRow: Record<string, any> = {
    platform: "sms",
    connection_type: "ghl",
    status: "active",
    username: from_number,
    display_name: from_number,
    daily_limit: limit,
    sends_today: 0,
    business_id: business_id || null,
  }

  // We store both the key and the subaccount id together so the campaign
  // worker can pull a single record and have everything it needs.
  const credentials = {
    provider: "ghl",
    ghl_api_key,
    ghl_subaccount_id,
  }

  let accountId: string | null = null
  let storedInline = false

  const firstAttempt = await supabase
    .from("accounts")
    .insert({ ...baseRow, api_key_encrypted: JSON.stringify(credentials) })
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

  if (!storedInline) {
    await supabase.from("system_settings").upsert({
      key: `sms_api_key_${accountId}`,
      value: credentials,
      updated_at: new Date().toISOString(),
    })
  }

  return NextResponse.json({
    ok: true,
    account_id: accountId,
    location_name: verify.location_name,
  })
}

// ── Helpers ──────────────────────────────────────────────────────────

async function verifyGhlKey(
  subaccountId: string,
  key: string
): Promise<{ ok: true; location_name: string } | { ok: false; error: string }> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), VERIFY_TIMEOUT_MS)
  try {
    const res = await fetch(
      `${GHL_BASE}/locations/${encodeURIComponent(subaccountId)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${key}`,
          Version: GHL_API_VERSION,
          "Content-Type": "application/json",
        },
        signal: ctrl.signal,
        cache: "no-store",
      }
    )
    clearTimeout(timer)
    if (!res.ok) {
      const txt = await res.text().catch(() => "")
      return {
        ok: false,
        error: `GHL returned ${res.status}${txt ? `: ${txt.slice(0, 160)}` : ""}`,
      }
    }
    const data: any = await res.json().catch(() => ({}))
    const name =
      data?.location?.name ||
      data?.name ||
      data?.location?.companyName ||
      "(unnamed)"
    return { ok: true, location_name: String(name) }
  } catch (e: any) {
    clearTimeout(timer)
    if (e?.name === "AbortError") {
      return { ok: false, error: "GHL verification timed out" }
    }
    return { ok: false, error: e?.message || "verification failed" }
  }
}
