"use client"
/**
 * File editor for a single vault file. Reuses the autosave pattern from
 * components/memory/memory-editor.tsx (debounce 700 ms, SaveIndicator).
 *
 * Header actions: Move… (folder picker), Delete (confirm). Body: Edit /
 * Preview tabs.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import { Loader2, Eye, Pencil, Trash2, FolderInput } from "lucide-react"
import { toast } from "sonner"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { SaveIndicator, type SaveState } from "@/components/memory/save-indicator"
import { SessionExpiredCard } from "@/components/projects/session-expired"
import { cn } from "@/lib/utils"

const SAVE_DEBOUNCE_MS = 700

interface FileEditorProps {
  path: string
  onPathChange?: (newPath: string | null) => void
  /** Initial tab to show when the editor mounts. Default "edit" for the
   *  Memory Tree, "preview" for the Agents subtab where users mostly want
   *  to read the agent's description rather than tweak it. */
  defaultTab?: "edit" | "preview"
}

interface FileResponse {
  path: string
  content: string
  size: number
  updated_at: string
}

interface TreeNode {
  name: string
  path: string
  kind: "file" | "folder"
  children?: TreeNode[]
}

export function FileEditor({ path, onPathChange, defaultTab = "edit" }: FileEditorProps) {
  const [content, setContent] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [errorStatus, setErrorStatus] = useState<number | null>(null)
  const [saveState, setSaveState] = useState<SaveState>("idle")
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [moveDialogOpen, setMoveDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlight = useRef<AbortController | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setErrorStatus(null)
    fetch(`/api/memory-vault/file?path=${encodeURIComponent(path)}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          if (!cancelled) setErrorStatus(res.status)
          throw new Error(body.error || `HTTP ${res.status}`)
        }
        return res.json() as Promise<FileResponse>
      })
      .then((data) => {
        if (cancelled) return
        setContent(data.content || "")
        setLastSavedAt(new Date(data.updated_at))
        setSaveState("idle")
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => {
      cancelled = true
      if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null }
      inFlight.current?.abort()
    }
  }, [path])

  const persist = useCallback(async (next: string) => {
    inFlight.current?.abort()
    const ctl = new AbortController()
    inFlight.current = ctl
    setSaveState("saving")
    try {
      const res = await fetch("/api/memory-vault/file", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, content: next }),
        signal: ctl.signal,
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      setLastSavedAt(new Date(data.updated_at || Date.now()))
      setSaveState("saved")
    } catch (err) {
      if ((err as Error).name === "AbortError") return
      setSaveState("error")
      console.error("[file-editor] save failed:", err)
    }
  }, [path])

  const onChange = useCallback((next: string) => {
    setContent(next)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => persist(next), SAVE_DEBOUNCE_MS)
  }, [persist])

  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current)
        persist(content)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path])

  async function softDelete() {
    try {
      const res = await fetch(`/api/memory-vault/file?path=${encodeURIComponent(path)}`, { method: "DELETE" })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`)
      toast.success(`Deleted ${path.split("/").pop()}`)
      onPathChange?.(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed")
    } finally {
      setDeleteDialogOpen(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-zinc-500">
        <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading {path}…
      </div>
    )
  }

  if (errorStatus === 401) {
    return <SessionExpiredCard what="this file" />
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="text-red-400 font-medium mb-1">Couldn&apos;t load this file</div>
        <div className="text-xs text-zinc-400 break-all">{error}</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800/60 shrink-0">
        <div className="flex-1 min-w-0">
          <div className="text-xs text-zinc-500 truncate">{path.split("/").slice(0, -1).join(" / ") || "/"}</div>
          <div className="text-sm text-zinc-100 font-medium truncate">{path.split("/").pop()}</div>
        </div>
        <Badge variant="outline" className="text-[10px] tabular-nums">
          {content.length.toLocaleString()} chars
        </Badge>
        <SaveIndicator state={saveState} lastSavedAt={lastSavedAt} />
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-zinc-500 hover:text-zinc-100"
            onClick={() => setMoveDialogOpen(true)}
            title="Move file to another folder"
          >
            <FolderInput className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-zinc-500 hover:text-red-400"
            onClick={() => setDeleteDialogOpen(true)}
            title="Delete (soft — into /.trash/)"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
      <Tabs defaultValue={defaultTab} className="flex-1 flex flex-col min-h-0">
        <TabsList className="mx-4 mt-2 self-start">
          <TabsTrigger value="edit" className="gap-1.5"><Pencil className="w-3.5 h-3.5" />Edit</TabsTrigger>
          <TabsTrigger value="preview" className="gap-1.5"><Eye className="w-3.5 h-3.5" />Preview</TabsTrigger>
        </TabsList>
        <TabsContent value="edit" className="flex-1 px-4 pb-4 mt-2 min-h-0">
          <Textarea
            value={content}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Write markdown here…"
            className="h-full w-full font-mono text-sm resize-none"
            spellCheck={false}
          />
        </TabsContent>
        <TabsContent value="preview" className="flex-1 px-4 pb-4 mt-2 min-h-0 overflow-y-auto">
          <article className={cn("prose prose-invert max-w-none text-sm")}>
            <ReactMarkdown>{content || "_(empty)_"}</ReactMarkdown>
          </article>
        </TabsContent>
      </Tabs>

      {/* Move dialog */}
      <MoveFileDialog
        open={moveDialogOpen}
        currentPath={path}
        onClose={() => setMoveDialogOpen(false)}
        onMoved={(newPath) => {
          setMoveDialogOpen(false)
          onPathChange?.(newPath)
          toast.success(`Moved`)
        }}
      />

      {/* Delete dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {path.split("/").pop()}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-zinc-400">
            Moves to <code className="text-zinc-300">/.trash/</code> on the AI VPS. Restorable for ~30s.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={softDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Move file dialog ────────────────────────────────────────────

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

function MoveFileDialog({ open, currentPath, onClose, onMoved }: {
  open: boolean
  currentPath: string
  onClose: () => void
  onMoved: (newPath: string) => void
}) {
  const [folders, setFolders] = useState<string[]>([])
  const [target, setTarget] = useState("/")
  const [moving, setMoving] = useState(false)
  const currentParent = useMemo(() => currentPath.split("/").slice(0, -1).join("/") || "/", [currentPath])
  const fileName = useMemo(() => currentPath.split("/").pop() || "", [currentPath])

  useEffect(() => {
    if (!open) return
    fetch("/api/memory-vault/tree", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => setFolders(collectFolders(data.tree || [], [])))
  }, [open])

  async function handleMove() {
    if (target === currentParent) { onClose(); return }
    setMoving(true)
    const to = `${target.replace(/\/$/, "")}/${fileName}`.replace(/^\//, "/")
    try {
      const res = await fetch("/api/memory-vault/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: currentPath, to }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`)
      onMoved(to)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Move failed")
    } finally {
      setMoving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Move {fileName} to…</DialogTitle>
        </DialogHeader>
        <div className="max-h-64 overflow-y-auto -mx-1 px-1">
          {folders.map((f) => (
            <button
              key={f}
              onClick={() => setTarget(f)}
              disabled={f === currentParent}
              className={cn(
                "block w-full text-left text-sm px-2 py-1.5 rounded",
                target === f ? "bg-amber-500/20 text-amber-100" : "text-zinc-300 hover:bg-zinc-800/60",
                f === currentParent && "opacity-50 cursor-not-allowed"
              )}
            >
              {f === "/" ? "/ (root)" : f}{f === currentParent ? "  (current)" : ""}
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleMove} disabled={moving || target === currentParent}>
            {moving ? "Moving…" : "Move"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
