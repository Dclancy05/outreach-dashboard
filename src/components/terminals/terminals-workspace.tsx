"use client"

/**
 * The full /agency/terminals page workspace.
 *
 * Layout:
 *   ┌────────────────────────────────────────────────────────┐
 *   │ Top bar: count, +New, layout selector, Stop all        │
 *   ├──────────┬─────────────────────────────────────────────┤
 *   │ Sidebar  │  Terminal grid (1, 4, 9, or 16 panes)       │
 *   │ (320px)  │                                             │
 *   │          │                                             │
 *   └──────────┴─────────────────────────────────────────────┘
 *
 * Grid behavior: shows up to N panes from the session list, where N is the
 * current layout (1 / 4 / 9 / 16). Clicking a session card in the sidebar
 * promotes it into the focused slot of the grid. Sessions not currently in
 * the grid are still running — their tmux pane is alive on the VPS, we just
 * unmount the xterm.js instance to keep RAM bounded.
 */
import { useCallback, useEffect, useMemo, useState } from "react"
import { Plus, Loader2, Square, LayoutGrid, Maximize2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { SessionList, type SessionRow } from "@/components/terminals/session-list"
import { TerminalPane } from "@/components/terminals/terminal-pane"

interface CreateResponse {
  id: string
  title: string
  branch: string
  worktree_path: string
  ws_url: string
  token: string
  created_at: string
}

type Layout = 1 | 4 | 9 | 16

const LAYOUTS: { n: Layout; label: string; cols: string }[] = [
  { n: 1, label: "1 pane", cols: "grid-cols-1" },
  { n: 4, label: "2x2", cols: "grid-cols-2" },
  { n: 9, label: "3x3", cols: "grid-cols-3" },
  { n: 16, label: "4x4", cols: "grid-cols-4" },
]

// Per-session connection details we got back from POST /api/terminals.
// Cached so reopening an existing session doesn't require another create call.
interface Connection {
  ws_url: string
  token: string
}

export function TerminalsWorkspace() {
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [layout, setLayout] = useState<Layout>(1)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  /** Sessions to render right now in the grid. Bounded to `layout`. */
  const [visibleIds, setVisibleIds] = useState<string[]>([])
  /** Per-session WS url + token, populated on create. For sessions loaded
   *  from list-on-mount we hydrate this lazily from a fresh POST… (Phase 2:
   *  add a GET that returns connection info without creating). */
  const [connections, setConnections] = useState<Record<string, Connection>>({})

  // ─── Data fetch ────────────────────────────────────────────────────

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/terminals", { cache: "no-store" })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      const data = (await res.json()) as {
        sessions: Array<SessionRow & { ws_url?: string; token?: string }>
      }
      const list = data.sessions || []
      setSessions(list.map((s) => ({
        id: s.id, title: s.title, branch: s.branch,
        status: s.status, created_at: s.created_at, last_activity_at: s.last_activity_at,
      })))
      // Hydrate connection details for each existing session so reload-attach
      // works without a fresh POST.
      setConnections((cur) => {
        const next = { ...cur }
        for (const s of list) {
          if (s.ws_url && s.token && !next[s.id]) {
            next[s.id] = { ws_url: s.ws_url, token: s.token }
          }
        }
        return next
      })
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 15_000)
    return () => clearInterval(id)
  }, [refresh])

  // ─── Visible-grid management ──────────────────────────────────────

  // When sessions list updates, ensure visibleIds doesn't reference dead sessions.
  useEffect(() => {
    setVisibleIds((cur) => cur.filter((id) => sessions.some((s) => s.id === id)))
    // If nothing is focused, focus the most recent session.
    if (!focusedId && sessions.length > 0) {
      setFocusedId(sessions[0].id)
    }
  }, [sessions, focusedId])

  // When layout shrinks, drop trailing visible ids. When it grows, top-up from
  // the session list (most-recent first).
  useEffect(() => {
    setVisibleIds((cur) => {
      const wanted = layout
      if (cur.length === wanted) return cur
      if (cur.length > wanted) return cur.slice(0, wanted)
      const fill = sessions
        .filter((s) => !cur.includes(s.id))
        .map((s) => s.id)
        .slice(0, wanted - cur.length)
      return [...cur, ...fill]
    })
  }, [layout, sessions])

  const focusSession = (id: string) => {
    setFocusedId(id)
    // Promote into visible grid: replace the first slot with this id, swapping
    // out whatever was there. Keeps the rest of the grid stable so other panes
    // don't unmount unnecessarily.
    setVisibleIds((cur) => {
      if (cur.includes(id)) return cur
      if (cur.length < layout) return [id, ...cur]
      return [id, ...cur.slice(0, -1)]
    })
  }

  // ─── Create / stop / rename ────────────────────────────────────────

  const createSession = async () => {
    setCreating(true)
    try {
      const res = await fetch("/api/terminals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
      const data = body as CreateResponse
      // Cache the connection details for this new session.
      setConnections((c) => ({ ...c, [data.id]: { ws_url: data.ws_url, token: data.token } }))
      toast.success("Terminal started", { description: data.title })
      await refresh()
      focusSession(data.id)
    } catch (e) {
      toast.error("Couldn't start terminal", {
        description: e instanceof Error ? e.message : String(e),
      })
    } finally {
      setCreating(false)
    }
  }

  const stopSession = async (id: string) => {
    try {
      const res = await fetch(`/api/terminals/${id}`, { method: "DELETE" })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      toast.success("Terminal stopped")
      // Optimistic: drop locally before refetch.
      setSessions((s) => s.filter((x) => x.id !== id))
      setVisibleIds((v) => v.filter((x) => x !== id))
      if (focusedId === id) setFocusedId(null)
      await refresh()
    } catch (e) {
      toast.error("Stop failed", { description: e instanceof Error ? e.message : String(e) })
    }
  }

  const renameSession = async (id: string, title: string) => {
    try {
      const res = await fetch(`/api/terminals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      setSessions((s) => s.map((x) => (x.id === id ? { ...x, title } : x)))
    } catch (e) {
      toast.error("Rename failed", { description: e instanceof Error ? e.message : String(e) })
    }
  }

  const stopAll = async () => {
    if (sessions.length === 0) return
    if (!window.confirm(`Stop all ${sessions.length} terminals? Branches are preserved.`)) return
    await Promise.all(sessions.map((s) => stopSession(s.id)))
  }

  // ─── Resize handler — push viewport size to VPS ──────────────────

  const handleResize = useCallback(async (id: string, cols: number, rows: number) => {
    try {
      await fetch(`/api/terminals/${id}/resize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cols, rows }),
      })
    } catch {
      // Resize failures aren't user-visible — tmux keeps working at the old
      // size; just slightly off-screen rendering.
    }
  }, [])

  // ─── Render ───────────────────────────────────────────────────────

  const visibleSessions = useMemo(
    () => visibleIds.map((id) => sessions.find((s) => s.id === id)).filter(Boolean) as SessionRow[],
    [visibleIds, sessions],
  )

  const currentLayout = LAYOUTS.find((l) => l.n === layout) || LAYOUTS[0]

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-zinc-800/60 shrink-0 bg-zinc-950/90 backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="text-zinc-400 text-sm">🖥️</span>
          <span className="text-sm font-semibold text-zinc-100">Terminals</span>
          <span className="text-[11px] text-zinc-500">
            {sessions.length} active
          </span>
        </div>
        <div className="flex items-center gap-1">
          {/* Layout selector */}
          <div className="hidden sm:flex items-center gap-0.5 mr-2 rounded-md border border-zinc-800 bg-zinc-900/50 p-0.5">
            {LAYOUTS.map((l) => (
              <button
                key={l.n}
                onClick={() => setLayout(l.n)}
                className={cn(
                  "px-2 py-1 text-[11px] rounded transition-colors",
                  layout === l.n
                    ? "bg-amber-500/20 text-amber-100"
                    : "text-zinc-400 hover:text-zinc-100",
                )}
                title={l.label}
              >
                {l.n === 1 ? <Maximize2 className="w-3 h-3 inline" /> : l.label}
              </button>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={createSession}
            disabled={creating || sessions.length >= 16}
            className="text-zinc-300 hover:text-amber-100 hover:bg-amber-500/10"
          >
            {creating ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Plus className="w-3.5 h-3.5 mr-1.5" />
            )}
            New terminal
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={stopAll}
            disabled={sessions.length === 0}
            className="text-zinc-400 hover:text-red-300 hover:bg-red-500/10"
            title="Stop all terminals"
          >
            <Square className="w-3.5 h-3.5 mr-1.5" />
            Stop all
          </Button>
        </div>
      </div>

      {/* Body: sidebar + grid */}
      <div className="flex-1 flex min-h-0">
        {/* Sidebar */}
        <div className="w-[260px] sm:w-[300px] shrink-0 border-r border-zinc-800/60 overflow-hidden flex flex-col">
          <SessionList
            sessions={sessions}
            focusedId={focusedId}
            loading={loading}
            onFocus={focusSession}
            onRename={renameSession}
            onStop={stopSession}
          />
        </div>

        {/* Grid */}
        <div className="flex-1 min-w-0 p-2">
          {error && (
            <Card className="p-4 m-2 border-red-900/50 bg-red-950/20 text-red-300 text-sm">
              <div className="font-medium mb-1">Couldn&apos;t reach the terminal-server</div>
              <div className="text-xs text-zinc-400 break-all">{error}</div>
              <div className="text-xs text-zinc-500 mt-2">
                Set <code className="bg-zinc-800/60 px-1 rounded">TERMINAL_RUNNER_URL</code> and{" "}
                <code className="bg-zinc-800/60 px-1 rounded">TERMINAL_RUNNER_TOKEN</code> in the API Keys tab.
              </div>
            </Card>
          )}

          {!error && visibleSessions.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-zinc-500 text-sm text-center px-6">
              <LayoutGrid className="w-8 h-8 mb-3 text-zinc-700" />
              <div className="text-base font-medium text-zinc-300 mb-1">
                {sessions.length === 0
                  ? "No terminals yet"
                  : "Pick a terminal from the sidebar"}
              </div>
              <div className="text-xs text-zinc-500 max-w-md">
                {sessions.length === 0
                  ? "Each terminal runs in its own git branch on the VPS. Close your laptop — they keep going. Reopen — they're still there."
                  : "Or change the layout to show multiple at once."}
              </div>
              {sessions.length === 0 && (
                <Button onClick={createSession} disabled={creating} size="sm" className="mt-4">
                  {creating ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1.5" />}
                  Start your first terminal
                </Button>
              )}
            </div>
          )}

          {!error && visibleSessions.length > 0 && (
            <div className={cn("grid gap-2 h-full", currentLayout.cols)}>
              {visibleSessions.map((s) => {
                const conn = connections[s.id]
                return (
                  <Card
                    key={s.id}
                    className={cn(
                      "overflow-hidden p-0 flex flex-col bg-zinc-950 border-zinc-800/80",
                      focusedId === s.id && "ring-1 ring-amber-500/40",
                    )}
                    onClick={() => setFocusedId(s.id)}
                  >
                    <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-zinc-800/60 text-xs shrink-0 bg-zinc-900/60">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
                        <span className="font-medium text-zinc-200 truncate">{s.title}</span>
                        {s.branch && (
                          <span className="text-[10px] text-zinc-500 font-mono truncate hidden sm:inline">
                            {s.branch}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); stopSession(s.id) }}
                        className="text-zinc-500 hover:text-red-400 shrink-0"
                        title="Stop"
                      >
                        ×
                      </button>
                    </div>
                    <div className="flex-1 min-h-0 relative">
                      {conn ? (
                        <TerminalPane
                          sessionId={s.id}
                          wsUrl={conn.ws_url}
                          token={conn.token}
                          onResize={(cols, rows) => handleResize(s.id, cols, rows)}
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-zinc-500 text-xs">
                          <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                          Loading connection…
                        </div>
                      )}
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

