"use client"
/**
 * /agency/memory — the unified Command Center (4-pane vault, v3).
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ Header: title · filter chips · VPS · Search · 🔔 · ⚙ · 💻    │
 *   ├─────────────┬─────────────────────────────────┬──────────────┤
 *   │             │                                 │              │
 *   │  Sidebar    │  Center pane (mode-driven)      │  Right rail  │
 *   │  (mode-     │  - knowledge → FileEditor       │  (mode-aware)│
 *   │   aware)    │  - code      → CodeFileViewer   │              │
 *   │             │  - convos    → FileEditor       │              │
 *   │             │  - agents    → AgentWorkflows   │              │
 *   │             │  - terminals → TerminalsWS      │              │
 *   │             │  - all       → AllModeLanding   │              │
 *   │             │  ┌───────────────────────────┴──────────────┐  │
 *   │             │  │ Time Machine scrubber (knowledge/code)   │  │
 *   │             │  └──────────────────────────────────────────┘  │
 *   └─────────────┴────────────────────────────────────────────────┘
 *
 * Filter chips (modes):
 *   All · Knowledge · Code · Conversations · Agents · Terminals · Inbox folder
 *
 * Phase 3 (Command Center unify, 2026-05-04):
 *   - Added `agents` + `terminals` modes — they used to live at /agency/agents
 *     and /agency/terminals. Both routes now redirect here with `?mode=` set.
 *   - Centre pane is delegated to <CenterPane mode={...}/> for clarity.
 *   - Sidebar swaps shape:
 *       knowledge/convos/inbox → TreeView
 *       code                   → CodeTreeView / PagesView
 *       agents                 → AgentsSidebar (list of agents)
 *       terminals              → SessionList (parallel-claude sessions)
 *   - Right rail swaps tabs:
 *       agents    → AgentsRightRail (Runs · Health · Info)
 *       terminals → TerminalsRightRail (Activity · Siblings)
 *       other     → RightRail (Chat · Info · History · Memories)
 *   - Mode persisted in URL: `?mode=agents` etc. — survives refresh,
 *     deep-linkable, plays nicely with hash deep-links from the legacy split.
 *   - Keyboard shortcuts: `g k / c / v / a / t` switch modes from anywhere
 *     outside an editable target.
 *
 * Mobile (<lg): pane-stack navigator (sidebar → center → rail).
 * Tablet (sm-lg): 2-pane (sidebar + center) with right rail collapsed to 48px.
 *
 * Hash redirects (top of page):
 *   #agent-workflows*  → ?mode=agents (new) — used to be /agency/agents
 *   #api-keys          → /agency/integrations#api-keys (route doesn't exist
 *                        yet — falls through to /agency/team for now)
 */
import * as React from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import {
  Brain, Settings as SettingsIcon, TerminalSquare, Search, MessageSquare,
} from "lucide-react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { toast } from "sonner"

import { listPersonas, listMemories, type Memory } from "@/lib/api/memory"
import { SettingsPanel } from "@/components/memory/settings-panel"
import { TreeView } from "@/components/memory-tree/tree-view"
import { ConversationsView } from "@/components/memory-tree/conversations-view"
import { VpsStatusBadge } from "@/components/memory-tree/vps-status-badge"
import { CodeTreeView } from "@/components/projects/code-tree-view"
import { GitHubStatusBadge } from "@/components/projects/github-status-badge"
import { PagesView } from "@/components/projects/pages-view"
import { SessionList, type SessionRow } from "@/components/terminals/session-list"
import { useTerminalsDrawer } from "@/components/terminals/terminals-drawer-provider"

