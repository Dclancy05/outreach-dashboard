"use client"
/**
 * MemoryPage — client orchestrator for /jarvis/memory.
 *
 * Sits inside the Jarvis shell (sidebar + header + status bar provided by
 * W3A's (jarvis)/layout.tsx). Renders the 4-pane workspace:
 *
 *   ┌──────────────────┬─────────────────────────────────┬──────────────┐
 *   │   Vault Tree     │   Markdown Editor               │   Right Rail │
 *   │   280px          │   flex                          │   320px      │
 *   │   (TreeView)     │   (FileEditor)                  │   (RightRail)│
 *   └──────────────────┴─────────────────────────────────┴──────────────┘
 *
 * Above the panes:
 *   - <MemoryResumeChip>      single-line "Resume <file> →" (BUG-010, BUG-019)
 *   - <MemoryTopBar>          filter chips + settings/terminal actions
 *   - <TimeMachineBanner>     yellow "as of …" banner when ?at= is set
 *   - <JarvisSegmentedControl optional> for Memory · Agents · Terminals nav
 *
 * Time Machine wiring:
 *   - Read ?at= via useSearchParams (e.g. ?at=1d, ?at=2026-04-30)
 *   - When at !== null: pass readOnly=true to FileEditor + TreeView
 *   - "Back to now" clears ?at= via router.replace
 *
 * Mobile (<lg):
 *   - Uses the existing PaneStack from /agency/memory's pane-stack.tsx
 *   - Outer container is `min-h-dvh` so the page actually scrolls (BUG-019)
 *
 * Backward compat: /agency/memory's page.tsx is untouched. The shared
 * components (TreeView, FileEditor, FilterChips, SettingsPanel) gain
 * additive props/behavior with safe defaults — see each file's leading
 * comment block for the contract.
 */

import * as React from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import {
  Brain, FileText, Code2,
} from "lucide-react"
import useSWR from "swr"
import { Card } from "@/components/ui/card"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"

import { listPersonas, listMemories, type Memory } from "@/lib/api/memory"
import { SettingsPanel } from "@/components/memory/settings-panel"
import { TreeView } from "@/components/memory-tree/tree-view"
import { FileEditor } from "@/components/memory-tree/file-editor"
import { ConversationsView } from "@/components/memory-tree/conversations-view"
import { CodeTreeView } from "@/components/projects/code-tree-view"
import { CodeFileViewer } from "@/components/projects/code-file-viewer"
import { PagesView } from "@/components/projects/pages-view"

import { type FilterId } from "@/components/memory/filter-chips"
import { TimeMachine, type TimeMachineValue } from "@/components/memory/time-machine"
import { TimeMachineBanner } from "@/components/memory/time-machine-banner"
import { RightRail } from "@/components/memory/right-rail"
import { PaneStack, useIsMobile, type PaneStackState } from "@/components/memory/pane-stack"
import { recordFileOpen } from "@/lib/last-file-tracker"
import { cn } from "@/lib/utils"

import { JarvisSegmentedControl } from "@/components/jarvis/shell/jarvis-segmented-control"
import { MemoryResumeChip } from "./memory-resume-chip"
import { MemoryTopBar } from "./memory-top-bar"
import { MemoryEmptyFolder } from "./memory-empty-folder"

type TimeMachineRaw = TimeMachineValue | null

function parseAt(raw: string | null): TimeMachineRaw {
  if (raw === "1h" || raw === "1d" || raw === "1w" || raw === "30d") return raw
  return null
}

export function MemoryPage() {
  return (
    <React.Suspense fallback={<MemorySkeleton />}>
      <MemoryPageInner />
    </React.Suspense>
  )
}

function MemorySkeleton() {
  return <div className="min-h-dvh bg-mem-bg" aria-hidden />
}

