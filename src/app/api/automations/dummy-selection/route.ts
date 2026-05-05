import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export const dynamic = "force-dynamic"

/**
 * Dummy group + account selection persisted for the Live View tab.
 *
 * Spec: the Automations Live View has an always-on VNC embed of the global
 * dummy group. When Dylan picks which account to "be" in that group, the
 * choice persists across page loads so he doesn't have to re-select every
 * time. We key by `proxy_group_id` because the dummy group is one row in
 * `proxy_groups` with `is_dummy = true`.
 */

/**
 * GET /api/automations/dummy-selection
 *
 * Returns the current dummy group (if any — there can be only one since the
 * migration enforces a partial unique index on is_dummy=true) plus the
 * persisted account selection and the accounts available in that group.
 */
export async function GET(_req: NextRequest) {
  // 1. Find the single dummy group.
  // Bug #26 fix — DO NOT include `username`/`password` columns. These are
  // proxy auth credentials. The previous query returned them to ANY
  // authenticated dashboard user, leaking proxy creds via the GET. The
  // UI only needs identity fields (id/name/ip/port/location) to render
  // the dummy-group selector banner; auth happens server-side via the
  // VPS having its own copy of proxy credentials.
  const { data: group, error: groupErr } = await supabase
    .from("proxy_groups")
    .select("id, name, ip, port, location_city, location_country, is_dummy")
    .eq("is_dummy", true)
    .maybeSingle()

  if (groupErr) return NextResponse.json({ error: groupErr.message }, { status: 500 })

  if (!group) {
    return NextResponse.json({
      group: null,
      accounts: [],
      selection: null,
      message: "No dummy group configured. Mark one proxy group as is_dummy=true in the Accounts page.",
    })
  }

  // 2. Accounts in that group (only ones wired to platforms the recorder cares about).
  const { data: accounts, error: acctErr } = await supabase
    .from("accounts")
    .select("account_id, platform, username, display_name, status, proxy_group_id")
    .eq("proxy_group_id", group.id)
    .order("platform", { ascending: true })

  if (acctErr) return NextResponse.json({ error: acctErr.message }, { status: 500 })

  // 3. Persisted selection for this group.
  const { data: selection, error: selErr } = await supabase
    .from("automation_dummy_selection")
    .select("proxy_group_id, account_id, updated_at")
    .eq("proxy_group_id", group.id)
    .maybeSingle()

  if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 })

  return NextResponse.json({
    group,
    accounts: accounts || [],
    selection: selection || null,
  })
}

/**
 * POST /api/automations/dummy-selection
 *
 * Upserts the persisted account pick for the dummy group. Body:
 *   { proxy_group_id: string, account_id: string | null }
 *
 * account_id may be null to clear the selection (e.g. "operate as no-one").
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { proxy_group_id, account_id } = body

  if (!proxy_group_id) {
    return NextResponse.json({ error: "proxy_group_id is required" }, { status: 400 })
  }

  const row = {
    proxy_group_id,
    account_id: account_id || null,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from("automation_dummy_selection")
    .upsert(row, { onConflict: "proxy_group_id" })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
