"use client"
/**
 * Small status pill that shows which VPS the Memory Vault is currently
 * connected to. Renders a colored dot + the host name (or a short error
 * if the configured URL is unreachable).
 *
 * Polls /api/memory-vault/status every 30s.
 *
 * BUG-025 fix: latency chip turns yellow > 200ms and red > 500ms; tooltip
 * explains "VPS round-trip latency from your browser".
 */
import { useEffect, useState } from "react"
import { CheckCircle2, AlertTriangle, ServerOff, Server } from "lucide-react"

type Status = {
  ok: boolean
  configured: boolean
  url?: string
  host?: string
  port?: string
  path?: string
  latency_ms?: number
  vault_root?: string | null
  remote_ts?: string | null
  ts?: string
  error?: string
}

// BUG-025 fix: latency thresholds. <=200ms = good, 201-500 = warning, >500 = bad.
const LATENCY_WARN_MS = 200
const LATENCY_BAD_MS = 500

function latencyColorClass(ms: number): string {
  if (ms > LATENCY_BAD_MS) return "text-red-400"
  if (ms > LATENCY_WARN_MS) return "text-amber-400"
  return "text-zinc-500"
}

export function VpsStatusBadge() {
  const [status, setStatus] = useState<Status | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    const fetchOnce = async () => {
      try {
        const res = await fetch("/api/memory-vault/status", { cache: "no-store" })
        const j = (await res.json()) as Status
        if (!cancelled) setStatus(j)
      } catch (err) {
        if (!cancelled) setStatus({ ok: false, configured: true, error: err instanceof Error ? err.message : String(err) })
      }
    }
    fetchOnce()
    const id = setInterval(fetchOnce, 30_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  if (!status) {
    return (
      <button
        type="button"
        className="inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900/60 px-2.5 py-1 text-xs text-zinc-400"
        title="Checking VPS connection…"
      >
        <Server className="w-3 h-3 animate-pulse" />
        <span>Connecting…</span>
      </button>
    )
  }

  if (!status.configured) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full border border-amber-700/50 bg-amber-950/40 px-2.5 py-1 text-xs text-amber-300"
        title={status.error || "MEMORY_VAULT_API_URL not set"}
      >
        <AlertTriangle className="w-3 h-3" />
        Vault not configured
      </span>
    )
  }

  const host = status.host || "unknown"
  const shortHost = host.split(".")[0]
  const ok = !!status.ok
  const Icon = ok ? CheckCircle2 : ServerOff
  const ring = ok
    ? "border-emerald-700/50 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/50"
    : "border-red-700/50 bg-red-950/40 text-red-300 hover:bg-red-900/50"

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${ring}`}
        title={ok ? `Memory Vault is live on ${host}` : `Memory Vault unreachable: ${status.error || "no response"}`}
      >
        <span className="relative flex h-2 w-2">
          {ok && (
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400/60 opacity-75" />
          )}
          <span
            className={`relative inline-flex rounded-full h-2 w-2 ${ok ? "bg-emerald-400" : "bg-red-500"}`}
          />
        </span>
        <Icon className="w-3 h-3" />
        <span className="font-medium">{shortHost}</span>
        {ok && typeof status.latency_ms === "number" && (
          // BUG-025 fix: color the chip + tooltip explains the meaning.
          <span
            className={latencyColorClass(status.latency_ms)}
            title="VPS round-trip latency from your browser"
          >
            {status.latency_ms}ms
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 z-50 mt-2 w-80 rounded-lg border border-zinc-800 bg-zinc-950 shadow-xl p-3 text-xs"
          onMouseLeave={() => setOpen(false)}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold text-zinc-100">Memory Vault connection</div>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider ${
                ok ? "bg-emerald-900/40 text-emerald-300" : "bg-red-900/40 text-red-300"
              }`}
            >
              {ok ? "live" : "down"}
            </span>
          </div>
          <dl className="space-y-1.5 text-zinc-400">
            <Row label="Host" value={host} />
            <Row label="Port" value={status.port || "—"} />
            {status.path && status.path !== "/" && <Row label="Path" value={status.path} />}
            <Row label="Vault root" value={status.vault_root || "—"} />
            {typeof status.latency_ms === "number" && (
              <Row
                label="Latency"
                value={`${status.latency_ms} ms`}
                valueClass={latencyColorClass(status.latency_ms)}
              />
            )}
            {status.remote_ts && <Row label="Remote time" value={new Date(status.remote_ts).toLocaleTimeString()} />}
            {status.error && (
              <Row label="Error" value={status.error} valueClass="text-red-300" />
            )}
          </dl>
          <div className="mt-3 pt-2 border-t border-zinc-800/60 text-[10px] text-zinc-600 break-all">
            {status.url}
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-zinc-500 shrink-0">{label}</dt>
      <dd className={`text-right break-all ${valueClass || "text-zinc-300"}`}>{value}</dd>
    </div>
  )
}
