"use client"
/**
 * Memory Tree — recursive folder/file explorer for the /agency/memory page.
 *
 * Reads from /api/memory-vault/tree, renders Radix Collapsible folders
 * with clickable file leaves. Live updates via SSE on /api/memory-vault/events.
 *
 * P1 scope: read + select. No drag-drop, no context menu, no inline rename.
 * Those land in P2. Folders auto-collapse closed except the current path's chain.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import * as Collapsible from "@radix-ui/react-collapsible"
import { ChevronRight, File, Folder, FolderOpen, Loader2, RefreshCw } from "lucide-react"
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

export function TreeView({ selectedPath, onSelect }: TreeViewProps) {
  const [tree, setTree] = useState<TreeNode[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchTree = useCallback(async () => {
    try {
      const res = await fetch("/api/memory-vault/tree", { cache: "no-store" })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      const data: TreeResponse = await res.json()
      setTree(data.tree)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial load
  useEffect(() => {
    fetchTree()
  }, [fetchTree])

  // Live updates via SSE
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
    return () => {
      cancelled = true
      es?.close()
    }
  }, [fetchTree])

  if (loading && !tree) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-zinc-500">
        <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading vault…
      </div>
    )
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
    <div className="overflow-y-auto h-full text-sm">
      {(tree || []).map((node) => (
        <TreeRow key={node.path} node={node} depth={0} selectedPath={selectedPath} onSelect={onSelect} />
      ))}
    </div>
  )
}

function TreeRow({ node, depth, selectedPath, onSelect }: { node: TreeNode; depth: number; selectedPath: string | null; onSelect: (p: string) => void }) {
  const indent = depth * 12
  const isSelected = selectedPath === node.path
  const inSelectedChain = useMemo(
    () => selectedPath ? selectedPath.startsWith(node.path + "/") : false,
    [selectedPath, node.path]
  )
  const [open, setOpen] = useState(depth === 0 || inSelectedChain)

  if (node.kind === "folder") {
    const fileCount = (node.children || []).filter((c) => c.kind === "file").length
    return (
      <Collapsible.Root open={open} onOpenChange={setOpen}>
        <Collapsible.Trigger asChild>
          <button
            className={cn(
              "flex items-center gap-1 w-full text-left py-1 hover:bg-zinc-800/50 rounded text-zinc-200",
              "px-2 transition-colors"
            )}
            style={{ paddingLeft: 8 + indent }}
          >
            <ChevronRight className={cn("w-3 h-3 text-zinc-500 transition-transform shrink-0", open && "rotate-90")} />
            {open ? <FolderOpen className="w-4 h-4 text-amber-400 shrink-0" /> : <Folder className="w-4 h-4 text-amber-500 shrink-0" />}
            <span className="truncate flex-1">{node.name || "(root)"}</span>
            {fileCount > 0 && (
              <span className="text-[10px] text-zinc-500 shrink-0 tabular-nums">{fileCount}</span>
            )}
          </button>
        </Collapsible.Trigger>
        <Collapsible.Content>
          {(node.children || []).map((child) => (
            <TreeRow key={child.path} node={child} depth={depth + 1} selectedPath={selectedPath} onSelect={onSelect} />
          ))}
        </Collapsible.Content>
      </Collapsible.Root>
    )
  }

  // File
  return (
    <button
      onClick={() => onSelect(node.path)}
      className={cn(
        "flex items-center gap-1 w-full text-left py-1 rounded transition-colors",
        "px-2",
        isSelected
          ? "bg-amber-500/20 text-amber-100"
          : "text-zinc-300 hover:bg-zinc-800/50 hover:text-zinc-100"
      )}
      style={{ paddingLeft: 8 + indent + 16 }}
    >
      <File className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
      <span className="truncate flex-1">{node.name}</span>
      {node.is_symlink && (
        <span className="text-[9px] text-zinc-600 shrink-0">↗</span>
      )}
    </button>
  )
}
