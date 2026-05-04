"use client"

/**
 * TerminalPane — one xterm.js terminal connected to a tmux session via WS.
 *
 * Design (rewritten for the bulletproof pass — tracks every failure mode the
 * v1 implementation could hit):
 *
 *   1. xterm and its onData subscription mount ONCE per component lifecycle.
 *      The keystroke handler reads `wsRef.current` at fire time so we never
 *      capture a stale WebSocket in a closure across reconnects.
 *
 *   2. Outbound keystrokes that arrive while the WS is not OPEN are buffered
 *      (capped) and flushed on the next `connected` transition. The user can
 *      keep typing during a brief disconnected window without losing chars.
 *
 *   3. A deadman watchdog tracks `lastServerDataAt`. If we go > 45s with no
 *      bytes from the server while the WS *says* it's OPEN, we force-close
 *      and let the existing reconnect path heal — catches NAT rebind, mobile
 *      sleep, half-open sockets the kernel hasn't noticed.
 *
 *   4. xterm focus is restored on every `connected` transition and every
 *      pointer-down inside the pane container. No more "I clicked away and
 *      didn't realize my keys are going to the body".
 *
 *   5. SearchAddon (Cmd/Ctrl+F) and WebLinksAddon (clickable file:line hints)
 *      are wired so the pane behaves like a first-class terminal app.
 *
 *   6. The visible state machine surfaces every error as a friendly sentence
 *      with a one-click action — no dead-end "Disconnected" labels.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Loader2, Plug, AlertTriangle, RotateCw, KeyRound, Search, X } from "lucide-react"
import { Terminal, type IDisposable } from "xterm"
import { FitAddon } from "@xterm/addon-fit"
import { SearchAddon } from "@xterm/addon-search"
import { WebLinksAddon } from "@xterm/addon-web-links"
import * as Sentry from "@sentry/nextjs"
import "xterm/css/xterm.css"

type State = "idle" | "connecting" | "connected" | "disconnected" | "error"

interface Props {
  sessionId: string
  /** Full wss:// URL the terminal-server exposes — bearer token rides as
   *  `?token=` (the dashboard's /api/terminals route does that). */
  wsUrl: string
  /** Called whenever the local viewport changes — caller pushes resize to VPS. */
  onResize?: (cols: number, rows: number) => void
  /** Called when the user clicks a `path:line:col` link in the terminal output —
   *  caller can route to the Command Center's Code mode. */
  onOpenFile?: (path: string, line?: number, col?: number) => void
}

// Cap on how many bytes we'll buffer while the WS is down. Beyond this we
// drop oldest — protects against a runaway paste when the server is dead.
const OUTBOUND_BUFFER_LIMIT = 64 * 1024

// If the server hasn't sent any data for this long while we *think* we're
// connected, suspect the socket is half-open and force-reconnect.
const SERVER_SILENCE_TIMEOUT_MS = 45_000
const WATCHDOG_TICK_MS = 5_000

// Backoff cap. The reconnect ladder doubles from 500ms; we cap at 30s so
// the user never waits more than half a minute for a heal attempt.
const RECONNECT_CAP_MS = 30_000

