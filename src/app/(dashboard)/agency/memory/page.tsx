"use client"
/**
 * /agency/memory — 4-pane Memory page (v2).
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ Header: title · filter chips · VPS · Search · 🔔 · ⚙ · 💻    │
 *   ├─────────────┬─────────────────────────────────┬──────────────┤
 *   │             │                                 │              │
 *   │  Tree pane  │  Editor pane                    │  Right rail  │
 *   │             │                                 │  (Chat/Info/ │
 *   │  (vault     │  (markdown editor / code        │   History/   │
 *   │   tree, or  │   viewer / conversation         │   Memories)  │
 *   │   code      │   transcript / pages view)      │              │
 *   │   tree)     │                                 │              │
 *   │             │  ┌──────────────────────────────┴────────────┐ │
 *   │             │  │ Time Machine scrubber                    │ │
 *   │             │  └──────────────────────────────────────────┘ │
 *   └─────────────┴────────────────────────────────────────────────┘
 *
 * Filter chips: All · Knowledge · Code · Conversations · Inbox
 *   - Inbox chip opens the right-edge slide-in drawer (and tints the chip).
 *
 * Mobile (<lg): pane-stack navigator (tree → file → rail).
 * Tablet (sm-lg): 2-pane (tree + editor) with right rail collapsed to 48px.
 *
 * Hash redirects (top of page):
 *   #agent-workflows*  → /agency/agents
 *   #api-keys          → /agency/integrations#api-keys (route doesn't exist
 *                        yet — falls through to /agency/team for now)
 */
import * as React from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  Brain, Settings as SettingsIcon, TerminalSquare, FileText, Search, Code2, MessageSquare,
} from "lucide-react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

import { listPersonas, listMemories, type Memory } from "@/lib/api/memory"
import { SettingsPanel } from "@/components/memory/settings-panel"
import { TreeView } from "@/components/memory-tree/tree-view"
import { FileEditor } from "@/components/memory-tree/file-editor"
import { ConversationsView } from "@/components/memory-tree/conversations-view"
import { VpsStatusBadge } from "@/components/memory-tree/vps-status-badge"
import { CodeTreeView } from "@/components/projects/code-tree-view"
import { CodeFileViewer } from "@/components/projects/code-file-viewer"
import { GitHubStatusBadge } from "@/components/projects/github-status-badge"
import { PagesView } from "@/components/projects/pages-view"
import { useTerminalsDrawer } from "@/components/terminals/terminals-drawer-provider"

import { FilterChips, type FilterId } from "@/components/memory/filter-chips"
import { WelcomeBanner } from "@/components/memory/welcome-banner"
import { ContinueCard } from "@/components/memory/continue-card"
import { TimeMachine } from "@/components/memory/time-machine"
import { TimeMachineBanner } from "@/components/memory/time-machine-banner"
import { RightRail } from "@/components/memory/right-rail"
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

export default function MemoryPage() {
  return (
    <React.Suspense fallback={<div className="h-screen bg-background" aria-hidden />}>
      <MemoryPageInner />
    </React.Suspense>
  )
}

