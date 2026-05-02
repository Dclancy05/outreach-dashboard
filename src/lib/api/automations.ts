/**
 * Shared client + server helpers for automation analytics.
 *
 * Keeps query logic that's reused between the dashboard UI (Overview tab
 * sparkline, idle banner) and cron routes (health-score worker) in one
 * place so we don't drift on shape definitions.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

export interface DailySparklinePoint {
  /** ISO date (YYYY-MM-DD), in UTC, no time component. */
  date: string
  /** Total runs that finished on that date (passed + failed + healed). */
  total: number
  /** Successful runs (passed + healed). */
  passed: number
  /** Failed runs. */
  failed: number
  /** Pass rate 0-100 for this day; null when no runs landed. */
  pass_rate: number | null
}

/**
 * Build a 14-day window of daily pass-rate datapoints from the
 * automation_runs table. Day buckets are UTC date strings so the
 * sparkline stays stable regardless of viewer timezone — the spec only
 * needs day-grain ("Last 14 days success rate"), not hour-grain.
 *
 * Returns exactly 14 entries, oldest first, including zero-run days so
 * the chart always has 13 line segments and gaps render as flat zero
 * bars (we render `pass_rate ?? 0`).
 */
export async function fetchAutomationRunsLast14Days(
  client: SupabaseClient,
  opts?: { automation_id?: string }
): Promise<DailySparklinePoint[]> {
  const now = Date.now()
  const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000
  const since = new Date(now - fourteenDaysMs).toISOString()

  let q = client
    .from("automation_runs")
    .select("status, started_at, finished_at")
    .gte("started_at", since)
    .in("status", ["passed", "failed", "healed"])
    .order("started_at", { ascending: true })

  if (opts?.automation_id) q = q.eq("automation_id", opts.automation_id)

  const { data, error } = await q
  if (error) {
    // Don't crash the dashboard for an analytics widget — just return
    // an empty 14-day window so the sparkline renders flat.
    console.warn("[fetchAutomationRunsLast14Days] query failed:", error.message)
    return buildEmptyWindow(now)
  }

  return aggregateRunsByDay(data || [], now)
}

/**
 * Same as `fetchAutomationRunsLast14Days` but constructs its own
 * Supabase client from env vars. Use this from server components or
 * API routes that don't already have a client.
 */
export async function fetchAutomationRunsLast14DaysFromEnv(opts?: {
  automation_id?: string
}): Promise<DailySparklinePoint[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return buildEmptyWindow(Date.now())
  const client = createClient(url, key)
  return fetchAutomationRunsLast14Days(client, opts)
}

function isoDay(d: Date): string {
  // YYYY-MM-DD in UTC.
  return d.toISOString().slice(0, 10)
}

function buildEmptyWindow(nowMs: number): DailySparklinePoint[] {
  const points: DailySparklinePoint[] = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date(nowMs - i * 24 * 60 * 60 * 1000)
    points.push({
      date: isoDay(d),
      total: 0,
      passed: 0,
      failed: 0,
      pass_rate: null,
    })
  }
  return points
}

export function aggregateRunsByDay(
  runs: Array<{ status: string | null; started_at: string | null }>,
  nowMs: number = Date.now()
): DailySparklinePoint[] {
  const window = buildEmptyWindow(nowMs)
  const byDay = new Map(window.map((p) => [p.date, p]))

  for (const r of runs) {
    if (!r.started_at) continue
    const day = isoDay(new Date(r.started_at))
    const bucket = byDay.get(day)
    if (!bucket) continue
    bucket.total += 1
    if (r.status === "passed" || r.status === "healed") bucket.passed += 1
    else if (r.status === "failed") bucket.failed += 1
  }

  for (const p of window) {
    p.pass_rate = p.total > 0 ? Math.round((p.passed / p.total) * 100) : null
  }
  return window
}
