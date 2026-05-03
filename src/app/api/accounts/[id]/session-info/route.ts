import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/**
 * GET /api/accounts/:id/session-info
 *
 * Returns the public-safe identity tuple the Sign-In modal's trust bar shows
 * so the user can verify "yes, this is the right Chrome / right proxy / right
 * profile" before typing credentials. Deliberately omits proxy username +
 * password — those are server-side-only secrets that should never reach the
 * client even though /api/accounts/:id (legacy) does leak them.
 *
 * Shape:
 *   {
 *     account_id: string,
 *     platform: string,
 *     username: string | null,
 *     proxy: {
 *       ip: string | null,
 *       port: number | null,
 *       provider: string | null,
 *       city: string | null,
 *       state: string | null,
 *       country: string | null,
 *       status: string | null,
 *     } | null,
 *     profile: { dir: string | null, label: string },
 *     vnc: { session_id: string, framebuffer: string },
 *   }
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const account_id = params.id
  if (!account_id) {
    return NextResponse.json({ error: "account_id required" }, { status: 400 })
  }

  const { data: account, error } = await supabase
    .from("accounts")
    .select("account_id, platform, username, proxy_group_id")
    .eq("account_id", account_id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 })

  // Pull proxy + fingerprint in parallel. Either failing returns null instead
  // of breaking the response — the bar should still render with whatever we
  // can get.
  const [proxyRes, fpRes] = await Promise.all([
    account.proxy_group_id
      ? supabase
          .from("proxy_groups")
          .select("ip, port, provider, location_city, location_state, location_country, status")
          .eq("id", account.proxy_group_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("account_fingerprints")
      .select("chrome_profile_dir")
      .eq("account_id", account_id)
      .maybeSingle(),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proxyRow = (proxyRes as any).data as
    | {
        ip: string | null
        port: number | null
        provider: string | null
        location_city: string | null
        location_state: string | null
        location_country: string | null
        status: string | null
      }
    | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fpRow = (fpRes as any).data as { chrome_profile_dir: string | null } | null

  // Derive a friendly profile label from the dir path. The VPS uses
  // /home/clawd/.chrome-automation today (single shared profile); Phase 2
  // will swap to /vps/profiles/<group_id>. Either way, take the basename so
  // the user sees "chrome-automation" or "<group_id>" not the full path.
  const profileDir = fpRow?.chrome_profile_dir || "/home/clawd/.chrome-automation"
  const profileLabel = profileDir.split("/").filter(Boolean).pop() || "main"

  return NextResponse.json({
    account_id: account.account_id,
    platform: account.platform,
    username: account.username || null,
    proxy: proxyRow
      ? {
          ip: proxyRow.ip,
          port: proxyRow.port,
          provider: proxyRow.provider,
          city: proxyRow.location_city,
          state: proxyRow.location_state,
          country: proxyRow.location_country,
          status: proxyRow.status,
        }
      : null,
    profile: { dir: profileDir, label: profileLabel },
    // Phase 1 keeps a shared "main" session. Phase 2 swaps to per-group.
    vnc: { session_id: "main", framebuffer: "1280x720" },
  })
}
