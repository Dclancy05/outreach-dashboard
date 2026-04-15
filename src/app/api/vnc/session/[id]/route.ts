import { NextRequest, NextResponse } from "next/server"

const VNC_MANAGER_URL = process.env.VNC_MANAGER_URL || "http://127.0.0.1:18790"
const VNC_API_KEY = process.env.VNC_API_KEY || "vnc-mgr-2026-dylan"

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const res = await fetch(`${VNC_MANAGER_URL}/api/sessions`, {
      headers: { "X-API-Key": VNC_API_KEY },
    })
    const data = await res.json()
    const session = data.sessions?.find((s: any) => s.id === params.id)
    if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 })
    return NextResponse.json({ data: session })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const res = await fetch(`${VNC_MANAGER_URL}/api/sessions/${params.id}`, {
      method: "DELETE",
      headers: { "X-API-Key": VNC_API_KEY },
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 })
  }
}