import { FilterChips, type FilterId } from "@/components/memory/filter-chips"
import { WelcomeBanner } from "@/components/memory/welcome-banner"
import { ContinueCard } from "@/components/memory/continue-card"
import { TimeMachineBanner } from "@/components/memory/time-machine-banner"
import { RightRail } from "@/components/memory/right-rail"
import { AgentsRightRail } from "@/components/memory/agents-right-rail"
import { TerminalsRightRail } from "@/components/memory/terminals-right-rail"
import { AgentsSidebar } from "@/components/memory/agents-sidebar"
import { CenterPane, type CenterMode } from "@/components/memory/center-pane"
import { ModeShortcutHints } from "@/components/memory/mode-shortcut-hints"
import { PaneStack, useIsMobile, type PaneStackState } from "@/components/memory/pane-stack"
import { InboxBell } from "@/components/inbox/inbox-bell"
import { useInboxDrawer } from "@/components/inbox/inbox-drawer-provider"
import { recordFileOpen } from "@/lib/last-file-tracker"
import { cn } from "@/lib/utils"

type TimeMachineRaw = "1h" | "1d" | "1w" | "30d" | null

function parseAt(raw: string | null): TimeMachineRaw {
  if (raw === "1h" || raw === "1d" || raw === "1w" || raw === "30d") return raw
  return null
}

// ── URL <-> filter mapping ──────────────────────────────────────────────
const VALID_MODES: FilterId[] = [
  "all", "knowledge", "code", "conversations", "agents", "terminals", "inbox",
]

function modeFromSearch(sp: URLSearchParams | null | undefined): FilterId {
  const raw = sp?.get("mode")
  if (raw && (VALID_MODES as string[]).includes(raw)) return raw as FilterId
  return "all"
}

// CenterPane uses a slightly different vocabulary (knowledge/convos/code/agents/
// terminals/all) — convert here so the chip set stays exactly the spec values
// while the centre pane stays domain-named.
function centerModeFor(filter: FilterId): CenterMode {
  switch (filter) {
    case "knowledge": return "knowledge"
    case "code": return "code"
    case "conversations": return "convos"
    case "agents": return "agents"
    case "terminals": return "terminals"
    case "inbox":
    case "all":
    default:
      return filter === "all" ? "all" : "knowledge"
  }
}

export default function MemoryPage() {
  return (
    <React.Suspense fallback={<div className="h-screen bg-background" aria-hidden />}>
      <MemoryPageInner />
    </React.Suspense>
  )
}

