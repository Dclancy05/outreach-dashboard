import { NextRequest, NextResponse } from "next/server"
import { isAllowedKey, readKey, type AllowedKey } from "@/lib/integration-keys"
import { runKeyProbe } from "@/lib/key-probes"

export const dynamic = "force-dynamic"

// POST /api/system-settings/keys/test
// Body: { key }
// Pings the integration's lightweight health endpoint and returns
// { ok: true, detail } or { ok: false, error }. Never returns the raw key.
//
// Probe logic lives in src/lib/key-probes.ts so the new /api/api-keys/test
// route can share it. This route is the legacy entry point for the old
// Settings → Integrations panel.
export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 })
  }

  const key = typeof body.key === "string" ? body.key : ""
  if (!key) {
    return NextResponse.json({ ok: false, error: "key required" }, { status: 400 })
  }
  if (!isAllowedKey(key)) {
    return NextResponse.json({ ok: false, error: "key not allowed" }, { status: 400 })
  }

  const value = await readKey(key as AllowedKey)
  if (!value) {
    return NextResponse.json({ ok: false, error: "key is not set" }, { status: 200 })
  }

  if (key === "CRON_SECRET") {
    return NextResponse.json({
      ok: false,
      error: "CRON_SECRET cannot be live-tested",
    })
  }

  try {
    const result = await runKeyProbe(key, value)
    return NextResponse.json(result)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "probe failed"
    return NextResponse.json({ ok: false, error: msg }, { status: 200 })
  }
}
