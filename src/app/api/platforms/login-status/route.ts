import { NextResponse } from "next/server"

const VPS_URL = process.env.VPS_URL || "https://srv1197943.taild42583.ts.net:10000"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(req: Request) {
  const url = new URL(req.url)
  const platforms = url.searchParams.get("platforms") || "instagram,facebook,linkedin,tiktok"
  const refresh = url.searchParams.get("refresh") === "1"
  try {
    if (refresh) {
      await fetch(`${VPS_URL}/login-status/refresh`, { signal: AbortSignal.timeout(5000) }).catch(() => {})
    }
    const res = await fetch(`${VPS_URL}/login-status?platforms=${encodeURIComponent(platforms)}`, {
      signal: AbortSignal.timeout(55000),
    })
    const data = await res.json()
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ cached: false, results: [], error: (e as Error).message }, { status: 502 })
  }
}
