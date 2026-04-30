// Sweep stuck workflow runs.
//
// Why this exists:
//   The Vercel function lifetime can SIGKILL the synchronous workflow executor
//   (run-sync.ts) before the agent-runner finishes — typical on Hobby's 60s
//   limit, or on Pro if a Quick Ask hits a cache-miss + slow tool call. When
//   that happens the run row is left with status='running' forever and Dylan
//   gets no Telegram reply. Same hazard for /workflows/run on the VPS if the
//   agent-runner crashes mid-execution.
//
//   This cron walks the table every 10 minutes, finds runs that have been
//   `running` longer than the threshold, marks them `failed` with a clear
//   reason, and pings Telegram if the run came from Telegram so Dylan knows
//   what happened.
//
// Auth: standard `Bearer ${CRON_SECRET}`.
//
// Idempotency: a stuck run will be swept at most once — once we flip its
// status to `failed`, the WHERE clause stops matching it.
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { sendTelegram } from "@/lib/telegram"

const STUCK_AFTER_MS = 10 * 60 * 1000 // 10 min
const STUCK_QUEUED_AFTER_MS = 30 * 60 * 1000 // 30 min — queued but never picked up

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

interface StuckRun {
  id: string
  workflow_id: string
  status: string
  started_at: string | null
  created_at: string
  input: Record<string, unknown> | null
}

interface RunMeta {
  source?: string
  telegram_chat_id?: string | number
  telegram_message_id?: number
}

function readMeta(input: Record<string, unknown> | null): RunMeta {
  const m = input?._meta
  return m && typeof m === "object" ? (m as RunMeta) : {}
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = req.headers.get("authorization") || ""
  const expected = process.env.CRON_SECRET || ""
  if (!expected) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 })
  if (auth !== `Bearer ${expected}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const now = Date.now()
  const runningCutoff = new Date(now - STUCK_AFTER_MS).toISOString()
  const queuedCutoff = new Date(now - STUCK_QUEUED_AFTER_MS).toISOString()

  // Pull both shapes of stuck run in one round-trip. We OR-filter on (status='running' AND started_at < cutoff)
  // OR (status='queued' AND created_at < queued_cutoff). PostgREST's `.or()` handles this.
  const { data: stuck, error } = await supabase
    .from("workflow_runs")
    .select("id, workflow_id, status, started_at, created_at, input")
    .or(
      `and(status.eq.running,started_at.lt.${runningCutoff}),and(status.eq.queued,created_at.lt.${queuedCutoff})`,
    )
    .limit(100)

  if (error) {
    console.error("[sweep-stuck-runs] fetch failed:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const targets = (stuck || []) as StuckRun[]
  const swept: Array<{ id: string; status: string; reason: string; notified: boolean }> = []

  for (const run of targets) {
    const isRunning = run.status === "running"
    const startedAt = run.started_at || run.created_at
    const ageMs = startedAt ? now - new Date(startedAt).getTime() : 0
    const ageMin = Math.round(ageMs / 60000)
    const reason = isRunning
      ? `Sweeper killed after ${ageMin}m stuck in 'running' (likely Vercel function timeout or agent-runner crash)`
      : `Sweeper killed after ${ageMin}m stuck in 'queued' (likely Inngest/VPS executor never picked it up)`

    const { error: updErr } = await supabase
      .from("workflow_runs")
      .update({
        status: "failed",
        error: reason,
        finished_at: new Date().toISOString(),
      })
      .eq("id", run.id)
      .eq("status", run.status) // optimistic: only update if still in same state

    if (updErr) {
      console.error(`[sweep-stuck-runs] update ${run.id} failed:`, updErr.message)
      continue
    }

    let notified = false
    const meta = readMeta(run.input)
    if (meta.source === "telegram" && meta.telegram_chat_id) {
      try {
        await sendTelegram(
          `⚠️ *Run #${run.id.slice(0, 8)}* timed out after ${ageMin} minutes.\n\n${reason}`,
          {
            chatId: meta.telegram_chat_id,
            parseMode: "Markdown",
            replyToMessageId: meta.telegram_message_id,
            disableWebPagePreview: true,
          },
        )
        notified = true
      } catch (e) {
        console.error(`[sweep-stuck-runs] telegram notify failed for ${run.id}:`, (e as Error).message)
      }
    }

    swept.push({ id: run.id, status: run.status, reason, notified })
  }

  return NextResponse.json({
    ok: true,
    checked_at: new Date().toISOString(),
    examined: targets.length,
    swept: swept.length,
    runs: swept,
  })
}
