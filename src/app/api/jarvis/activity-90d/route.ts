import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

type DayRow = {
  date: string
  runs: number
  audits: number
  edits: number
  notifications: number
  total: number
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export async function GET() {
  const today = new Date()
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 89))

  // Pre-fill 90 days
  const days: Map<string, DayRow> = new Map()
  for (let i = 0; i < 90; i++) {
    const d = new Date(start.getTime() + i * 86400_000)
    const key = isoDate(d)
    days.set(key, { date: key, runs: 0, audits: 0, edits: 0, notifications: 0, total: 0 })
  }

  // Workflow runs (one source of activity)
  const [runsRes, auditsRes, memVersionsRes, notifsRes] = await Promise.all([
    supabase
      .from("workflow_runs")
      .select("started_at")
      .gte("started_at", start.toISOString())
      .limit(5000),
    supabase
      .from("audit_log")
      .select("ts")
      .gte("ts", start.toISOString())
      .limit(5000),
    // Memory file edits — version_history has frozen IDs but the simplest signal
    // is memory_versions inserts (each save = one version).
    supabase
      .from("memory_versions")
      .select("created_at")
      .gte("created_at", start.toISOString())
      .limit(5000),
    supabase
      .from("notifications")
      .select("created_at")
      .gte("created_at", start.toISOString())
      .limit(5000),
  ])

  for (const r of runsRes.data || []) {
    if (!r.started_at) continue
    const k = isoDate(new Date(r.started_at))
    const slot = days.get(k)
    if (slot) {
      slot.runs += 1
      slot.total += 1
    }
  }
  for (const r of auditsRes.data || []) {
    if (!r.ts) continue
    const k = isoDate(new Date(r.ts))
    const slot = days.get(k)
    if (slot) {
      slot.audits += 1
      slot.total += 1
    }
  }
  for (const r of memVersionsRes.data || []) {
    if (!r.created_at) continue
    const k = isoDate(new Date(r.created_at))
    const slot = days.get(k)
    if (slot) {
      slot.edits += 1
      slot.total += 1
    }
  }
  for (const r of notifsRes.data || []) {
    if (!r.created_at) continue
    const k = isoDate(new Date(r.created_at))
    const slot = days.get(k)
    if (slot) {
      slot.notifications += 1
      slot.total += 1
    }
  }

  const rows = Array.from(days.values())
  const max = Math.max(1, ...rows.map((r) => r.total))
  const total90 = rows.reduce(
    (acc, r) => ({
      runs: acc.runs + r.runs,
      audits: acc.audits + r.audits,
      edits: acc.edits + r.edits,
      notifications: acc.notifications + r.notifications,
      total: acc.total + r.total,
    }),
    { runs: 0, audits: 0, edits: 0, notifications: 0, total: 0 },
  )

  // Streak: longest run of consecutive days with total > 0 ending today
  let streakNow = 0
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].total > 0) streakNow += 1
    else break
  }

  return NextResponse.json({
    days: rows,
    max,
    total_90d: total90,
    streak_days: streakNow,
    timezone: "UTC",
  })
}
