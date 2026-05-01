"use client"
/**
 * /agency/memory — Memory Tree v2.
 *
 * Tabs: Memory Tree, Project Tree (read-only source code browser),
 * Conversations, Agent Workflows.
 *
 * Header gear button opens the existing memory SettingsPanel as a dialog so power
 * users can still tweak token budgets, MCP keys, default personas, etc.
 */
import { useEffect, useState } from "react"
import { Brain, Bot, Code2, FolderTree, KeyRound, MessageSquare, Settings as SettingsIcon, TerminalSquare } from "lucide-react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import useSWR from "swr"
import { listPersonas, type Persona, type Memory } from "@/lib/api/memory"
import { listMemories } from "@/lib/api/memory"
import { SettingsPanel } from "@/components/memory/settings-panel"
import { TreeView } from "@/components/memory-tree/tree-view"
import { FileEditor } from "@/components/memory-tree/file-editor"
import { ConversationsView } from "@/components/memory-tree/conversations-view"
import { VpsStatusBadge } from "@/components/memory-tree/vps-status-badge"
import { AgentWorkflowsTabs } from "@/components/agent-workflows/agent-workflows-tabs"
import { CodeTreeView } from "@/components/projects/code-tree-view"
import { CodeFileViewer } from "@/components/projects/code-file-viewer"
import { GitHubStatusBadge } from "@/components/projects/github-status-badge"
import { PagesView } from "@/components/projects/pages-view"
import { ApiKeysView } from "@/components/api-keys/api-keys-view"
import { useTerminalsDrawer } from "@/components/terminals/terminals-drawer-provider"

type MemoryTab = "tree" | "project-tree" | "api-keys" | "conversations" | "agent-workflows"
const VALID_TABS: MemoryTab[] = ["tree", "project-tree", "api-keys", "conversations", "agent-workflows"]

