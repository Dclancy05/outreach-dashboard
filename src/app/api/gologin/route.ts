import { NextRequest, NextResponse } from "next/server"
import { getSecret } from "@/lib/secrets"

const GOLOGIN_API = "https://api.gologin.com/browser"

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  }
}

export async function GET() {
  const TOKEN = await getSecret("GOLOGIN_API_TOKEN")
  if (!TOKEN) {
    return NextResponse.json({ error: "GOLOGIN_API_TOKEN not configured" }, { status: 500 })
  }

  try {
    const res = await fetch(`${GOLOGIN_API}/v2?limit=50`, { headers: headers(TOKEN), cache: "no-store" })
    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ error: `GoLogin API error: ${res.status}`, details: text }, { status: res.status })
    }
    const data = await res.json()
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const TOKEN = await getSecret("GOLOGIN_API_TOKEN")
  if (!TOKEN) {
    return NextResponse.json({ error: "GOLOGIN_API_TOKEN not configured" }, { status: 500 })
  }

  try {
    const body = await req.json()
    const { profileId, ...updateData } = body

    if (!profileId) {
      return NextResponse.json({ error: "profileId is required" }, { status: 400 })
    }

    const res = await fetch(`${GOLOGIN_API}/${profileId}`, {
      method: "PATCH",
      headers: headers(TOKEN),
      body: JSON.stringify(updateData),
    })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ error: `GoLogin API error: ${res.status}`, details: text }, { status: res.status })
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 })
  }
}
