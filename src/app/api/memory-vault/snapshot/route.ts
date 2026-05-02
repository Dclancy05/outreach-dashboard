/**
 * Vault snapshot read + force-snapshot API.
 *
 * GET /api/memory-vault/snapshot?at=<ISO8601>
 *   Reconstructs the vault tree as it existed at the given timestamp.
 *   Returns { tree, files } where files[*] = { path, content, size_bytes, snapshot_date }.
 *   Auth: admin_session cookie (enforced by /src/middleware.ts for /api/memory-vault/*).
 *
 * POST /api/memory-vault/snapshot
 *   Force-runs snapshotVault for `body.date` (defaults to today).
 *   Used for manual bootstrapping / catch-up; cron has its own route.
 *   Auth: admin_session cookie.
 */
import { NextRequest, NextResponse } from "next/server"
import { snapshotVault, getVaultStateAt } from "@/lib/vault-snapshot"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const at = url.searchParams.get("at")
  if (!at) {
    return NextResponse.json(
      { error: "missing query param: at (ISO 8601 timestamp)" },
      { status: 400 },
    )
  }
  const ts = new Date(at)
  if (isNaN(ts.getTime())) {
    return NextResponse.json(
      { error: `invalid timestamp: ${at}` },
      { status: 400 },
    )
  }
  try {
    const state = await getVaultStateAt(ts)
    return NextResponse.json(state)
  } catch (e) {
    return NextResponse.json(
      { error: "snapshot read failed", detail: (e as Error).message },
      { status: 500 },
    )
  }
}

export async function POST(req: NextRequest) {
  let date = new Date()
  try {
    const body = (await req.json().catch(() => ({}))) as { date?: string }
    if (body && typeof body.date === "string" && body.date) {
      const d = new Date(body.date)
      if (!isNaN(d.getTime())) date = d
    }
  } catch {
    // ignore — empty body is fine
  }
  try {
    const result = await snapshotVault(date)
    return NextResponse.json({ ok: true, snapshot_date: date.toISOString().slice(0, 10), ...result })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    )
  }
}
