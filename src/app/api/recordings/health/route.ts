import { NextResponse } from "next/server"
import { getSecret } from "@/lib/secrets"

// VPS infra-only health. Returns whether Chrome/Xvfb/proxy/queue are alive.
//
// IMPORTANT — DO NOT add a /login-status call here. Historically this endpoint
// also pulled login state, which forced the VPS to drive Chrome through every
// platform (IG → FB → LI → TikTok) on every cache miss. Combined with the
// 30s system-pulse poller, that rotated a real, logged-in Chrome session
// every ~5 minutes — a textbook ban-risk pattern. Login state must be queried
// explicitly via /api/platforms/login-status (user-initiated only). See
// /root/.claude/plans/funnel-restored-goofy-stearns.md for the incident write-up.
export async function GET() {
  try {
    const VPS_URL =
      (await getSecret("VPS_URL")) ||
      (await getSecret("RECORDING_SERVER_URL")) ||
      "https://srv1197943.taild42583.ts.net:10000"
    const res = await fetch(`${VPS_URL}/health`, { next: { revalidate: 0 } })
    const data = await res.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({
      chrome: false, xvfb: false, proxy: false, queueProcessor: false, recording: false,
    })
  }
}
