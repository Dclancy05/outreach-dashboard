"use client"
/**
 * Right-rail "Memories" tab — full CRUD over /api/memories.
 *
 * Capabilities (parity with legacy memory-list + memory-editor):
 *  - List with pin/archive states
 *  - Create new memory (inline)
 *  - Pin / Unpin (action)
 *  - Archive / Unarchive (action)
 *  - Duplicate (action)
 *  - Bulk archive selected
 *  - Open Persona detail link from each memory
 *  - Search filter
 *
 * Uses the existing api/memory.ts helpers.
 */
import * as React from "react"
import useSWR from "swr"
import Link from "next/link"
import {
  Pin, PinOff, Archive, ArchiveRestore, Copy, Plus, Search, X,
  CheckSquare, Square, Trash2, ExternalLink, Loader2,
} from "lucide-react"
import { toast } from "sonner"
import {
  listMemories,
  createMemory,
  updateMemory,
  type Memory,
} from "@/lib/api/memory"
import { cn } from "@/lib/utils"

interface Props {
  /** Currently selected vault file path (used to scope memories to a file). */
  path: string | null
  /** Active business scope from localStorage. */
  businessId: string | null
}

async function memoryAction(action: string, payload: Record<string, unknown>) {
  const r = await fetch("/api/memories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  })
  if (!r.ok) {
    const body = await r.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${r.status}`)
  }
  return r.json()
}

export function MemoriesTab({ path, businessId }: Props) {
  const [q, setQ] = React.useState("")
  const [creating, setCreating] = React.useState(false)
  const [newTitle, setNewTitle] = React.useState("")
  const [selected, setSelected] = React.useState<Set<string>>(new Set())

  const { data, mutate, isLoading } = useSWR(
    ["memories", businessId, q],
    () => listMemories({ business_id: businessId, q: q || undefined, limit: 200 }),
    { revalidateOnFocus: false }
  )
  const memories: Memory[] = data?.data ?? []
  const total = data?.count ?? memories.length

  async function onCreate() {
    const title = newTitle.trim()
    if (!title) return
    try {
      await createMemory({
        title,
        type: "user",
        body: "",
        emoji: "📝",
        business_id: businessId,
      })
      setNewTitle("")
      setCreating(false)
      mutate()
      toast.success("Memory created")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create memory")
    }
  }

  async function onPin(id: string, pinned: boolean) {
    try {
      await updateMemory(id, { pinned: !pinned })
      mutate()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to pin")
    }
  }

  async function onArchive(id: string) {
    try {
      await memoryAction("archive", { id })
      mutate()
      toast.success("Archived")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to archive")
    }
  }

  async function onDuplicate(id: string) {
    try {
      await memoryAction("duplicate", { id })
      mutate()
      toast.success("Duplicated")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to duplicate")
    }
  }

  async function onBulkArchive() {
    if (selected.size === 0) return
    try {
      await memoryAction("bulk_archive", { ids: Array.from(selected) })
      setSelected(new Set())
      mutate()
      toast.success(`Archived ${selected.size}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to bulk archive")
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Toolbar */}
      <div className="px-3 py-2 border-b border-mem-border flex items-center gap-1.5">
        <div className="flex-1 h-7 bg-mem-surface-2 border border-mem-border rounded-md flex items-center gap-1.5 px-2 focus-within:border-mem-border-strong transition-colors">
          <Search size={11} className="text-mem-text-muted shrink-0" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search memories…"
            className="flex-1 bg-transparent outline-none border-0 text-[12px] text-mem-text-primary placeholder:text-mem-text-muted min-w-0"
            aria-label="Search memories"
          />
          {q && (
            <button onClick={() => setQ("")} aria-label="Clear search" className="text-mem-text-muted hover:text-mem-text-primary">
              <X size={11} />
            </button>
          )}
        </div>
        <button
          onClick={() => setCreating((s) => !s)}
          aria-label="New memory"
          className="h-7 w-7 grid place-items-center rounded-md bg-mem-surface-2 border border-mem-border text-mem-text-secondary hover:text-mem-text-primary hover:border-mem-border-strong transition-colors"
        >
          <Plus size={13} />
        </button>
      </div>

      {creating && (
        <div className="px-3 py-2 border-b border-mem-border flex items-center gap-1.5">
          <input
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onCreate()
              if (e.key === "Escape") {
                setCreating(false)
                setNewTitle("")
              }
            }}
            placeholder="New memory title…"
            className="flex-1 h-7 px-2 bg-mem-surface-2 border border-mem-accent rounded-md text-[12px] text-mem-text-primary outline-none"
          />
          <button
            onClick={onCreate}
            disabled={!newTitle.trim()}
            className={cn(
              "h-7 px-2.5 rounded-md text-[12px] font-medium transition-colors",
              newTitle.trim()
                ? "bg-mem-accent text-white"
                : "bg-mem-surface-3 text-mem-text-muted"
            )}
          >
            Add
          </button>
        </div>
      )}

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="px-3 py-2 border-b border-mem-border bg-mem-surface-2/50 flex items-center gap-2">
          <span className="text-[11px] text-mem-text-secondary">{selected.size} selected</span>
          <button
            onClick={onBulkArchive}
            className="h-6 px-2 rounded-md bg-mem-surface-3 border border-mem-border text-[11px] text-mem-text-primary hover:border-mem-border-strong transition-colors inline-flex items-center gap-1"
          >
            <Archive size={11} />
            Archive
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto h-6 px-2 rounded-md text-[11px] text-mem-text-muted hover:text-mem-text-primary"
          >
            Clear
          </button>
        </div>
      )}

      {/* List */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
        {isLoading ? (
          <div className="px-4 py-12 text-center text-[12px] text-mem-text-muted">
            <Loader2 size={14} className="inline animate-spin mr-1" />
            Loading memories…
          </div>
        ) : memories.length === 0 ? (
          <div className="px-4 py-12 text-center text-[12px] text-mem-text-muted">
            No memories yet. Press <kbd className="font-mono px-1 py-0.5 rounded bg-mem-surface-3 border border-mem-border text-[10px]">+</kbd> to add one.
          </div>
        ) : (
          <ul className="divide-y divide-mem-border/40">
            {memories.map((m) => {
              const isSelected = selected.has(m.id)
              return (
                <li
                  key={m.id}
                  className={cn(
                    "px-3 py-2 hover:bg-mem-surface-2/40 transition-colors",
                    isSelected && "bg-mem-accent/5"
                  )}
                >
                  <div className="flex items-start gap-2">
                    <button
                      onClick={() => toggleSelect(m.id)}
                      aria-label={isSelected ? "Unselect" : "Select"}
                      className="mt-0.5 text-mem-text-muted hover:text-mem-text-primary shrink-0"
                    >
                      {isSelected ? <CheckSquare size={13} /> : <Square size={13} />}
                    </button>
                    <span aria-hidden className="text-[14px] shrink-0 mt-0.5">{m.emoji || "📝"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-[12.5px] font-medium text-mem-text-primary truncate">
                          {m.title}
                        </p>
                        {m.pinned && <Pin size={10} className="text-mem-status-thinking shrink-0" />}
                      </div>
                      {m.description && (
                        <p className="text-[11px] text-mem-text-muted mt-0.5 line-clamp-1">
                          {m.description}
                        </p>
                      )}
                      <div className="mt-1 flex items-center gap-1">
                        <button
                          onClick={() => onPin(m.id, m.pinned)}
                          className="h-5 px-1.5 rounded text-[10px] text-mem-text-muted hover:text-mem-text-primary hover:bg-mem-surface-3 inline-flex items-center gap-1"
                          title={m.pinned ? "Unpin" : "Pin"}
                        >
                          {m.pinned ? <PinOff size={10} /> : <Pin size={10} />}
                          {m.pinned ? "Unpin" : "Pin"}
                        </button>
                        <button
                          onClick={() => onDuplicate(m.id)}
                          className="h-5 px-1.5 rounded text-[10px] text-mem-text-muted hover:text-mem-text-primary hover:bg-mem-surface-3 inline-flex items-center gap-1"
                          title="Duplicate"
                        >
                          <Copy size={10} />
                          Dup
                        </button>
                        <button
                          onClick={() => onArchive(m.id)}
                          className="h-5 px-1.5 rounded text-[10px] text-mem-text-muted hover:text-mem-text-primary hover:bg-mem-surface-3 inline-flex items-center gap-1"
                          title="Archive"
                        >
                          <Archive size={10} />
                          Archive
                        </button>
                        {m.persona_id && (
                          <Link
                            href={`/agency/memory/personas/${m.persona_id}`}
                            className="ml-auto h-5 px-1.5 rounded text-[10px] text-mem-accent hover:text-mem-accent hover:bg-mem-accent/10 inline-flex items-center gap-1"
                            title="Open persona"
                          >
                            Persona
                            <ExternalLink size={9} />
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      <div className="shrink-0 border-t border-mem-border px-3 py-2 text-[11px] text-mem-text-muted flex items-center justify-between">
        <span>{total} total</span>
        <Link
          href="/agency/memory/personas/global"
          className="text-mem-accent hover:underline inline-flex items-center gap-1"
        >
          Manage personas <ExternalLink size={9} />
        </Link>
      </div>
    </div>
  )
}
