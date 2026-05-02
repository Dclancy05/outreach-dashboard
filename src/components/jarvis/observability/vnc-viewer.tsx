"use client"

/**
 * VNC viewer — embeds the live VPS Chrome browser into /jarvis/observability.
 *
 * Wraps the @novnc/novnc RFB client. The host page owns *which* WS URL/password
 * to connect to (read from NEXT_PUBLIC_VNC_WS_URL); this component owns:
 *   - the canvas container
 *   - RFB lifecycle (instantiate → events → disconnect)
 *   - connection state machine (idle / connecting / connected / error)
 *   - reconnect with linear backoff (2s, then 4s, then 6s — capped 6s)
 *   - debounced resize on viewport changes
 *   - keyboard pass-through when canvas is focused
 *
 * Connection is NEVER auto-initiated on mount. The parent toolbar's `Connect`
 * button calls the imperative `connect()` we expose via ref. This is to avoid
 * accidental traffic against the senders' real Chrome (ban-risk policy).
 *
 * RFB import: noVNC ships untyped CommonJS at `@novnc/novnc/lib/rfb`. We treat
 * it as an unknown shape and narrow with a tiny ambient interface below — no
 * `any` leaks across the module boundary.
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
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
  // settable props we touch
  scaleViewport: boolean
  resizeSession: boolean
  showDotCursor: boolean
  background: string
  qualityLevel: number
  compressionLevel: number
  viewOnly: boolean
  focusOnClick: boolean
  // methods
  disconnect(): void
  sendCtrlAltDel(): void
  focus(): void
  blur(): void
  // EventTarget surface
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
  /** Active resolution e.g. "1920x1080" — only after framebuffer arrives. */
  resolution: string | null
  /** Best-effort frames per second computed from frame events. */
  fps: number
  /** Round-trip latency in ms (rough — measured on every framebuffer rect). */
  ping: number | null
  /** Desktop name reported by the server (when known). */
  desktopName: string | null
}

export interface VncViewerHandle {
  connect(): void
  disconnect(): void
  reconnect(): void
  sendCtrlAltDel(): void
  /** Returns a PNG data URL of the current canvas, or null if unavailable. */
  screenshot(): string | null
  focus(): void
}

interface VncViewerProps {
  /** WebSocket URL — e.g. wss://host:6080/websockify. */
  wsUrl: string | null
  /** Optional VNC password (RFB credentials.password). */
  password?: string
  /** Image quality 0-9 (higher = better). Default 6. */
  quality?: number
  /** Compression 0-9 (higher = more CPU, less bandwidth). Default 2. */
  compression?: number
  /** Render at 1:1 (false) or scale-to-fit (true). Default true. */
  scaleViewport?: boolean
  /** Stream stats updates back to parent for the status strip. */
  onStateChange?: (state: VncConnectionState) => void
  onStatsChange?: (stats: VncStats) => void
  onError?: (message: string) => void
  className?: string
}

/* -------------------------------------------------------------------------- */
/*                                 Component                                  */
/* -------------------------------------------------------------------------- */

