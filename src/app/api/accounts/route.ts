import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// GET /api/accounts — lightweight listing used by the onboarding wizard and
// any other caller that just needs "pick an account". Returns public fields
// only (no passwords, no 2fa secrets).
export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("business_id")
  const platform = req.nextUrl.searchParams.get("platform")

  let q = supabase
    .from("accounts")
    .select(
      "account_id, platform, username, display_name, status, daily_limit, sends_today, business_id, proxy_group_id, cookies_health, cookies_updated_at"
    )
    .limit(200)

  if (businessId) q = q.eq("business_id", businessId)
  if (platform) q = q.eq("platform", platform)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data: data || [], total: data?.length || 0 })
}

// 6-char a-z0-9 random suffix for the account_id. Crypto-strong is overkill
// here — we just need enough entropy that two simultaneous "Add Account"
// clicks in the same millisecond don't collide.
function randomString(len: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
  let out = ""
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

// POST /api/accounts — single-account creation. The Add Account dialog at
// accounts/page.tsx:1485-1608 hits this; before this route existed, the
// dialog routed through the legacy `/api/dashboard` action which couldn't
// enforce the platform-uniqueness rule server-side.
//
// Body shape (all fields optional except `platform`):
//   {
//     platform, username, display_name, password,
//     twofa_backup_codes?, recovery_email?,
//     email_login_username?, email_login_password?,
//     proxy_group_id?, daily_limit?, warmup_sequence_id?, notes?,
//     business_id?
//   }
//
// Server-side enforces the "one platform per proxy group" invariant from
// migration 20260427_one_platform_per_group.sql — same proxy_group_id +
// platform can't already have an active/warming account. Returns 409 with
// a clear message if the rule would be violated.
export async function POST(req: NextRequest) {
  let body: any = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const platform = typeof body.platform === "string" ? body.platform.trim().toLowerCase() : ""
  if (!platform) {
    return NextResponse.json({ error: "platform is required" }, { status: 400 })
  }

  const username =
    typeof body.username === "string" ? body.username.replace(/^@/, "").trim() : ""
  const display_name =
    typeof body.display_name === "string" ? body.display_name.trim() : ""
  const password = typeof body.password === "string" ? body.password : ""
  const proxyGroupId =
    typeof body.proxy_group_id === "string" ? body.proxy_group_id : ""
  const businessId =
    typeof body.business_id === "string" && body.business_id ? body.business_id : "default"

  // 2FA backup codes can arrive as a textarea string ("\n"-delimited) or
  // already-split array. Normalize to a single newline-joined string so the
  // existing schema (TEXT column) keeps working for the rest of the app.
  let twofa_backup_codes = ""
  if (Array.isArray(body.twofa_backup_codes)) {
    twofa_backup_codes = body.twofa_backup_codes
      .map((s: unknown) => (typeof s === "string" ? s.trim() : ""))
      .filter(Boolean)
      .join("\n")
  } else if (typeof body.twofa_backup_codes === "string") {
    twofa_backup_codes = body.twofa_backup_codes
  }

  // Platform-uniqueness check — only if a proxy_group_id was actually
  // assigned. If the user picked "None (assign later)" we let it through;
  // the assignProxy code path enforces the rule when they later attach one.
  if (proxyGroupId) {
    const { data: existing, error: existingErr } = await supabase
      .from("accounts")
      .select("account_id, status, username")
      .eq("proxy_group_id", proxyGroupId)
      .eq("platform", platform)
      // Only block on accounts that are still alive. Banned/cooldown/deleted
      // rows shouldn't keep a slot reserved forever.
      .in("status", ["active", "pending_setup", "warming", "warmup"])
      .limit(1)

    if (existingErr) {
      return NextResponse.json({ error: existingErr.message }, { status: 500 })
    }
    if (existing && existing.length > 0) {
      return NextResponse.json(
        {
          error: `This proxy group already has a ${platform} account (@${
            existing[0].username || "unknown"
          }). One account per platform per proxy.`,
          conflict_account_id: existing[0].account_id,
        },
        { status: 409 }
      )
    }
  }

  // Cross-platform username uniqueness — same handle on the same platform
  // shouldn't be inserted twice. Only enforce when we actually got a
  // username (the field is optional in the form).
  if (username) {
    const { data: dup } = await supabase
      .from("accounts")
      .select("account_id")
      .eq("platform", platform)
      .ilike("username", username)
      .limit(1)
    if (dup && dup.length > 0) {
      return NextResponse.json(
        { error: `@${username} already exists on ${platform}` },
        { status: 409 }
      )
    }
  }

  const account_id = `acc_${Date.now()}_${randomString(6)}`

  // Optional limits — only set when the caller specified them. Empty string
  // is a deliberate "use default" signal so we leave the column at its
  // schema default rather than overwriting with "".
  const dailyLimit =
    body.daily_limit !== undefined && body.daily_limit !== ""
      ? String(body.daily_limit)
      : "40"
  const warmupSequenceId =
    typeof body.warmup_sequence_id === "string" ? body.warmup_sequence_id : ""

  const row: Record<string, unknown> = {
    account_id,
    platform,
    username,
    display_name: display_name || username,
    password,
    twofa_secret: typeof body.twofa_secret === "string" ? body.twofa_secret : "",
    twofa_backup_codes,
    email: typeof body.recovery_email === "string" ? body.recovery_email : "",
    email_login_username:
      typeof body.email_login_username === "string" ? body.email_login_username : "",
    email_login_password:
      typeof body.email_login_password === "string" ? body.email_login_password : "",
    proxy_group_id: proxyGroupId,
    daily_limit: dailyLimit,
    sends_today: "0",
    warmup_sequence_id: warmupSequenceId,
    warmup_day: warmupSequenceId ? 1 : 0,
    notes: typeof body.notes === "string" ? body.notes : "",
    status: "pending_setup",
    connection_type: "novnc",
    business_id: businessId,
  }

  const { error } = await supabase.from("accounts").insert(row)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, account_id })
}
