import { NextResponse } from "next/server"
import { getSecret } from "@/lib/secrets"

export async function POST() {
  try {
    const VPS_URL =
      (await getSecret("VPS_URL")) ||
      (await getSecret("RECORDING_SERVER_URL")) ||
      "http://srv1197943.hstgr.cloud:3848"
    const res = await fetch(`${VPS_URL}/start`, { method: "POST" })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e: any) {
    return NextResponse.json({ error: "Failed to connect to recording service", details: e.message }, { status: 502 })
  }
}
