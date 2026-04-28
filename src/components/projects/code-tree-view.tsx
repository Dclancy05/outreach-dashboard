"use client"
/**
 * Code Tree — read-only file-tree browser for the Project Tree tab.
 *
 * Forked from memory-tree/tree-view.tsx but stripped of all editing primitives:
 * no DnD, no rename, no delete, no context menu, no SSE watcher. ~200 LOC.
 */
import { useCallback, useEffect, useMemo, useState } from "react"
import * as Collapsible from "@radix-ui/react-collapsible"
import { ChevronRight, File, Folder, FolderOpen, Loader2, RefreshCw, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { SessionExpiredCard } from "./session-expired"

export interface CodeNode {
  name: string
  path: string                 // "agency-hq/src/app/page.tsx"
  kind: "file" | "folder"
  size?: number
  sha?: string
  children?: CodeNode[]
}

interface TreeResponse {
  tree: CodeNode[]
  configured: boolean
  hint?: string
}

interface Props {
  selectedPath: string | null
  onSelect: (path: string, kind: "file" | "folder") => void
}

export function CodeTreeView({ selectedPath, onSelect }: Props) {
  const [data, setData] = useState<TreeResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [errorStatus, setErrorStatus] = useState<number | null>(null)
  const [filter, setFilter] = useState("")
  const [openDirs, setOpenDirs] = useState<Set<string>>(new Set())

  const fetchTree = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/projects/tree", { cache: "no-store" })
      const body = (await res.json()) as TreeResponse & { error?: string }
      if (!res.ok) {
        setErrorStatus(res.status)
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      setErrorStatus(null)
      setData(body)
      // Auto-expand the project root folders so the user sees them by default
      if (body.tree?.length) {
        setOpenDirs(prev => {
          const next = new Set(prev)
          for (const top of body.tree) next.add(top.path)
          return next
        })
      }
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchTree() }, [fetchTree])

  const filtered = useMemo(() => {
    if (!data?.tree) return null
    const q = filter.trim().toLowerCase()
    if (!q) return data.tree
    return data.tree.map(top => filterNode(top, q)).filter(Boolean) as CodeNode[]
  }, [data, filter])

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-zinc-500">
        <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading source tree…
      </div>
    )
  }

  if (error) {
    if (errorStatus === 401) return <SessionExpiredCard what="the source code tree" />
    return (
      <div className="p-3 text-sm text-red-300">
        {error}
        <Button size="sm" variant="outline" className="mt-2" onClick={fetchTree}>
          <RefreshCw className="w-3 h-3 mr-1.5" /> Retry
        </Button>
      </div>
    )
  }

  if (data && !data.configured) {
    return (
      <div className="p-4 text-sm text-zinc-400 space-y-2">
        <div className="font-medium text-zinc-200">Project Tree isn&apos;t hooked up yet</div>
        <div>{data.hint || "Set GITHUB_PAT in Vercel env and reload."}</div>
        <Button size="sm" variant="outline" onClick={fetchTree} className="mt-2">
          <RefreshCw className="w-3 h-3 mr-1.5" /> Re-check
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-2 py-2 border-b border-zinc-800/60 flex items-center gap-2 shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
          <Input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Filter files…"
            className="h-7 pl-7 text-xs bg-zinc-900/50"
          />
        </div>
        <Button size="sm" variant="ghost" onClick={fetchTree} title="Refresh" className="h-7 w-7 p-0">
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
        </Button>
      </div>
      <div className="flex-1 overflow-auto py-1">
        {filtered?.map(node => (
          <NodeRow
            key={node.path}
            node={node}
            depth={0}
            selectedPath={selectedPath}
            onSelect={onSelect}
            openDirs={openDirs}
            setOpenDirs={setOpenDirs}
          />
        ))}
      </div>
    </div>
  )
}

function filterNode(node: CodeNode, q: string): CodeNode | null {
  if (node.kind === "file") {
    return node.name.toLowerCase().includes(q) || node.path.toLowerCase().includes(q) ? node : null
  }
  const matchedChildren = (node.children ?? []).map(c => filterNode(c, q)).filter(Boolean) as CodeNode[]
  if (matchedChildren.length === 0 && !node.name.toLowerCase().includes(q)) return null
  return { ...node, children: matchedChildren }
}

interface NodeRowProps {
  node: CodeNode
  depth: number
  selectedPath: string | null
  onSelect: (path: string, kind: "file" | "folder") => void
  openDirs: Set<string>
  setOpenDirs: React.Dispatch<React.SetStateAction<Set<string>>>
}

function NodeRow({ node, depth, selectedPath, onSelect, openDirs, setOpenDirs }: NodeRowProps) {
  const isOpen = openDirs.has(node.path)
  const isSelected = selectedPath === node.path
  const indent = { paddingLeft: 8 + depth * 12 }

  if (node.kind === "file") {
    return (
      <button
        type="button"
        onClick={() => onSelect(node.path, "file")}
        className={cn(
          "flex items-center gap-1.5 w-full text-left text-xs py-1 pr-2 rounded-sm hover:bg-zinc-800/60",
          isSelected && "bg-amber-500/20 text-amber-100 hover:bg-amber-500/25",
        )}
        style={indent}
      >
        <File className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
        <span className="truncate font-mono">{node.name}</span>
      </button>
    )
  }

  function toggle() {
    setOpenDirs(prev => {
      const next = new Set(prev)
      if (next.has(node.path)) next.delete(node.path)
      else next.add(node.path)
      return next
    })
  }

  return (
    <Collapsible.Root open={isOpen} onOpenChange={toggle}>
      <div
        className={cn(
          "flex items-center gap-1 w-full text-xs py-1 rounded-sm hover:bg-zinc-800/60 cursor-pointer",
          isSelected && "bg-amber-500/20 text-amber-100",
        )}
        style={indent}
        onClick={() => onSelect(node.path, "folder")}
      >
        <Collapsible.Trigger asChild>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); toggle() }}
            className="shrink-0 p-0.5 -ml-0.5"
            aria-label={isOpen ? "Collapse" : "Expand"}
          >
            <ChevronRight className={cn("w-3 h-3 text-zinc-500 transition-transform", isOpen && "rotate-90")} />
          </button>
        </Collapsible.Trigger>
        {isOpen
          ? <FolderOpen className="w-3.5 h-3.5 text-amber-400/70 shrink-0" />
          : <Folder     className="w-3.5 h-3.5 text-amber-400/70 shrink-0" />}
        <span className="truncate font-mono">{node.name}</span>
      </div>
      <Collapsible.Content>
        {(node.children ?? []).map(c => (
          <NodeRow
            key={c.path}
            node={c}
            depth={depth + 1}
            selectedPath={selectedPath}
            onSelect={onSelect}
            openDirs={openDirs}
            setOpenDirs={setOpenDirs}
          />
        ))}
      </Collapsible.Content>
    </Collapsible.Root>
  )
}
