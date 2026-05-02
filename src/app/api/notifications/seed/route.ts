/**
 * POST /api/notifications/seed
 *
 * Manual trigger for the inbox seeder. Same logic the every-5-minute cron at
 * /api/cron/inbox-tick runs — exposed here so the UI ("Refresh inbox" button)
 * and ad-hoc curl calls can force a drain without waiting.
 *
 * Auth: middleware gates everything outside the PUBLIC_ROUTES whitelist
 * with the admin_session cookie, so this route requires a valid PIN session
 * by virtue of NOT being whitelisted in src/middleware.ts.
 */
import { NextResponse } from "next/server"
import { seedNotifications } from "@/lib/notifications-seeder"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST() {
  const result = await seedNotifications()
  return NextResponse.json({ ok: true, ...result })
}
