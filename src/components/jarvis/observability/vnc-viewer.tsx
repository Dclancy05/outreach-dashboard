"use client"

/**
 * VNC viewer — embeds the live VPS Chrome browser into /jarvis/observability.
 *
 * v2 (Phase 1 — bulletproofing 2026-05-03):
 *   - Reconnect v2: 8 attempts (was 3), exponential backoff capped at 30s,
 *     attempt counter resets after 60s of stable connection so a long session
 *     that drops once isn't penalized for the next drop.
 *   - Lifecycle handlers: beforeunload + visibilitychange — closes WS cleanly
 *     when user nukes the tab; pauses when tab is backgrounded >5min;
 *     reconnects on visibility return.
 *   - Adaptive quality: rolling p95 ping → auto-adjusts qualityLevel.
 *   - Telemetry: every 5s, POST {fps, ping, freezeMs, sessionId} to
 *     /api/observability/vnc so we can chart VNC health.
 *   - Reconnect overlay shows attempt N of M so user isn't staring at a
 *     frozen screen during Tailscale Funnel 1001 closes.
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react"
import { cn } from "@/lib/utils"

/* -------------------------------------------------------------------------- */
/*                          Minimal RFB type surface                          */
/* -------------------------------------------------------------------------- */

interface RfbCredentials {
  username?: string
  password?: string
  target?: string
}

interface RfbOptions {
  credentials?: RfbCredentials
  shared?: boolean
  repeaterID?: string
  wsProtocols?: string[]
}

interface RfbInstance {
  scaleViewport: boolean
  resizeSession: boolean
  clipViewport: boolean
  showDotCursor: boolean
  background: string
  qualityLevel: number
  compressionLevel: number
  viewOnly: boolean
  focusOnClick: boolean
  disconnect(): void
  sendCtrlAltDel(): void
  focus(): void
  blur(): void
  addEventListener(type: string, listener: (ev: CustomEvent) => void): void
  removeEventListener(type: string, listener: (ev: CustomEvent) => void): void
}

interface RfbConstructor {
  new (
    target: HTMLElement,
    urlOrChannel: string,
    options?: RfbOptions
  ): RfbInstance
}

/* -------------------------------------------------------------------------- */
/*                              Public API types                              */
/* -------------------------------------------------------------------------- */

export type VncConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "error"
  | "reconnecting"

export interface VncStats {
  resolution: string | null
  fps: number
  ping: number | null
  desktopName: string | null
}

export interface VncViewerHandle {
  connect(): void
  disconnect(): void
  reconnect(): void
  sendCtrlAltDel(): void
  screenshot(): string | null
  focus(): void
}

interface VncViewerProps {
  wsUrl: string | null
  password?: string
  /** Initial quality 0-9. May be auto-adjusted if `adaptiveQuality`. Default 4. */
  quality?: number
  compression?: number
  scaleViewport?: boolean
  /** Auto-tune quality based on rolling p95 ping. Default true. */
  adaptiveQuality?: boolean
  /** Account this VNC is for — sent with telemetry. */
  accountId?: string | null
  /** Session id — opaque, sent with telemetry. Generated if absent. */
  sessionId?: string
  /** When true, POST stats to /api/observability/vnc every 5s. Default true. */
  telemetryEnabled?: boolean
  onStateChange?: (state: VncConnectionState) => void
  onStatsChange?: (stats: VncStats) => void
  onError?: (message: string) => void
  className?: string
}

/* -------------------------------------------------------------------------- */
/*                                 Constants                                  */
/* -------------------------------------------------------------------------- */

const MAX_RECONNECT_ATTEMPTS = 8
const RECONNECT_CAP_MS = 30_000
const STABLE_CONNECT_RESET_MS = 60_000
const HIDDEN_DISCONNECT_MS = 5 * 60_000
const TELEMETRY_INTERVAL_MS = 5_000
const ADAPTIVE_DOWN_THRESHOLD_MS = 300
const ADAPTIVE_UP_THRESHOLD_MS = 80

/* -------------------------------------------------------------------------- */
/*                                 Component                                  */
/* -------------------------------------------------------------------------- */

