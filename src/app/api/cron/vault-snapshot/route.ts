/**
 * Daily vault snapshot cron — fires at 02:15 UTC (~10:15 PM Eastern, off-peak).
 *
 * Auth: Bearer ${CRON_SECRET} (Vercel cron sends this header per project setting).
 * Idempotent: re-running on the same day is a no-op (UNIQUE(snapshot_date, file_path)
 * + ON CONFLICT DO NOTHING). Safe to retry.
 */
import { NextRequest, NextResponse } from "next/server"
import { snapshotVault } from "@/lib/vault-snapshot"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

async function handle(req: NextRequest) {
  const auth = req.headers.get("authorization") || ""
  const expected = process.env.CRON_SECRET || ""
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    )
  }
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  try {
    const date = new Date()
    const result = await snapshotVault(date)
    return NextResponse.json({
      ok: true,
      snapshot_date: date.toISOString().slice(0, 10),
      ...result,
    })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 502 },
    )
  }
}

export async function GET(req: NextRequest) {
  return handle(req)
}

export async function POST(req: NextRequest) {
  return handle(req)
}
