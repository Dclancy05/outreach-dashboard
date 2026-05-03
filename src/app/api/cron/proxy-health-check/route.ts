import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { sendTelegram } from "@/lib/telegram"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type ProxyRow = {
  id: string
  name: string | null
  ip: string | null
  port: number | null
  username: string | null
  password: string | null
  status: string | null
}

// Build a fetch through a residential proxy using https-proxy-agent +
// node:https (https-proxy-agent is already in the dep tree). Throws on
// any failure — the caller treats that as a failed check, which is the
// safe default (we'd rather mark "unknown" as failed than skip).
async function fetchThroughProxy(
  proxyUrl: string,
  targetUrl: string,
  timeoutMs: number
): Promise<Response> {
  const { HttpsProxyAgent } = await import("https-proxy-agent")
  const https = await import("node:https")
  const url = new URL(targetUrl)
  const agent = new HttpsProxyAgent(proxyUrl)

  return await new Promise<Response>((resolve, reject) => {
    const req = https.request(
      {
        host: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method: "GET",
        agent: agent as any,
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on("data", (c) => chunks.push(c))
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8")
          resolve(new Response(body, { status: res.statusCode || 0 }))
        })
      }
    )
    req.on("error", reject)
    req.on("timeout", () => {
      req.destroy(new Error("timeout"))
    })
    req.end()
  })
}

async function checkProxy(p: ProxyRow): Promise<{ ok: boolean; reason?: string }> {
  if (!p.ip || !p.port) return { ok: false, reason: "missing ip/port" }
  const auth =
    p.username && p.password
      ? `${encodeURIComponent(p.username)}:${encodeURIComponent(p.password)}@`
      : ""
  const proxyUrl = `http://${auth}${p.ip}:${p.port}`
  try {
    const res = await fetchThroughProxy(proxyUrl, "https://api.ipify.org?format=json", 5000)
    if (res.status >= 200 && res.status < 300) return { ok: true }
    return { ok: false, reason: `http ${res.status}` }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

async function handle(req: NextRequest) {
  const auth = req.headers.get("authorization") || ""
  const expected = process.env.CRON_SECRET || ""
  if (!expected)
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 })
  if (auth !== `Bearer ${expected}`)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const startedAt = Date.now()

  try {
    const { data: rows, error } = await supabase
      .from("proxy_groups")
      .select("id, name, ip, port, username, password, status")

    if (error) {
      console.error("[proxy-health-check] supabase select error:", error)
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    const proxies = (rows || []) as ProxyRow[]
    const newly_failed: Array<{
      id: string
      ip: string | null
      port: number | null
      name: string | null
    }> = []
    let healthy = 0
    let failed = 0

    // Run in small parallel batches to keep total runtime sane on Vercel.
    const concurrency = 5
    for (let i = 0; i < proxies.length; i += concurrency) {
      const batch = proxies.slice(i, i + concurrency)
      const results = await Promise.all(
        batch.map(async (p) => ({ p, result: await checkProxy(p) }))
      )
      const now = new Date().toISOString()
      await Promise.all(
        results.map(async ({ p, result }) => {
          const newStatus = result.ok ? "active" : "failed"
          if (!result.ok) {
            console.error(
              `[proxy-health-check] proxy ${p.id} (${p.ip}:${p.port}) failed: ${result.reason}`
            )
            failed++
            if (p.status === "active") {
              newly_failed.push({ id: p.id, ip: p.ip, port: p.port, name: p.name })
            }
          } else {
            healthy++
          }
          const { error: upErr } = await supabase
            .from("proxy_groups")
            .update({ status: newStatus, health_check_at: now })
            .eq("id", p.id)
          if (upErr) {
            console.error(
              `[proxy-health-check] failed to update proxy ${p.id}:`,
              upErr.message
            )
          }
        })
      )
    }

    if (newly_failed.length > 0) {
      const lines = newly_failed
        .map((p) => `• ${p.name || "(unnamed)"} — \`${p.ip}:${p.port}\``)
        .join("\n")
      const msg = `🚨 *Proxy health alert* — ${newly_failed.length} proxy/proxies just went down:\n${lines}`
      await sendTelegram(msg)

      try {
        await supabase.from("notifications").insert({
          type: "proxy_failed",
          title: `Proxy down (${newly_failed.length})`,
          message: msg,
        })
      } catch (e) {
        console.error("[proxy-health-check] notifications insert failed:", e)
      }
    }

    try {
      await supabase.from("cron_run_log").insert({
        cron_name: "proxy-health-check",
        ran_at: new Date(startedAt).toISOString(),
        ms: Date.now() - startedAt,
        status: "ok",
        info: { total: proxies.length, healthy, failed, newly_failed: newly_failed.length },
      })
    } catch {}

    return NextResponse.json({
      ok: true,
      total: proxies.length,
      healthy,
      failed,
      newly_failed,
      ms: Date.now() - startedAt,
    })
  } catch (e) {
    console.error("[proxy-health-check] unhandled error:", e)
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 }
    )
  }
}

import { wrapCron } from "@/lib/cron-handler"
const wrapped = wrapCron("proxy-health-check", handle)
export async function GET(req: NextRequest) { return wrapped(req) }
export async function POST(req: NextRequest) { return wrapped(req) }
