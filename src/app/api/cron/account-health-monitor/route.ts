import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const VPS_URL = process.env.VPS_URL || "https://srv1197943.taild42583.ts.net:10000"
const BATCH_SIZE = 20
const PROBE_TIMEOUT_MS = 15000

type AccountRow = {
  account_id: string
  platform: string | null
  proxy_group_id: string | null
  status: string | null
  health_score: number | null
  last_health_check_at: string | null
}

type ProbeResponse = {
  healthy?: boolean
  score?: number
  signals?: any[]
}

async function probeAccount(acct: AccountRow): Promise<
  | { kind: "ok"; data: ProbeResponse }
  | { kind: "not_found" }
  | { kind: "error"; reason: string }
> {
  try {
    const res = await fetch(`${VPS_URL}/account-health/probe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        account_id: acct.account_id,
        platform: acct.platform,
        proxy_group_id: acct.proxy_group_id,
      }),
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
    if (res.status === 404) return { kind: "not_found" }
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      return { kind: "error", reason: `http ${res.status}: ${text.slice(0, 200)}` }
    }
    const data = (await res.json().catch(() => ({}))) as ProbeResponse
    return { kind: "ok", data }
  } catch (e) {
    return { kind: "error", reason: (e as Error).message }
  }
}

async function handle(req: NextRequest) {
  const auth = req.headers.get("authorization") || ""
  const expected = process.env.CRON_SECRET || ""
  if (!expected)
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 })
  if (auth !== `Bearer ${expected}`)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const startedAt = Date.now()

  try {
    // Pick the BATCH_SIZE accounts with the oldest (or null) last_health_check_at.
    // nullsFirst:true puts never-checked accounts at the front of the line.
    const { data: rows, error } = await supabase
      .from("accounts")
      .select(
        "account_id, platform, proxy_group_id, status, health_score, last_health_check_at"
      )
      .neq("status", "banned")
      .is("deleted_at", null)
      .order("last_health_check_at", { ascending: true, nullsFirst: true })
      .limit(BATCH_SIZE)

    if (error) {
      console.error("[account-health-monitor] supabase select error:", error)
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    const accounts = (rows || []) as AccountRow[]
    let ok = 0
    let errors = 0
    let vpsMissing = false
    const errorDetails: Array<{ account_id: string; reason: string }> = []

    for (const acct of accounts) {
      const result = await probeAccount(acct)
      const now = new Date().toISOString()

      if (result.kind === "not_found") {
        vpsMissing = true
        // Touch last_health_check_at so we don't hammer the same accounts
        // repeatedly. Leave health_score untouched.
        const { error: upErr } = await supabase
          .from("accounts")
          .update({ last_health_check_at: now })
          .eq("account_id", acct.account_id)
        if (upErr) {
          console.error(
            `[account-health-monitor] update timestamp failed for ${acct.account_id}:`,
            upErr.message
          )
          errors++
          errorDetails.push({ account_id: acct.account_id, reason: upErr.message })
        } else {
          ok++
        }
        continue
      }

      if (result.kind === "error") {
        console.error(
          `[account-health-monitor] probe error for ${acct.account_id}: ${result.reason}`
        )
        errors++
        errorDetails.push({ account_id: acct.account_id, reason: result.reason })
        continue
      }

      const score =
        typeof result.data.score === "number"
          ? Math.max(0, Math.min(100, Math.round(result.data.score)))
          : null

      const update: Record<string, any> = { last_health_check_at: now }
      if (score !== null) update.health_score = score
      // Only auto-flag — never touch a banned account (already filtered, but
      // belt-and-suspenders) and never auto-unflag here. A human un-flags.
      if (score !== null && score < 30 && acct.status !== "banned" && acct.status !== "flagged") {
        update.status = "flagged"
      }

      const { error: upErr } = await supabase
        .from("accounts")
        .update(update)
        .eq("account_id", acct.account_id)

      if (upErr) {
        console.error(
          `[account-health-monitor] update failed for ${acct.account_id}:`,
          upErr.message
        )
        errors++
        errorDetails.push({ account_id: acct.account_id, reason: upErr.message })
      } else {
        ok++
      }
    }

    // Log the run. If the VPS endpoint isn't deployed, leave a clear note
    // so future debugging doesn't waste anyone's afternoon.
    try {
      await supabase.from("cron_run_log").insert({
        cron_name: "account-health-monitor",
        ran_at: new Date(startedAt).toISOString(),
        ms: Date.now() - startedAt,
        status: vpsMissing ? "warn" : "ok",
        info: {
          checked: accounts.length,
          ok,
          errors,
          note: vpsMissing ? "vps probe endpoint not yet deployed" : undefined,
          errors_detail: errorDetails.slice(0, 10),
        },
      })
    } catch {}

    return NextResponse.json({
      checked: accounts.length,
      ok,
      errors,
      vps_missing: vpsMissing,
      ms: Date.now() - startedAt,
    })
  } catch (e) {
    console.error("[account-health-monitor] unhandled error:", e)
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 }
    )
  }
}

export async function GET(req: NextRequest) {
  return handle(req)
}
export async function POST(req: NextRequest) {
  return handle(req)
}
