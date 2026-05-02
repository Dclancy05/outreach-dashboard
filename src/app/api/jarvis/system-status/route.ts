import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { promises as fs } from "fs"
import os from "os"

export const dynamic = "force-dynamic"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

type ServiceProbe = {
  name: string
  url: string
  expectStatus?: number
  authHeader?: string
}

const SERVICES: ServiceProbe[] = [
  { name: "Memory Vault API", url: "http://127.0.0.1:8788/health" },
  { name: "Terminal Server", url: "http://127.0.0.1:10002/sessions" },
  { name: "VPS Recording", url: "https://srv1197943.taild42583.ts.net:10000/health", expectStatus: 200 },
  { name: "OpenClaw Gateway", url: "https://srv1197943.taild42583.ts.net:8443/", expectStatus: 200 },
]

const CRONS = [
  { path: "/api/cron/cookie-backup", schedule: "0 7 * * *", label: "Cookie Backup" },
  { path: "/api/cron/warmup-tick", schedule: "0 8 * * *", label: "Warmup Tick" },
  { path: "/api/cron/morning-digest", schedule: "0 8 * * *", label: "Morning Digest" },
  { path: "/api/retry-queue/process", schedule: "0 9 * * *", label: "Retry Queue" },
  { path: "/api/cron/automations-maintenance", schedule: "0 10 * * *", label: "Automations Maintenance" },
  { path: "/api/ai-agent/scan", schedule: "30 10 * * *", label: "AI Agent Scan" },
  { path: "/api/cron/deadman-check", schedule: "0 11 * * *", label: "Deadman Check" },
  { path: "/api/cron/cookies-health-check", schedule: "0 12 * * *", label: "Cookies Health" },
  { path: "/api/cron/campaign-worker", schedule: "0 13 * * *", label: "Campaign Worker" },
  { path: "/api/cron/proxy-health-check", schedule: "15 14 * * *", label: "Proxy Health" },
  { path: "/api/cron/account-health-monitor", schedule: "30 14 * * *", label: "Account Health" },
  { path: "/api/cron/workflow-tick", schedule: "45 14 * * *", label: "Workflow Tick" },
  { path: "/api/cron/sweep-stuck-runs", schedule: "0 1 * * *", label: "Sweep Stuck Runs" },
  { path: "/api/cron/cost-cap", schedule: "0 2 * * *", label: "Cost Cap" },
  { path: "/api/cron/rate-limit-reset", schedule: "0 0 * * *", label: "Rate Limit Reset" },
]

const DB_TABLES = [
  "accounts",
  "proxy_groups",
  "campaigns",
  "leads",
  "send_queue",
  "send_log",
  "memories",
  "vault_snapshots",
  "notifications",
  "mcp_servers",
  "agents",
  "workflow_runs",
  "terminal_sessions",
  "automations",
]

async function probeService(svc: ServiceProbe): Promise<{ name: string; status: "up" | "down" | "auth_required"; latency_ms: number | null; code: number | null }> {
  const start = Date.now()
  try {
    const headers: HeadersInit = svc.authHeader ? { Authorization: svc.authHeader } : {}
    const res = await fetch(svc.url, {
      headers,
      signal: AbortSignal.timeout(4000),
    })
    const latency_ms = Date.now() - start
    const expected = svc.expectStatus ?? 200
    if (res.status === 401 || res.status === 403) {
      return { name: svc.name, status: "auth_required", latency_ms, code: res.status }
    }
    return {
      name: svc.name,
      status: res.status === expected ? "up" : "down",
      latency_ms,
      code: res.status,
    }
  } catch {
    return { name: svc.name, status: "down", latency_ms: null, code: null }
  }
}

async function readVpsMetrics() {
  try {
    const meminfo = await fs.readFile("/proc/meminfo", "utf-8").catch(() => "")
    const totalMatch = meminfo.match(/MemTotal:\s+(\d+)/)
    const availMatch = meminfo.match(/MemAvailable:\s+(\d+)/)
    const total_kb = totalMatch ? Number(totalMatch[1]) : 0
    const avail_kb = availMatch ? Number(availMatch[1]) : 0
    const used_pct = total_kb > 0 ? Math.round(((total_kb - avail_kb) / total_kb) * 100) : 0

    const loadAvg = os.loadavg()
    const cpuCount = os.cpus().length
    const uptime = os.uptime()

    return {
      memory: {
        used_pct,
        total_gb: Number((total_kb / 1024 / 1024).toFixed(1)),
        avail_gb: Number((avail_kb / 1024 / 1024).toFixed(1)),
      },
      load: {
        one: Number(loadAvg[0].toFixed(2)),
        five: Number(loadAvg[1].toFixed(2)),
        fifteen: Number(loadAvg[2].toFixed(2)),
        cpu_count: cpuCount,
        load_pct: Math.min(100, Math.round((loadAvg[0] / cpuCount) * 100)),
      },
      uptime_seconds: Math.round(uptime),
      hostname: os.hostname(),
      platform: `${os.type()} ${os.release()}`,
    }
  } catch {
    return null
  }
}

async function readDbStats() {
  const results = await Promise.all(
    DB_TABLES.map(async (table) => {
      try {
        const { count, error } = await supabase
          .from(table)
          .select("*", { count: "exact", head: true })
          .abortSignal(AbortSignal.timeout(3000))
        if (error) return { table, count: null, error: error.message }
        return { table, count: count ?? 0, error: null }
      } catch {
        return { table, count: null, error: "timeout" }
      }
    }),
  )
  return results
}

async function readMcpHealth() {
  try {
    const { data, error } = await supabase
      .from("mcp_servers")
      .select("id, name, kind, status, last_health_at, last_health_ok")
      .order("created_at", { ascending: true })
    if (error) return []
    return data || []
  } catch {
    return []
  }
}

async function readRecentDeploys() {
  try {
    const res = await fetch("https://api.github.com/repos/Dclancy05/outreach-dashboard/commits?per_page=5", {
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) return []
    const commits = (await res.json()) as Array<{
      sha: string
      commit: { message: string; author: { date: string } }
      html_url: string
    }>
    return commits.slice(0, 5).map((c) => ({
      sha: c.sha.slice(0, 7),
      message: c.commit.message.split("\n")[0],
      date: c.commit.author.date,
      url: c.html_url,
    }))
  } catch {
    return []
  }
}

async function readCronInfo() {
  try {
    const { data: rows } = await supabase
      .from("notifications")
      .select("type, title, created_at")
      .like("type", "cron_%")
      .order("created_at", { ascending: false })
      .limit(50)
    const lastByPath: Record<string, string> = {}
    for (const r of rows || []) {
      const m = r.type.match(/^cron_(.+)$/)
      if (m && !lastByPath[m[1]]) lastByPath[m[1]] = r.created_at
    }
    return CRONS.map((c) => {
      const slug = c.path.replace(/^\/api\/cron\//, "").replace(/^\/api\//, "")
      return {
        ...c,
        last_run_at: lastByPath[slug] || null,
      }
    })
  } catch {
    return CRONS.map((c) => ({ ...c, last_run_at: null }))
  }
}

export async function GET() {
  const [vps, services, db, mcps, deploys, crons] = await Promise.all([
    readVpsMetrics(),
    Promise.all(SERVICES.map(probeService)),
    readDbStats(),
    readMcpHealth(),
    readRecentDeploys(),
    readCronInfo(),
  ])

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    vps,
    services,
    db,
    mcps,
    deploys,
    crons,
  })
}
