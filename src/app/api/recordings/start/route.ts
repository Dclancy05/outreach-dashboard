import { NextResponse } from "next/server"

const VPS_URL = "http://srv1197943.hstgr.cloud:3848"

export async function POST() {
  try {
    const res = await fetch(`${VPS_URL}/start`, { method: "POST" })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e: any) {
    return NextResponse.json({ error: "Failed to connect to recording service", details: e.message }, { status: 502 })
  }
}
