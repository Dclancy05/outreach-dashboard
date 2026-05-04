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
 *
 * Mount-timing safety (BUG-005 fix):
 * `<TerminalPane>` calls `xterm.Terminal#open()` synchronously in its mount
 * effect. xterm reads `clientWidth`/`clientHeight` from the container at that
 * moment to size its renderer; if those are zero (because we're inside a
 * drawer that's still animating from `x:100%` to `0`, or the parent has
 * `display:none`/`hidden`/`opacity:0`), xterm crashes later with
 * `Cannot read properties of undefined (reading 'dimensions')` — every time
 * its Viewport tries to recompute scroll on a never-sized renderer.
 *
 * Mitigation: gate the grid that hosts `<TerminalPane>` behind a
 * `ResizeObserver` watching the grid container. Until we observe a non-zero
 * `contentRect`, we render a tiny placeholder. The pane (and therefore
 * xterm.open) only mounts once the container has real dimensions. After
 * first non-zero observation we keep the panes mounted — `<TerminalPane>`
 * has its own ResizeObserver that handles subsequent resizes via fit().
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Plus, Loader2, Square, Maximize2, PanelRightClose, PanelRightOpen, TerminalSquare, Zap, Server, KeyRound, AlertTriangle } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { SessionList, type SessionRow } from "@/components/terminals/session-list"
import { ActivityFeed } from "@/components/terminals/activity-feed"
import { TerminalPane } from "@/components/terminals/terminal-pane"
import { Skeleton } from "@/components/ui/skeleton"

interface CreateResponse {
  id: string
  title: string
  branch: string
  worktree_path: string
  /** wss:// URL with `?token=` already embedded by /api/terminals. */
  ws_url: string
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
// Token is now embedded in ws_url as `?token=` — see /api/terminals route.
interface Connection {
  ws_url: string
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
  /** VPS-aware concurrency state. The terminal-server reads /proc/meminfo and
   *  computes a soft cap; we surface "x of y" + disable + Newterminal when
   *  full. Falls back to the hard cap if the VPS doesn't return capacity. */
  const [capacity, setCapacity] = useState<{ active: number; hard_max: number; soft_max: number } | null>(null)
  /** Right rail Activity Feed visibility. Saved to localStorage so it stays
   *  open across reloads. */
  const [activityOpen, setActivityOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true
    return window.localStorage.getItem("terminals.activityOpen") !== "false"
  })

  /**
   * Grid-container "ready" gate — see BUG-005 doc above.
   * `gridReady` flips true on the first ResizeObserver tick where the grid
   * container has non-zero clientWidth and clientHeight. Until then we render
   * a no-op placeholder instead of `<TerminalPane>` so xterm.open() never
   * runs against a 0×0 element.
   */
  const gridContainerRef = useRef<HTMLDivElement | null>(null)
  const [gridReady, setGridReady] = useState(false)

