"use client"
import { useState, useEffect } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { RefreshCw } from "lucide-react"

type Health = {
  chrome: boolean
  xvfb: boolean
  proxy: boolean
  queueProcessor: boolean
  recording?: boolean
}

export function SystemPulse() {
  const [health, setHealth] = useState<Health | null>(null)
  const [loading, setLoading] = useState(true)
  const [hovering, setHovering] = useState(false)
  const [restarting, setRestarting] = useState(false)

  const load = async () => {
    try {
      const res = await fetch("/api/recordings/health", { cache: "no-store" })
      const data = await res.json()
      setHealth(data)
    } catch {
      setHealth({ chrome: false, xvfb: false, proxy: false, queueProcessor: false })
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
    // 5 min cadence. Was 30s — combined with the now-removed /login-status
    // probe inside /api/recordings/health, that hammered Chrome through every
    // platform every 30s and put real Instagram cookies at ban risk. We never
    // need infra status fresher than 5 min; an outage will surface within
    // that window.
    const i = setInterval(load, 5 * 60 * 1000)
    return () => clearInterval(i)
  }, [])

  const handleRestart = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (restarting) return
    setRestarting(true)
    try {
      await fetch("/api/recordings/restart", { method: "POST" })
    } catch {
      // swallow — poll below will surface state
    }
    const deadline = Date.now() + 20000
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 2000))
      try {
        const res = await fetch("/api/recordings/health", { cache: "no-store" })
        const data = await res.json()
        setHealth(data)
        const failing = [data.chrome, data.xvfb, data.proxy, data.queueProcessor].filter(v => !v).length
        if (failing === 0) break
      } catch {
        // keep polling
      }
    }
    await load()
    setRestarting(false)
  }

  if (loading) return null

  const checks: { label: string; ok: boolean }[] = health
    ? [
        { label: "Chrome", ok: !!health.chrome },
        { label: "Xvfb", ok: !!health.xvfb },
        { label: "Proxy", ok: !!health.proxy },
        { label: "Queue", ok: !!health.queueProcessor },
      ]
    : []

  const okCount = checks.filter(c => c.ok).length
  const total = checks.length || 4
  const failing = checks.filter(c => !c.ok).map(c => c.label)

  // Login-state UI was removed alongside the /login-status probe in
  // /api/recordings/health (ban-risk fix). Per-account login state now lives
  // on /accounts and /automations as user-triggered probes only.
  const color = okCount === total
    ? "bg-emerald-500"
    : okCount >= total / 2 ? "bg-amber-500" : "bg-red-500"

  let label: string
  if (okCount === total) {
    label = "All systems operational"
  } else if (failing.length >= 3) {
    // Most-failures case: the recording-service infra (Chrome/Xvfb/proxy/queue)
    // is down. That's the OpenClaw machinery, not the dashboard core — say so
    // accurately instead of "VPS offline" which makes the whole box look dead.
    label = "Recording infra paused"
  } else {
    const joined = failing.join(", ")
    label = `${joined} offline`
    if (label.length > 30) label = `${failing.length} systems offline`
  }

  return (
    <div
      className="fixed bottom-4 right-4 z-40 group"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <div className="relative flex items-center gap-2 rounded-full bg-card/80 backdrop-blur-xl border border-border/50 shadow-lg px-2.5 py-1.5 hover:bg-card transition">
        <Link
          href="/automations?tab=maintenance"
          className="flex items-center gap-2"
          title={label}
          aria-label={`System status: ${label}`}
        >
          <motion.span
            className={cn("h-2.5 w-2.5 rounded-full shrink-0", color)}
            animate={okCount === total ? {} : { opacity: [1, 0.4, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
          {hovering && (
            <div className="text-[10px] font-medium text-foreground whitespace-nowrap flex items-center">
              {checks.map(c => (
                <span key={c.label} className={cn("inline-block mr-2", c.ok ? "text-emerald-400" : "text-red-400")}>
                  {c.ok ? "✓" : "✗"} {c.label}
                </span>
              ))}
            </div>
          )}
        </Link>
        {hovering && okCount < total && (
          <button
            onClick={handleRestart}
            disabled={restarting}
            className={cn(
              "ml-1 inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border transition",
              restarting
                ? "bg-muted/30 text-muted-foreground border-border/50 cursor-wait"
                : "bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/30"
            )}
            title="Restart recording service"
          >
            <RefreshCw className={cn("h-3 w-3", restarting && "animate-spin")} />
            {restarting ? "Restarting…" : "Restart"}
          </button>
        )}
      </div>
    </div>
  )
}
