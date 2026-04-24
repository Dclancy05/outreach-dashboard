"use client"

/**
 * NoVncViewer
 *
 * Production-quality in-dashboard VNC viewer. Connects directly to the VPS's
 * websockify endpoint over WSS — no iframe, no new window, no separate noVNC
 * HTML page. We ship the `@novnc/novnc` RFB client inline so the viewer can
 * live anywhere in the app and render a remote Chrome session in a React
 * component.
 *
 * Why not the iframe? The VPS nginx serves an unrelated "OpenClaw Control"
 * app at every URL, overriding /vnc.html. Embedding that page gave users the
 * wrong UI. Talking WebSocket directly to /websockify/<id> bypasses the HTML
 * path entirely — the HTML path being broken no longer matters.
 *
 * Lifecycle: connecting → connected / disconnected / error. All four states
 * have polished dark-theme UI consistent with `platform-login-modal.tsx`.
 *
 * Why dynamic import? `@novnc/novnc` uses `document` / `window` at import
 * time, which breaks Next.js SSR. We load it lazily inside `useEffect` so the
 * module only resolves on the client.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import type RFBType from "@novnc/novnc/lib/rfb"
import { Loader2, MonitorX, RefreshCw, WifiOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// Alias to the RFB class type so we can reference it without the runtime
// import (which would trigger SSR failures). The runtime class is loaded
// dynamically inside the effect below.
type RfbInstance = InstanceType<typeof RFBType>

type ConnectionState = "idle" | "connecting" | "connected" | "disconnected" | "error"

const DEFAULT_WS_BASE =
  process.env.NEXT_PUBLIC_VNC_WS_BASE ||
  "wss://srv1197943.taild42583.ts.net/websockify"

const VNC_PASSWORD = process.env.NEXT_PUBLIC_VNC_PASSWORD || ""

export interface NoVncViewerProps {
  /**
   * Optional per-account session id. Defaults to "main" — the shared-Chrome
   * session on the VPS. Per-account sessions hit `/websockify/<sessionId>`.
   */
  sessionId?: string
  /**
   * Override the full WebSocket URL. When set, takes precedence over the
   * session-id path composition. Mostly used for tests / debugging.
   */
  wsUrl?: string
  /** Called once the RFB handshake completes and the canvas is visible. */
  onConnected?: () => void
  /**
   * Called when the WebSocket closes for any reason (graceful or error).
   * The `clean` flag mirrors the noVNC `disconnect` event detail.
   */
  onDisconnected?: (info: { clean: boolean; reason?: string }) => void
  /** Optional className merged onto the outer wrapper. */
  className?: string
}

function buildWsUrl(sessionId: string | undefined, override?: string): string {
  if (override) return override
  const id = sessionId && sessionId.trim() ? sessionId.trim() : "main"
  // Tolerate the caller including a trailing slash on the base.
  const base = DEFAULT_WS_BASE.replace(/\/+$/, "")
  return `${base}/${encodeURIComponent(id)}`
}