export const VncViewer = forwardRef<VncViewerHandle, VncViewerProps>(
  function VncViewer(
    {
      wsUrl,
      password,
      quality = 4,
      compression = 7,
      scaleViewport = true,
      adaptiveQuality = true,
      accountId = null,
      sessionId,
      telemetryEnabled = true,
      onStateChange,
      onStatsChange,
      onError,
      className,
    },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null)
    const rfbRef = useRef<RfbInstance | null>(null)
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const reconnectAttemptsRef = useRef(0)
    const lastStableAtRef = useRef<number | null>(null)
    const [state, setState] = useState<VncConnectionState>("idle")
    const [reconnectAttempt, setReconnectAttempt] = useState(0)
    const stateRef = useRef<VncConnectionState>("idle")
    const [errorMsg, setErrorMsg] = useState<string | null>(null)
    const stoppedByUserRef = useRef(false)
    const currentQualityRef = useRef(quality)

    // Stable session id — generated once.
    const sid = useMemo(
      () => sessionId || `vnc_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`,
      [sessionId]
    )

    // Stats — kept in refs so we can mutate without re-rendering.
    const statsRef = useRef<VncStats>({
      resolution: null,
      fps: 0,
      ping: null,
      desktopName: null,
    })
    const frameTimesRef = useRef<number[]>([])
    const pingHistoryRef = useRef<number[]>([])
    const bytesInRef = useRef(0)
    const freezeMsRef = useRef(0)
    const lastFrameAtRef = useRef<number>(performance.now())

    /* ------------------------------ helpers ------------------------------ */

    const updateState = useCallback(
      (next: VncConnectionState) => {
        stateRef.current = next
        setState(next)
        onStateChange?.(next)
      },
      [onStateChange]
    )

    const emitStats = useCallback(() => {
      onStatsChange?.({ ...statsRef.current })
    }, [onStatsChange])

    /* ------------------------------ teardown ----------------------------- */

    const teardown = useCallback(() => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      const rfb = rfbRef.current
      if (rfb) {
        try {
          rfb.disconnect()
        } catch {
          // RFB throws if disconnect is called twice; safe to ignore.
        }
        rfbRef.current = null
      }
    }, [])

    /* ------------------------------ connect ------------------------------ */

    const connect = useCallback(async () => {
      if (!wsUrl) {
        const msg = "No VNC WebSocket URL configured. Set NEXT_PUBLIC_VNC_WS_URL."
        setErrorMsg(msg)
        onError?.(msg)
        updateState("error")
        return
      }
      if (!containerRef.current) return
      if (rfbRef.current) return // already connecting/connected

      stoppedByUserRef.current = false
      setErrorMsg(null)
      updateState(reconnectAttemptsRef.current > 0 ? "reconnecting" : "connecting")

      let RFB: RfbConstructor
      try {
        const mod = (await import("@novnc/novnc/lib/rfb")) as {
          default?: RfbConstructor
        }
        const resolved = mod.default ?? (mod as unknown as RfbConstructor)
        RFB = resolved
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Failed to load noVNC client"
        setErrorMsg(msg)
        onError?.(msg)
        updateState("error")
        return
      }

      try {
        const rfb = new RFB(containerRef.current, wsUrl, {
          credentials: password ? { password } : undefined,
        })

        rfb.scaleViewport = scaleViewport
        rfb.resizeSession = false
        rfb.clipViewport = false
        rfb.showDotCursor = true
        rfb.background = "rgb(11, 11, 13)"
        rfb.qualityLevel = currentQualityRef.current
        rfb.compressionLevel = compression
        rfb.viewOnly = false
        rfb.focusOnClick = true

        const handleConnect = () => {
          lastStableAtRef.current = Date.now()
          updateState("connected")
          // Force scale recompute (see comment in v1 for why).
          setTimeout(() => {
            const r = rfbRef.current
            if (!r) return
            try {
              r.scaleViewport = false
              r.scaleViewport = scaleViewport
            } catch {
              // older noVNC builds may not let us set this twice
            }
          }, 80)
          // Reset attempt counter only after STABLE_CONNECT_RESET_MS of uptime
          setTimeout(() => {
            if (
              stateRef.current === "connected" &&
              lastStableAtRef.current &&
              Date.now() - lastStableAtRef.current >= STABLE_CONNECT_RESET_MS
            ) {
              reconnectAttemptsRef.current = 0
              setReconnectAttempt(0)
            }
          }, STABLE_CONNECT_RESET_MS + 100)
        }

        const handleDisconnect = (_ev: CustomEvent) => {
          rfbRef.current = null
          if (stoppedByUserRef.current) {
            updateState("idle")
            return
          }
          // Reconnect with exponential backoff. Tailscale Funnel sends close
          // code 1001 every 10–40s as a known relay quirk → previously 3
          // attempts wasn't enough for sessions over 5 min. Now 8 attempts
          // with exp backoff capped at 30s.
          if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttemptsRef.current += 1
            setReconnectAttempt(reconnectAttemptsRef.current)
            const delay = Math.min(
              RECONNECT_CAP_MS,
              Math.pow(2, reconnectAttemptsRef.current) * 1000
            )
            updateState("reconnecting")
            reconnectTimerRef.current = setTimeout(() => {
              void connect()
            }, delay)
          } else {
            const msg = "VNC connection lost. Click Refresh to try again."
            setErrorMsg(msg)
            onError?.(msg)
            updateState("error")
          }
        }

        const handleCredentialsRequired = () => {
          const msg = "VNC server requires a password — set NEXT_PUBLIC_VNC_PASSWORD or pass `password` prop."
          setErrorMsg(msg)
          onError?.(msg)
          updateState("error")
          stoppedByUserRef.current = true // don't auto-reconnect — auth issue
          try { rfbRef.current?.disconnect() } catch {}
          rfbRef.current = null
        }

        const handleSecurityFailure = (ev: CustomEvent) => {
          const detail = (ev as unknown as {
            detail?: { reason?: string; status?: number }
          }).detail
          const msg = detail?.reason ?? "VNC security handshake failed"
          setErrorMsg(msg)
          onError?.(msg)
          updateState("error")
        }

        const handleDesktopName = (ev: CustomEvent) => {
          const detail = (ev as unknown as { detail?: { name?: string } }).detail
          statsRef.current.desktopName = detail?.name ?? null
          emitStats()
        }

        rfb.addEventListener("connect", handleConnect)
        rfb.addEventListener("disconnect", handleDisconnect)
        rfb.addEventListener("credentialsrequired", handleCredentialsRequired)
        rfb.addEventListener("securityfailure", handleSecurityFailure)
        rfb.addEventListener("desktopname", handleDesktopName)

        rfbRef.current = rfb
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Failed to start VNC connection"
        setErrorMsg(msg)
        onError?.(msg)
        updateState("error")
      }
    }, [
      wsUrl,
      password,
      compression,
      scaleViewport,
      onError,
      updateState,
      emitStats,
    ])

    /* --------------------------- disconnect/reconnect -------------------- */

    const disconnect = useCallback(() => {
      stoppedByUserRef.current = true
      reconnectAttemptsRef.current = 0
      setReconnectAttempt(0)
      teardown()
      updateState("idle")
    }, [teardown, updateState])

    const reconnect = useCallback(() => {
      teardown()
      reconnectAttemptsRef.current = 0
      setReconnectAttempt(0)
      stoppedByUserRef.current = false
      reconnectTimerRef.current = setTimeout(() => {
        void connect()
      }, 100)
    }, [connect, teardown])

    const sendCtrlAltDel = useCallback(() => {
      try { rfbRef.current?.sendCtrlAltDel() } catch {}
    }, [])

    const screenshot = useCallback((): string | null => {
      const root = containerRef.current
      if (!root) return null
      const canvas = root.querySelector("canvas")
      if (!canvas) return null
      try { return canvas.toDataURL("image/png") } catch { return null }
    }, [])

    const focus = useCallback(() => {
      try { rfbRef.current?.focus() } catch {}
    }, [])

    useImperativeHandle(
      ref,
      (): VncViewerHandle => ({
        connect, disconnect, reconnect, sendCtrlAltDel, screenshot, focus,
      }),
      [connect, disconnect, reconnect, sendCtrlAltDel, screenshot, focus]
    )

    /* ------------------------- resize observation ------------------------ */

    useEffect(() => {
      if (!containerRef.current) return
      let raf = 0
      const ro = new ResizeObserver(() => {
        cancelAnimationFrame(raf)
        raf = requestAnimationFrame(() => {
          const root = containerRef.current
          if (!root) return
          const canvas = root.querySelector("canvas")
          if (canvas) {
            const w = canvas.width
            const h = canvas.height
            if (w && h) {
              const next = `${w}x${h}`
              if (statsRef.current.resolution !== next) {
                statsRef.current.resolution = next
                emitStats()
              }
            }
          }
        })
      })
      ro.observe(containerRef.current)
      return () => {
        cancelAnimationFrame(raf)
        ro.disconnect()
      }
    }, [emitStats])

    /* ----------------------- coarse FPS estimator ------------------------ */

    useEffect(() => {
      if (state !== "connected") return
      let alive = true
      const tick = () => {
        if (!alive) return
        const now = performance.now()
        // Track gaps for freeze detection
        const gap = now - lastFrameAtRef.current
        if (gap > 1000) {
          freezeMsRef.current += gap
        }
        lastFrameAtRef.current = now
        frameTimesRef.current.push(now)
        if (frameTimesRef.current.length > 60) frameTimesRef.current.shift()
        const times = frameTimesRef.current
        if (times.length >= 2) {
          const span = times[times.length - 1] - times[0]
          const fps = span > 0 ? Math.round(((times.length - 1) * 1000) / span) : 0
          if (fps !== statsRef.current.fps) {
            statsRef.current.fps = fps
            emitStats()
          }
        }
        requestAnimationFrame(tick)
      }
      const handle = requestAnimationFrame(tick)
      return () => {
        alive = false
        cancelAnimationFrame(handle)
        frameTimesRef.current = []
      }
    }, [state, emitStats])

    /* --------------------------- ping estimator -------------------------- */

    useEffect(() => {
      if (state !== "connected" || !wsUrl) return
      let cancelled = false
      const httpUrl = wsUrl
        .replace(/^wss:/, "https:")
        .replace(/^ws:/, "http:")
        .replace(/\/websockify.*$/, "/")
      const sample = async () => {
        const start = performance.now()
        try {
          await fetch(httpUrl, { method: "HEAD", mode: "no-cors" })
        } catch {
          // opaque ok
        }
        const dur = Math.round(performance.now() - start)
        if (!cancelled) {
          statsRef.current.ping = dur
          pingHistoryRef.current.push(dur)
          if (pingHistoryRef.current.length > 24) pingHistoryRef.current.shift() // last 2 min
          emitStats()
        }
      }
      void sample()
      const id = setInterval(() => { void sample() }, 5000)
      return () => {
        cancelled = true
        clearInterval(id)
      }
    }, [state, wsUrl, emitStats])

    /* ---------------------- adaptive quality controller ------------------ */

    useEffect(() => {
      if (!adaptiveQuality || state !== "connected") return
      const id = setInterval(() => {
        const hist = pingHistoryRef.current
        if (hist.length < 6) return // need ~30s of samples
        const sorted = [...hist].sort((a, b) => a - b)
        const p95 = sorted[Math.floor(sorted.length * 0.95)]
        const cur = currentQualityRef.current
        let next = cur
        if (p95 > ADAPTIVE_DOWN_THRESHOLD_MS && cur > 1) next = cur - 1
        else if (p95 < ADAPTIVE_UP_THRESHOLD_MS && cur < 8) next = cur + 1
        if (next !== cur) {
          currentQualityRef.current = next
          const r = rfbRef.current
          if (r) {
            try { r.qualityLevel = next } catch {}
          }
        }
      }, 10_000)
      return () => clearInterval(id)
    }, [adaptiveQuality, state])

    /* --------------------------- telemetry POST -------------------------- */

    useEffect(() => {
      if (!telemetryEnabled || state !== "connected") return
      const id = setInterval(() => {
        const fps = statsRef.current.fps
        const ping = statsRef.current.ping
        const freezeMs = Math.round(freezeMsRef.current)
        freezeMsRef.current = 0 // reset window
        const body = JSON.stringify({
          kind: "vnc_health",
          session_id: sid,
          account_id: accountId,
          fps,
          ping_ms: ping,
          freeze_ms: freezeMs,
          quality: currentQualityRef.current,
          compression,
        })
        // Best-effort; ignore network failures so we never break the viewer.
        fetch("/api/observability/vnc", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
          keepalive: true,
        }).catch(() => {})
      }, TELEMETRY_INTERVAL_MS)
      return () => clearInterval(id)
    }, [telemetryEnabled, state, sid, accountId, compression])

    /* --------------------- visibility + beforeunload --------------------- */

    useEffect(() => {
      let hiddenAt: number | null = null
      let hiddenTimer: ReturnType<typeof setTimeout> | null = null

      const onVisibility = () => {
        if (document.visibilityState === "hidden") {
          hiddenAt = Date.now()
          hiddenTimer = setTimeout(() => {
            // After HIDDEN_DISCONNECT_MS hidden, drop the connection to free
            // VPS websockify slot. Reconnect on visible again.
            if (stateRef.current === "connected") {
              stoppedByUserRef.current = false
              teardown()
              updateState("idle")
            }
          }, HIDDEN_DISCONNECT_MS)
        } else {
          if (hiddenTimer) { clearTimeout(hiddenTimer); hiddenTimer = null }
          if (hiddenAt && stateRef.current === "idle" && !stoppedByUserRef.current) {
            // Came back from background after we tore down — reconnect
            void connect()
          }
          hiddenAt = null
        }
      }
      const onBeforeUnload = () => {
        try { rfbRef.current?.disconnect() } catch {}
      }
      document.addEventListener("visibilitychange", onVisibility)
      window.addEventListener("beforeunload", onBeforeUnload)
      return () => {
        document.removeEventListener("visibilitychange", onVisibility)
        window.removeEventListener("beforeunload", onBeforeUnload)
        if (hiddenTimer) clearTimeout(hiddenTimer)
      }
    }, [connect, teardown, updateState])

    /* ---------------- per-account settings fetch (Wave 1.6) -------------- */

    useEffect(() => {
      if (!accountId) return
      let cancelled = false
      ;(async () => {
        try {
          const res = await fetch(`/api/accounts/${encodeURIComponent(accountId)}/vnc-settings`)
          if (!res.ok) return
          const json = await res.json().catch(() => null)
          if (!json?.settings || cancelled) return
          const s = json.settings
          if (typeof s.quality === "number" && s.quality !== currentQualityRef.current) {
            currentQualityRef.current = s.quality
            const r = rfbRef.current
            if (r) {
              try { r.qualityLevel = s.quality } catch {}
            }
          }
          // Note: compression/adaptive change requires reconnect to apply
          // (RFB negotiates encodings at handshake). User must Refresh manually.
        } catch {}
      })()
      return () => { cancelled = true }
    }, [accountId])

    /* --------------------------- cleanup on unmount ----------------------- */

    useEffect(() => {
      return () => { teardown() }
    }, [teardown])

    /* -------------------------------- render ----------------------------- */

    return (
      <div
        className={cn(
          "relative h-full w-full overflow-hidden rounded-lg border border-mem-border bg-[rgb(11,11,13)]",
          className
        )}
      >
        <div
          ref={containerRef}
          tabIndex={0}
          aria-label="VNC canvas — click to capture keyboard input"
          className="h-full w-full outline-none focus-visible:ring-2 focus-visible:ring-mem-accent/60"
          onClick={() => containerRef.current?.focus()}
        />

        {state === "connecting" || state === "reconnecting" ? (
          <div
            role="status"
            aria-live="polite"
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-mem-bg/80 backdrop-blur-sm"
          >
            <div
              aria-hidden
              className="h-8 w-8 animate-spin rounded-full border-2 border-mem-border border-t-mem-accent motion-reduce:animate-none"
            />
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-mem-text-secondary">
              {state === "reconnecting"
                ? `Reconnecting… (attempt ${reconnectAttempt} of ${MAX_RECONNECT_ATTEMPTS})`
                : "Connecting…"}
            </p>
          </div>
        ) : null}

        {state === "error" && errorMsg ? (
          <div
            role="alert"
            className="absolute inset-x-4 bottom-4 rounded-md border border-mem-status-stuck/40 bg-mem-status-stuck/10 px-3 py-2 text-[12px] text-mem-text-primary"
          >
            <span className="font-medium text-mem-status-stuck">Error: </span>
            {errorMsg}
          </div>
        ) : null}
      </div>
    )
  }
)
