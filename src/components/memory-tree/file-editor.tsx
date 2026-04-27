"use client"
/**
 * File editor for a single vault file. Reuses the autosave pattern from
 * components/memory/memory-editor.tsx (debounce 700 ms, SaveIndicator).
 *
 * Layout: top bar (path + tabs Edit/Preview + save status) + textarea / preview body.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import { Loader2, Eye, Pencil } from "lucide-react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { SaveIndicator, type SaveState } from "@/components/memory/save-indicator"
import { cn } from "@/lib/utils"

const SAVE_DEBOUNCE_MS = 700

interface FileEditorProps {
  path: string
}

interface FileResponse {
  path: string
  content: string
  size: number
  updated_at: string
}

export function FileEditor({ path }: FileEditorProps) {
  const [content, setContent] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>("idle")
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlight = useRef<AbortController | null>(null)

  // Load file when path changes
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/memory-vault/file?path=${encodeURIComponent(path)}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
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
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
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

  // Flush on unmount/path change
  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current)
        // Fire-and-forget final save (may not complete if browser is closing)
        persist(content)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-zinc-500">
        <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading {path}…
      </div>
    )
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
      </div>
      <Tabs defaultValue="edit" className="flex-1 flex flex-col min-h-0">
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
    </div>
  )
}