function MemoryPageInner() {
  const search = useSearchParams()
  const { open: openTerminals } = useTerminalsDrawer()
  const { open: openInbox } = useInboxDrawer()

  // ── State ──────────────────────────────────────────────────────────────
  const [filter, setFilterRaw] = React.useState<FilterId>(() => modeFromSearch(search))
  const [selectedPath, setSelectedPath] = React.useState<string | null>(null)
  const [projectPath, setProjectPath] = React.useState<string | null>(null)
  const [projectViewMode, setProjectViewMode] = React.useState<"files" | "pages">("pages")
  const [pendingPageRoute, setPendingPageRoute] = React.useState<string | null>(null)
  const [businessId, setBusinessId] = React.useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const [paneState, setPaneState] = React.useState<PaneStackState>("tree")
  // Selected-agent slug tracked for the agents sidebar / right rail. Survives
  // the chip switch so flipping back to agents lands you on the same agent.
  const [selectedAgentSlug, setSelectedAgentSlug] = React.useState<string | null>(null)
  // Sessions for the terminals sidebar — pulled from /api/terminals on a
  // 15s interval (matches TerminalsWorkspace).
  const [sessions, setSessions] = React.useState<SessionRow[]>([])
  const [sessionsLoading, setSessionsLoading] = React.useState(false)
  const [focusedSessionId, setFocusedSessionId] = React.useState<string | null>(null)

  const isMobile = useIsMobile()
  const at = parseAt(search?.get("at") ?? null)
  const dimmed = at !== null

  // ── filter setter that also writes ?mode= to the URL ──────────────────
  const setFilter = React.useCallback(
    (next: FilterId) => {
      setFilterRaw(next)
      if (typeof window === "undefined") return
      const url = new URL(window.location.href)
      // Default ("all") drops the param — keeps the URL tidy.
      if (next === "all") {
        url.searchParams.delete("mode")
      } else {
        url.searchParams.set("mode", next)
      }
      // Clear hash so legacy #agent-workflows/... doesn't fight the chip.
      window.history.replaceState(null, "", url.pathname + url.search + url.hash)
      // Reset mobile pane to "tree" on chip change so the user lands on the
      // sidebar instead of staring at an unrelated file.
      setPaneState("tree")
    },
    []
  )

  // ── Hash redirects (legacy deep-links) ─────────────────────────────────
  React.useEffect(() => {
    if (typeof window === "undefined") return
    const h = window.location.hash.replace(/^#/, "")
    if (!h) return
    const seg = h.split("/")[0]
    if (seg === "agent-workflows") {
      // Old #agent-workflows[/sub] → new ?mode=agents — keep the sub-tab via
      // the existing AgentWorkflowsTabs URL sync (it reads `tab=` and `#`).
      const subSeg = h.split("/")[1]
      window.history.replaceState(null, "", window.location.pathname + window.location.search)
      setFilter("agents")
      if (subSeg) {
        const url = new URL(window.location.href)
        url.searchParams.set("tab", subSeg)
        window.history.replaceState(null, "", url.toString())
      }
      return
    }
    if (seg === "api-keys") {
      window.history.replaceState(null, "", window.location.pathname + window.location.search)
      // /agency/integrations doesn't exist yet — surface settings dialog later.
      return
    }
    // #tree / #project-tree / #conversations: map to filter chips
    if (seg === "project-tree") setFilter("code")
    else if (seg === "conversations") setFilter("conversations")
    // others fall through
  }, [setFilter])

  // Sync state when the URL changes via browser back/forward.
  React.useEffect(() => {
    const next = modeFromSearch(search)
    if (next !== filter) setFilterRaw(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  // ── Persist project view-mode in localStorage; honor URL params ───────
  React.useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    const fileParam = params.get("file")
    const pageParam = params.get("page")
    if (fileParam) {
      setProjectViewMode("files")
      setProjectPath(fileParam)
      setFilterRaw("code")
      return
    }
    if (pageParam) {
      setProjectViewMode("pages")
      setPendingPageRoute(pageParam)
      setFilterRaw("code")
      return
    }
    const stored = localStorage.getItem("project_tree_mode")
    if (stored === "files" || stored === "pages") setProjectViewMode(stored)
  }, [])

  React.useEffect(() => {
    const stored =
      typeof window !== "undefined" ? localStorage.getItem("memory_business_scope") : null
    setBusinessId(stored)
  }, [])

  // ── Agents/terminals data fetches (only when their mode is active) ────
  React.useEffect(() => {
    if (filter !== "terminals") return
    let cancelled = false
    let timer: ReturnType<typeof setInterval> | null = null

    async function refresh() {
      try {
        if (!cancelled) setSessionsLoading(true)
        const res = await fetch("/api/terminals", { cache: "no-store" })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = (await res.json()) as { sessions?: SessionRow[] }
        if (cancelled) return
        const list = json.sessions || []
        setSessions(list)
        if (!focusedSessionId && list.length > 0) setFocusedSessionId(list[0].id)
      } catch {
        // Don't toast — TerminalsWorkspace also hits this endpoint and shows
        // its own error UX. We just leave the sidebar empty.
      } finally {
        if (!cancelled) setSessionsLoading(false)
      }
    }

    refresh()
    timer = setInterval(refresh, 15_000)
    return () => {
      cancelled = true
      if (timer) clearInterval(timer)
    }
  }, [filter, focusedSessionId])

  // ── SettingsPanel still expects personas + memories as props ──────────
  const { data: personas = [] } = useSWR(["personas", businessId], () =>
    listPersonas({ business_id: businessId, include_archived: false })
  )
  const { data: memoryData } = useSWR(["memories-meta", businessId], () =>
    listMemories({ business_id: businessId, limit: 1 })
  )
  const memories: Memory[] = memoryData?.data ?? []

  // ── Inbox filter chip: open drawer + visually pin the chip ────────────
  function handleFilter(id: FilterId) {
    setFilter(id)
    if (id === "inbox") {
      openInbox()
    }
  }

  // ── File selection (records to last-file tracker) ─────────────────────
  function handleSelect(path: string) {
    setSelectedPath(path)
    if (path) recordFileOpen(path)
    if (isMobile) setPaneState("file")
  }

  // ── Project tree URL sync (preserved from legacy) ─────────────────────
  function setProjectMode(mode: "files" | "pages") {
    setProjectViewMode(mode)
    if (typeof window !== "undefined") localStorage.setItem("project_tree_mode", mode)
    syncProjectUrl(mode, mode === "files" ? projectPath : null, null)
  }

  function syncProjectUrl(mode: "files" | "pages", filePath: string | null, pageRoute: string | null) {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    params.delete("file")
    params.delete("page")
    if (mode === "files" && filePath) params.set("file", filePath)
    if (mode === "pages" && pageRoute) params.set("page", pageRoute)
    const search = params.toString() ? `?${params.toString()}` : ""
    const newUrl = `${window.location.pathname}${search}${window.location.hash}`
    window.history.replaceState(null, "", newUrl)
  }

  function openInTree(sourcePath: string) {
    const slugged = sourcePath.startsWith("agency-hq/") ? sourcePath : `agency-hq/${sourcePath}`
    setProjectMode("files")
    setProjectPath(slugged)
    syncProjectUrl("files", slugged, null)
  }

  function openInPages(route: string) {
    setProjectMode("pages")
    setPendingPageRoute(route)
    syncProjectUrl("pages", null, route)
  }

  // ── Keyboard shortcuts: g k / g c / g v / g a / g t ───────────────────
  React.useEffect(() => {
    let armed = false
    let armedTimer: ReturnType<typeof setTimeout> | null = null

    function disarm() {
      armed = false
      if (armedTimer) {
        clearTimeout(armedTimer)
        armedTimer = null
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      // Skip when typing in an input/textarea or holding modifiers.
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target
      if (t instanceof HTMLElement) {
        const tag = t.tagName
        if (tag === "INPUT" || tag === "TEXTAREA" || t.isContentEditable) return
      }

      if (!armed) {
        if (e.key === "g") {
          armed = true
          armedTimer = setTimeout(disarm, 1500)
          return
        }
        return
      }

      // 2nd key of the `g <x>` sequence.
      let next: FilterId | null = null
      if (e.key === "k") next = "knowledge"
      else if (e.key === "c") next = "code"
      else if (e.key === "v") next = "conversations"
      else if (e.key === "a") next = "agents"
      else if (e.key === "t") next = "terminals"
      else if (e.key === "h") next = "all"

      if (next) {
        e.preventDefault()
        handleFilter(next)
      }
      disarm()
    }

    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      disarm()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Sidebar (varies by mode) ─────────────────────────────────────────
  const sidebarLabel = (() => {
    switch (filter) {
      case "agents": return "Agents"
      case "terminals": return "Sessions"
      case "conversations": return "Conversations"
      case "code": return "Source code"
      case "inbox": return "Inbox"
      default: return "Vault"
    }
  })()

  const treePane = (
    <Card className="h-full overflow-hidden p-0 rounded-none border-0 bg-mem-surface-1">
      <div className="px-3 py-2 border-b border-mem-border text-[10px] uppercase tracking-[0.04em] font-semibold text-mem-text-muted">
        {sidebarLabel}
      </div>
      <div className="h-[calc(100%-2.25rem)]">
        {filter === "agents" ? (
          <AgentsSidebar
            selectedSlug={selectedAgentSlug}
            onSelect={(slug) => {
              setSelectedAgentSlug(slug)
              if (isMobile) setPaneState("file")
            }}
          />
        ) : filter === "terminals" ? (
          <SessionList
            sessions={sessions}
            focusedId={focusedSessionId}
            loading={sessionsLoading}
            onFocus={(id) => {
              setFocusedSessionId(id)
              if (isMobile) setPaneState("file")
            }}
            onRename={async (id, title) => {
              try {
                await fetch(`/api/terminals/${id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ title }),
                })
                setSessions((s) => s.map((x) => (x.id === id ? { ...x, title } : x)))
              } catch (e) {
                toast.error("Rename failed", { description: e instanceof Error ? e.message : String(e) })
              }
            }}
            onStop={async (id) => {
              try {
                await fetch(`/api/terminals/${id}`, { method: "DELETE" })
                setSessions((s) => s.filter((x) => x.id !== id))
                if (focusedSessionId === id) setFocusedSessionId(null)
              } catch (e) {
                toast.error("Stop failed", { description: e instanceof Error ? e.message : String(e) })
              }
            }}
          />
        ) : filter === "code" ? (
          projectViewMode === "pages" ? (
            <div className="h-full overflow-y-auto">
              <PagesView
                onOpenInTree={openInTree}
                initialSelectRoute={pendingPageRoute}
                onAutoSelected={() => setPendingPageRoute(null)}
              />
            </div>
          ) : (
            <CodeTreeView
              selectedPath={projectPath}
              onSelect={(path, kind) => {
                if (kind === "file") {
                  setProjectPath(path)
                  syncProjectUrl("files", path, null)
                  if (isMobile) setPaneState("file")
                } else {
                  const next = `${path}/README.md`
                  setProjectPath(next)
                  syncProjectUrl("files", next, null)
                  if (isMobile) setPaneState("file")
                }
              }}
            />
          )
        ) : filter === "conversations" ? (
          <ConversationsView />
        ) : (
          <TreeView
            selectedPath={selectedPath}
            onSelect={(p) => handleSelect(p)}
          />
        )}
      </div>
    </Card>
  )

  // ── Center pane (delegated) ──────────────────────────────────────────
  const filePane = (
    <CenterPane
      mode={centerModeFor(filter)}
      selectedPath={selectedPath}
      setSelectedPath={setSelectedPath}
      projectPath={projectPath}
      setProjectPath={setProjectPath}
      syncProjectUrl={syncProjectUrl}
      openInPages={openInPages}
      onSelect={handleSelect}
      dimmed={dimmed}
    />
  )

  // ── Right rail (varies by mode) ──────────────────────────────────────
  const sessionTitles = React.useMemo(
    () => Object.fromEntries(sessions.map((s) => [s.id, s.title])),
    [sessions]
  )

  const railPane = (() => {
    if (filter === "agents") return <AgentsRightRail selectedSlug={selectedAgentSlug} />
    if (filter === "terminals") return <TerminalsRightRail sessionTitles={sessionTitles} />
    return <RightRail path={selectedPath} businessId={businessId} />
  })()

  // ── Header (shared) ───────────────────────────────────────────────────
  const header = (
    <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4 px-3 sm:px-6 pt-3 sm:pt-4 pb-3 border-b border-border shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <Brain className="w-5 h-5 text-mem-accent shrink-0" />
        <h1 className="text-[18px] sm:text-[22px] font-semibold tracking-[-0.01em] text-foreground leading-none truncate">
          Command Center
        </h1>
        <span className="hidden md:inline text-[12px] text-muted-foreground">
          — memory, code, agents, terminals — one page
        </span>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <FilterChips
          value={filter}
          onChange={handleFilter}
        />
        {filter === "code" && (
          <div className="inline-flex rounded-md border border-mem-border bg-mem-surface-2 p-0.5">
            <button
              onClick={() => setProjectMode("pages")}
              className={cn(
                "px-2 py-1 text-[11px] rounded transition-colors",
                projectViewMode === "pages"
                  ? "bg-mem-accent/20 text-mem-accent"
                  : "text-mem-text-secondary hover:text-mem-text-primary"
              )}
            >
              Pages
            </button>
            <button
              onClick={() => setProjectMode("files")}
              className={cn(
                "px-2 py-1 text-[11px] rounded transition-colors",
                projectViewMode === "files"
                  ? "bg-mem-accent/20 text-mem-accent"
                  : "text-mem-text-secondary hover:text-mem-text-primary"
              )}
            >
              Files
            </button>
          </div>
        )}
        <div className="hidden sm:flex items-center gap-1.5">
          <VpsStatusBadge />
          {filter === "code" && <GitHubStatusBadge />}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={openTerminals}
          className="text-muted-foreground hover:text-mem-accent hover:bg-mem-accent/10 h-8 w-8 p-0"
          title="Open Terminals — run multiple persistent Claude sessions in parallel"
        >
          <TerminalSquare className="w-4 h-4" />
        </Button>
        <InboxBell />
        <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground h-8 w-8 p-0"
              title="Memory settings (token budget, MCP keys, default persona, import/export, health-scan)"
            >
              <SettingsIcon className="w-4 h-4" />
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Memory settings</DialogTitle>
            </DialogHeader>
            <SettingsPanel personas={personas} memories={memories} businessId={businessId} />
          </DialogContent>
        </Dialog>
      </div>
    </header>
  )

  // ── Mobile pane-layout decision ──────────────────────────────────────
  // For terminals mode the centre pane is full-bleed at every breakpoint —
  // <TerminalsWorkspace /> ships its own session-list sidebar and activity
  // feed, so wrapping it in our 3-pane shell triple-renders the same data.
  // The Phase 3 dedicated TerminalsRightRail / SessionList in our shell were
  // intended to add sibling-awareness but ended up as dupes; we now mount the
  // workspace alone and revisit per-mode chrome in a follow-up.
  const useFullBleedTerminals = filter === "terminals"

  // ── Layout: 4-pane on lg+, 2-pane on sm-lg, pane-stack on <sm ─────────
  return (
    <div className="h-[calc(100vh-3.5rem)] md:h-screen flex flex-col bg-background overflow-hidden -mt-16 md:-mt-6 -mx-4 md:-mx-6 -mb-20 md:-mb-6 pt-16 md:pt-0">
      {/* InboxBell floating fallback for narrow viewports where header bell is not reachable */}
      <InboxBell floating />

      <ContinueCard onSelect={handleSelect} />
      <WelcomeBanner />
      {header}
      <TimeMachineBanner at={at} />

      <div className="flex-1 min-h-0 flex">
        {useFullBleedTerminals ? (
          // Terminals mode: full-bleed. TerminalsWorkspace owns the chrome.
          <div className="flex-1 min-w-0">{filePane}</div>
        ) : isMobile ? (
          <PaneStack
            state={paneState}
            onBack={() => setPaneState((s) => (s === "rail" ? "file" : "tree"))}
            onOpenRail={() => setPaneState("rail")}
            selectedPath={selectedPath}
            treePane={treePane}
            filePane={filePane}
            railPane={railPane}
          />
        ) : (
          <>
            <div className="hidden md:block w-[260px] xl:w-[280px] shrink-0 border-r border-mem-border bg-mem-surface-1">
              {treePane}
            </div>
            <div className="flex-1 min-w-0 flex flex-col">
              {filePane}
            </div>
            <div className="hidden xl:block">
              {railPane}
            </div>
          </>
        )}
      </div>

      {/* Floating shortcut hint strip (lg+ only) */}
      <ModeShortcutHints />
    </div>
  )
}

// Lazy-loaded variants kept for future code-splitting (PagesView etc.)
const _LazyConversations = dynamic(
  () => import("@/components/memory-tree/conversations-view").then((m) => m.ConversationsView),
  { ssr: false }
)
void _LazyConversations
void Search
void MessageSquare
void Link
