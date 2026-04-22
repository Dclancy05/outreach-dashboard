import { NextResponse } from "next/server"

const VPS_URL = process.env.VPS_URL || "https://srv1197943.taild42583.ts.net:10000"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const url = (body as { url?: string }).url
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 })
  try {
    const res = await fetch(`${VPS_URL}/goto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(10000),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }
}