  useEffect(() => {
    const el = gridContainerRef.current
    if (!el) return

    // Fast-path: container is already sized (typical for /agency/terminals
    // and /jarvis/terminals — full-screen mounts), skip waiting.
    if (el.clientWidth > 0 && el.clientHeight > 0) {
      setGridReady(true)
      return
    }

    // Slow-path (drawer / hidden mount): wait until we observe non-zero
    // dimensions. This is the actual BUG-005 trigger — terminals-drawer
    // mounts the workspace inside an `AnimatePresence` panel sliding in from
    // `x:100%`, and on the Memory page the drawer can be mounted before its
    // panel has any layout box.
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) {
        setGridReady(true)
        ro.disconnect()
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ─── Data fetch ────────────────────────────────────────────────────

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/terminals", { cache: "no-store" })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      const data = (await res.json()) as {
        sessions: Array<SessionRow & { ws_url?: string }>
        capacity?: { active: number; hard_max: number; soft_max: number }
      }
      const list = data.sessions || []
      setSessions(list.map((s) => ({
        id: s.id, title: s.title, branch: s.branch,
        status: s.status, created_at: s.created_at, last_activity_at: s.last_activity_at,
        cost_usd: s.cost_usd, cost_cap_usd: s.cost_cap_usd, paused_reason: s.paused_reason,
      })))
      if (data.capacity) setCapacity(data.capacity)
      // Hydrate connection details for each existing session so reload-attach
      // works without a fresh POST.
      setConnections((cur) => {
        const next = { ...cur }
        for (const s of list) {
          if (s.ws_url && !next[s.id]) {
            next[s.id] = { ws_url: s.ws_url }
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
      setConnections((c) => ({ ...c, [data.id]: { ws_url: data.ws_url } }))
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
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-zinc-800/60 shrink-0 bg-zinc-950/90 backdrop-blur">
        <div className="flex items-center gap-2">
          <TerminalSquare className="w-5 h-5 text-cyan-400" />
          <h1 className="text-lg font-semibold text-zinc-100">Terminals</h1>
          <span className="text-xs text-zinc-500 hidden sm:inline">— parallel claudes that survive your laptop close</span>
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
                    ? "bg-cyan-500/20 text-cyan-100"
                    : "text-zinc-400 hover:text-zinc-100",
                )}
                title={l.label}
              >
                {l.n === 1 ? <Maximize2 className="w-3 h-3 inline" /> : l.label}
              </button>
            ))}
          </div>
          {capacity && (
            <span className="hidden md:inline text-[11px] text-zinc-500 mr-2" title="VPS-aware soft cap (RAM headroom)">
              {capacity.active} / {capacity.soft_max}
            </span>
          )}
          <Button
            size="sm"
            onClick={createSession}
            disabled={
              creating ||
              (capacity ? sessions.length >= capacity.soft_max : sessions.length >= 8) ||
              !!error
            }
            className="bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-100 border border-cyan-500/30 disabled:opacity-50"
            title={
              capacity && sessions.length >= capacity.soft_max
                ? `VPS at capacity (${capacity.active}/${capacity.soft_max}) — stop a session first`
                : "Spawn a new terminal"
            }
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
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setActivityOpen((v) => {
                const next = !v
                try { window.localStorage.setItem("terminals.activityOpen", String(next)) } catch { /* */ }
                return next
              })
            }}
            className="hidden lg:inline-flex text-zinc-400 hover:text-cyan-100 hover:bg-cyan-500/10"
            title={activityOpen ? "Hide activity feed" : "Show activity feed"}
          >
            {activityOpen ? <PanelRightClose className="w-3.5 h-3.5" /> : <PanelRightOpen className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>

      {/* Body: sidebar + grid + activity feed */}
      <div className="flex-1 flex min-h-0">
        {/* Sidebar */}
        <div className="w-[260px] sm:w-[300px] shrink-0 border-r border-zinc-800/60 overflow-hidden flex flex-col">
          {loading && sessions.length === 0 ? (
            // While the very first /api/terminals fetch is in flight, show a
            // 3-row skeleton mimicking the session card shape so the layout
            // doesn't jump when data lands. Once any data arrives or loading
            // flips false, the real <SessionList /> takes over.
            <div className="p-3 space-y-2" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 p-2 rounded-md border border-zinc-800/60 bg-zinc-900/30"
                >
                  <Skeleton className="h-1.5 w-1.5 rounded-full shrink-0" />
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <Skeleton className="h-3 w-3/4" />
                    <Skeleton className="h-2 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <SessionList
              sessions={sessions}
              focusedId={focusedId}
              loading={loading}
              onFocus={focusSession}
              onRename={renameSession}
              onStop={stopSession}
            />
          )}
        </div>

        {/* Right rail: Activity Feed (collapsible) */}
        {activityOpen && (
          <div className="hidden lg:flex w-[300px] xl:w-[340px] shrink-0 border-l border-zinc-800/60 overflow-hidden flex-col order-last">
            <ActivityFeed
              sessionTitles={Object.fromEntries(sessions.map((s) => [s.id, s.title]))}
            />
          </div>
        )}

        {/* Grid — gated by ResizeObserver so xterm never opens at 0×0 */}
        <div ref={gridContainerRef} className="flex-1 min-w-0 p-3">
          {error && <SetupOrErrorCard error={error} />}

          {!error && visibleSessions.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mb-5">
                <TerminalSquare className="w-7 h-7 text-cyan-400" />
              </div>
              <div className="text-xl font-semibold text-zinc-100 mb-2">
                {sessions.length === 0
                  ? "Your parallel-claude workspace"
                  : "Pick a terminal from the sidebar"}
              </div>
              <div className="text-sm text-zinc-400 max-w-lg leading-relaxed">
                {sessions.length === 0 ? (
                  <>
                    Spawn a Claude session per task. Each one runs on its own git branch on the VPS,
                    aware of what its siblings are working on, with a $5 cost cap baked in.
                    Close your laptop — they keep going.
                  </>
                ) : (
                  "Or change the layout to show 4 / 9 / 16 panes at once."
                )}
              </div>
              {sessions.length === 0 && (
                <>
                  <div className="flex items-center gap-6 mt-6 mb-6 text-xs text-zinc-500">
                    <FeatureChip icon={Zap} label="Persistent across laptop close" />
                    <FeatureChip icon={Server} label="Isolated git worktrees" />
                  </div>
                  <Button
                    onClick={createSession}
                    disabled={creating}
                    size="sm"
                    className="bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-100 border border-cyan-500/30"
                  >
                    {creating ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1.5" />}
                    Start your first terminal
                  </Button>
                </>
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
                      focusedId === s.id && "ring-1 ring-cyan-500/40",
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
                        gridReady ? (
                          <TerminalPane
                            sessionId={s.id}
                            wsUrl={conn.ws_url}
                            onResize={(cols, rows) => handleResize(s.id, cols, rows)}
                          />
                        ) : (
                          // BUG-005: container hasn't laid out yet. Show a
                          // skeleton instead of mounting xterm into a 0×0 box.
                          <div className="absolute inset-0 flex items-center justify-center text-zinc-500 text-xs">
                            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                            Sizing terminal…
                          </div>
                        )
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

function FeatureChip({ icon: Icon, label }: { icon: typeof TerminalSquare; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-zinc-400">
      <Icon className="w-3.5 h-3.5 text-cyan-400/70" />
      {label}
    </span>
  )
}

function SetupOrErrorCard({ error }: { error: string }) {
  // Two distinct error shapes from /api/terminals:
  //   1. 503 — TERMINAL_RUNNER_URL/TOKEN not configured. First-time setup.
  //   2. 502 — service unreachable. VPS down or Funnel path missing.
  const needsSetup = /not configured|TERMINAL_RUNNER/.test(error)
  if (needsSetup) {
    return (
      <div className="max-w-2xl mx-auto mt-12">
        <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-cyan-500/15 flex items-center justify-center shrink-0">
              <KeyRound className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <div className="text-base font-semibold text-zinc-100 mb-0.5">One-time setup</div>
              <div className="text-xs text-zinc-400">
                Connect this page to the VPS that runs your terminals.
              </div>
            </div>
          </div>
          <ol className="space-y-3 text-sm text-zinc-300 mb-5">
            <SetupStep n={1}>
              Deploy <code className="px-1.5 py-0.5 rounded bg-zinc-800/80 text-cyan-300 text-xs">terminal-server</code> on srv1197943 — full walkthrough at <code className="text-xs text-zinc-400">DEPLOY_VPS_TERMINAL_SERVER.md</code> in the repo
            </SetupStep>
            <SetupStep n={2}>
              Apply the 3 SQL migrations under <code className="text-xs text-zinc-400">supabase/migrations/20260430_terminal_sessions*.sql</code>
            </SetupStep>
            <SetupStep n={3}>
              Add <code className="px-1.5 py-0.5 rounded bg-zinc-800/80 text-cyan-300 text-xs">TERMINAL_RUNNER_URL</code> + <code className="px-1.5 py-0.5 rounded bg-zinc-800/80 text-cyan-300 text-xs">TERMINAL_RUNNER_TOKEN</code> in the API Keys tab
            </SetupStep>
          </ol>
          <Link
            href="/agency/memory#api-keys"
            className="inline-flex items-center gap-1.5 text-xs text-cyan-300 hover:text-cyan-100 underline-offset-4 hover:underline"
          >
            <KeyRound className="w-3.5 h-3.5" />
            Open the API Keys tab →
          </Link>
        </div>
      </div>
    )
  }
  return (
    <div className="max-w-2xl mx-auto mt-12">
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-base font-semibold text-zinc-100 mb-1">VPS service is down</div>
            <div className="text-xs text-zinc-400 break-all mb-3">{error}</div>
            <div className="text-xs text-zinc-500 leading-relaxed">
              On the VPS, run <code className="px-1.5 py-0.5 rounded bg-zinc-800/80 text-zinc-300">systemctl status terminal-server</code>.
              Or check Tailscale Funnel exposes <code className="px-1.5 py-0.5 rounded bg-zinc-800/80 text-zinc-300">:8443/terminals</code> with{" "}
              <code className="px-1.5 py-0.5 rounded bg-zinc-800/80 text-zinc-300">tailscale funnel status</code>.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function SetupStep({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-200 text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">
        {n}
      </span>
      <span className="leading-relaxed">{children}</span>
    </li>
  )
}
