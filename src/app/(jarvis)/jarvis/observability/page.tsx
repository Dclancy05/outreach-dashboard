"use client"

/**
 * /jarvis/observability — live view of the Chrome browser the senders use.
 *
 * This is the marquee Jarvis luxury feature: open the page, click Connect,
 * see — and click into — the actual VPS Chrome window driving the senders.
 *
 * Architecture:
 *   - <VncViewer> owns the noVNC RFB lifecycle + canvas. Imperative API via ref.
 *   - <VncToolbar> floats top-right, fires our imperative actions.
 *   - <VncStatusStrip> hugs the bottom, displays connection telemetry.
 *   - <VncEmptyState> is shown when state === "idle" (pre-connect or after a
 *     graceful disconnect).
 *
 * Connection is NEVER auto-initiated. The user must click Connect. This is a
 * deliberate ban-risk safeguard — we don't want a stray pageview to silently
 * open a websocket against the senders' real Chrome.
 *
 * Env:
 *   NEXT_PUBLIC_VNC_WS_URL  — e.g. wss://srv1197943.taild42583.ts.net:6080/websockify
 *   NEXT_PUBLIC_VNC_PASSWORD (optional) — VNC password if x11vnc was started with one
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { motion, useReducedMotion } from "framer-motion"
import { Eye } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { enterJarvis } from "@/components/jarvis/motion/presets"
import {
  VncViewer,
  type VncConnectionState,
  type VncStats,
  type VncViewerHandle,
} from "@/components/jarvis/observability/vnc-viewer"
import { VncToolbar } from "@/components/jarvis/observability/vnc-toolbar"
import { VncStatusStrip } from "@/components/jarvis/observability/vnc-status-strip"
import {
  VncEmptyState,
  type VncHealth,
} from "@/components/jarvis/observability/vnc-empty-state"

const QUALITY_PRESETS = [
  { label: "Low (3) — fastest", quality: 3, compression: 6 },
  { label: "Balanced (6) — default", quality: 6, compression: 2 },
  { label: "High (9) — best", quality: 9, compression: 0 },
] as const

export default function JarvisObservabilityPage() {
  const reduced = useReducedMotion()
  const viewerRef = useRef<VncViewerHandle | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  // Read public env once. Vercel inlines NEXT_PUBLIC_* into the bundle.
  const wsUrl = useMemo<string | null>(() => {
    const fromEnv = process.env.NEXT_PUBLIC_VNC_WS_URL
    if (fromEnv && fromEnv.length > 0) return fromEnv
    return null
  }, [])
  const password = useMemo<string | undefined>(() => {
    return process.env.NEXT_PUBLIC_VNC_PASSWORD || undefined
  }, [])

  const [state, setState] = useState<VncConnectionState>("idle")
  const [stats, setStats] = useState<VncStats>({
    resolution: null,
    fps: 0,
    ping: null,
    desktopName: null,
  })
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [hadError, setHadError] = useState(false)
  const [health, setHealth] = useState<VncHealth>("unknown")
  const [qualityIdx, setQualityIdx] = useState<number>(1)
  const [showQualityMenu, setShowQualityMenu] = useState(false)

  /* ----------------------------- health probe ---------------------------- */

  const runHealthCheck = useCallback(async () => {
    setHealth("checking")
    try {
      // Existing scaffolding endpoint accepts POSTs; treat any 2xx/4xx as
      // "the route is alive on Vercel," which means the dashboard is reachable.
      // For VPS reachability we ALSO try a HEAD against the WS URL's HTTP form.
      const probes: Promise<boolean>[] = []
      probes.push(
        fetch("/api/observability/vnc", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "health_probe" }),
        })
          .then((r) => r.ok)
          .catch(() => false)
      )
      if (wsUrl) {
        const httpUrl = wsUrl
          .replace(/^wss:/, "https:")
          .replace(/^ws:/, "http:")
          .replace(/\/websockify.*$/, "/")
        probes.push(
          fetch(httpUrl, { method: "HEAD", mode: "no-cors" })
            .then(() => true)
            .catch(() => false)
        )
      }
      const results = await Promise.all(probes)
      // Dashboard probe MUST be ok; VPS probe is best-effort (no-cors gives an
      // opaque response so a thrown error is the only signal).
      if (!results[0]) {
        setHealth("unknown")
        return
      }
      setHealth(results.length > 1 && results[1] ? "reachable" : "unknown")
    } catch {
      setHealth("unknown")
    }
  }, [wsUrl])

  // Poll every 5s while idle/error so the user sees live VPS status.
  useEffect(() => {
    if (state === "connected" || state === "connecting") return
    void runHealthCheck()
    const id = setInterval(() => {
      void runHealthCheck()
    }, 5000)
    return () => clearInterval(id)
  }, [state, runHealthCheck])

  /* ------------------------------- actions ------------------------------- */

  const handleConnect = useCallback(() => {
    setHadError(false)
    setErrorMessage(null)
    viewerRef.current?.connect()
  }, [])

  const handleDisconnect = useCallback(() => {
    viewerRef.current?.disconnect()
  }, [])

  const handleRefresh = useCallback(() => {
    viewerRef.current?.reconnect()
    toast.message("Reconnecting VNC…")
  }, [])

  const handleCtrlAltDel = useCallback(() => {
    viewerRef.current?.sendCtrlAltDel()
    toast.message("Sent Ctrl-Alt-Del")
  }, [])

  const handleScreenshot = useCallback(() => {
    const dataUrl = viewerRef.current?.screenshot()
    if (!dataUrl) {
      toast.error("Screenshot unavailable — connect first")
      return
    }
    const a = document.createElement("a")
    a.href = dataUrl
    const ts = new Date().toISOString().replace(/[:.]/g, "-")
    a.download = `vnc-${ts}.png`
    a.click()
    toast.success("Screenshot saved")
  }, [])

  const handleFullscreen = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    if (document.fullscreenElement) {
      void document.exitFullscreen()
      return
    }
    if (el.requestFullscreen) {
      void el.requestFullscreen().catch(() => {
        toast.error("Fullscreen blocked by browser")
      })
    }
  }, [])

  const handleViewerError = useCallback((message: string) => {
    setErrorMessage(message)
    setHadError(true)
  }, [])

  /* ---------------------- focus VNC on tap into canvas ------------------- */

  // When connected, clicks anywhere in the canvas should focus the viewer so
  // arrow keys / WASD pass through.
  useEffect(() => {
    if (state !== "connected") return
    viewerRef.current?.focus()
  }, [state])

  /* -------------------------------- render ------------------------------- */

  const showEmptyState = state === "idle" || (state === "error" && !!errorMessage)
  const isConnected = state === "connected"

  return (
    <motion.div
      initial={enterJarvis.initial}
      animate={enterJarvis.animate}
      transition={reduced ? { duration: 0 } : enterJarvis.transition}
      className="flex min-h-[calc(100vh-3.5rem)] flex-col gap-4 px-4 py-5 sm:px-6 lg:px-8"
    >
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-mem-accent/15 text-mem-accent">
            <Eye className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h1
              className="text-[28px] font-semibold leading-tight tracking-tight text-mem-text-primary"
              style={{ fontFamily: "Inter Display, Inter, system-ui, sans-serif" }}
            >
              Observability
            </h1>
            <p className="mt-1 text-[13px] text-mem-text-secondary">
              Watch the live Chrome browser the senders are using.
            </p>
          </div>
        </div>

        <ConnectedPill state={state} />
      </header>

      {/* Main canvas area */}
      <section
        ref={containerRef}
        className={cn(
          "relative flex-1 overflow-hidden rounded-xl border border-mem-border bg-mem-bg",
          "min-h-[480px] sm:min-h-[560px]"
        )}
      >
        {/* The viewer is ALWAYS mounted — even when idle the canvas div needs
            to exist so noVNC has somewhere to render on connect. We just
            stack the empty state over it visually. */}
        <VncViewer
          ref={viewerRef}
          wsUrl={wsUrl}
          password={password}
          quality={QUALITY_PRESETS[qualityIdx].quality}
          compression={QUALITY_PRESETS[qualityIdx].compression}
          onStateChange={setState}
          onStatsChange={setStats}
          onError={handleViewerError}
          className={cn(showEmptyState && "invisible")}
        />

        {showEmptyState && (
          <div className="absolute inset-0 p-3 sm:p-4">
            <VncEmptyState
              hasUrl={!!wsUrl}
              wsUrl={wsUrl}
              health={health}
              hadError={hadError}
              errorMessage={errorMessage}
              onConnect={handleConnect}
            />
          </div>
        )}

        {/* Toolbar — only render when there's an URL or already trying. */}
        {(wsUrl || isConnected) && !showEmptyState && (
          <VncToolbar
            state={state}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
            onFullscreen={handleFullscreen}
            onScreenshot={handleScreenshot}
            onRefresh={handleRefresh}
            onCtrlAltDel={handleCtrlAltDel}
            onOpenSettings={() => setShowQualityMenu((v) => !v)}
          />
        )}

        {/* Quality popover (lives inside canvas section so it overlays). */}
        {showQualityMenu && (
          <div
            role="menu"
            className="absolute right-3 top-14 z-20 w-56 rounded-lg border border-mem-border bg-mem-surface-1 p-1.5 shadow-xl"
          >
            <p className="px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-mem-text-muted">
              Quality
            </p>
            {QUALITY_PRESETS.map((preset, i) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setQualityIdx(i)
                  setShowQualityMenu(false)
                  if (state === "connected") {
                    // Apply by reconnecting (RFB has setters but they don't
                    // re-issue server-side encoding messages mid-stream).
                    viewerRef.current?.reconnect()
                  }
                }}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[12px] transition-colors",
                  i === qualityIdx
                    ? "bg-mem-accent/15 text-mem-text-primary"
                    : "text-mem-text-secondary hover:bg-white/[0.04] hover:text-mem-text-primary"
                )}
              >
                <span>{preset.label}</span>
                {i === qualityIdx && (
                  <span className="font-mono text-[10px] text-mem-accent">●</span>
                )}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Status strip */}
      <VncStatusStrip state={state} stats={stats} wsUrl={wsUrl} />
    </motion.div>
  )
}

/* -------------------------------------------------------------------------- */
/*                              Connected pill                                */
/* -------------------------------------------------------------------------- */

function ConnectedPill({ state }: { state: VncConnectionState }) {
  const labelMap: Record<VncConnectionState, string> = {
    idle: "Disconnected",
    connecting: "Connecting…",
    connected: "Connected",
    reconnecting: "Reconnecting…",
    error: "Error",
  }
  const dotMap: Record<VncConnectionState, string> = {
    idle: "bg-mem-text-muted",
    connecting: "bg-mem-status-thinking",
    connected: "bg-mem-status-working",
    reconnecting: "bg-mem-status-thinking",
    error: "bg-mem-status-stuck",
  }
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex h-9 items-center gap-2 rounded-full border border-mem-border bg-mem-surface-1 px-3"
    >
      <span
        aria-hidden
        className={cn("relative h-2 w-2 rounded-full", dotMap[state])}
      >
        {state === "connected" && (
          <span className="absolute inset-0 animate-ping rounded-full bg-mem-status-working/40 motion-reduce:hidden" />
        )}
      </span>
      <span className="text-[12px] font-medium text-mem-text-primary">
        {labelMap[state]}
      </span>
    </div>
  )
}
