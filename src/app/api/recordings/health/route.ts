import { NextResponse } from "next/server"
import { getSecret } from "@/lib/secrets"

export async function GET() {
  try {
    const VPS_URL =
      (await getSecret("VPS_URL")) ||
      (await getSecret("RECORDING_SERVER_URL")) ||
      "https://srv1197943.taild42583.ts.net:10000"
    const res = await fetch(`${VPS_URL}/health`, { next: { revalidate: 0 } })
    const data = await res.json()

    // Also pull the login-status probe (cached 5min on the VPS side, so cheap).
    // If any required platform is logged out, the aggregate loggedIn flag goes false
    // and the dashboard banner flips to red with a direct "Log in" call-to-action.
    let loginResults: Array<{ platform: string; loggedIn: boolean | null; loginUrl?: string }> = []
    try {
      const liRes = await fetch(`${VPS_URL}/login-status`, { signal: AbortSignal.timeout(8000) })
      const liData = await liRes.json()
      loginResults = Array.isArray(liData?.results) ? liData.results : []
    } catch {}
    const loggedOut = loginResults.filter(r => r.loggedIn === false)

    return NextResponse.json({
      ...data,
      accountsLoggedIn: loggedOut.length === 0 && loginResults.length > 0,
      loginResults,
      loggedOutCount: loggedOut.length,
    })
  } catch {
    return NextResponse.json({
      chrome: false, xvfb: false, proxy: false, queueProcessor: false, recording: false,
      accountsLoggedIn: false, loginResults: [], loggedOutCount: 0,
    })
  }
}
