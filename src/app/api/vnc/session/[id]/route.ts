import { NextRequest, NextResponse } from "next/server"
import { getSecret } from "@/lib/secrets"

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const VNC_MANAGER_URL = (await getSecret("VNC_MANAGER_URL")) || "http://127.0.0.1:18790"
    const VNC_API_KEY = (await getSecret("VNC_API_KEY")) || ""
    const res = await fetch(`${VNC_MANAGER_URL}/sessions`, {
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
    const VNC_MANAGER_URL = (await getSecret("VNC_MANAGER_URL")) || "http://127.0.0.1:18790"
    const VNC_API_KEY = (await getSecret("VNC_API_KEY")) || ""
    const res = await fetch(`${VNC_MANAGER_URL}/sessions/${params.id}`, {
      method: "DELETE",
      headers: { "X-API-Key": VNC_API_KEY },
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 })
  }
}
