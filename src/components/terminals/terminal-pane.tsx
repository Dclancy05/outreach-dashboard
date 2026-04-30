"use client"

/**
 * TerminalPane — one xterm.js terminal connected to a tmux session via WS.
 *
 * Why xterm.js (vs a plain textarea or Monaco): tmux speaks a real terminal
 * protocol — escape sequences for cursor moves, colors, mouse, etc. xterm.js
 * is the only browser library that handles all that correctly. It's what
 * VS Code, ttyd, Codespaces, and bridgemind all use.
 *
 * Connection lifecycle:
 *   idle → connecting → connected ⇄ disconnected → connecting (retry)
 *                          ↘ error (terminal state)
 *
 * Persistence: the WebSocket is stateless — closing it does NOT kill the
 * tmux pane. Reopening attaches to the same pane and the server replays the
 * scrollback so the user sees their prior output.
 */
import { useEffect, useRef, useState } from "react"
import { Loader2, Plug, AlertTriangle } from "lucide-react"
import { Terminal } from "xterm"
import { FitAddon } from "@xterm/addon-fit"
import "xterm/css/xterm.css"

type State = "idle" | "connecting" | "connected" | "disconnected" | "error"

interface Props {
  sessionId: string
  /** Full wss:// URL the terminal-server exposes (no token in URL — we add it). */
  wsUrl: string
  /** Bearer token for the terminal-server, used as `?token=` query param. */
  token: string
  /** Called whenever the local viewport changes — caller pushes resize to VPS. */
  onResize?: (cols: number, rows: number) => void
}

export function TerminalPane({ sessionId, wsUrl, token, onResize }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectAttemptRef = useRef(0)
  const [state, setState] = useState<State>("idle")
  const [error, setError] = useState<string | null>(null)

  // Mount xterm.js once. The terminal itself is reusable across reconnects —
  // we don't tear it down when the WS dies, just when the component unmounts.
  useEffect(() => {
    if (!containerRef.current) return
    const term = new Terminal({
      cursorBlink: true,
      fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.2,
      theme: {
        background: "#09090b",       // zinc-950
        foreground: "#e4e4e7",        // zinc-200
        cursor: "#fbbf24",            // amber-400
        selectionBackground: "#3f3f46", // zinc-700
      },
      scrollback: 5000,
      allowProposedApi: true,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(containerRef.current)
    fit.fit()
    xtermRef.current = term
    fitRef.current = fit
    return () => {
      term.dispose()
      xtermRef.current = null
      fitRef.current = null
    }
  }, [])

  // Resize-to-fit on container resize. Push the new size to the parent so it
  // can tell the VPS (tmux needs to know to redraw correctly).
  useEffect(() => {
    if (!containerRef.current || !fitRef.current) return
    const ro = new ResizeObserver(() => {
      try {
        fitRef.current?.fit()
        if (xtermRef.current) {
          onResize?.(xtermRef.current.cols, xtermRef.current.rows)
        }
      } catch { /* fit may throw if container is 0×0 mid-transition */ }
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [onResize])

  // Connect WS + wire bidirectional bytes. Reconnects with exponential backoff
  // capped at 30s, infinite retries — closing tab is the only way to give up.
  useEffect(() => {
    if (!wsUrl || !token) return
    let cancelled = false

    const connect = () => {
      if (cancelled) return
      setState("connecting")
      setError(null)
      const url = `${wsUrl}?token=${encodeURIComponent(token)}`
      const ws = new WebSocket(url)
      ws.binaryType = "arraybuffer"
      wsRef.current = ws

      ws.onopen = () => {
        if (cancelled) { ws.close(); return }
        reconnectAttemptRef.current = 0
        setState("connected")
        // Resize-fit after open so the server's initial scrollback replay
        // doesn't get cropped by a 0-row layout.
        setTimeout(() => {
          try { fitRef.current?.fit() } catch { /* */ }
        }, 50)
      }

      ws.onmessage = (ev) => {
        if (!xtermRef.current) return
        // Server sends raw bytes. Could be string (initial scrollback) or
        // binary (live tail). xterm.write handles both.
        const data = typeof ev.data === "string"
          ? ev.data
          : new Uint8Array(ev.data as ArrayBuffer)
        xtermRef.current.write(data)
      }

      ws.onerror = () => {
        // ws errors don't carry detail — see the close event for the actual reason
      }

      ws.onclose = (ev) => {
        if (cancelled) return
        wsRef.current = null
        if (ev.code === 1000) {
          setState("disconnected")
          return
        }
        setState("disconnected")
        if (ev.code === 4401 || ev.code === 1008) {
          setError("Unauthorized — terminal-server rejected the token.")
          setState("error")
          return
        }
        if (ev.code === 4404 || ev.code === 1011) {
          setError("Session not found on the VPS — it may have crashed.")
          setState("error")
          return
        }
        // Generic network drop / server restart — reconnect with backoff.
        reconnectAttemptRef.current += 1
        const delay = Math.min(30_000, 500 * 2 ** Math.min(reconnectAttemptRef.current, 6))
        setTimeout(connect, delay)
      }

      // Forward keystrokes from xterm → WS.
      const term = xtermRef.current
      if (term) {
        const sub = term.onData((data) => {
          if (ws.readyState === ws.OPEN) ws.send(data)
        })
        ws.addEventListener("close", () => sub.dispose())
      }
    }

    connect()
    return () => {
      cancelled = true
      try { wsRef.current?.close(1000, "unmount") } catch { /* */ }
      wsRef.current = null
    }
  }, [wsUrl, token, sessionId])

  return (
    <div className="relative h-full w-full bg-zinc-950">
      <div ref={containerRef} className="absolute inset-0" />
      {(state === "connecting" || state === "idle") && (
        <Overlay>
          <Loader2 className="w-5 h-5 animate-spin mb-2 text-amber-400" />
          <div className="text-sm">Connecting to session…</div>
        </Overlay>
      )}
      {state === "disconnected" && (
        <Overlay>
          <Plug className="w-5 h-5 mb-2 text-zinc-400" />
          <div className="text-sm">Reconnecting…</div>
        </Overlay>
      )}
      {state === "error" && (
        <Overlay>
          <AlertTriangle className="w-5 h-5 mb-2 text-red-400" />
          <div className="text-sm font-medium text-red-300">Disconnected</div>
          {error && <div className="text-xs text-zinc-400 mt-1 max-w-sm text-center">{error}</div>}
        </Overlay>
      )}
    </div>
  )
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/80 backdrop-blur-sm pointer-events-none">
      {children}
    </div>
  )
}
