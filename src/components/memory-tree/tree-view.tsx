"use client"
/**
 * Memory Tree — recursive folder/file explorer for the /agency/memory page.
 *
 * Reads from /api/memory-vault/tree, renders Radix Collapsible folders
 * with clickable file leaves. Live updates via SSE on /api/memory-vault/events.
 *
 * Features:
 * - Toolbar: + New file, + New folder, refresh
 * - Right-click on any row: Rename, Move to..., Delete, New file/folder under here
 * - F2 (or double-click) to inline-rename
 * - Friendly empty state when the vault API isn't configured (HTTP 503)
 * - Live updates via SSE — when files change on disk, the tree re-renders
 */
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react"
import * as Collapsible from "@radix-ui/react-collapsible"
import * as ContextMenu from "@radix-ui/react-context-menu"
import {
  ChevronRight, File, Folder, FolderOpen, Loader2, RefreshCw, FilePlus, FolderPlus,
  Pencil, Trash2, FolderInput, Cog,
} from "lucide-react"
import { toast } from "sonner"
import {
  DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable,
  useSensor, useSensors, closestCenter,
  type DragStartEvent, type DragEndEvent,
} from "@dnd-kit/core"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export interface TreeNode {
  name: string
  path: string
  kind: "file" | "folder"
  size?: number
  updated_at?: string
  is_symlink?: boolean
  children?: TreeNode[]
}

interface TreeResponse {
  root: string
  tree: TreeNode[]
}

interface TreeViewProps {
  selectedPath: string | null
  onSelect: (path: string) => void
}

// Top-level paths the tree should hide (they're surfaced elsewhere — Conversations
// has its own tab; .trash is internal soft-delete storage).
const HIDDEN_TOP_PATHS = new Set(["/Conversations", "/.trash"])