function MemoryPageInner() {
  const router = useRouter()
  const search = useSearchParams()
  const { open: openTerminals } = useTerminalsDrawer()
  const { open: openInbox, isOpen: inboxOpen } = useInboxDrawer()

  // ── Hash redirects (legacy deep-links) ─────────────────────────────────
  React.useEffect(() => {
    if (typeof window === "undefined") return
    const h = window.location.hash.replace(/^#/, "")
    if (!h) return
    const seg = h.split("/")[0]
    if (seg === "agent-workflows") {
      // Old #agent-workflows[/sub] → /agency/agents
      window.history.replaceState(null, "", window.location.pathname + window.location.search)
      router.replace("/agency/agents")
      return
    }
    if (seg === "api-keys") {
      window.history.replaceState(null, "", window.location.pathname + window.location.search)
      // /agency/integrations doesn't exist yet — surface settings dialog later.
      // For now fall through; users land on the default Memory view.
      return
    }
    // #tree / #project-tree / #conversations: map to filter chips
    if (seg === "project-tree") setFilter("code")
    else if (seg === "conversations") setFilter("conversations")
    // others fall through
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── State ──────────────────────────────────────────────────────────────
  const [filter, setFilter] = React.useState<FilterId>("all")
  const [selectedPath, setSelectedPath] = React.useState<string | null>(null)
  const [projectPath, setProjectPath] = React.useState<string | null>(null)
  const [projectViewMode, setProjectViewMode] = React.useState<"files" | "pages">("pages")
  const [pendingPageRoute, setPendingPageRoute] = React.useState<string | null>(null)
  const [businessId, setBusinessId] = React.useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const [paneState, setPaneState] = React.useState<PaneStackState>("tree")

  const isMobile = useIsMobile()
  const at = parseAt(search?.get("at") ?? null)
  const dimmed = at !== null

  // ── Persist project view-mode in localStorage; honor URL params ───────
  React.useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    const fileParam = params.get("file")
    const pageParam = params.get("page")
    if (fileParam) {
      setProjectViewMode("files")
      setProjectPath(fileParam)
      setFilter("code")
      return
    }
    if (pageParam) {
      setProjectViewMode("pages")
      setPendingPageRoute(pageParam)
      setFilter("code")
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

  // ── Pane assembly ─────────────────────────────────────────────────────
  const treePane = (
    <Card className="h-full overflow-hidden p-0 rounded-none border-0 bg-mem-surface-1">
      <div className="px-3 py-2 border-b border-mem-border text-[10px] uppercase tracking-[0.04em] font-semibold text-mem-text-muted">
        {filter === "conversations" ? "Conversations" : filter === "code" ? "Source code" : "Vault"}
      </div>
      <div className="h-[calc(100%-2.25rem)]">
        {filter === "code" ? (
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

  const filePane = (
    <div className={cn("h-full flex flex-col bg-mem-bg", dimmed && "opacity-70 pointer-events-auto")}>
      <div className={cn("flex-1 min-h-0 overflow-hidden", dimmed && "pointer-events-none")}>
        {filter === "code" ? (
          projectPath ? (
            <CodeFileViewer
              key={projectPath}
              path={projectPath}
              onSegmentClick={(segPath) => {
                const next = `${segPath}/README.md`
                setProjectPath(next)
                syncProjectUrl("files", next, null)
              }}
              onOpenInPages={openInPages}
              onDeleted={() => {
                setProjectPath(null)
                syncProjectUrl("files", null, null)
              }}
            />
          ) : (
            <EmptyPane icon={Code2} title="Pick a code file" body="Browse the source tree on the left or switch to Pages mode for the friendly view." />
          )
        ) : selectedPath ? (
          <FileEditor key={selectedPath} path={selectedPath} onPathChange={setSelectedPath} />
        ) : (
          <EmptyPane icon={FileText} title="Pick a file from the tree" body="Folders mirror real directories on the AI VPS — your edits here are the same files your AI reads on the terminal." />
        )}
      </div>
      <TimeMachine />
    </div>
  )

  const railPane = (
    <RightRail path={selectedPath} businessId={businessId} />
  )

  // ── Header (shared) ───────────────────────────────────────────────────
  const header = (
    <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4 px-3 sm:px-6 pt-3 sm:pt-4 pb-3 border-b border-border shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <Brain className="w-5 h-5 text-mem-accent shrink-0" />
        <h1 className="text-[18px] sm:text-[22px] font-semibold tracking-[-0.01em] text-foreground leading-none truncate">
          Memory
        </h1>
        <span className="hidden md:inline text-[12px] text-muted-foreground">— what your AI knows</span>
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
        {isMobile ? (
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
    </div>
  )
}

function EmptyPane({
  icon: Icon, title, body,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  body: string
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-mem-text-secondary text-sm px-6">
      <Icon className="w-8 h-8 mb-3 text-mem-text-muted" />
      <div className="text-mem-text-primary text-[14px]">{title}</div>
      <div className="text-[12px] text-mem-text-muted mt-2 max-w-md text-center">
        {body}
      </div>
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
