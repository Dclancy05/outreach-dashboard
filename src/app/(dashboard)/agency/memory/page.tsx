"use client"
/**
 * /agency/memory — Memory Tree v2.
 *
 * Two tabs: Memory Tree (file-tree browser/editor) + Conversations (P2 placeholder).
 * Old DB-backed Memories + Personas + Settings tabs removed from UI; the underlying
 * tables stay alive for AI-internal use via MCP. Old page preserved at page.legacy.tsx.
 *
 * Header gear button opens the existing memory SettingsPanel as a dialog so power
 * users can still tweak token budgets, MCP keys, default personas, etc.
 */
import { useEffect, useState } from "react"
import { Brain, FolderTree, MessageSquare, Settings as SettingsIcon } from "lucide-react"
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

export default function MemoryPage() {
  const [tab, setTab] = useState<"tree" | "conversations">("tree")
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [businessId, setBusinessId] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

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

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as "tree" | "conversations")} className="flex-1 flex flex-col min-h-0">
        <TabsList className="mx-4 mt-3 self-start">
          <TabsTrigger value="tree" className="gap-2">
            <FolderTree className="w-4 h-4" />
            Memory Tree
          </TabsTrigger>
          <TabsTrigger value="conversations" className="gap-2">
            <MessageSquare className="w-4 h-4" />
            Conversations
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

        <TabsContent value="conversations" className="flex-1 mt-3 min-h-0">
          <div className="px-4 pb-4 h-full">
            <Card className="h-full overflow-hidden">
              <ConversationsView />
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