export default function NoVncViewer({
  sessionId,
  wsUrl,
  onConnected,
  onDisconnected,
  className,
}: NoVncViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const rfbRef = useRef<RfbInstance | null>(null)
  const [state, setState] = useState<ConnectionState>("idle")
  const [error, setError] = useState<string>("")
  // Bump this to force a reconnect (useEffect dep). We never re-use an RFB
  // instance after disconnect — the cleanest path is to tear down + rebuild.
  const [reconnectTick, setReconnectTick] = useState(0)

  // Stable refs for callbacks so the effect below doesn't retrigger on every
  // parent render.
  const onConnectedRef = useRef(onConnected)
  const onDisconnectedRef = useRef(onDisconnected)
  useEffect(() => { onConnectedRef.current = onConnected }, [onConnected])
  useEffect(() => { onDisconnectedRef.current = onDisconnected }, [onDisconnected])

  const url = buildWsUrl(sessionId, wsUrl)

  useEffect(() => {
    let disposed = false
    let rfb: RfbInstance | null = null

    async function connect() {
      if (!containerRef.current) return
      setState("connecting")
      setError("")

      // Dynamic import — @novnc/novnc touches DOM globals at module load so
      // it only runs on the client. The Webpack chunk stays out of the SSR
      // bundle entirely.
      let RFB: typeof RFBType
      try {
        const mod = await import("@novnc/novnc/lib/rfb")
        // The CJS build exposes the class under .default; guard against the
        // ESM wrapper variant too.
        const asRecord = mod as unknown as { default?: typeof RFBType }
        RFB = asRecord.default ?? (mod as unknown as typeof RFBType)
      } catch (e: unknown) {
        if (disposed) return
        const msg = e instanceof Error ? e.message : "Failed to load noVNC"
        setError(msg)
        setState("error")
        return
      }

      if (disposed || !containerRef.current) return

      try {
        rfb = new RFB(containerRef.current, url, {
          credentials: { password: VNC_PASSWORD },
        })
      } catch (e: unknown) {
        if (disposed) return
        const msg = e instanceof Error ? e.message : "Failed to open VNC connection"
        setError(msg)
        setState("error")
        return
      }

      rfb.scaleViewport = true
      rfb.resizeSession = false
      rfb.viewOnly = false
      rfb.focusOnClick = true
      rfb.showDotCursor = true

      const handleConnect = () => {
        if (disposed) return
        setState("connected")
        setError("")
        onConnectedRef.current?.()
      }

      const handleDisconnect = (ev: Event) => {
        if (disposed) return
        const detail = (ev as CustomEvent<{ clean?: boolean; reason?: string }>).detail || {}
        const clean = detail.clean === true
        const reason = detail.reason
        setState(clean ? "disconnected" : "error")
        if (!clean && reason) setError(reason)
        onDisconnectedRef.current?.({ clean, reason })
      }

      const handleCredentialsRequired = () => {
        if (disposed || !rfb) return
        // noVNC may fire this if the server asks for creds again. Re-send the
        // password from the env so the user never sees a password prompt.
        rfb.sendCredentials({ password: VNC_PASSWORD })
      }

      const handleSecurityFailure = (ev: Event) => {
        if (disposed) return
        const detail = (ev as CustomEvent<{ reason?: string; status?: number }>).detail || {}
        setError(detail.reason || `VNC security failure (${detail.status ?? "?"})`)
        setState("error")
      }

      // Forward server clipboard → browser clipboard so the user can paste
      // text copied inside the VNC session. Silent on permission denial.
      const handleClipboard = (ev: Event) => {
        const detail = (ev as CustomEvent<{ text?: string }>).detail
        const text = detail?.text
        if (!text || typeof navigator === "undefined") return
        const clipboard = navigator.clipboard
        if (clipboard && typeof clipboard.writeText === "function") {
          clipboard.writeText(text).catch(() => {})
        }
      }

      rfb.addEventListener("connect", handleConnect)
      rfb.addEventListener("disconnect", handleDisconnect)
      rfb.addEventListener("credentialsrequired", handleCredentialsRequired)
      rfb.addEventListener("securityfailure", handleSecurityFailure)
      rfb.addEventListener("clipboard", handleClipboard)

      rfbRef.current = rfb
    }

    connect().catch((e: unknown) => {
      if (disposed) return
      const msg = e instanceof Error ? e.message : "Unexpected VNC error"
      setError(msg)
      setState("error")
    })

    return () => {
      disposed = true
      if (rfb) {
        try { rfb.disconnect() } catch {}
      }
      rfbRef.current = null
    }
  }, [url, reconnectTick])

  // Browser clipboard → server clipboard bridge. When the viewer has focus
  // and the user copies text in the host browser, push it into the VNC so
  // paste-in-Chrome works naturally.
  useEffect(() => {
    if (state !== "connected") return
    const node = containerRef.current
    if (!node) return

    function handleCopy() {
      const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : null
      if (!clipboard || typeof clipboard.readText !== "function") return
      clipboard.readText().then(text => {
        if (text && rfbRef.current) {
          try { rfbRef.current.clipboardPasteFrom(text) } catch {}
        }
      }).catch(() => {})
    }

    node.addEventListener("copy", handleCopy)
    return () => node.removeEventListener("copy", handleCopy)
  }, [state])

  const reconnect = useCallback(() => {
    setState("connecting")
    setError("")
    setReconnectTick(t => t + 1)
  }, [])

  return (
    <div
      data-testid="novnc-viewer"
      data-connection-state={state}
      className={cn("relative h-full w-full bg-black/90 overflow-hidden", className)}
    >
      {/* The VNC canvas renders inside this div. noVNC fills the target with
          its own <canvas> — we set tabIndex so keyboard events reach it. */}
      <div
        ref={containerRef}
        tabIndex={0}
        className="h-full w-full outline-none"
        aria-label="Remote browser viewer"
      />

      {state === "connecting" && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-black/80 backdrop-blur-sm">
          <div className="relative h-14 w-14">
            <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-violet-500 via-fuchsia-500 to-pink-500 opacity-60 blur-md animate-pulse" />
            <div className="relative h-full w-full rounded-full bg-gradient-to-tr from-violet-500 via-fuchsia-500 to-pink-500 p-[2px]">
              <div className="h-full w-full rounded-full bg-black flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-violet-300" />
              </div>
            </div>
          </div>
          <div className="text-center space-y-1">
            <p className="text-sm font-medium text-foreground">Connecting to browser…</p>
            <p className="text-[11px] text-muted-foreground/80">
              Opening a secure tunnel to the shared Chrome session.
            </p>
          </div>
        </div>
      )}

      {state === "error" && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-black/85 backdrop-blur-sm p-8">
          <div className="h-14 w-14 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center">
            <WifiOff className="h-6 w-6 text-red-400" />
          </div>
          <div className="text-center space-y-1 max-w-md">
            <h4 className="text-sm font-semibold text-foreground">
              Couldn&apos;t connect to the browser
            </h4>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {error ||
                "The VNC connection dropped. This usually means the VPS is offline or the session hasn't started yet."}
            </p>
          </div>
          <Button
            size="sm"
            onClick={reconnect}
            className="bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-400 hover:to-purple-500 text-white rounded-xl shadow-lg shadow-purple-500/30"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Reconnect
          </Button>
        </div>
      )}

      {state === "disconnected" && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-black/85 backdrop-blur-sm p-8">
          <div className="h-14 w-14 rounded-full bg-muted/20 border border-border/40 flex items-center justify-center">
            <MonitorX className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="text-center space-y-1 max-w-md">
            <h4 className="text-sm font-semibold text-foreground">Browser disconnected</h4>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              The session closed cleanly. You can reconnect below.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={reconnect}
            className="rounded-xl"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Reconnect
          </Button>
        </div>
      )}
    </div>
  )
}