function MemoryPageInner() {
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams()

  /* ─── State ─────────────────────────────────────────────────────── */
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
  const isTimeMachineActive = at !== null
  const dimmed = isTimeMachineActive

  /* ─── Persist / honor URL params for project files & pages ──────── */
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
    const stored = window.localStorage.getItem("project_tree_mode")
    if (stored === "files" || stored === "pages") setProjectViewMode(stored)
  }, [])

  React.useEffect(() => {
    const stored =
      typeof window !== "undefined" ? window.localStorage.getItem("memory_business_scope") : null
    setBusinessId(stored)
  }, [])

  /* ─── Settings dialog data ─────────────────────────────────────── */
  const { data: personas = [] } = useSWR(["jarvis-personas", businessId], () =>
    listPersonas({ business_id: businessId, include_archived: false })
  )
  const { data: memoryData } = useSWR(["jarvis-memories-meta", businessId], () =>
    listMemories({ business_id: businessId, limit: 1 })
  )
  const memories: Memory[] = memoryData?.data ?? []

  /* ─── Filter chip logic ────────────────────────────────────────── */
  // BUG-003 + BUG-011: clicking the "Inbox folder" chip filters the vault tree
  // to /Inbox — it does NOT open a drawer. The drawer/bell concept lives
  // elsewhere in the Jarvis sidebar (a separate /jarvis/inbox page).
  function handleFilterChange(id: FilterId) {
    setFilter(id)
  }

  function handleSelectInboxFolder() {
    // Switching to "inbox" filter will cause the tree to render scoped to /Inbox.
    setFilter("inbox")
  }

  /* ─── File selection ───────────────────────────────────────────── */
  function handleSelect(path: string) {
    setSelectedPath(path)
    if (path) recordFileOpen(path)
    if (isMobile) setPaneState("file")
  }

  /* ─── Project tree URL sync (preserved from legacy) ────────────── */
  function setProjectMode(mode: "files" | "pages") {
    setProjectViewMode(mode)
    if (typeof window !== "undefined") window.localStorage.setItem("project_tree_mode", mode)
    syncProjectUrl(mode, mode === "files" ? projectPath : null, null)
  }

  function syncProjectUrl(mode: "files" | "pages", filePath: string | null, pageRoute: string | null) {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    params.delete("file")
    params.delete("page")
    if (mode === "files" && filePath) params.set("file", filePath)
    if (mode === "pages" && pageRoute) params.set("page", pageRoute)
    const qs = params.toString() ? `?${params.toString()}` : ""
    const newUrl = `${window.location.pathname}${qs}${window.location.hash}`
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

  /* ─── Top-level segmented control (Memory · Agents · Terminals) ─ */
  function handleSegmentChange(seg: "memory" | "agents" | "terminals") {
    if (seg === "memory") return
    router.push(`/jarvis/${seg}`)
  }

  /* ─── Tree pane (rootPath scoped per filter) ───────────────────── */
  // Map filter → vault rootPath so the tree filters in-place. "All" + "Knowledge"
  // share the unscoped root; "Inbox folder" → /Inbox; "Conversations" → handled
  // by the dedicated ConversationsView (better UX for transcripts).
  const vaultRootPath: string | undefined =
    filter === "inbox"
      ? "/Inbox"
      : undefined

  const treePane = (
    <Card className="h-full overflow-hidden p-0 rounded-none border-0 bg-mem-surface-1">
      <div className="px-3 py-2 border-b border-mem-border text-[10px] uppercase tracking-[0.04em] font-semibold text-mem-text-muted">
        {filter === "conversations"
          ? "Conversations"
          : filter === "code"
          ? "Source code"
          : filter === "inbox"
          ? "Inbox folder"
          : "Vault"}
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
            onSelect={handleSelect}
            rootPath={vaultRootPath}
            readOnly={isTimeMachineActive}
          />
        )}
      </div>
    </Card>
  )

  /* ─── File pane ────────────────────────────────────────────────── */
  const filePane = (
    <div className={cn("h-full flex flex-col bg-mem-bg", dimmed && "opacity-95")}>
      <div className="flex-1 min-h-0 overflow-hidden">
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
            <EmptyPane
              icon={Code2}
              title="Pick a code file"
              body="Browse the source tree on the left, or switch to Pages mode for the friendly view."
            />
          )
        ) : filter === "inbox" && !selectedPath ? (
          // BUG: empty Inbox folder gets a dedicated drop-zone hint.
          <MemoryEmptyFolder
            folder="Inbox"
            hint="Notes saved here while you're chatting land in the tree on the left. Drop files here, or pick one to start editing."
          />
        ) : selectedPath ? (
          <FileEditor
            key={`${selectedPath}-${at ?? "now"}`}
            path={selectedPath}
            onPathChange={setSelectedPath}
            readOnly={isTimeMachineActive}
            readOnlyReason={
              isTimeMachineActive
                ? `Read-only · ${humanLabelForAt(at)}`
                : undefined
            }
          />
        ) : (
          <EmptyPane
            icon={FileText}
            title="Pick a file from the tree"
            body="Folders mirror real directories on the AI VPS — your edits here are the same files your AI reads on the terminal."
          />
        )}
      </div>
      <TimeMachine />
    </div>
  )

  /* ─── Right rail ───────────────────────────────────────────────── */
  const railPane = <RightRail path={selectedPath} businessId={businessId} />

  /* ─── Settings dialog (BUG-004 + BUG-012) ──────────────────────── */
  const settingsDialog = (
    <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
      <DialogContent className="max-w-3xl p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Brain className="h-4 w-4 text-mem-accent" />
            Memory settings
          </DialogTitle>
        </DialogHeader>
        <SettingsPanel personas={personas} memories={memories} businessId={businessId} />
      </DialogContent>
    </Dialog>
  )

  /* ─── Render ───────────────────────────────────────────────────── */
  return (
    <div className="flex flex-col min-h-dvh bg-mem-bg -mx-4 sm:-mx-8 -mt-6 -mb-12">
      {/* Top: segmented control (Memory · Agents · Terminals) */}
      <div className="px-3 sm:px-5 pt-3 pb-1 flex items-center gap-2">
        <JarvisSegmentedControl
          options={[
            { value: "memory", label: "Memory" },
            { value: "agents", label: "Agents" },
            { value: "terminals", label: "Terminals" },
          ]}
          value="memory"
          onChange={handleSegmentChange}
          ariaLabel="Jarvis section"
        />
      </div>

      {/* Single-line resume chip (BUG-010, BUG-019 — replaces stacked banners) */}
      <MemoryResumeChip onSelect={handleSelect} />

      {/* Filter chips + actions */}
      <MemoryTopBar
        filter={filter}
        onChange={handleFilterChange}
        onSelectInboxFolder={handleSelectInboxFolder}
        onOpenSettings={() => setSettingsOpen(true)}
        rightSlot={
          filter === "code" ? (
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
          ) : null
        }
      />

      {/* Time Machine "as of" banner (BUG-016: read-only state surfaced loudly) */}
      <TimeMachineBanner at={at} />

      {/* 4-pane layout (lg+) / pane-stack (<lg). min-h-0 lets children fill. */}
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
            <div className="hidden lg:block w-[260px] xl:w-[280px] shrink-0 border-r border-mem-border bg-mem-surface-1">
              {treePane}
            </div>
            <div className="flex-1 min-w-0 flex flex-col">{filePane}</div>
            <div className="hidden xl:block">{railPane}</div>
          </>
        )}
      </div>

      {settingsDialog}

      {/* Suppress unused-router warning — router is used for segment switch */}
      <span className="hidden" aria-hidden>
        {pathname}
      </span>
    </div>
  )
}

/* ─── Helpers ──────────────────────────────────────────────────── */

function humanLabelForAt(at: TimeMachineRaw): string {
  switch (at) {
    case "1h":
      return "1 hour ago"
    case "1d":
      return "1 day ago"
    case "1w":
      return "1 week ago"
    case "30d":
      return "30 days ago"
    default:
      return "now"
  }
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
