import { NextRequest, NextResponse } from "next/server"

const VNC_MANAGER_URL = process.env.VNC_MANAGER_URL || "http://127.0.0.1:18790"
const VNC_API_KEY = process.env.VNC_API_KEY || "vnc-mgr-2026-dylan"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { proxy_group_id, platform, proxy_config } = body

    if (!proxy_group_id) {
      return NextResponse.json({ error: "proxy_group_id required" }, { status: 400 })
    }

    const res = await fetch(`${VNC_MANAGER_URL}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": VNC_API_KEY },
      body: JSON.stringify({ proxy_group_id, platform, proxy_config }),
    })

    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "VNC Manager unreachable" }, { status: 502 })
  }
}

export async function GET() {
  try {
    const res = await fetch(`${VNC_MANAGER_URL}/api/sessions`, {
      headers: { "X-API-Key": VNC_API_KEY },
    })
    const data = await res.json()
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "VNC Manager unreachable" }, { status: 502 })
  }
}