export function TreeView({ selectedPath, onSelect }: TreeViewProps) {
  const [tree, setTree] = useState<TreeNode[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [errorStatus, setErrorStatus] = useState<number | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)         // path being renamed
  const [moveDialog, setMoveDialog] = useState<TreeNode | null>(null)
  const [deleteDialog, setDeleteDialog] = useState<TreeNode | null>(null)
  const [newDialog, setNewDialog] = useState<{ kind: "file" | "folder"; parent: string } | null>(null)
  const [activeDrag, setActiveDrag] = useState<TreeNode | null>(null)
  // Require 6px of movement before drag activates so plain clicks still work
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const fetchTree = useCallback(async () => {
    try {
      const res = await fetch("/api/memory-vault/tree", { cache: "no-store" })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setErrorStatus(res.status)
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      const data: TreeResponse = await res.json()
      setTree(data.tree)
      setError(null)
      setErrorStatus(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchTree() }, [fetchTree])

  // Live updates via SSE with backoff
  useEffect(() => {
    let es: EventSource | null = null
    let backoff = 1000
    let cancelled = false
    function connect() {
      if (cancelled) return
      es = new EventSource("/api/memory-vault/events")
      es.onmessage = () => fetchTree()
      es.onerror = () => {
        es?.close()
        if (!cancelled) {
          setTimeout(connect, backoff)
          backoff = Math.min(backoff * 2, 30_000)
        }
      }
      es.onopen = () => { backoff = 1000 }
    }
    connect()
    return () => { cancelled = true; es?.close() }
  }, [fetchTree])

  // ─── Mutations ──────────────────────────────────────────────────

  async function vaultPost(endpoint: string, body: object): Promise<void> {
    const res = await fetch(`/api/memory-vault${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || `HTTP ${res.status}`)
    }
  }

  async function vaultPut(endpoint: string, body: object): Promise<void> {
    const res = await fetch(`/api/memory-vault${endpoint}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || `HTTP ${res.status}`)
    }
  }

  async function vaultDelete(path: string): Promise<void> {
    const res = await fetch(`/api/memory-vault/file?path=${encodeURIComponent(path)}`, { method: "DELETE" })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || `HTTP ${res.status}`)
    }
  }

  async function createFile(parent: string, name: string) {
    const path = `${parent.replace(/\/$/, "")}/${name}`.replace(/^\//, "/")
    try {
      await vaultPut("/file", { path, content: `# ${name.replace(/\.md$/, "")}\n\n` })
      toast.success(`Created ${path}`)
      onSelect(path)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create file")
    }
  }

  async function createFolder(parent: string, name: string) {
    const path = `${parent.replace(/\/$/, "")}/${name}`.replace(/^\//, "/")
    try {
      await vaultPost("/folder", { path })
      toast.success(`Created ${path}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create folder")
    }
  }

  async function rename(node: TreeNode, newName: string) {
    if (!newName || newName === node.name) { setRenaming(null); return }
    const parent = node.path.split("/").slice(0, -1).join("/") || "/"
    const to = `${parent === "/" ? "" : parent}/${newName}`
    try {
      await vaultPost("/move", { from: node.path, to })
      toast.success(`Renamed to ${newName}`)
      if (selectedPath === node.path && node.kind === "file") onSelect(to)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Rename failed")
    } finally {
      setRenaming(null)
    }
  }

  async function move(node: TreeNode, newParent: string) {
    const to = `${newParent.replace(/\/$/, "")}/${node.name}`.replace(/^\//, "/")
    try {
      await vaultPost("/move", { from: node.path, to })
      toast.success(`Moved to ${newParent === "/" ? "root" : newParent}`)
      if (selectedPath === node.path) onSelect(to)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Move failed")
    } finally {
      setMoveDialog(null)
    }
  }

  // ─── Drag-and-drop handlers ───────────────────────────────────
  function findNode(nodes: TreeNode[], targetPath: string): TreeNode | null {
    for (const n of nodes) {
      if (n.path === targetPath) return n
      if (n.children) {
        const found = findNode(n.children, targetPath)
        if (found) return found
      }
    }
    return null
  }

  function handleDragStart(e: DragStartEvent) {
    const node = findNode(tree || [], String(e.active.id))
    if (node) setActiveDrag(node)
  }

  async function handleDragEnd(e: DragEndEvent) {
    setActiveDrag(null)
    const fromPath = String(e.active.id)
    const targetFolder = e.over ? String(e.over.id) : null
    if (!targetFolder) return
    if (fromPath === targetFolder) return
    // Don't allow dropping a folder into itself or a descendant — server enforces
    // this too with a 400, but bail early so we don't even try.
    if (targetFolder.startsWith(fromPath + "/")) {
      toast.error("Can't move a folder into itself")
      return
    }
    const node = findNode(tree || [], fromPath)
    if (!node) return
    const currentParent = fromPath.split("/").slice(0, -1).join("/") || "/"
    if (currentParent === targetFolder) return // dropped where it already is
    await move(node, targetFolder)
  }

  async function softDelete(node: TreeNode) {
    try {
      await vaultDelete(node.path)
      toast.success(`Deleted ${node.name} (in trash for 30s)`)
      if (selectedPath === node.path) onSelect("")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed")
    } finally {
      setDeleteDialog(null)
    }
  }

  // ─── Render ──────────────────────────────────────────────────────

  if (loading && !tree) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-zinc-500">
        <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading vault…
      </div>
    )
  }

  if (errorStatus === 503) {
    return <NotConfiguredEmptyState />
  }

  if (error) {
    return (
      <div className="p-3 text-sm">
        <div className="text-red-400 font-medium mb-1">Vault unreachable</div>
        <div className="text-xs text-zinc-400 mb-2 break-all">{error}</div>
        <button onClick={() => { setLoading(true); fetchTree() }} className="text-xs text-zinc-300 hover:text-white inline-flex items-center gap-1">
          <RefreshCw className="w-3 h-3" /> Retry
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-zinc-800/60 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs gap-1 text-zinc-400 hover:text-zinc-100"
          onClick={() => setNewDialog({ kind: "file", parent: "/" })}
          title="New file at root"
        >
          <FilePlus className="w-3.5 h-3.5" /> File
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs gap-1 text-zinc-400 hover:text-zinc-100"
          onClick={() => setNewDialog({ kind: "folder", parent: "/" })}
          title="New folder at root"
        >
          <FolderPlus className="w-3.5 h-3.5" /> Folder
        </Button>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-zinc-500 hover:text-zinc-300"
          onClick={fetchTree}
          title="Refresh tree"
        >
          <RefreshCw className="w-3 h-3" />
        </Button>
      </div>

      {/* Tree (with drag-and-drop) */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveDrag(null)}
      >
        <div className="overflow-y-auto flex-1 text-sm py-1">
          {(tree || [])
            .filter((node) => !HIDDEN_TOP_PATHS.has(node.path))
            .map((node) => (
              <TreeRow
                key={node.path}
                node={node}
                depth={0}
                selectedPath={selectedPath}
                renaming={renaming}
                activeDragPath={activeDrag?.path ?? null}
                onSelect={onSelect}
                onStartRename={(path) => setRenaming(path)}
                onCommitRename={rename}
                onContextNew={(kind, parent) => setNewDialog({ kind, parent })}
                onContextMove={(n) => setMoveDialog(n)}
                onContextDelete={(n) => setDeleteDialog(n)}
              />
            ))}
        </div>
        <DragOverlay dropAnimation={null}>
          {activeDrag ? (
            <div className="bg-zinc-900/95 border border-amber-500/50 rounded shadow-xl px-2 py-1 text-sm text-zinc-100 inline-flex items-center gap-1.5 max-w-xs">
              {activeDrag.kind === "folder"
                ? <Folder className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                : <File className="w-3.5 h-3.5 text-zinc-500 shrink-0" />}
              <span className="truncate">{activeDrag.name}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Dialogs */}
      <NewItemDialog
        open={!!newDialog}
        kind={newDialog?.kind || "file"}
        parent={newDialog?.parent || "/"}
        onClose={() => setNewDialog(null)}
        onCreate={(name) => {
          if (newDialog?.kind === "file") createFile(newDialog.parent, name.endsWith(".md") ? name : `${name}.md`)
          else if (newDialog?.kind === "folder") createFolder(newDialog.parent, name)
          setNewDialog(null)
        }}
      />
      <MoveDialog
        node={moveDialog}
        tree={tree || []}
        onClose={() => setMoveDialog(null)}
        onMove={move}
      />
      <DeleteDialog
        node={deleteDialog}
        onClose={() => setDeleteDialog(null)}
        onConfirm={softDelete}
      />
    </div>
  )
}

// ─── TreeRow ──────────────────────────────────────────────────────

function TreeRow({
  node, depth, selectedPath, renaming, activeDragPath,
  onSelect, onStartRename, onCommitRename, onContextNew, onContextMove, onContextDelete,
}: {
  node: TreeNode
  depth: number
  selectedPath: string | null
  renaming: string | null
  activeDragPath: string | null
  onSelect: (p: string) => void
  onStartRename: (path: string) => void
  onCommitRename: (node: TreeNode, newName: string) => void
  onContextNew: (kind: "file" | "folder", parent: string) => void
  onContextMove: (n: TreeNode) => void
  onContextDelete: (n: TreeNode) => void
}) {
  const indent = depth * 12
  const isSelected = selectedPath === node.path
  const inSelectedChain = useMemo(
    () => (selectedPath ? selectedPath.startsWith(node.path + "/") : false),
    [selectedPath, node.path]
  )
  const [open, setOpen] = useState(depth === 0 || inSelectedChain)
  const isRenaming = renaming === node.path

  // Draggable: every row can be picked up. Disabled while renaming so the input works.
  const drag = useDraggable({ id: node.path, disabled: isRenaming })
  // Droppable: only folders accept drops. Disable for self while dragging this node
  // (don't let user "drop on yourself"). Server also blocks self/descendant drops.
  const drop = useDroppable({
    id: node.path,
    disabled: node.kind !== "folder" || activeDragPath === node.path,
  })

  // Auto-expand a closed folder if the user hovers over it for 600ms while dragging.
  useEffect(() => {
    if (node.kind !== "folder") return
    if (!drop.isOver) return
    if (open) return
    const t = setTimeout(() => setOpen(true), 600)
    return () => clearTimeout(t)
  }, [drop.isOver, open, node.kind])

  const isBeingDragged = activeDragPath === node.path
  const dragRowStyle: React.CSSProperties = isBeingDragged ? { opacity: 0.4 } : {}
  // Highlight ring when this folder is the current drop target
  const dropTargetClass = drop.isOver && node.kind === "folder" && !isBeingDragged
    ? "ring-1 ring-amber-500/60 bg-amber-500/5 rounded"
    : ""

  // Combine drag + drop refs onto the wrapper div
  const setRefs = (el: HTMLDivElement | null) => {
    drag.setNodeRef(el)
    if (node.kind === "folder") drop.setNodeRef(el)
  }

  const handleKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "F2" && !isRenaming) {
      e.preventDefault()
      onStartRename(node.path)
    }
  }, [isRenaming, node.path, onStartRename])

  const renameInputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus()
      renameInputRef.current.select()
    }
  }, [isRenaming])

  const rowContent = (
    <div ref={setRefs} {...drag.attributes} {...drag.listeners} style={dragRowStyle} className={dropTargetClass}>
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        {node.kind === "folder" ? (
          <Collapsible.Root open={open} onOpenChange={setOpen}>
            <Collapsible.Trigger asChild>
              <button
                onKeyDown={handleKey}
                onDoubleClick={(e) => { e.stopPropagation(); if (depth > 0) onStartRename(node.path) }}
                className={cn(
                  "flex items-center gap-1 w-full text-left py-1 hover:bg-zinc-800/50 rounded text-zinc-200 px-2 transition-colors",
                  isSelected && "bg-zinc-800/70"
                )}
                style={{ paddingLeft: 8 + indent }}
              >
                <ChevronRight className={cn("w-3 h-3 text-zinc-500 transition-transform shrink-0", open && "rotate-90")} />
                {open ? <FolderOpen className="w-4 h-4 text-amber-400 shrink-0" /> : <Folder className="w-4 h-4 text-amber-500 shrink-0" />}
                {isRenaming ? (
                  <RenameInput
                    ref={renameInputRef}
                    initial={node.name}
                    onCommit={(n) => onCommitRename(node, n)}
                    onCancel={() => onCommitRename(node, node.name)}
                  />
                ) : (
                  <span className="truncate flex-1">{node.name || "(root)"}</span>
                )}
                {!isRenaming && (node.children || []).filter((c) => c.kind === "file").length > 0 && (
                  <span className="text-[10px] text-zinc-500 shrink-0 tabular-nums">
                    {(node.children || []).filter((c) => c.kind === "file").length}
                  </span>
                )}
              </button>
            </Collapsible.Trigger>
            <Collapsible.Content>
              {(node.children || []).map((child) => (
                <TreeRow
                  key={child.path}
                  node={child}
                  depth={depth + 1}
                  selectedPath={selectedPath}
                  renaming={renaming}
                  activeDragPath={activeDragPath}
                  onSelect={onSelect}
                  onStartRename={onStartRename}
                  onCommitRename={onCommitRename}
                  onContextNew={onContextNew}
                  onContextMove={onContextMove}
                  onContextDelete={onContextDelete}
                />
              ))}
            </Collapsible.Content>
          </Collapsible.Root>
        ) : (
          <button
            onClick={() => !isRenaming && onSelect(node.path)}
            onKeyDown={handleKey}
            onDoubleClick={(e) => { e.stopPropagation(); onStartRename(node.path) }}
            className={cn(
              "flex items-center gap-1 w-full text-left py-1 rounded transition-colors px-2",
              isSelected
                ? "bg-amber-500/20 text-amber-100"
                : "text-zinc-300 hover:bg-zinc-800/50 hover:text-zinc-100"
            )}
            style={{ paddingLeft: 8 + indent + 16 }}
          >
            <File className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
            {isRenaming ? (
              <RenameInput
                ref={renameInputRef}
                initial={node.name}
                onCommit={(n) => onCommitRename(node, n)}
                onCancel={() => onCommitRename(node, node.name)}
              />
            ) : (
              <span className="truncate flex-1">{node.name}</span>
            )}
            {!isRenaming && node.is_symlink && (
              <span className="text-[9px] text-zinc-600 shrink-0">↗</span>
            )}
          </button>
        )}
      </ContextMenu.Trigger>

      <ContextMenu.Portal>
        <ContextMenu.Content className="min-w-[180px] bg-zinc-900 border border-zinc-800 rounded-md shadow-xl py-1 text-sm">
          {node.kind === "folder" && (
            <>
              <CtxItem icon={<FilePlus className="w-3.5 h-3.5" />} onSelect={() => onContextNew("file", node.path)}>New file here</CtxItem>
              <CtxItem icon={<FolderPlus className="w-3.5 h-3.5" />} onSelect={() => onContextNew("folder", node.path)}>New folder here</CtxItem>
              <ContextMenu.Separator className="h-px bg-zinc-800 my-1" />
            </>
          )}
          {depth > 0 && (
            <CtxItem icon={<Pencil className="w-3.5 h-3.5" />} onSelect={() => onStartRename(node.path)}>
              Rename <span className="ml-auto text-[10px] text-zinc-500">F2</span>
            </CtxItem>
          )}
          <CtxItem icon={<FolderInput className="w-3.5 h-3.5" />} onSelect={() => onContextMove(node)}>Move to…</CtxItem>
          <ContextMenu.Separator className="h-px bg-zinc-800 my-1" />
          <CtxItem icon={<Trash2 className="w-3.5 h-3.5 text-red-400" />} className="text-red-400" onSelect={() => onContextDelete(node)}>Delete</CtxItem>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
    </div>
  )

  return rowContent
}

function CtxItem({ icon, onSelect, children, className }: { icon: React.ReactNode; onSelect: () => void; children: React.ReactNode; className?: string }) {
  return (
    <ContextMenu.Item
      onSelect={onSelect}
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 cursor-pointer outline-none data-[highlighted]:bg-zinc-800 text-zinc-200",
        className
      )}
    >
      {icon}
      <span className="flex-1 flex items-center">{children}</span>
    </ContextMenu.Item>
  )
}

interface RenameInputProps {
  initial: string
  onCommit: (v: string) => void
  onCancel: () => void
}

const RenameInput = forwardRef<HTMLInputElement, RenameInputProps>(
  ({ initial, onCommit, onCancel }, ref) => {
    const [v, setV] = useState(initial)
    return (
      <input
        ref={ref}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => onCommit(v)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); onCommit(v) }
          if (e.key === "Escape") { e.preventDefault(); onCancel() }
        }}
        onClick={(e) => e.stopPropagation()}
        className="flex-1 bg-zinc-800 text-zinc-100 text-sm px-1 py-0.5 rounded outline-none ring-1 ring-amber-500/50"
      />
    )
  }
)
RenameInput.displayName = "RenameInput"

// ─── Dialogs ─────────────────────────────────────────────────────

function NewItemDialog({ open, kind, parent, onClose, onCreate }: {
  open: boolean
  kind: "file" | "folder"
  parent: string
  onClose: () => void
  onCreate: (name: string) => void
}) {
  const [name, setName] = useState("")
  useEffect(() => { if (!open) setName("") }, [open])
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New {kind} in {parent}</DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          placeholder={kind === "file" ? "filename.md" : "folder-name"}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) onCreate(name.trim()) }}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!name.trim()} onClick={() => onCreate(name.trim())}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MoveDialog({ node, tree, onClose, onMove }: {
  node: TreeNode | null
  tree: TreeNode[]
  onClose: () => void
  onMove: (n: TreeNode, newParent: string) => void
}) {
  const folders = useMemo(() => collectFolders(tree, []), [tree])
  const [target, setTarget] = useState<string>("/")
  return (
    <Dialog open={!!node} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Move {node?.name} to…</DialogTitle>
        </DialogHeader>
        <div className="max-h-64 overflow-y-auto -mx-1 px-1">
          {folders
            .filter((f) => !node || (f !== node.path && !f.startsWith(node.path + "/")))
            .map((f) => (
              <button
                key={f}
                onClick={() => setTarget(f)}
                className={cn(
                  "block w-full text-left text-sm px-2 py-1.5 rounded",
                  target === f ? "bg-amber-500/20 text-amber-100" : "text-zinc-300 hover:bg-zinc-800/60"
                )}
              >
                {f === "/" ? "/ (root)" : f}
              </button>
            ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => node && onMove(node, target)}>Move</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function collectFolders(nodes: TreeNode[], acc: string[]): string[] {
  if (acc.length === 0) acc.push("/")
  for (const n of nodes) {
    if (n.kind === "folder") {
      acc.push(n.path)
      collectFolders(n.children || [], acc)
    }
  }
  return acc
}

function DeleteDialog({ node, onClose, onConfirm }: {
  node: TreeNode | null
  onClose: () => void
  onConfirm: (n: TreeNode) => void
}) {
  return (
    <Dialog open={!!node} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete {node?.name}?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-zinc-400">
          This {node?.kind} moves into <code className="text-zinc-300">/.trash/</code> on the AI VPS.
          Restorable by an admin for ~30 seconds, then it gets cleaned up.
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={() => node && onConfirm(node)}>Delete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Friendly empty state for HTTP 503 ──────────────────────────

function NotConfiguredEmptyState() {
  return (
    <div className="p-6 text-sm text-zinc-300 space-y-4">
      <div className="flex items-center gap-2 text-amber-400">
        <Cog className="w-5 h-5" />
        <h3 className="font-medium">Memory Vault isn&apos;t connected yet</h3>
      </div>
      <p className="text-zinc-400">
        The Memory Tree page reads from a small file-server running on your AI VPS.
        Two env vars need to be set in Vercel before it can talk to the server:
      </p>
      <ol className="list-decimal pl-5 text-xs space-y-2 text-zinc-400">
        <li>
          On the AI VPS, run <code className="text-zinc-200 bg-zinc-800/60 px-1 py-0.5 rounded">tailscale funnel --bg 8788</code> to expose the file-server publicly. Copy the URL it prints.
        </li>
        <li>
          In Vercel <strong>→ Settings → Environment Variables</strong> on the <code>outreach-github</code> project, add:
          <ul className="list-disc pl-5 mt-1 space-y-0.5">
            <li><code className="text-zinc-200 bg-zinc-800/60 px-1 rounded">MEMORY_VAULT_API_URL</code> — the URL from step 1</li>
            <li><code className="text-zinc-200 bg-zinc-800/60 px-1 rounded">MEMORY_VAULT_TOKEN</code> — the token from <code>/root/.config/social-saas/.env</code> on the AI VPS</li>
          </ul>
        </li>
        <li>Trigger a redeploy (or push any commit). The page will populate automatically.</li>
      </ol>
      <p className="text-zinc-500 text-xs">
        The full setup runbook is at <code>/docs/ai-vps-runbook.md</code> in the repo.
      </p>
    </div>
  )
}
