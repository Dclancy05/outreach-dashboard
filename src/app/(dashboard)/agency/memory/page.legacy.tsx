"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import useSWR, { useSWRConfig } from "swr"
import {
  Brain, Plus, Search, Pin, Sparkles, Filter, Star,
  Database, Settings as SettingsIcon, BookOpen, Layers, Activity,
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from "@/components/ui/tabs"
import { toast } from "sonner"
import { motion } from "framer-motion"
import { createClient } from "@supabase/supabase-js"
import { CategoryChips } from "@/components/memory/category-chips"
import { MemoryList } from "@/components/memory/memory-list"
import { MemoryEditor } from "@/components/memory/memory-editor"
import { PersonaCard } from "@/components/memory/persona-card"
import { PersonaQuickEditModal } from "@/components/memory/persona-quick-edit-modal"
import { TokenMeter } from "@/components/memory/token-meter"
import { SettingsPanel } from "@/components/memory/settings-panel"
import {
  listMemories, createMemory, updateMemory, deleteMemory,
  pinMemory, archiveMemory, duplicateMemory, reorderMemories,
  listPersonas, deletePersona, setDefaultPersona, duplicatePersona,
  previewInjection,
  type Memory, type MemoryType, type Persona,
} from "@/lib/api/memory"
import { cn } from "@/lib/utils"

const supabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const fetcher = async <T,>(fn: () => Promise<T>): Promise<T> => fn()

export default function MemoryPage() {
  const { mutate } = useSWRConfig()
  const [activeTab, setActiveTab] = useState<"memories" | "personas" | "settings">("memories")

  // Selected business (read from localStorage like the rest of the app)
  const [businessId, setBusinessId] = useState<string | null>(null)
  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("memory_business_scope") : null
    setBusinessId(stored)
  }, [])

  // Filters
  const [typeFilter, setTypeFilter] = useState<MemoryType | "all">("all")
  const [search, setSearch] = useState("")
  const [pinnedOnly, setPinnedOnly] = useState(false)
  const [includeArchived, setIncludeArchived] = useState(false)
  const [activePersona, setActivePersona] = useState<string>("all") // "all" | "global" | persona id
  const [selectedMemoryId, setSelectedMemoryId] = useState<string | null>(null)
  const [editingPersona, setEditingPersona] = useState<Persona | null>(null)
  const [personaModalOpen, setPersonaModalOpen] = useState(false)

  const memoryQueryKey = useMemo(
    () => ["memories", businessId, activePersona, typeFilter, search, pinnedOnly, includeArchived],
    [businessId, activePersona, typeFilter, search, pinnedOnly, includeArchived]
  )

  const { data: memoryData, error: memoryErr, isLoading: memoriesLoading } = useSWR(
    memoryQueryKey,
    () => listMemories({
      business_id: businessId,
      persona_id: activePersona === "all" ? null : activePersona,
      type: typeFilter === "all" ? undefined : typeFilter,
      q: search || undefined,
      pinned: pinnedOnly || undefined,
      include_archived: includeArchived,
      limit: 500,
    }),
    { revalidateOnFocus: true, dedupingInterval: 500 }
  )

  const { data: personas = [], mutate: refetchPersonas } = useSWR(
    ["personas", businessId],
    () => listPersonas({ business_id: businessId, include_archived: false }),
    { revalidateOnFocus: true }
  )

  const memories = memoryData?.data ?? []

  // Realtime sync ───────────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabaseClient
      .channel("memory-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "memories" }, () => mutate(memoryQueryKey))
      .on("postgres_changes", { event: "*", schema: "public", table: "personas" }, () => refetchPersonas())
      .subscribe()
    return () => { supabaseClient.removeChannel(channel) }
  }, [mutate, memoryQueryKey, refetchPersonas])

  // Auto-select first memory when list loads or filters change
  useEffect(() => {
    if (memoriesLoading) return
    if (memories.length === 0) { setSelectedMemoryId(null); return }
    if (!selectedMemoryId || !memories.find((m) => m.id === selectedMemoryId)) {
      setSelectedMemoryId(memories[0].id)
    }
  }, [memories, selectedMemoryId, memoriesLoading])

  const selectedMemory = useMemo(() => memories.find((m) => m.id === selectedMemoryId) || null, [memories, selectedMemoryId])

  // Counts per type for chips
  const typeCounts = useMemo(() => {
    const c: Record<string, number> = { all: memories.length }
    for (const m of memories) c[m.type] = (c[m.type] || 0) + 1
    return c
  }, [memories])

  // Token preview from injection endpoint
  const { data: injectionPreview } = useSWR(
    ["inject-preview", businessId, activePersona],
    () => previewInjection({
      persona_id: activePersona === "all" || activePersona === "global" ? null : activePersona,
      business_id: businessId || undefined,
      max_tokens: 4000,
    }),
    { revalidateOnFocus: false, dedupingInterval: 5000 }
  )

  // Actions ─────────────────────────────────────────────────────────────
  const handleCreate = useCallback(async (defaults?: Partial<Memory>) => {
    try {
      const m = await createMemory({
        title: defaults?.title || "New memory",
        type: defaults?.type || (typeFilter === "all" ? "user" : typeFilter),
        body: defaults?.body || "",
        business_id: businessId,
        persona_id: activePersona === "all" || activePersona === "global" ? null : activePersona,
        ...defaults,
      })
      toast.success("Memory created")
      mutate(memoryQueryKey)
      setSelectedMemoryId(m.id)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed")
    }
  }, [businessId, activePersona, typeFilter, mutate, memoryQueryKey])

  const handlePin = useCallback(async (m: Memory) => {
    try { await pinMemory(m.id, !m.pinned); mutate(memoryQueryKey) } catch (e) { toast.error(e instanceof Error ? e.message : "Failed") }
  }, [mutate, memoryQueryKey])

  const handleArchive = useCallback(async (m: Memory) => {
    try { await archiveMemory(m.id, !m.archived); mutate(memoryQueryKey) } catch (e) { toast.error(e instanceof Error ? e.message : "Failed") }
  }, [mutate, memoryQueryKey])

  const handleDuplicate = useCallback(async (m: Memory) => {
    try { const dup = await duplicateMemory(m.id); mutate(memoryQueryKey); setSelectedMemoryId(dup.id); toast.success("Duplicated") } catch (e) { toast.error(e instanceof Error ? e.message : "Failed") }
  }, [mutate, memoryQueryKey])

  const handleDelete = useCallback(async (m: Memory) => {
    try { await deleteMemory(m.id); mutate(memoryQueryKey); if (selectedMemoryId === m.id) setSelectedMemoryId(null) } catch (e) { toast.error(e instanceof Error ? e.message : "Failed") }
  }, [mutate, memoryQueryKey, selectedMemoryId])

  const handleReorder = useCallback(async (next: Memory[]) => {
    // Map new index → injection_priority (top = 100, descending by 5)
    const items = next.map((m, i) => ({ id: m.id, injection_priority: Math.max(0, 100 - i * 2) }))
    mutate(memoryQueryKey, { ...memoryData!, data: next.map((m, i) => ({ ...m, injection_priority: items[i].injection_priority })) }, false)
    try { await reorderMemories(items); mutate(memoryQueryKey) } catch (e) { toast.error(e instanceof Error ? e.message : "Failed") }
  }, [memoryData, mutate, memoryQueryKey])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.metaKey || e.ctrlKey) return
      if (e.key === "c") { e.preventDefault(); handleCreate() }
      if (e.key === "/") { e.preventDefault(); document.getElementById("memory-search")?.focus() }
      if (e.key === "p" && selectedMemory) { e.preventDefault(); handlePin(selectedMemory) }
      if (e.key === "a" && selectedMemory) { e.preventDefault(); handleArchive(selectedMemory) }
      if (e.key === "1") setTypeFilter("user")
      if (e.key === "2") setTypeFilter("feedback")
      if (e.key === "3") setTypeFilter("project")
      if (e.key === "4") setTypeFilter("reference")
      if (e.key === "0") setTypeFilter("all")
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault()
        const idx = memories.findIndex((m) => m.id === selectedMemoryId)
        const next = memories[Math.min(memories.length - 1, idx + 1)]
        if (next) setSelectedMemoryId(next.id)
      }
      if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault()
        const idx = memories.findIndex((m) => m.id === selectedMemoryId)
        const next = memories[Math.max(0, idx - 1)]
        if (next) setSelectedMemoryId(next.id)
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [memories, selectedMemoryId, selectedMemory, handleCreate, handlePin, handleArchive])

  const pinnedCount = memories.filter((m) => m.pinned).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-3 text-2xl sm:text-3xl font-bold">
            <Brain className="h-7 w-7 sm:h-8 sm:w-8 text-amber-400" />
            <span className="bg-gradient-to-r from-amber-400 via-orange-300 to-rose-400 bg-clip-text text-transparent">
              Memory HQ
            </span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Persistent memory + personas every chat carries — auto-saved, version-tracked, MCP-ready.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => handleCreate()} className="bg-amber-500 hover:bg-amber-600 text-amber-950 font-semibold">
            <Plus className="mr-1 h-4 w-4" /> New memory <kbd className="ml-2 rounded bg-amber-950/30 px-1 text-[10px]">c</kbd>
          </Button>
        </div>
      </div>

      {/* Stat row */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Total memories</p>
              <p className="mt-1 text-2xl font-bold">{memories.length}</p>
            </div>
            <Database className="h-5 w-5 text-amber-400" />
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Pinned</p>
              <p className="mt-1 text-2xl font-bold">{pinnedCount}</p>
            </div>
            <Pin className="h-5 w-5 text-amber-400" />
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Personas</p>
              <p className="mt-1 text-2xl font-bold">{personas.length}</p>
            </div>
            <Layers className="h-5 w-5 text-violet-400" />
          </div>
        </Card>
        <Card className="p-4">
          <p className="mb-1 text-xs text-muted-foreground">Token usage (next chat)</p>
          <TokenMeter
            used={injectionPreview?.tokens_used ?? 0}
            budget={4000}
            injectedCount={injectionPreview?.memory_ids.length ?? 0}
            totalCount={memories.length}
            size="sm"
          />
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList>
          <TabsTrigger value="memories"><BookOpen className="mr-2 h-3.5 w-3.5" /> Memories</TabsTrigger>
          <TabsTrigger value="personas"><Layers className="mr-2 h-3.5 w-3.5" /> Personas</TabsTrigger>
          <TabsTrigger value="settings"><SettingsIcon className="mr-2 h-3.5 w-3.5" /> Settings</TabsTrigger>
        </TabsList>

        {/* ─── Memories ─── */}
        <TabsContent value="memories" className="mt-4">
          <div className="space-y-3">
            {/* Filters bar */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  id="memory-search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search memories…  (press /)"
                  className="w-64 pl-8 text-sm"
                />
              </div>
              <CategoryChips value={typeFilter} onChange={setTypeFilter} counts={typeCounts as Record<MemoryType | "all", number>} />
              <button
                onClick={() => setPinnedOnly((v) => !v)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-all",
                  pinnedOnly ? "border-amber-400/50 bg-amber-500/10 text-amber-300" : "border-border bg-secondary/40 text-muted-foreground hover:bg-secondary"
                )}
              >
                <Pin className="h-3 w-3" /> Pinned
              </button>
              <button
                onClick={() => setIncludeArchived((v) => !v)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-all",
                  includeArchived ? "border-amber-400/50 bg-amber-500/10 text-amber-300" : "border-border bg-secondary/40 text-muted-foreground hover:bg-secondary"
                )}
              >
                <Filter className="h-3 w-3" /> Archived
              </button>
              <select
                value={activePersona}
                onChange={(e) => setActivePersona(e.target.value)}
                className="ml-auto rounded-md border border-input bg-card px-2 py-1 text-xs"
              >
                <option value="all">All personas</option>
                <option value="global">🌐 Global only (no persona)</option>
                {personas.map((p) => (
                  <option key={p.id} value={p.id}>{p.emoji} {p.name}</option>
                ))}
              </select>
              <select
                value={businessId || "__null__"}
                onChange={(e) => {
                  const v = e.target.value === "__null__" ? null : e.target.value
                  setBusinessId(v)
                  if (v) localStorage.setItem("memory_business_scope", v)
                  else localStorage.removeItem("memory_business_scope")
                }}
                className="rounded-md border border-input bg-card px-2 py-1 text-xs"
              >
                <option value="__null__">All businesses</option>
                <BusinessOptions />
              </select>
            </div>

            {/* Two-pane layout */}
            <div className="grid gap-4 lg:grid-cols-[400px_1fr]">
              <div>
                {memoriesLoading ? (
                  <div className="space-y-2">
                    {[1,2,3,4,5].map((i) => (
                      <div key={i} className="h-16 animate-pulse rounded-lg bg-card/40" />
                    ))}
                  </div>
                ) : memoryErr ? (
                  <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                    Failed to load: {String(memoryErr)}. {String(memoryErr).includes('relation') && '— Did you run migrations/008_memory_system.sql?'}
                  </div>
                ) : (
                  <MemoryList
                    memories={memories}
                    selectedId={selectedMemoryId}
                    onSelect={setSelectedMemoryId}
                    onTogglePin={handlePin}
                    onToggleArchive={handleArchive}
                    onDuplicate={handleDuplicate}
                    onDelete={handleDelete}
                    onReorder={handleReorder}
                  />
                )}
              </div>

              <div>
                {selectedMemory ? (
                  <MemoryEditor
                    memory={selectedMemory}
                    personas={personas}
                    onChange={(m) => mutate(memoryQueryKey, (cur: { data: Memory[]; count: number } | undefined) => cur ? { ...cur, data: cur.data.map((x) => x.id === m.id ? m : x) } : cur, false)}
                    onDeleted={(id) => { mutate(memoryQueryKey); if (selectedMemoryId === id) setSelectedMemoryId(null) }}
                  />
                ) : (
                  <EmptyState onCreate={() => handleCreate()} />
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ─── Personas ─── */}
        <TabsContent value="personas" className="mt-4">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Personas are named bundles of system prompt + tone + memories. Pick one per chat or set a default.
            </p>
            <Button onClick={() => { setEditingPersona(null); setPersonaModalOpen(true) }} variant="outline">
              <Plus className="mr-1 h-3.5 w-3.5" /> New persona
            </Button>
          </div>
          {personas.length === 0 ? (
            <Card className="p-12 text-center">
              <div className="text-5xl">🎭</div>
              <p className="mt-3 font-semibold">No personas yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Build one to give a name to a chat style.</p>
              <Button className="mt-4" onClick={() => setPersonaModalOpen(true)}>
                <Plus className="mr-1 h-4 w-4" /> Create first persona
              </Button>
            </Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {personas.map((p) => (
                <PersonaCard
                  key={p.id}
                  persona={p}
                  onEdit={() => { setEditingPersona(p); setPersonaModalOpen(true) }}
                  onSetDefault={async () => {
                    try { await setDefaultPersona(p.id, businessId); refetchPersonas(); toast.success(`${p.name} is now default`) }
                    catch (e) { toast.error(e instanceof Error ? e.message : "Failed") }
                  }}
                  onDuplicate={async () => {
                    try { const dup = await duplicatePersona(p.id); refetchPersonas(); toast.success(`Duplicated as ${dup.name}`) }
                    catch (e) { toast.error(e instanceof Error ? e.message : "Failed") }
                  }}
                  onDelete={async () => {
                    if (!confirm(`Delete persona "${p.name}"?`)) return
                    try { await deletePersona(p.id); refetchPersonas(); toast.success("Deleted") }
                    catch (e) { toast.error(e instanceof Error ? e.message : "Failed") }
                  }}
                />
              ))}
            </div>
          )}
          <PersonaQuickEditModal
            open={personaModalOpen}
            onOpenChange={setPersonaModalOpen}
            persona={editingPersona}
            personas={personas}
            onSaved={() => refetchPersonas()}
          />
        </TabsContent>

        {/* ─── Settings ─── */}
        <TabsContent value="settings" className="mt-4">
          <SettingsPanel personas={personas} memories={memories} businessId={businessId} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <Card className="flex h-full min-h-[400px] flex-col items-center justify-center p-8 text-center">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
        <div className="text-6xl">🧠</div>
      </motion.div>
      <h3 className="mt-4 text-lg font-semibold">Your memories will live here</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Type rules, preferences, and project context here once. Every chat that uses an MCP-enabled persona will load them automatically.
      </p>
      <Button className="mt-4 bg-amber-500 hover:bg-amber-600 text-amber-950" onClick={onCreate}>
        <Plus className="mr-1 h-4 w-4" /> Add your first memory
      </Button>
      <div className="mt-6 grid w-full max-w-md gap-2">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Quick start ideas</p>
        <ul className="space-y-1 text-left text-xs text-muted-foreground">
          <li>👤 <strong className="text-foreground">User:</strong> "I'm Dylan, building a multi-channel outreach platform."</li>
          <li>💬 <strong className="text-foreground">Feedback:</strong> "Never use em-dashes. Why: house style. How: every prose output."</li>
          <li>📋 <strong className="text-foreground">Project:</strong> "Launching Memory HQ this week — focus on polish over features."</li>
          <li>🔗 <strong className="text-foreground">Reference:</strong> "Pipeline bugs tracked in Linear project INGEST."</li>
        </ul>
      </div>
    </Card>
  )
}

function BusinessOptions() {
  const ref = useRef<{ id: string; name: string; icon?: string }[]>([])
  const [businesses, setBusinesses] = useState<{ id: string; name: string; icon?: string }[]>([])
  useEffect(() => {
    fetch("/api/businesses").then((r) => r.json()).then((d) => {
      const arr = (d.data || []).filter((b: { status?: string }) => b.status !== "archived")
      ref.current = arr
      setBusinesses(arr)
    }).catch(() => {})
  }, [])
  return (<>{businesses.map((b) => <option key={b.id} value={b.id}>{b.icon || "🏪"} {b.name}</option>)}</>)
}
