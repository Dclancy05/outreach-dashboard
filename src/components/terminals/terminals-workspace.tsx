"use client"

/**
 * The full Terminals workspace — sidebar + activity feed + grid.
 *
 * Phase 4 enterprise UX overhaul (2026-05-04) added:
 *   - Spawn presets (Bug fix / Build feature / Investigate) via SpawnDialog
 *   - Per-session color, icon, nickname surfaced in the per-pane header
 *   - 6-state lifecycle dot beside every session name
 *   - Drag-to-rearrange grid (dnd-kit) with localStorage-saved layouts
 *   - $ counter strip per pane (per-session + per-day)
 *   - file:line wiring → routes to /agency/memory?mode=code&file=… in the
 *     same Command Center
 *
 * Layout:
 *   ┌────────────────────────────────────────────────────────┐
 *   │ Top bar: count, +New (preset), layout selector,        │
 *   │          Layouts (save/load), Stop all                 │
 *   ├──────────┬─────────────────────────────────────────────┤
 *   │ Sidebar  │  Terminal grid (1, 4, 9, or 16 panes)       │
 *   │ (320px)  │  drag the header to rearrange.              │
 *   └──────────┴─────────────────────────────────────────────┘
 *
 * Mount-timing safety (BUG-005 fix): the grid is gated by a ResizeObserver
 * watching the grid container. Until non-zero contentRect, we render a
 * placeholder — protects xterm.open() from a 0×0 mount inside an animating
 * drawer.
 */
import * as React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Plus, Loader2, Square, Maximize2, PanelRightClose, PanelRightOpen,
  TerminalSquare, Zap, Server, KeyRound, AlertTriangle, GripVertical,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors,
  closestCenter,
} from "@dnd-kit/core"
import { SortableContext, useSortable, rectSortingStrategy, arrayMove } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { SessionList, type SessionRow } from "@/components/terminals/session-list"
import { ActivityFeed } from "@/components/terminals/activity-feed"
import { TerminalPane } from "@/components/terminals/terminal-pane"
import { Skeleton } from "@/components/ui/skeleton"
import { SpawnDialog } from "@/components/terminals/spawn-dialog"
import { LayoutsMenu } from "@/components/terminals/layouts-menu"
import { CostTodayStrip } from "@/components/terminals/cost-today-strip"
import {
  type LayoutSize, type SavedLayout,
  readCurrentLayout, writeCurrentLayout,
} from "@/components/terminals/layouts-store"
import {
  colorClasses, iconFor, deriveLifecycle, LIFECYCLE_META,
} from "@/components/terminals/terminal-style"

interface CreateResponse {
  id: string
  title: string
  branch: string
  worktree_path: string
  /** wss:// URL with `?token=` already embedded by /api/terminals. */
  ws_url: string
  created_at: string
}

const LAYOUTS: { n: LayoutSize; label: string; cols: string }[] = [
  { n: 1, label: "1 pane", cols: "grid-cols-1" },
  { n: 4, label: "2x2", cols: "grid-cols-2" },
  { n: 9, label: "3x3", cols: "grid-cols-3" },
  { n: 16, label: "4x4", cols: "grid-cols-4" },
]

interface Connection {
  ws_url: string
}

interface Props {
  /** Phase 4 #5: Cmd+K palette deep-link `?focus=<id>` lands here. */
  focusOnMount?: string | null
}