export function TerminalPane({ sessionId, wsUrl, onResize, onOpenFile }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const searchRef = useRef<SearchAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectAttemptRef = useRef(0)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const watchdogTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastServerDataAtRef = useRef<number>(Date.now())
  const outboundBufferRef = useRef<string[]>([])
  const outboundBufferSizeRef = useRef<number>(0)
  const onDataSubRef = useRef<IDisposable | null>(null)
  const onResizeRef = useRef<Props["onResize"]>(onResize)
  const onOpenFileRef = useRef<Props["onOpenFile"]>(onOpenFile)
  const stateRef = useRef<State>("idle")
  // Once the user has focused this pane at least once, the blur handler will
  // restore focus when it falls to body. Avoids stealing focus on initial
  // mount before the user has actually engaged with the pane.
  const userHasFocusedRef = useRef(false)

  const [state, setState] = useState<State>("idle")
  const [error, setError] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")

  // Keep refs in sync with latest callback identity so the xterm-mount effect
  // doesn't have to depend on them (and re-mount xterm whenever the parent
  // re-renders with a new arrow function).
  useEffect(() => { onResizeRef.current = onResize }, [onResize])
  useEffect(() => { onOpenFileRef.current = onOpenFile }, [onOpenFile])

  const setStateBoth = useCallback((s: State) => {
    stateRef.current = s
    setState(s)
  }, [])

  // Try to send a chunk over the live WS, or buffer it until reconnect.
  const sendOrBuffer = useCallback((data: string) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(data)
        return
      } catch {
        /* fall through to buffer */
      }
    }
    // Drop oldest if over the cap so a runaway paste during a dead WS can't
    // exhaust the heap.
    outboundBufferRef.current.push(data)
    outboundBufferSizeRef.current += data.length
    while (outboundBufferSizeRef.current > OUTBOUND_BUFFER_LIMIT && outboundBufferRef.current.length > 1) {
      const dropped = outboundBufferRef.current.shift()
      if (dropped) outboundBufferSizeRef.current -= dropped.length
    }
  }, [])

  const flushBuffer = useCallback(() => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    while (outboundBufferRef.current.length > 0) {
      const chunk = outboundBufferRef.current.shift()
      if (chunk === undefined) break
      try {
        ws.send(chunk)
        outboundBufferSizeRef.current -= chunk.length
      } catch {
        // Re-queue and stop draining; we'll retry on next OPEN.
        outboundBufferRef.current.unshift(chunk)
        return
      }
    }
    outboundBufferSizeRef.current = 0
  }, [])

  // ─── xterm mount (once) ──────────────────────────────────────────────
  // Stable across reconnects, prop changes, and parent rerenders.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

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
      // Keep the alt-screen buffer in sync — fixes scrollback corruption when
      // a TUI (claude, vim, less) exits and the parent shell repaints.
      windowsMode: false,
    })
    const fit = new FitAddon()
    const search = new SearchAddon()
    const links = new WebLinksAddon((event, uri) => {
      // The default WebLinksAddon opens http(s) URIs in a new tab. We extend
      // to also recognize `file:line[:col]` paths and route them to onOpenFile
      // so the dashboard can jump to the Code mode.
      const fileMatch = uri.match(/^([^:\s]+\.[a-z0-9]+):(\d+)(?::(\d+))?$/i)
      if (fileMatch && onOpenFileRef.current) {
        event.preventDefault()
        onOpenFileRef.current(fileMatch[1], Number(fileMatch[2]), fileMatch[3] ? Number(fileMatch[3]) : undefined)
        return
      }
      // Default: open URLs.
      try { window.open(uri, "_blank", "noopener,noreferrer") } catch { /* */ }
    })

    term.loadAddon(fit)
    term.loadAddon(search)
    term.loadAddon(links)
    term.open(container)
    try { fit.fit() } catch { /* container may be 0×0 mid-transition */ }

    xtermRef.current = term
    fitRef.current = fit
    searchRef.current = search

    // SINGLE keystroke subscription, lives for the full xterm lifetime. Reads
    // wsRef.current at fire time, so it always sees the freshest WS — no
    // stale captures across reconnects, no leak across re-mounts.
    onDataSubRef.current = term.onData((data) => {
      sendOrBuffer(data)
    })

    // Focus recovery — once the user has focused the terminal, keep it focused.
    // Real bug observed in production: after the first message + Enter, output
    // streams in and the helper textarea blurs to body. The user has to click
    // back in to type again. We watch for blur where the new active element is
    // body and restore focus on the next animation frame.
    const helper = container.querySelector(".xterm-helper-textarea") as HTMLTextAreaElement | null
    const handleHelperFocus = () => {
      userHasFocusedRef.current = true
    }
    const handleHelperBlur = () => {
      // Defer so the next-focused element has time to settle. If focus went
      // somewhere intentional (a button, the search overlay, the inbox drawer,
      // a dialog), leave it alone. Only restore when focus has fallen to body
      // — i.e., nothing claimed it.
      requestAnimationFrame(() => {
        if (!userHasFocusedRef.current) return
        const ae = document.activeElement
        if (ae === document.body || ae === null || ae === document.documentElement) {
          try { xtermRef.current?.focus() } catch { /* */ }
        }
      })
    }
    helper?.addEventListener("focus", handleHelperFocus)
    helper?.addEventListener("blur", handleHelperBlur)

    // Cmd/Ctrl+F opens the in-pane search bar.
    const searchKeyHandler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        // Only intercept when the xterm has focus so we don't steal Cmd+F
        // from the surrounding page.
        if (document.activeElement === container.querySelector(".xterm-helper-textarea")) {
          e.preventDefault()
          setSearchOpen(true)
        }
      }
      if (e.key === "Escape" && searchOpen) {
        setSearchOpen(false)
      }
    }
    container.addEventListener("keydown", searchKeyHandler, true)

    return () => {
      container.removeEventListener("keydown", searchKeyHandler, true)
      helper?.removeEventListener("focus", handleHelperFocus)
      helper?.removeEventListener("blur", handleHelperBlur)
      onDataSubRef.current?.dispose()
      onDataSubRef.current = null
      term.dispose()
      xtermRef.current = null
      fitRef.current = null
      searchRef.current = null
    }
    // We intentionally exclude every changing dep — xterm must be a singleton.
    // Callbacks are read through refs above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ─── ResizeObserver — push viewport size up so VPS knows the new geometry.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const ro = new ResizeObserver(() => {
      try {
        fitRef.current?.fit()
        const term = xtermRef.current
        if (term) onResizeRef.current?.(term.cols, term.rows)
      } catch { /* fit may throw if container is 0×0 mid-transition */ }
    })
    ro.observe(container)
    return () => ro.disconnect()
  }, [])

  // ─── WS lifecycle (per wsUrl/sessionId) ──────────────────────────────
  useEffect(() => {
    if (!wsUrl) return
    let cancelled = false

    const clearReconnectTimer = () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
    }

    const scheduleReconnect = () => {
      if (cancelled) return
      reconnectAttemptRef.current += 1
      const delay = Math.min(
        RECONNECT_CAP_MS,
        500 * 2 ** Math.min(reconnectAttemptRef.current, 6),
      )
      Sentry.addBreadcrumb({
        category: "terminal-ws",
        level: "info",
        message: "reconnect scheduled",
        data: { sessionId, delayMs: delay, attempt: reconnectAttemptRef.current },
      })
      clearReconnectTimer()
      reconnectTimerRef.current = setTimeout(connect, delay)
    }

    const focusXterm = () => {
      try { xtermRef.current?.focus() } catch { /* */ }
    }

    function connect() {
      if (cancelled) return
      setStateBoth("connecting")
      setError(null)
      lastServerDataAtRef.current = Date.now()

      const ws = new WebSocket(wsUrl)
      ws.binaryType = "arraybuffer"
      wsRef.current = ws

      ws.onopen = () => {
        if (cancelled) {
          try { ws.close(1000, "cancelled") } catch { /* */ }
          return
        }
        Sentry.addBreadcrumb({
          category: "terminal-ws",
          level: "info",
          message: "ws open",
          data: { sessionId, attempt: reconnectAttemptRef.current },
        })
        reconnectAttemptRef.current = 0
        setStateBoth("connected")
        // Fit after the server's initial scrollback replay so a 0-row layout
        // doesn't crop output. Refocus xterm so the user can immediately type
        // even if their pointer wandered.
        setTimeout(() => {
          try { fitRef.current?.fit() } catch { /* */ }
          focusXterm()
          flushBuffer()
        }, 50)
      }

      ws.onmessage = (ev) => {
        const term = xtermRef.current
        if (!term) return
        lastServerDataAtRef.current = Date.now()
        const data = typeof ev.data === "string"
          ? ev.data
          : new Uint8Array(ev.data as ArrayBuffer)
        term.write(data)
      }

      ws.onerror = () => {
        // ws errors don't carry detail in the browser API — see close event
        // for the actual reason. We still surface a generic message in case
        // close never fires.
      }

      ws.onclose = (ev) => {
        if (cancelled) return
        Sentry.addBreadcrumb({
          category: "terminal-ws",
          level: "info",
          message: "ws close",
          data: { sessionId, code: ev.code, reason: ev.reason || null },
        })
        wsRef.current = null
        if (ev.code === 1000) {
          // Clean close from server (pty exited, etc.). Try to reconnect —
          // tmux session is still alive on the VPS even if our attach died.
          setStateBoth("disconnected")
          scheduleReconnect()
          return
        }
        if (ev.code === 4401 || ev.code === 1008) {
          setError("Authentication rejected. The session token may have expired — reload the page to re-issue one.")
          setStateBoth("error")
          return
        }
        if (ev.code === 4404 || ev.code === 1011) {
          setError("This terminal isn't running on the VPS. It may have crashed or been killed — open a new one.")
          setStateBoth("error")
          return
        }
        setStateBoth("disconnected")
        scheduleReconnect()
      }
    }

    // Start the watchdog — if the server goes silent while we *think* we're
    // connected, the socket is half-open. Force-close and let onclose+
    // scheduleReconnect heal it.
    watchdogTimerRef.current = setInterval(() => {
      if (stateRef.current !== "connected") return
      const silentFor = Date.now() - lastServerDataAtRef.current
      if (silentFor > SERVER_SILENCE_TIMEOUT_MS) {
        Sentry.addBreadcrumb({
          category: "terminal-ws",
          level: "warning",
          message: "watchdog force-close",
          data: { sessionId, silentForMs: silentFor },
        })
        const ws = wsRef.current
        if (ws) {
          try { ws.close(4000, "watchdog: server silence") } catch { /* */ }
        }
      }
    }, WATCHDOG_TICK_MS)

    connect()

    return () => {
      cancelled = true
      clearReconnectTimer()
      if (watchdogTimerRef.current) {
        clearInterval(watchdogTimerRef.current)
        watchdogTimerRef.current = null
      }
      try { wsRef.current?.close(1000, "unmount") } catch { /* */ }
      wsRef.current = null
    }
  }, [wsUrl, sessionId, flushBuffer, setStateBoth])

  // ─── Search bar ──────────────────────────────────────────────────────
  const runSearch = useCallback((term: string, direction: "next" | "prev") => {
    const search = searchRef.current
    if (!search) return
    if (direction === "next") search.findNext(term)
    else search.findPrevious(term)
  }, [])

  const closeSearch = useCallback(() => {
    setSearchOpen(false)
    setSearchTerm("")
    try { searchRef.current?.clearDecorations() } catch { /* */ }
  }, [])

  const reloadPage = useCallback(() => {
    if (typeof window !== "undefined") window.location.reload()
  }, [])

  const forceReconnect = useCallback(() => {
    const ws = wsRef.current
    if (ws) {
      try { ws.close(4000, "user-forced reconnect") } catch { /* */ }
    } else {
      // No live ws — bump the reconnect attempt and let the existing schedule run.
      reconnectAttemptRef.current = 0
    }
  }, [])

  // Click anywhere in the pane container → focus xterm. Catches the case where
  // a user clicks a child element (e.g. the status overlay) and loses focus.
  const onPaneMouseDown = useCallback(() => {
    try { xtermRef.current?.focus() } catch { /* */ }
  }, [])

  const overlayContent = useMemo(() => {
    if (state === "connecting" || state === "idle") {
      return (
        <Overlay>
          <Loader2 className="w-5 h-5 animate-spin mb-2 text-amber-400" />
          <div className="text-sm">Connecting to session…</div>
        </Overlay>
      )
    }
    if (state === "disconnected") {
      return (
        <Overlay>
          <Plug className="w-5 h-5 mb-2 text-zinc-400" />
          <div className="text-sm">Reconnecting…</div>
          <div className="text-xs text-zinc-500 mt-1">Your work is safe — the session is still running on the VPS.</div>
        </Overlay>
      )
    }
    if (state === "error") {
      const isAuth = error?.startsWith("Authentication")
      return (
        <Overlay interactive>
          <AlertTriangle className="w-5 h-5 mb-2 text-red-400" />
          <div className="text-sm font-medium text-red-300">{isAuth ? "Sign-in needed" : "Disconnected"}</div>
          {error && <div className="text-xs text-zinc-400 mt-1 max-w-sm text-center leading-relaxed">{error}</div>}
          <div className="flex items-center gap-2 mt-3">
            {isAuth ? (
              <button
                onClick={reloadPage}
                className="text-xs px-3 py-1.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-100 hover:bg-amber-500/25 inline-flex items-center gap-1.5"
              >
                <KeyRound className="w-3.5 h-3.5" />
                Reload to re-auth
              </button>
            ) : (
              <button
                onClick={forceReconnect}
                className="text-xs px-3 py-1.5 rounded-md bg-cyan-500/15 border border-cyan-500/30 text-cyan-100 hover:bg-cyan-500/25 inline-flex items-center gap-1.5"
              >
                <RotateCw className="w-3.5 h-3.5" />
                Try again
              </button>
            )}
          </div>
        </Overlay>
      )
    }
    return null
  }, [state, error, forceReconnect, reloadPage])

  return (
    <div
      className="relative h-full w-full bg-zinc-950"
      onMouseDown={onPaneMouseDown}
    >
      <div ref={containerRef} className="absolute inset-0" />
      {overlayContent}
      {searchOpen && (
        <SearchBar
          term={searchTerm}
          onTerm={setSearchTerm}
          onNext={() => runSearch(searchTerm, "next")}
          onPrev={() => runSearch(searchTerm, "prev")}
          onClose={closeSearch}
        />
      )}
    </div>
  )
}

