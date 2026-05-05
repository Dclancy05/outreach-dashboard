import { NextRequest, NextResponse } from "next/server"
import { injectCookiesForAccount } from "@/lib/vnc/cookie-injection"

export const dynamic = "force-dynamic"

// POST /api/vnc/inject-cookies
// Body: { session_id, account_id }
//
// Pulls the latest cookie snapshot for `account_id` from
// `account_cookie_snapshots`, then forwards it to the VPS endpoint
// `POST ${VPS_URL}/sessions/{session_id}/inject-cookies` so the running
// Chrome session can preload the user's logged-in state via CDP. This is
// what lets the Sign-In modal skip the actual login UI when we already have
// fresh cookies on file.
//
// Implementation lives in `src/lib/vnc/cookie-injection.ts` so other
// server modules (notably `/api/recordings/start`) can compose this without
// an internal HTTP round-trip. The HTTP shape exported here is unchanged —
// the accounts page (which hits this route through PlatformLoginModal)
// continues to see identical responses. If you need to change the response
// shape, change BOTH consumers (this route AND recordings/start) together.
export async function POST(req: NextRequest) {
  let body: any = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 }
    )
  }

  const result = await injectCookiesForAccount({
    sessionId: body?.session_id,
    accountId: body?.account_id,
  })
  return NextResponse.json(result.body, { status: result.httpStatus })
}
