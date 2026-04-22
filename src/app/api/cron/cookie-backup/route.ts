import { NextRequest, NextResponse } from "next/server"

const VPS_URL = process.env.VPS_URL || "https://srv1197943.taild42583.ts.net:10000"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

async function handle(req: NextRequest) {
  const auth = req.headers.get("authorization") || ""
  const expected = process.env.CRON_SECRET || ""
  if (!expected) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 })
  if (auth !== `Bearer ${expected}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  try {
    const res = await fetch(`${VPS_URL}/cookies/backup`, {
      method: "POST",
      signal: AbortSignal.timeout(10000),
    })
    const data = await res.json().catch(() => ({}))
    return NextResponse.json({ ok: res.ok, ...data })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 })
  }
}

export async function GET(req: NextRequest) { return handle(req) }
export async function POST(req: NextRequest) { return handle(req) }
