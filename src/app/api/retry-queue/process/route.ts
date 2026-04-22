import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { nextRetryDelay } from "../route"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function getBaseUrl(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") || "https"
  const host = req.headers.get("host") || "localhost:3000"
  return `${proto}://${host}`
}

export async function POST(req: NextRequest) {
  const baseUrl = getBaseUrl(req)

  // Pick up to 10 due items
  const { data: due, error: pickErr } = await supabase
    .from("retry_queue")
    .select("*")
    .eq("status", "pending")
    .lte("next_retry_at", new Date().toISOString())
    .order("next_retry_at", { ascending: true })
    .limit(10)

  if (pickErr) return NextResponse.json({ error: pickErr.message }, { status: 500 })
  if (!due || due.length === 0) return NextResponse.json({ processed: 0, data: [] })

  const results: any[] = []

  for (const item of due) {
    // Mark in_progress to prevent double-picking
    await supabase
      .from("retry_queue")
      .update({ status: "in_progress" })
      .eq("id", item.id)

    try {
      let ok = false
      let errMsg = ""

      if (item.action_type === "send") {
        const res = await fetch(`${baseUrl}/api/automation/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...item.payload, __from_retry: true }),
        })
        const data = await res.json().catch(() => ({}))
        ok = res.ok && !data.error
        errMsg = data.error || (ok ? "" : `HTTP ${res.status}`)
      } else {
        errMsg = `Unknown action_type: ${item.action_type}`
      }

      if (ok) {
        await supabase
          .from("retry_queue")
          .update({
            status: "resolved",
            resolved_at: new Date().toISOString(),
            attempt_count: item.attempt_count + 1,
          })
          .eq("id", item.id)
        results.push({ id: item.id, ok: true })
      } else {
        const nextAttempt = item.attempt_count + 1
        if (nextAttempt >= (item.max_attempts || 5)) {
          await supabase
            .from("retry_queue")
            .update({
              status: "gave_up",
              attempt_count: nextAttempt,
              error_message: errMsg,
              resolved_at: new Date().toISOString(),
            })
            .eq("id", item.id)
          // Notify
          try {
            await supabase.from("notifications").insert({
              type: "retry_gave_up",
              title: "Send permanently failed",
              message: `Gave up after ${nextAttempt} tries: ${errMsg.slice(0, 200)}`,
            })
          } catch {}
          results.push({ id: item.id, ok: false, gave_up: true, error: errMsg })
        } else {
          const delay = nextRetryDelay(nextAttempt)
          await supabase
            .from("retry_queue")
            .update({
              status: "pending",
              attempt_count: nextAttempt,
              next_retry_at: new Date(Date.now() + delay * 1000).toISOString(),
              error_message: errMsg,
            })
            .eq("id", item.id)
          results.push({ id: item.id, ok: false, next_in_sec: delay, error: errMsg })
        }
      }
    } catch (e: any) {
      await supabase
        .from("retry_queue")
        .update({
          status: "pending",
          attempt_count: item.attempt_count + 1,
          next_retry_at: new Date(Date.now() + nextRetryDelay(item.attempt_count + 1) * 1000).toISOString(),
          error_message: String(e?.message || e),
        })
        .eq("id", item.id)
      results.push({ id: item.id, ok: false, error: String(e?.message || e) })
    }
  }

  return NextResponse.json({ processed: results.length, data: results })
}

// Convenience GET for cron
export async function GET(req: NextRequest) {
  return POST(req)
}