export function TerminalsWorkspace({ focusOnMount }: Props = {}) {
  const router = useRouter()
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  /** Hydrate from localStorage so a refresh keeps the layout the user picked. */
  const initial = typeof window !== "undefined" ? readCurrentLayout() : null
  const [layout, setLayout] = useState<LayoutSize>((initial?.size as LayoutSize) || 1)
  const [focusedId, setFocusedId] = useState<string | null>(focusOnMount || null)
  const [visibleIds, setVisibleIds] = useState<string[]>(initial?.visibleIds || [])
  const [connections, setConnections] = useState<Record<string, Connection>>({})
  const [capacity, setCapacity] = useState<{ active: number; hard_max: number; soft_max: number } | null>(null)
  const [spawnOpen, setSpawnOpen] = useState(false)
  const [activityOpen, setActivityOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true
    return window.localStorage.getItem("terminals.activityOpen") !== "false"
  })

  const gridContainerRef = useRef<HTMLDivElement | null>(null)
  const [gridReady, setGridReady] = useState(false)

  useEffect(() => {
    const el = gridContainerRef.current
    if (!el) return
    if (el.clientWidth > 0 && el.clientHeight > 0) {
      setGridReady(true)
      return
    }
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

  // Persist current layout shape to localStorage so refresh preserves it.
  useEffect(() => {
    writeCurrentLayout(layout, visibleIds)
  }, [layout, visibleIds])

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
        status: s.status, lifecycle_state: s.lifecycle_state,
        created_at: s.created_at, last_activity_at: s.last_activity_at,
        cost_usd: s.cost_usd, cost_cap_usd: s.cost_cap_usd, paused_reason: s.paused_reason,
        color: s.color, icon: s.icon, nickname: s.nickname,
      })))
      if (data.capacity) setCapacity(data.capacity)
      // Only build a new connections object when there's actually a new session
      // to add — otherwise return the same reference so React skips the render.
      // Was: always shipped a new object every refresh, which forced the entire
      // workspace tree to re-render on every interval and was a major lag source
      // when interleaved with xterm output.
      setConnections((cur) => {
        let next: Record<string, Connection> | null = null
        for (const s of list) {
          if (s.ws_url && !cur[s.id]) {
            if (next === null) next = { ...cur }
            next[s.id] = { ws_url: s.ws_url }
          }
        }
        return next ?? cur
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
    // 30s poll (was 15s — terminals don't appear/disappear that often, the
    // refresh was the dominant cause of recurring parent re-renders).
    const id = setInterval(refresh, 30_000)
    return () => clearInterval(id)
  }, [refresh])

  // ─── Visible-grid management ──────────────────────────────────────

  useEffect(() => {
    setVisibleIds((cur) => cur.filter((id) => sessions.some((s) => s.id === id)))
    if (!focusedId && sessions.length > 0) {
      setFocusedId(sessions[0].id)
    }
  }, [sessions, focusedId])

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

  const focusSession = useCallback((id: string) => {
    setFocusedId(id)
    setVisibleIds((cur) => {
      if (cur.includes(id)) return cur
      if (cur.length < layout) return [id, ...cur]
      return [id, ...cur.slice(0, -1)]
    })
  }, [layout])

  // Honour `focusOnMount` (e.g. ?focus= deep-link from Cmd+K) once the session
  // shows up in the list.
  useEffect(() => {
    if (!focusOnMount) return
    if (sessions.find((s) => s.id === focusOnMount)) {
      focusSession(focusOnMount)
    }
  }, [focusOnMount, sessions, focusSession])

  // ─── Create / stop / rename / customise ────────────────────────────

  const createBlankSession = async () => {
    try {
      const res = await fetch("/api/terminals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
      const data = body as CreateResponse
      setConnections((c) => ({ ...c, [data.id]: { ws_url: data.ws_url } }))
      toast.success("Terminal started", { description: data.title })
      await refresh()
      focusSession(data.id)
    } catch (e) {
      toast.error("Couldn't start terminal", {
        description: e instanceof Error ? e.message : String(e),
      })
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

  /** Optimistic patch — used by the customise dialog. */
  const applyCustomization = (id: string, patch: { color?: string | null; icon?: string | null; nickname?: string | null }) => {
    setSessions((s) => s.map((x) => (x.id === id ? { ...x, ...patch } : x)))
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
      /* resize failures aren't user-visible */
    }
  }, [])

  // ─── file:line wiring (Phase 4 #12) ────────────────────────────────

  const openFile = useCallback((path: string, line?: number, _col?: number) => {
    // Route to the Code mode of the same Command Center. The Code mode reads
    // ?file= and renders the corresponding source. Line/col aren't surfaced
    // (yet) — when the Code viewer grows a goto-line API we'll add #L<line>.
    const params = new URLSearchParams()
    params.set("mode", "code")
    params.set("file", path)
    if (line) params.set("line", String(line))
    router.push(`/agency/memory?${params.toString()}`)
  }, [router])

  // ─── Drag to rearrange ─────────────────────────────────────────────

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    setVisibleIds((cur) => {
      const oldIndex = cur.indexOf(String(active.id))
      const newIndex = cur.indexOf(String(over.id))
      if (oldIndex < 0 || newIndex < 0) return cur
      return arrayMove(cur, oldIndex, newIndex)
    })
  }

  // ─── Render ───────────────────────────────────────────────────────

  const visibleSessions = useMemo(
    () => visibleIds.map((id) => sessions.find((s) => s.id === id)).filter(Boolean) as SessionRow[],
    [visibleIds, sessions],
  )

  const currentLayout = LAYOUTS.find((l) => l.n === layout) || LAYOUTS[0]

  const onLoadLayout = (l: SavedLayout) => {
    setLayout(l.size)
    // Filter out ids that no longer exist; pad with most-recent sessions.
    const live = l.visibleIds.filter((id) => sessions.some((s) => s.id === id))
    const fill = sessions
      .filter((s) => !live.includes(s.id))
      .map((s) => s.id)
      .slice(0, l.size - live.length)
    setVisibleIds([...live, ...fill])
    toast.success("Layout loaded", { description: l.name })
  }

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-zinc-800/60 shrink-0 bg-zinc-950/90 backdrop-blur">
        <div className="flex items-center gap-2">
          <TerminalSquare className="w-5 h-5 text-cyan-400" />
          <h1 className="text-lg font-semibold text-zinc-100">Terminals</h1>
          <span className="text-xs text-zinc-500 hidden sm:inline">
            — parallel claudes that survive your laptop close
          </span>
          <span className="hidden md:inline text-[10px] text-zinc-500 ml-2">
            ⌘K to spawn / focus
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
          <LayoutsMenu size={layout} visibleIds={visibleIds} onLoad={onLoadLayout} />
          <Button
            size="sm"
            onClick={() => setSpawnOpen(true)}
            disabled={
              (capacity ? sessions.length >= capacity.soft_max : sessions.length >= 8) ||
              !!error
            }
            className="bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-100 border border-cyan-500/30 disabled:opacity-50"
            title={
              capacity && sessions.length >= capacity.soft_max
                ? `VPS at capacity (${capacity.active}/${capacity.soft_max}) — stop a session first`
                : "Spawn a new terminal (preset)"
            }
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
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
              onCustomized={applyCustomization}
            />
          )}
        </div>

        {/* Right rail: Activity Feed (collapsible) */}
        {activityOpen && (
          <div className="hidden lg:flex w-[300px] xl:w-[340px] shrink-0 border-l border-zinc-800/60 overflow-hidden flex-col order-last">
            <ActivityFeed
              sessionTitles={Object.fromEntries(sessions.map((s) => [s.id, s.nickname?.trim() || s.title]))}
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
                    onClick={() => setSpawnOpen(true)}
                    size="sm"
                    className="bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-100 border border-cyan-500/30"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1.5" />
                    Start your first terminal
                  </Button>
                </>
              )}
            </div>
          )}

          {!error && visibleSessions.length > 0 && (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={visibleIds} strategy={rectSortingStrategy}>
                <div className={cn("grid gap-2 h-full", currentLayout.cols)}>
                  {visibleSessions.map((s) => {
                    const conn = connections[s.id]
                    return (
                      <SortablePane
                        key={s.id}
                        session={s}
                        focused={focusedId === s.id}
                        connection={conn}
                        gridReady={gridReady}
                        // handleResize takes (id, cols, rows). SortablePane
                        // constructs a stable per-session closure internally
                        // so React.memo can short-circuit when nothing else
                        // about this pane changed.
                        onResizeWithId={handleResize}
                        onFocusId={setFocusedId}
                        onStopId={stopSession}
                        onOpenFile={openFile}
                      />
                    )
                  })}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>

      <SpawnDialog
        open={spawnOpen}
        onOpenChange={setSpawnOpen}
        onSpawned={async (data) => {
          setConnections((c) => ({ ...c, [data.id]: { ws_url: data.ws_url } }))
          await refresh()
          focusSession(data.id)
        }}
      />

      {/* Bare blank-spawn fallback for keyboard users — Cmd+K → "New terminal"
          calls /api/terminals directly (no preset). Hidden but keeps the
          imperative entrypoint alive for downstream UIs. */}
      <button hidden onClick={createBlankSession} aria-hidden />
    </div>
  )
}