function Overlay({ children, interactive }: { children: React.ReactNode; interactive?: boolean }) {
  return (
    <div
      className={
        "absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/80 backdrop-blur-sm" +
        (interactive ? "" : " pointer-events-none")
      }
    >
      {children}
    </div>
  )
}

function SearchBar({
  term, onTerm, onNext, onPrev, onClose,
}: {
  term: string
  onTerm: (s: string) => void
  onNext: () => void
  onPrev: () => void
  onClose: () => void
}) {
  return (
    <div className="absolute top-2 right-2 z-10 flex items-center gap-1 bg-zinc-900/95 border border-zinc-700 rounded-md px-2 py-1 shadow-lg">
      <Search className="w-3.5 h-3.5 text-zinc-400" />
      <input
        autoFocus
        value={term}
        onChange={(e) => onTerm(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            if (e.shiftKey) onPrev()
            else onNext()
          }
          if (e.key === "Escape") {
            e.preventDefault()
            onClose()
          }
        }}
        placeholder="Find in terminal"
        className="bg-transparent border-0 outline-none text-xs text-zinc-100 placeholder:text-zinc-500 w-44"
      />
      <button
        onClick={onPrev}
        title="Previous (Shift+Enter)"
        className="text-zinc-400 hover:text-zinc-100 px-1 text-xs"
      >↑</button>
      <button
        onClick={onNext}
        title="Next (Enter)"
        className="text-zinc-400 hover:text-zinc-100 px-1 text-xs"
      >↓</button>
      <button
        onClick={onClose}
        title="Close (Esc)"
        className="text-zinc-400 hover:text-red-300 px-1"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}