function readTabFromHash(): MemoryTab {
  if (typeof window === "undefined") return "tree"
  // Hash may be "tree" or "agent-workflows/runs". Take the first segment.
  const h = window.location.hash.replace(/^#/, "").split("/")[0] as MemoryTab
  return VALID_TABS.includes(h) ? h : "tree"
}

export default function MemoryPage() {
  const { open: openTerminals } = useTerminalsDrawer()
  const [tab, setTabRaw] = useState<MemoryTab>("tree")
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [projectPath, setProjectPath] = useState<string | null>(null)
  const [projectViewMode, setProjectViewMode] = useState<"files" | "pages">("pages")
  // When set, PagesView auto-selects this page route once its list is loaded.
  // Used by the "Open in Pages" cross-nav button in the Files view.
  const [pendingPageRoute, setPendingPageRoute] = useState<string | null>(null)
  const [businessId, setBusinessId] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Persist view-mode choice across reloads — non-technical users land on
  // "pages" by default, technical users keep "files" once they've toggled.
  // URL search params (?file= / ?page=) take precedence over localStorage so
  // shared cross-nav links land on the right view immediately.
  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    const fileParam = params.get("file")
    const pageParam = params.get("page")
    if (fileParam) {
      setProjectViewMode("files")
      setProjectPath(fileParam)
      return
    }
    if (pageParam) {
      setProjectViewMode("pages")
      setPendingPageRoute(pageParam)
      return
    }
    const stored = localStorage.getItem("project_tree_mode")
    if (stored === "files" || stored === "pages") setProjectViewMode(stored)
  }, [])

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

  // Cross-nav: jump from a Pages card to the raw source file.
  // sourcePath is repo-relative ("src/app/foo/page.tsx"); the Files view expects
  // the slug-prefixed form ("agency-hq/src/app/foo/page.tsx").
  function openInTree(sourcePath: string) {
    const slugged = sourcePath.startsWith("agency-hq/") ? sourcePath : `agency-hq/${sourcePath}`
    setProjectMode("files")
    setProjectPath(slugged)
    syncProjectUrl("files", slugged, null)
  }

  // Cross-nav: jump from a Files-view file back to the matching Page card.
  function openInPages(route: string) {
    setProjectMode("pages")
    setPendingPageRoute(route)
    syncProjectUrl("pages", null, route)
  }

  // Load the active tab from URL hash on mount + listen for back/forward nav.
  // This makes a browser refresh keep you on the tab you were on instead of
  // jumping back to "tree".
  useEffect(() => {
    setTabRaw(readTabFromHash())
    const onHash = () => setTabRaw(readTabFromHash())
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [])

  const setTab = (next: MemoryTab) => {
    setTabRaw(next)
    if (typeof window !== "undefined") {
      // Use replaceState so the back button doesn't get spammed with tab switches.
      const newUrl = `${window.location.pathname}${window.location.search}#${next}`
      window.history.replaceState(null, "", newUrl)
    }
  }

  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("memory_business_scope") : null
    setBusinessId(stored)
  }, [])

  // We still load personas + memories so SettingsPanel works (it expects them as props).
  const { data: personas = [] } = useSWR(["personas", businessId], () =>
    listPersonas({ business_id: businessId, include_archived: false })
  )
  const { data: memoryData } = useSWR(["memories-meta", businessId], () =>
    listMemories({ business_id: businessId, limit: 1 })
  )
  const memories: Memory[] = memoryData?.data ?? []

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] md:h-screen">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-zinc-800/60 shrink-0">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-amber-400" />
          <h1 className="text-lg font-semibold text-zinc-100">Memory</h1>
          <span className="text-xs text-zinc-500 hidden sm:inline">— what your AI knows</span>
        </div>
        <div className="flex items-center gap-2">
          <VpsStatusBadge />
          {tab === "project-tree" && <GitHubStatusBadge />}
          <Button
            variant="ghost"
            size="sm"
            onClick={openTerminals}
            className="text-zinc-400 hover:text-amber-100 hover:bg-amber-500/10"
            title="Open Terminals — run multiple persistent Claude sessions in parallel"
          >
            <TerminalSquare className="w-4 h-4" />
          </Button>
          <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-zinc-100" title="Memory settings (token budget, MCP keys, default persona)">
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
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as MemoryTab)} className="flex-1 flex flex-col min-h-0">
        <TabsList className="mx-4 mt-3 self-start">
          <TabsTrigger value="tree" className="gap-2">
            <FolderTree className="w-4 h-4" />
            Memory Tree
          </TabsTrigger>
          <TabsTrigger value="project-tree" className="gap-2">
            <Code2 className="w-4 h-4" />
            Project Tree
          </TabsTrigger>
          <TabsTrigger value="api-keys" className="gap-2">
            <KeyRound className="w-4 h-4" />
            Keys
          </TabsTrigger>
          <TabsTrigger value="conversations" className="gap-2">
            <MessageSquare className="w-4 h-4" />
            Conversations
          </TabsTrigger>
          <TabsTrigger value="agent-workflows" className="gap-2">
            <Bot className="w-4 h-4" />
            Agent Workflows
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tree" className="flex-1 mt-3 min-h-0">
          <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-3 px-4 pb-4 h-full">
            <Card className="overflow-hidden p-0">
              <div className="px-3 py-2 border-b border-zinc-800/60 text-xs text-zinc-500 uppercase tracking-wider">
                Vault
              </div>
              <div className="h-[calc(100%-2.5rem)]">
                <TreeView selectedPath={selectedPath} onSelect={setSelectedPath} />
              </div>
            </Card>
            <Card className="overflow-hidden p-0">
              {selectedPath ? (
                <FileEditor key={selectedPath} path={selectedPath} onPathChange={setSelectedPath} />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-zinc-500 text-sm">
                  <Brain className="w-8 h-8 mb-3 text-zinc-700" />
                  <div>Pick a file from the tree to view or edit it.</div>
                  <div className="text-xs text-zinc-600 mt-2 max-w-md text-center px-6">
                    Folders mirror real directories on the AI VPS — your edits here are the same files your AI reads on the terminal.
                  </div>
                </div>
              )}
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="project-tree" className="flex-1 mt-3 min-h-0">
          <div className="px-4 pb-4 h-full flex flex-col gap-3">
            {/* View-mode toggle: friendly Pages view by default, raw Files for power users */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="inline-flex rounded-md border border-zinc-800 bg-zinc-900/40 p-0.5">
                <button
                  onClick={() => setProjectMode("pages")}
                  className={`px-3 py-1 text-xs rounded ${projectViewMode === "pages" ? "bg-amber-500/20 text-amber-100" : "text-zinc-400 hover:text-zinc-100"}`}
                >
                  🧭 Pages
                </button>
                <button
                  onClick={() => setProjectMode("files")}
                  className={`px-3 py-1 text-xs rounded ${projectViewMode === "files" ? "bg-amber-500/20 text-amber-100" : "text-zinc-400 hover:text-zinc-100"}`}
                >
                  📁 Files
                </button>
              </div>
              <span className="text-[11px] text-zinc-600">
                {projectViewMode === "pages"
                  ? "Friendly view — pages, jobs, agents, and what's not built yet"
                  : "Raw source code from GitHub — edit and delete open PRs for your review"}
              </span>
            </div>

            {projectViewMode === "pages" ? (
              <div className="flex-1 min-h-0">
                <PagesView
                  onOpenInTree={openInTree}
                  initialSelectRoute={pendingPageRoute}
                  onAutoSelected={() => setPendingPageRoute(null)}
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-3 flex-1 min-h-0">
                <Card className="overflow-hidden p-0">
                  <div className="px-3 py-2 border-b border-zinc-800/60 text-xs text-zinc-500 uppercase tracking-wider">
                    Source code
                  </div>
                  <div className="h-[calc(100%-2.5rem)]">
                    <CodeTreeView
                      selectedPath={projectPath}
                      onSelect={(path, kind) => {
                        if (kind === "file") {
                          setProjectPath(path)
                          syncProjectUrl("files", path, null)
                        } else {
                          const next = `${path}/README.md`
                          setProjectPath(next)
                          syncProjectUrl("files", next, null)
                        }
                      }}
                    />
                  </div>
                </Card>
                <Card className="overflow-hidden p-0">
                  {projectPath ? (
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
                    <div className="flex flex-col items-center justify-center h-full text-zinc-500 text-sm">
                      <Code2 className="w-8 h-8 mb-3 text-zinc-700" />
                      <div>Pick a file to view its code.</div>
                      <div className="text-xs text-zinc-600 mt-2 max-w-md text-center px-6">
                        Folders show the project README when clicked. Each top-level
                        folder is a different project — pulled from GitHub, syntax-highlighted, read-only.
                      </div>
                    </div>
                  )}
                </Card>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="api-keys" className="flex-1 mt-3 min-h-0">
          <div className="px-4 pb-4 h-full">
            <Card className="h-full overflow-hidden p-0">
              <ApiKeysView />
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="conversations" className="flex-1 mt-3 min-h-0">
          <div className="px-4 pb-4 h-full">
            <Card className="h-full overflow-hidden">
              <ConversationsView />
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="agent-workflows" className="flex-1 mt-3 min-h-0">
          <AgentWorkflowsTabs />
        </TabsContent>
      </Tabs>
    </div>
  )
}
