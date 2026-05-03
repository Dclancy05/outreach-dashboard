import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { extractAdminId } from "@/lib/audit"

export const dynamic = "force-dynamic"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Wave 2.3 — Queue-depth observability + alerting.
//
// GET /api/observability/queue-depth
//   Optional: ?since_minutes=N (default 60) — used by historical chart.
//
// Returns:
//   {
//     ok, now,
//     send_queue: { queued, processing, failed, sent_24h, age_p95_ms, oldest_at },
//     retry_queue: { pending, scheduled_within_5min },
//     workflow_runs: { running, queued, failed_24h }
//   }
//
// Used by the Phase 2.3 dashboard widget AND by deadman-check
// (extended via Wave 2.3 to alert when queue depth crosses thresholds).

export async function GET(req: NextRequest) {
  const adminId = extractAdminId(req.headers.get("cookie"))
  // Allow internal cron callers (deadman-check) to use this without admin auth.
  const isInternal = req.headers.get("x-internal-cron") || req.headers.get("authorization")?.startsWith("Bearer ")
  if (!adminId && !isInternal) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
  }

  const day = new Date(Date.now() - 24 * 3600_000).toISOString()
  const fiveMin = new Date(Date.now() + 5 * 60_000).toISOString()

  // Run all queries in parallel
  const [
    queued, processing, failed, sent24,
    sendQueueOldest, retryPending, retrySoon,
    runsRunning, runsQueued, runsFailed24
  ] = await Promise.all([
    supabase.from("send_queue").select("*", { count: "exact", head: true }).eq("status", "queued"),
    supabase.from("send_queue").select("*", { count: "exact", head: true }).eq("status", "processing"),
    supabase.from("send_queue").select("*", { count: "exact", head: true }).eq("status", "failed").gte("created_at", day),
    supabase.from("send_queue").select("*", { count: "exact", head: true }).eq("status", "sent").gte("created_at", day),
    supabase.from("send_queue").select("created_at").eq("status", "queued").order("created_at", { ascending: true }).limit(1).maybeSingle(),
    supabase.from("retry_queue").select("*", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("retry_queue").select("*", { count: "exact", head: true }).eq("status", "pending").lte("next_retry_at", fiveMin),
    supabase.from("workflow_runs").select("*", { count: "exact", head: true }).eq("status", "running"),
    supabase.from("workflow_runs").select("*", { count: "exact", head: true }).eq("status", "queued"),
    supabase.from("workflow_runs").select("*", { count: "exact", head: true }).eq("status", "failed").gte("created_at", day),
  ])

  // Approximate p95 age — sample 50 oldest queued rows, take their 95th percentile.
  const { data: oldestSample } = await supabase
    .from("send_queue")
    .select("created_at")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(50)

  const ages = (oldestSample || []).map((r: any) => Date.now() - new Date(r.created_at).getTime())
  ages.sort((a, b) => a - b)
  const p95 = ages.length ? ages[Math.floor(ages.length * 0.95)] : 0

  return NextResponse.json({
    ok: true,
    now: new Date().toISOString(),
    send_queue: {
      queued: queued.count ?? 0,
      processing: processing.count ?? 0,
      failed_24h: failed.count ?? 0,
      sent_24h: sent24.count ?? 0,
      age_p95_ms: p95,
      oldest_at: sendQueueOldest.data?.created_at ?? null,
    },
    retry_queue: {
      pending: retryPending.count ?? 0,
      scheduled_within_5min: retrySoon.count ?? 0,
    },
    workflow_runs: {
      running: runsRunning.count ?? 0,
      queued: runsQueued.count ?? 0,
      failed_24h: runsFailed24.count ?? 0,
    },
  })
}
