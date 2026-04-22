import { NextResponse } from "next/server"

const VPS_URL = process.env.VPS_URL || process.env.RECORDING_SERVER_URL || "http://srv1197943.hstgr.cloud:3848"

export async function GET() {
  try {
    const res = await fetch(`${VPS_URL}/health`, { next: { revalidate: 0 } })
    const data = await res.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ chrome: false, xvfb: false, proxy: false, queueProcessor: false, recording: false })
  }
}
