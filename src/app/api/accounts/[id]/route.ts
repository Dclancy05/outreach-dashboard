import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Whitelist of fields the PATCH handler will accept. Anything not in this
// list returns 400 — protects credentials columns (password, twofa_secret,
// session_cookie, etc.) from being clobbered by a careless caller. Editing
// those goes through dedicated routes (cookies/snapshot, totp/secret, etc.).
const ALLOWED_PATCH_FIELDS = new Set([
  "username",
  "display_name",
  "daily_limit",
  "proxy_group_id",
  "warmup_sequence_id",
  "notes",
  "warmup_paused",
])

// Columns that contain credentials or session material. Stripped from the
// default GET response so a casual XSS / leaky log can't exfiltrate them.
// Caller can opt back in with `?include_secrets=1` (route is already behind
// admin middleware so the opt-in is a soft gate, not a security boundary).
// Mirrors the pattern in /api/accounts/all/route.ts:202-206.
const SECRET_FIELDS = [
  "password",
  "twofa_secret",
  "session_cookie",
  "email_password",
  "api_key_encrypted",
] as const

function stripSecrets<T extends Record<string, unknown>>(account: T): T {
  const out: Record<string, unknown> = { ...account }
  for (const k of SECRET_FIELDS) delete out[k]
  return out as T
}

// GET /api/accounts/:id — fetch a single account with proxy + warmup joined.
// Used by the account detail drawer. Mirrors the shape /api/accounts/detail
// returns but is keyed by URL param so the front-end can use REST-style URLs.
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const account_id = params.id
  if (!account_id) {
    return NextResponse.json({ error: "account_id required" }, { status: 400 })
  }

  const { data: account, error } = await supabase
    .from("accounts")
    .select("*")
    .eq("account_id", account_id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 })

  // Join proxy + warmup in parallel — keeps the call snappy, and either
  // failing returns null instead of breaking the whole response.
  const [proxyRes, warmupRes] = await Promise.all([
    account.proxy_group_id
      ? supabase
          .from("proxy_groups")
          .select("*")
          .eq("id", account.proxy_group_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    account.warmup_sequence_id
      ? supabase
          .from("warmup_sequences")
          .select("*")
          .eq("id", account.warmup_sequence_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])

  const includeSecrets = req.nextUrl.searchParams.get("include_secrets") === "1"
  const safeAccount = includeSecrets ? account : stripSecrets(account as Record<string, unknown>)

  return NextResponse.json({
    account: safeAccount,
    proxy: (proxyRes as any).data || null,
    warmup: (warmupRes as any).data || null,
  })
}

// PATCH /api/accounts/:id — partial update with strict field whitelist.
// Any field outside ALLOWED_PATCH_FIELDS returns 400 with the offending key
// listed so the caller can self-diagnose. If proxy_group_id is changing we
// re-run the platform-uniqueness check from migration
// 20260427_one_platform_per_group.sql.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const account_id = params.id
  if (!account_id) {
    return NextResponse.json({ error: "account_id required" }, { status: 400 })
  }

  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  // Reject any disallowed field outright. We don't silently strip them —
  // a 400 with the offending name is more useful than a confusing partial
  // update that quietly ignores half the payload.
  const offenders = Object.keys(body).filter((k) => !ALLOWED_PATCH_FIELDS.has(k))
  if (offenders.length > 0) {
    return NextResponse.json(
      {
        error: `Unsupported field(s): ${offenders.join(", ")}. Allowed: ${Array.from(
          ALLOWED_PATCH_FIELDS
        ).join(", ")}.`,
      },
      { status: 400 }
    )
  }

  // If proxy_group_id is being changed, fetch the existing row so we can
  // (a) know its platform and (b) only run the uniqueness check when the
  // value actually differs.
  if (Object.prototype.hasOwnProperty.call(body, "proxy_group_id")) {
    const newProxyGroupId = String(body.proxy_group_id || "")

    const { data: current, error: currentErr } = await supabase
      .from("accounts")
      .select("platform, proxy_group_id")
      .eq("account_id", account_id)
      .maybeSingle()

    if (currentErr) return NextResponse.json({ error: currentErr.message }, { status: 500 })
    if (!current) return NextResponse.json({ error: "Account not found" }, { status: 404 })

    if (newProxyGroupId && newProxyGroupId !== current.proxy_group_id) {
      const { data: clash, error: clashErr } = await supabase
        .from("accounts")
        .select("account_id, username")
        .eq("proxy_group_id", newProxyGroupId)
        .eq("platform", current.platform)
        .neq("account_id", account_id)
        .in("status", ["active", "pending_setup", "warming", "warmup"])
        .limit(1)

      if (clashErr) return NextResponse.json({ error: clashErr.message }, { status: 500 })
      if (clash && clash.length > 0) {
        return NextResponse.json(
          {
            error: `That proxy group already has a ${current.platform} account (@${
              clash[0].username || "unknown"
            }). One account per platform per proxy.`,
            conflict_account_id: clash[0].account_id,
          },
          { status: 409 }
        )
      }
    }
  }

  const updates: Record<string, unknown> = { ...body }
  updates.updated_at = new Date().toISOString()

  const { data, error } = await supabase
    .from("accounts")
    .update(updates)
    .eq("account_id", account_id)
    .select()
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: "Account not found" }, { status: 404 })

  return NextResponse.json({ ok: true, account: data })
}

// DELETE /api/accounts/:id  — soft delete by default. If `?hard=true` we
// hard-delete the row and cascade clean every related table:
//   - account_cookie_snapshots
//   - account_fingerprints
//   - account_sessions
//   - send_log
// Hard delete is for "I imported the wrong CSV, wipe it" — soft delete is
// for "this account got banned, hide it from the UI but keep the audit
// trail." The default is soft because lost data is unrecoverable.
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const account_id = params.id
  if (!account_id) {
    return NextResponse.json({ error: "account_id required" }, { status: 400 })
  }

  const hard = req.nextUrl.searchParams.get("hard") === "true"

  if (!hard) {
    const { error } = await supabase
      .from("accounts")
      .update({
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("account_id", account_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, mode: "soft" })
  }

  // Hard delete cascade. We attempt every cleanup in parallel and tolerate
  // individual failures (some tables may not exist on every deployment, or
  // the row may genuinely not have any cookies/sessions). The accounts row
  // itself is the one that MUST succeed.
  await Promise.allSettled([
    supabase.from("account_cookie_snapshots").delete().eq("account_id", account_id),
    supabase.from("account_fingerprints").delete().eq("account_id", account_id),
    supabase.from("account_sessions").delete().eq("account_id", account_id),
    supabase.from("send_log").delete().eq("account_id", account_id),
  ])

  const { error } = await supabase
    .from("accounts")
    .delete()
    .eq("account_id", account_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, mode: "hard" })
}