export const VncViewer = forwardRef<VncViewerHandle, VncViewerProps>(
  function VncViewer(
    {
      wsUrl,
      password,
      quality = 6,
      compression = 2,
      scaleViewport = true,
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
    const [state, setState] = useState<VncConnectionState>("idle")
    const stateRef = useRef<VncConnectionState>("idle")
    const [errorMsg, setErrorMsg] = useState<string | null>(null)

    // Stats — kept in refs so we can mutate without re-rendering on every frame.
    const statsRef = useRef<VncStats>({
      resolution: null,
      fps: 0,
      ping: null,
      desktopName: null,
    })
    const frameTimesRef = useRef<number[]>([])

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
      if (rfbRef.current) {
        // Already connecting/connected — caller should disconnect first.
        return
      }

      setErrorMsg(null)
      updateState(reconnectAttemptsRef.current > 0 ? "reconnecting" : "connecting")

      // Lazy-load noVNC. The lib reaches for window/document during module init,
      // so we cannot import it at the top of a file that might run on the server.
      let RFB: RfbConstructor
      try {
        // @novnc/novnc ships no types; resolved as implicit any due to
        // skipLibCheck. The dynamic import keeps it out of SSR.
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

        // Sensible defaults for an embedded viewer.
        rfb.scaleViewport = scaleViewport
        rfb.resizeSession = false
        rfb.showDotCursor = true
        rfb.background = "rgb(11, 11, 13)" // matches mem-bg
        rfb.qualityLevel = quality
        rfb.compressionLevel = compression
        rfb.viewOnly = false
        rfb.focusOnClick = true

        const handleConnect = () => {
          reconnectAttemptsRef.current = 0
          updateState("connected")
        }

        const handleDisconnect = (ev: CustomEvent) => {
          rfbRef.current = null
          // detail.clean === true means a graceful close (user clicked Disconnect)
          const detail = (ev as unknown as { detail?: { clean?: boolean } })
            .detail
          if (detail?.clean) {
            updateState("idle")
            return
          }
          // Unclean disconnects → schedule a reconnect (max 3 attempts).
          if (reconnectAttemptsRef.current < 3) {
            reconnectAttemptsRef.current += 1
            const delay = Math.min(6000, 2000 * reconnectAttemptsRef.current)
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
          // noVNC fires this when the RFB security step demands a password we
          // didn't pass in. Without transitioning state, the viewer would sit
          // at "connecting" forever (errorMsg is set but only renders when
          // state === "error"). Surface the failure so the parent's
          // onStateChange flips to "error" and any "connecting" overlay clears.
          const msg = "VNC server requires a password — set NEXT_PUBLIC_VNC_PASSWORD or pass `password` prop."
          setErrorMsg(msg)
          onError?.(msg)
          updateState("error")
          // Tear down the RFB so we don't leak the half-open WS while the user
          // sees the error. Reconnect button on the parent re-mounts cleanly.
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

        // Frame callback — noVNC fires "framebufferupdate" or, in newer builds,
        // emits no public event for every frame. We approximate FPS by polling
        // the canvas size + rendering loop (see effect below).
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
      quality,
      compression,
      scaleViewport,
      onError,
      updateState,
      emitStats,
    ])

    /* --------------------------- disconnect/reconnect -------------------- */

    const disconnect = useCallback(() => {
      reconnectAttemptsRef.current = 99 // prevent auto-reconnect
      teardown()
      updateState("idle")
    }, [teardown, updateState])

    const reconnect = useCallback(() => {
      teardown()
      reconnectAttemptsRef.current = 0
      // Slight delay to let the WebSocket close cleanly
      reconnectTimerRef.current = setTimeout(() => {
        void connect()
      }, 100)
    }, [connect, teardown])

    const sendCtrlAltDel = useCallback(() => {
      try {
        rfbRef.current?.sendCtrlAltDel()
      } catch {
        // No-op — only valid when connected.
      }
    }, [])

    const screenshot = useCallback((): string | null => {
      const root = containerRef.current
      if (!root) return null
      const canvas = root.querySelector("canvas")
      if (!canvas) return null
      try {
        return canvas.toDataURL("image/png")
      } catch {
        return null
      }
    }, [])

    const focus = useCallback(() => {
      try {
        rfbRef.current?.focus()
      } catch {
        // No-op
      }
    }, [])

    useImperativeHandle(
      ref,
      (): VncViewerHandle => ({
        connect,
        disconnect,
        reconnect,
        sendCtrlAltDel,
        screenshot,
        focus,
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
          // Track resolution from the underlying canvas (noVNC creates one).
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
        frameTimesRef.current.push(now)
        // keep last 60 frames (~1s at 60fps)
        if (frameTimesRef.current.length > 60) {
          frameTimesRef.current.shift()
        }
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
          // No-cors HEAD may resolve as opaque; we still measured the round trip.
        }
        const dur = Math.round(performance.now() - start)
        if (!cancelled) {
          statsRef.current.ping = dur
          emitStats()
        }
      }
      void sample()
      const id = setInterval(() => {
        void sample()
      }, 5000)
      return () => {
        cancelled = true
        clearInterval(id)
      }
    }, [state, wsUrl, emitStats])

    /* --------------------------- cleanup on unmount ----------------------- */

    useEffect(() => {
      return () => {
        teardown()
      }
    }, [teardown])

    /* -------------------------------- render ----------------------------- */

    return (
      <div
        className={cn(
          "relative h-full w-full overflow-hidden rounded-lg border border-mem-border bg-[rgb(11,11,13)]",
          className
        )}
      >
        {/* Container noVNC mounts its <canvas> into. tabIndex makes it focusable
            so keyboard input (arrows, WASD, etc.) routes through. */}
        <div
          ref={containerRef}
          tabIndex={0}
          aria-label="VNC canvas — click to capture keyboard input"
          className="h-full w-full outline-none focus-visible:ring-2 focus-visible:ring-mem-accent/60"
          onClick={() => {
            // Focus container so noVNC keyboard handler is active.
            containerRef.current?.focus()
          }}
        />

        {/* Connection-state overlay (only when not yet connected and not in the
            empty-state region the parent owns). */}
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
              {state === "reconnecting" ? "Reconnecting…" : "Connecting…"}
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
