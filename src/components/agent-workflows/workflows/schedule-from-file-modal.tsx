"use client"

/**
 * "Schedule overnight" modal — opens from a workflow card. Lets the user
 * point this workflow at a markdown file from the Memory vault (or paste
 * raw text), pick a time, and create a `schedules` row that the per-minute
 * tick will fire near the requested moment.
 *
 * Submitted payload always lives at `payload.message` so any workflow whose
 * agent prompt references {{message}} (Quick Ask, Build Feature End-to-End,
 * Investigate Bug, etc.) just works.
 */

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { CalendarClock, FileText, Pencil, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { TreeView } from "@/components/memory-tree/tree-view"
import { createSchedule } from "@/lib/api/schedules"
import { cn } from "@/lib/utils"

interface Props {
  workflowId: string
  workflowName: string
  workflowEmoji?: string | null
  onScheduled?: () => void
}

type SourceMode = "file" | "paste"

interface Preset {
  label: string
  cron: string
  hint: string
}

const PRESETS: Preset[] = [
  { label: "Every night at 3am",   cron: "0 3 * * *",   hint: "Quietest hours — best for long-running builds." },
  { label: "Every morning at 7am", cron: "0 7 * * *",   hint: "Ready when you wake up." },
  { label: "Weekday 9am",          cron: "0 9 * * 1-5", hint: "Mon–Fri only." },
  { label: "Once an hour",         cron: "0 * * * *",   hint: "Polls hourly. Use sparingly." },
]

export function ScheduleFromFileModal({ workflowId, workflowName, workflowEmoji, onScheduled }: Props) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<SourceMode>("file")
  const [filePath, setFilePath] = useState<string | null>(null)
  const [filePreview, setFilePreview] = useState<string>("")
  const [pasted, setPasted] = useState("")
  const [presetCron, setPresetCron] = useState<string>(PRESETS[0].cron)
  const [customCron, setCustomCron] = useState("")
  const [tz, setTz] = useState("America/New_York")
  const [submitting, setSubmitting] = useState(false)

  // When user picks a file, fetch first chunk of the body so they see it's
  // the right one before scheduling. Don't store the body on submit — the
  // backend re-reads at fire time so edits in between are honored.
  useEffect(() => {
    if (mode !== "file" || !filePath) { setFilePreview(""); return }
    let cancelled = false
    fetch(`/api/memory-vault/file?path=${encodeURIComponent(filePath)}`, { cache: "no-store" })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`vault ${r.status}`)))
      .then(d => { if (!cancelled) setFilePreview((d?.content || "").slice(0, 600)) })
      .catch(e => { if (!cancelled) setFilePreview(`(could not load preview: ${(e as Error).message})`) })
    return () => { cancelled = true }
  }, [mode, filePath])

  const cron = customCron.trim() || presetCron
  const messagePreview = useMemo(() => {
    if (mode === "paste") return pasted
    if (filePath) return filePreview
    return ""
  }, [mode, pasted, filePath, filePreview])

  const canSubmit = !!cron && (mode === "paste" ? pasted.trim().length > 0 : !!filePath)

  async function submit() {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      // Resolve the message content right now. We could let the workflow
      // re-read at fire time, but capturing once keeps the schedule
      // deterministic — the user knows exactly what's queued.
      let message: string
      if (mode === "paste") {
        message = pasted
      } else if (filePath) {
        const r = await fetch(`/api/memory-vault/file?path=${encodeURIComponent(filePath)}`, { cache: "no-store" })
        const d = await r.json().catch(() => ({}))
        if (!r.ok || typeof d.content !== "string") throw new Error("Could not read vault file")
        message = d.content
      } else {
        throw new Error("No source selected")
      }
      const presetLabel = PRESETS.find(p => p.cron === presetCron)?.label
      const name = `${workflowName} — ${customCron ? `cron \`${cron}\`` : presetLabel}`
      await createSchedule({
        workflow_id: workflowId,
        name,
        cron,
        timezone: tz,
        payload: { message, source: mode === "file" ? { kind: "vault_file", path: filePath } : { kind: "paste" } },
        enabled: true,
      })
      toast.success(`Scheduled — first run computed by next tick.`)
      onScheduled?.()
      setOpen(false)
      // Reset form
      setMode("file"); setFilePath(null); setPasted(""); setCustomCron(""); setPresetCron(PRESETS[0].cron)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        size="sm"
        variant="outline"
        className="text-[10px] h-6 px-2"
        onClick={(e) => { e.stopPropagation(); setOpen(true) }}
      >
        <CalendarClock className="w-3 h-3 mr-1" /> Schedule
      </Button>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Schedule {workflowEmoji} {workflowName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {/* Source picker */}
          <div>
            <Label className="text-xs uppercase tracking-wider text-zinc-500">Input</Label>
            <div className="flex gap-2 mt-1">
              <Button
                type="button"
                size="sm"
                variant={mode === "file" ? "default" : "outline"}
                className="text-xs"
                onClick={() => setMode("file")}
              >
                <FileText className="w-3 h-3 mr-1" /> Pick file from Memory
              </Button>
              <Button
                type="button"
                size="sm"
                variant={mode === "paste" ? "default" : "outline"}
                className="text-xs"
                onClick={() => setMode("paste")}
              >
                <Pencil className="w-3 h-3 mr-1" /> Type or paste
              </Button>
            </div>
          </div>

          {mode === "file" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="border border-zinc-800 rounded h-56 overflow-hidden">
                <TreeView selectedPath={filePath} onSelect={setFilePath} />
              </div>
              <div className="border border-zinc-800 rounded h-56 overflow-auto bg-zinc-950 text-xs p-2 font-mono whitespace-pre-wrap text-zinc-300">
                {filePath ? (filePreview || "Loading…") : <span className="text-zinc-600">Pick a file on the left to preview it.</span>}
              </div>
            </div>
          ) : (
            <Textarea
              rows={8}
              placeholder="Paste a project description, prompt, or task. The selected workflow will receive this as {{message}}."
              value={pasted}
              onChange={e => setPasted(e.target.value)}
              className="font-mono text-xs"
            />
          )}

          {/* When picker */}
          <div>
            <Label className="text-xs uppercase tracking-wider text-zinc-500">When</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-1">
              {PRESETS.map(p => (
                <button
                  key={p.cron}
                  type="button"
                  onClick={() => { setPresetCron(p.cron); setCustomCron("") }}
                  className={cn(
                    "text-left rounded border px-3 py-2 transition-colors",
                    !customCron && presetCron === p.cron
                      ? "border-amber-500/60 bg-amber-500/5"
                      : "border-zinc-800 hover:border-zinc-700",
                  )}
                >
                  <div className="text-xs font-medium text-zinc-100">{p.label}</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">{p.hint} · <code className="text-zinc-400">{p.cron}</code></div>
                </button>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-[1fr_180px] gap-2">
              <div>
                <Label className="text-[10px] text-zinc-500">Or custom cron expression</Label>
                <Input
                  value={customCron}
                  onChange={e => setCustomCron(e.target.value)}
                  placeholder="e.g. 30 2 * * 1   (every Monday 2:30am)"
                  className="text-xs font-mono"
                />
              </div>
              <div>
                <Label className="text-[10px] text-zinc-500">Timezone</Label>
                <Input value={tz} onChange={e => setTz(e.target.value)} className="text-xs" />
              </div>
            </div>
          </div>

          {/* Tiny preview of what'll be queued */}
          <div className="text-[11px] text-zinc-500 border-t border-zinc-900 pt-2">
            Queues a run of <span className="text-zinc-300">{workflowEmoji} {workflowName}</span> on cron <code className="text-zinc-300">{cron}</code> ({tz}) with a {messagePreview ? `${messagePreview.length}-char` : "—"} message.
            <div className="mt-1 text-zinc-600">First fire is computed by the next tick (within ~60s).</div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit || submitting}>
            {submitting ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Scheduling…</> : "Schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
