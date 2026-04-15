import { NextRequest, NextResponse } from "next/server"

const VNC_MANAGER_URL = process.env.VNC_MANAGER_URL || "http://127.0.0.1:18790"
const VNC_API_KEY = process.env.VNC_API_KEY || "vnc-mgr-2026-dylan"

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json()
    const res = await fetch(`${VNC_MANAGER_URL}/api/sessions/${params.id}/capture`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": VNC_API_KEY },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 })
  }
}