/* ─── A single draggable pane ────────────────────────────────────────────── */

interface SortablePaneProps {
  session: SessionRow
  focused: boolean
  connection?: Connection
  gridReady: boolean
  // ID-keyed callbacks — these are stable references across parent re-renders
  // (parent uses useCallback). SortablePane constructs the per-session closure
  // internally via useCallback so React.memo's prop check passes.
  onResizeWithId: (id: string, cols: number, rows: number) => void
  onFocusId: (id: string) => void
  onStopId: (id: string) => Promise<void>
  onOpenFile: (path: string, line?: number, col?: number) => void
}

// React.memo to skip re-rendering when nothing about THIS pane changed.
// Without it, every parent state change (refresh tick, focus shift, etc.)
// re-runs the entire SortablePane body for every visible pane — feels laggy
// when there are 4+ open at once and the parent ticks every 30s.
const SortablePane = React.memo(SortablePaneImpl)

function SortablePaneImpl({
  session: s, focused, connection: conn, gridReady,
  onResizeWithId, onFocusId, onStopId, onOpenFile,
}: SortablePaneProps) {
  const onFocus = useCallback(() => onFocusId(s.id), [onFocusId, s.id])
  const onStop = useCallback(() => { void onStopId(s.id) }, [onStopId, s.id])
  const onResize = useCallback(
    (cols: number, rows: number) => onResizeWithId(s.id, cols, rows),
    [onResizeWithId, s.id],
  )
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: s.id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }
  const colors = colorClasses(s.color)
  const Icon = iconFor(s.icon)
  const lifecycle = deriveLifecycle(s)
  const lc = LIFECYCLE_META[lifecycle]
  const displayName = s.nickname?.trim() || s.title
  const sessionCost = Number(s.cost_usd ?? 0)
  const sessionCap = Number(s.cost_cap_usd ?? 5)

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        "overflow-hidden p-0 flex flex-col bg-zinc-950 border-zinc-800/80",
        focused && "ring-1 " + colors.ring,
      )}
      onClick={onFocus}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-zinc-800/60 text-xs shrink-0 bg-zinc-900/60">
        <div className="flex items-center gap-2 min-w-0">
          {/* Drag handle — only this triggers drag, so clicks elsewhere on the
              header still focus the pane. */}
          <button
            {...attributes}
            {...listeners}
            className="text-zinc-600 hover:text-zinc-300 cursor-grab active:cursor-grabbing shrink-0 -ml-1 p-0.5"
            title="Drag to rearrange"
            aria-label="Drag handle"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="w-3.5 h-3.5" />
          </button>
          <span
            className={cn("h-1.5 w-1.5 rounded-full shrink-0", lc.dot, lc.pulse && "animate-pulse")}
            title={lc.label}
          />
          <Icon className={cn("w-3.5 h-3.5 shrink-0", colors.text)} />
          <span className="font-medium text-zinc-200 truncate">{displayName}</span>
          {s.branch && (
            <span className="text-[10px] text-zinc-500 font-mono truncate hidden sm:inline">
              {s.branch}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <CostTodayStrip sessionCost={sessionCost} sessionCap={sessionCap} />
          <button
            onClick={(e) => { e.stopPropagation(); onStop() }}
            className="text-zinc-500 hover:text-red-400 shrink-0"
            title="Stop"
          >
            ×
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 relative">
        {conn ? (
          gridReady ? (
            <TerminalPane
              sessionId={s.id}
              wsUrl={conn.ws_url}
              onResize={onResize}
              onOpenFile={onOpenFile}
            />
          ) : (
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
              Apply the SQL migrations under <code className="text-xs text-zinc-400">supabase/migrations/20260430_terminal_sessions*.sql</code> + the <code className="text-xs text-zinc-400">20260504_terminal_*.sql</code> set
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
