"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Pin, PinOff, Archive, ArchiveRestore, Copy, Trash2, GripVertical, MoreHorizontal, Star } from "lucide-react"
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core"
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { TYPE_BG, type Memory, type MemoryType } from "@/lib/api/memory"

export function MemoryList({
  memories,
  selectedId,
  onSelect,
  onTogglePin,
  onToggleArchive,
  onDuplicate,
  onDelete,
  onReorder,
}: {
  memories: Memory[]
  selectedId: string | null
  onSelect: (id: string) => void
  onTogglePin: (m: Memory) => void
  onToggleArchive: (m: Memory) => void
  onDuplicate: (m: Memory) => void
  onDelete: (m: Memory) => void
  onReorder: (next: Memory[]) => void
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const ids = memories.map((m) => m.id)

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIdx = ids.indexOf(String(active.id))
    const newIdx = ids.indexOf(String(over.id))
    if (oldIdx < 0 || newIdx < 0) return
    onReorder(arrayMove(memories, oldIdx, newIdx))
  }

  if (memories.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/30 p-8 text-center">
        <div className="mb-2 text-4xl">🧠</div>
        <p className="text-sm font-medium">No memories yet</p>
        <p className="mt-1 text-xs text-muted-foreground">Click + to add your first one</p>
      </div>
    )
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul className="space-y-1.5">
          <AnimatePresence initial={false}>
            {memories.map((m) => (
              <MemoryRow
                key={m.id}
                memory={m}
                selected={m.id === selectedId}
                onSelect={() => onSelect(m.id)}
                onTogglePin={() => onTogglePin(m)}
                onToggleArchive={() => onToggleArchive(m)}
                onDuplicate={() => onDuplicate(m)}
                onDelete={() => onDelete(m)}
              />
            ))}
          </AnimatePresence>
        </ul>
      </SortableContext>
    </DndContext>
  )
}

function MemoryRow({
  memory,
  selected,
  onSelect,
  onTogglePin,
  onToggleArchive,
  onDuplicate,
  onDelete,
}: {
  memory: Memory
  selected: boolean
  onSelect: () => void
  onTogglePin: () => void
  onToggleArchive: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: memory.id })
  const [confirmDelete, setConfirmDelete] = useState(false)
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition }
  const typeKey = memory.type as MemoryType

  return (
    <motion.li
      ref={setNodeRef}
      style={style}
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.15 }}
      className={cn(
        "group relative rounded-lg border bg-card transition-all",
        selected ? "border-amber-400/50 shadow-[0_0_0_1px_rgba(251,191,36,0.3)]" : "border-border hover:border-border/80",
        memory.pinned && "ring-1 ring-amber-300/40",
        memory.archived && "opacity-60",
        isDragging && "z-10 shadow-lg",
      )}
    >
      <button
        onClick={onSelect}
        className="flex w-full items-start gap-2 p-3 text-left"
      >
        <span
          {...attributes}
          {...listeners}
          className="mt-0.5 cursor-grab text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </span>
        <span className="text-lg leading-none">{memory.emoji || "📝"}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {memory.pinned && <Star className="h-3 w-3 fill-amber-400 text-amber-400" />}
            <span className="truncate text-sm font-medium">{memory.title}</span>
          </div>
          {memory.description && (
            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{memory.description}</p>
          )}
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium border", TYPE_BG[typeKey])}>
              {memory.type}
            </span>
            <span className="text-[10px] text-muted-foreground">prio {memory.injection_priority}</span>
            {memory.tags.length > 0 && (
              <span className="text-[10px] text-muted-foreground">
                {memory.tags.slice(0, 2).map((t) => `#${t}`).join(" ")}
                {memory.tags.length > 2 && ` +${memory.tags.length - 2}`}
              </span>
            )}
          </div>
        </div>
      </button>

      <div className="absolute right-2 top-2 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={(e) => { e.stopPropagation(); onTogglePin() }}
          title={memory.pinned ? "Unpin" : "Pin"}
          className="rounded p-1 hover:bg-secondary"
        >
          {memory.pinned ? <PinOff className="h-3.5 w-3.5 text-muted-foreground" /> : <Pin className="h-3.5 w-3.5 text-muted-foreground" />}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              className="rounded p-1 hover:bg-secondary"
              title="More"
            >
              <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={onDuplicate}>
              <Copy className="mr-2 h-3.5 w-3.5" /> Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onToggleArchive}>
              {memory.archived ? <><ArchiveRestore className="mr-2 h-3.5 w-3.5" /> Unarchive</> : <><Archive className="mr-2 h-3.5 w-3.5" /> Archive</>}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => setConfirmDelete(true)}
              className="text-red-400 focus:text-red-300"
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {confirmDelete && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center gap-2 rounded-lg bg-card/95 backdrop-blur-sm"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="text-xs">Delete this memory?</span>
          <button
            onClick={() => { onDelete(); setConfirmDelete(false) }}
            className="rounded bg-red-500/20 px-2 py-0.5 text-xs text-red-300 hover:bg-red-500/30"
          >
            Yes
          </button>
          <button
            onClick={() => setConfirmDelete(false)}
            className="rounded bg-secondary px-2 py-0.5 text-xs hover:bg-secondary/80"
          >
            No
          </button>
        </div>
      )}
    </motion.li>
  )
}
