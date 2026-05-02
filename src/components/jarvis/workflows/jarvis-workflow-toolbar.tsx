"use client"

/**
 * JarvisWorkflowToolbar — toolbar row that sits between the title row and the
 * 3-pane builder body. Hosts the dirty/saved badge, error pill, and
 * Save/Run/Templates/Fit View actions.
 *
 * Save: imperative (parent supplies onSaveNow). Autosave still ticks every
 * 1.5s in the parent — this is the "save right now" escape hatch.
 *
 * Run: opens a small input-JSON dialog, then POSTs /api/workflows/[id]/run
 * via the runWorkflow helper, which delegates to Inngest under the hood.
 *
 * Templates: links to the legacy /agency/agents Workflows tab where the full
 * template gallery lives — the Jarvis builder edits one workflow at a time,
 * the legacy view is the catalog.
 *
 * Fit: imperative re-fit (parent supplies onFitView). Useful after dragging
 * nodes off-screen.
 */

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"
import {
  Save,
  Play,
  FileBox,
  Maximize2,
  CheckCircle2,
  Loader2,
  AlertTriangle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { runWorkflow } from "@/lib/api/workflows"
import { cn } from "@/lib/utils"

interface JarvisWorkflowToolbarProps {
  workflowId: string
  dirty: boolean
  errorCount: number
  onSaveNow: () => Promise<void> | void
  onFitView: () => void
}

export function JarvisWorkflowToolbar({
  workflowId,
  dirty,
  errorCount,
  onSaveNow,
  onFitView,
}: JarvisWorkflowToolbarProps) {
  const [saving, setSaving] = React.useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      await onSaveNow()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-center gap-2 px-4 sm:px-6 pb-3 shrink-0 flex-wrap">
      {/* Status pill */}
      <div
        className={cn(
          "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border text-[11px] font-mono",
          dirty
            ? "bg-mem-status-thinking/10 border-mem-status-thinking/30 text-mem-status-thinking"
            : "bg-mem-surface-1 border-mem-border text-mem-text-muted"
        )}
        aria-live="polite"
      >
        {saving ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : dirty ? (
          <span className="w-1.5 h-1.5 rounded-full bg-mem-status-thinking" />
        ) : (
          <CheckCircle2 className="w-3 h-3" />
        )}
        {saving ? "Saving…" : dirty ? "Unsaved" : "Saved"}
      </div>

      {/* Error pill */}
      {errorCount > 0 && (
        <div className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-mem-status-stuck/10 border border-mem-status-stuck/30 text-mem-status-stuck text-[11px]">
          <AlertTriangle className="w-3 h-3" />
          {errorCount} issue{errorCount === 1 ? "" : "s"}
        </div>
      )}

      <div className="ml-auto flex items-center gap-1.5">
        {/* Templates */}
        <Button
          asChild
          size="sm"
          variant="ghost"
          className="h-8 text-mem-text-secondary hover:text-mem-text-primary text-[12px]"
        >
          <Link href="/jarvis/agents?tab=workflows" prefetch={false}>
            <FileBox className="w-3.5 h-3.5 mr-1.5" />
            Templates
          </Link>
        </Button>

        {/* Fit view dropdown trigger (single button — no dropdown needed yet) */}
        <Button
          size="sm"
          variant="ghost"
          className="h-8 text-mem-text-secondary hover:text-mem-text-primary text-[12px]"
          onClick={onFitView}
          title="Re-fit canvas to nodes"
          data-testid="jarvis-workflow-fit"
        >
          <Maximize2 className="w-3.5 h-3.5 mr-1.5" />
          Fit
        </Button>

        {/* Save (manual) */}
        <Button
          size="sm"
          variant="outline"
          className="h-8 border-mem-border bg-mem-surface-1 hover:bg-mem-surface-2 text-mem-text-primary text-[12px]"
          onClick={handleSave}
          disabled={saving || !dirty}
          data-testid="jarvis-workflow-save"
        >
          <Save className="w-3.5 h-3.5 mr-1.5" />
          Save
        </Button>

        {/* Run */}
        <RunDialog workflowId={workflowId} disabled={errorCount > 0} />
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function RunDialog({
  workflowId,
  disabled,
}: {
  workflowId: string
  disabled: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const [json, setJson] = React.useState("{}")
  const [submitting, setSubmitting] = React.useState(false)

  async function submit() {
    setSubmitting(true)
    try {
      let input: Record<string, unknown> = {}
      try {
        const parsed: unknown = JSON.parse(json || "{}")
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          input = parsed as Record<string, unknown>
        } else {
          throw new Error("Input must be a JSON object")
        }
      } catch (e) {
        toast.error(`Bad JSON: ${(e as Error).message}`)
        return
      }
      const r = await runWorkflow(workflowId, input)
      toast.success(
        `Run ${r.run_id.slice(0, 8)} queued — watch in /jarvis/agents?tab=runs`
      )
      setOpen(false)
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
        className="h-8 bg-mem-accent text-white hover:brightness-110 text-[12px]"
        onClick={() => setOpen(true)}
        disabled={disabled}
        data-testid="jarvis-workflow-run"
      >
        <Play className="w-3.5 h-3.5 mr-1.5" />
        Run
      </Button>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Run workflow</DialogTitle>
          <DialogDescription className="text-mem-text-muted text-[12px]">
            Real LLM calls — counts toward your daily cap. Watch the run live in
            the Runs subtab.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <Label htmlFor="jw-run-input" className="text-xs">
            Input (JSON)
          </Label>
          <Textarea
            id="jw-run-input"
            value={json}
            onChange={(e) => setJson(e.target.value)}
            rows={6}
            className="font-mono text-xs"
            spellCheck={false}
          />
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={submitting}
            className="bg-mem-accent text-white hover:brightness-110"
          >
            {submitting ? "Queueing…" : "Run"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
