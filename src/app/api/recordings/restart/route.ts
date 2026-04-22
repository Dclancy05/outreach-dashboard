import { NextResponse } from "next/server"

const VPS_URL = process.env.VPS_URL || process.env.RECORDING_SERVER_URL || "http://srv1197943.hstgr.cloud:3848"

export async function POST() {
  try {
    const restartRes = await fetch(`${VPS_URL}/restart`, { method: "POST" })
    if (restartRes.status !== 404) {
      const body = await restartRes.json().catch(() => ({}))
      return NextResponse.json(
        { ok: restartRes.ok, method: "restart", vps_response: body },
        { status: restartRes.status }
      )
    }
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, method: "unreachable", vps_response: { error: e.message } },
      { status: 502 }
    )
  }

  try {
    const startRes = await fetch(`${VPS_URL}/start`, { method: "POST" })
    const body = await startRes.json().catch(() => ({}))
    return NextResponse.json(
      { ok: startRes.ok, method: "start", vps_response: body },
      { status: startRes.status }
    )
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, method: "unreachable", vps_response: { error: e.message } },
      { status: 502 }
    )
  }
}
