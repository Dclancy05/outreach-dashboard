"use client"
import { useState, useEffect } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

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
    const i = setInterval(load, 30000)
    return () => clearInterval(i)
  }, [])

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
  const color = okCount === total ? "bg-emerald-500" : okCount >= total / 2 ? "bg-amber-500" : "bg-red-500"
  const label = okCount === total ? "All systems operational" : okCount >= total / 2 ? `${total - okCount} issue${total - okCount === 1 ? "" : "s"}` : "Systems down"

  return (
    <Link
      href="/automations?tab=maintenance"
      className="fixed bottom-4 right-4 z-40 group"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      title={label}
      aria-label={`System status: ${label}`}
    >
      <div className="relative flex items-center gap-2 rounded-full bg-card/80 backdrop-blur-xl border border-border/50 shadow-lg px-2.5 py-1.5 hover:bg-card transition">
        <motion.span
          className={cn("h-2.5 w-2.5 rounded-full shrink-0", color)}
          animate={okCount === total ? {} : { opacity: [1, 0.4, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
        {hovering && (
          <div className="text-[10px] font-medium text-foreground whitespace-nowrap">
            {checks.map(c => (
              <span key={c.label} className={cn("inline-block mr-2", c.ok ? "text-emerald-400" : "text-red-400")}>
                {c.ok ? "✓" : "✗"} {c.label}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  )
}
