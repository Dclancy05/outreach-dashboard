"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { History, RotateCcw, ArrowRight } from "lucide-react"
import { getVersions, restoreVersion, type Memory, type MemoryVersion } from "@/lib/api/memory"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

export function VersionHistoryModal({
  memory,
  open,
  onOpenChange,
  onRestored,
}: {
  memory: Memory | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onRestored: (m: Memory) => void
}) {
  const [versions, setVersions] = useState<MemoryVersion[]>([])
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [restoring, setRestoring] = useState(false)

  useEffect(() => {
    if (!open || !memory) return
    setLoading(true)
    getVersions(memory.id)
      .then((v) => { setVersions(v); setSelectedVersionId(v[0]?.id || null) })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false))
  }, [open, memory])

  if (!memory) return null
  const selected = versions.find((v) => v.id === selectedVersionId)

  async function handleRestore() {
    if (!selected || !memory) return
    setRestoring(true)
    try {
      const m = await restoreVersion(memory.id, selected.id)
      toast.success("Restored")
      onRestored(m)
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed")
    } finally {
      setRestoring(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-amber-400" /> Version history — {memory.title}
          </DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading versions…</div>
        ) : versions.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No prior versions yet — they're created automatically every time you edit.
          </div>
        ) : (
          <div className="grid grid-cols-[200px_1fr] gap-4">
            <div className="max-h-96 space-y-1 overflow-y-auto">
              {versions.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setSelectedVersionId(v.id)}
                  className={cn(
                    "w-full rounded-lg border p-2 text-left text-xs transition-all",
                    v.id === selectedVersionId
                      ? "border-amber-400/50 bg-amber-500/10"
                      : "border-border hover:bg-secondary/50"
                  )}
                >
                  <div className="font-medium">
                    {new Date(v.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                  </div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">via {v.changed_by}</div>
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-amber-400/30 bg-amber-500/5 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-amber-300">Selected version</span>
                </div>
                <div className="space-y-2">
                  <div>
                    <div className="text-[10px] uppercase text-muted-foreground">Title</div>
                    <div className="text-sm">{selected?.title || <em className="text-muted-foreground">—</em>}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-muted-foreground">Body</div>
                    <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-card/50 p-2 font-mono text-xs">{selected?.body || ""}</pre>
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="mb-2 text-xs font-semibold text-muted-foreground">Current</div>
                <div className="space-y-2">
                  <div>
                    <div className="text-[10px] uppercase text-muted-foreground">Title</div>
                    <div className="text-sm">{memory.title}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-muted-foreground">Body</div>
                    <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-card/50 p-2 font-mono text-xs">{memory.body}</pre>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button
            onClick={handleRestore}
            disabled={restoring || !selected}
            className="bg-amber-500 hover:bg-amber-600 text-amber-950"
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Restore this version
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
