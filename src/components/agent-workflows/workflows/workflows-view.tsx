"use client"

/**
 * Workflows subtab — list view by default; clicking one opens the visual
 * builder. "+ New" creates blank or from a template.
 */

import { useState } from "react"
import useSWR from "swr"
import { toast } from "sonner"
import { Plus, Workflow as WorkflowIcon, ArrowLeft, FileBox } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { listWorkflows, createWorkflow, type Workflow } from "@/lib/api/workflows"
import { WorkflowBuilder } from "@/components/agent-workflows/workflows/workflow-builder"
import { ScheduleFromFileModal } from "@/components/agent-workflows/workflows/schedule-from-file-modal"

export function WorkflowsView() {
  const { data: workflows = [], mutate } = useSWR<Workflow[]>("workflows", () => listWorkflows({}))
  const { data: templates = [] } = useSWR<Workflow[]>("workflow-templates", () => listWorkflows({ templates_only: true }))
  const [openId, setOpenId] = useState<string | null>(null)

  if (openId) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-3 py-2 border-b border-zinc-800/60 flex items-center gap-2 shrink-0">
          <Button size="sm" variant="ghost" className="h-7" onClick={() => setOpenId(null)}>
            <ArrowLeft className="w-3 h-3 mr-1" /> Back to list
          </Button>
        </div>
        <div className="flex-1 min-h-0">
          <WorkflowBuilder workflowId={openId} onClose={() => { setOpenId(null); mutate() }} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-zinc-800/60 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
            <WorkflowIcon className="w-4 h-4" /> Workflows
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">Visual recipes that chain agents together. Loops, approval gates, scheduled overnight runs.</p>
        </div>
        <NewWorkflowDialog templates={templates} onCreated={(id) => { mutate(); setOpenId(id) }} />
      </div>

      {/* Templates row */}
      {templates.length > 0 && (
        <div className="px-4 pt-3 pb-2 border-b border-zinc-900/40">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Templates — start from these</div>
          <div className="flex gap-2 flex-wrap">
            {templates.map(t => (
              <NewFromTemplateButton key={t.id} template={t} onCreated={(id) => { mutate(); setOpenId(id) }} />
            ))}
          </div>
        </div>
      )}

      {/* Your workflows */}
      <div className="flex-1 overflow-auto p-4">
        {workflows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-zinc-500 text-sm">
            <WorkflowIcon className="w-10 h-10 mb-3 text-zinc-700" />
            <div>No workflows yet.</div>
            <div className="text-xs text-zinc-600 mt-1 text-center max-w-md px-6">
              Click a template above to start with a working example, or hit "+ New workflow" for a blank canvas.
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {workflows.map(w => (
              <Card key={w.id} className="p-3 hover:border-amber-500/40 transition-colors group">
                <div className="flex items-start gap-2 cursor-pointer" onClick={() => setOpenId(w.id)}>
                  <span className="text-2xl">{w.emoji || "⚙️"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-zinc-100 truncate">{w.name}</div>
                    <div className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{w.description || "No description."}</div>
                    <div className="flex items-center gap-2 mt-2 text-[10px] text-zinc-500">
                      <span className="capitalize">{w.status}</span>
                      <span>·</span>
                      <span>${w.budget_usd.toString()} cap</span>
                      <span>·</span>
                      <span>{w.use_count} runs</span>
                      {w.last_run_at && <><span>·</span><span>last {formatDistanceToNow(new Date(w.last_run_at), { addSuffix: true })}</span></>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-end mt-2 pt-2 border-t border-zinc-800/40 opacity-70 group-hover:opacity-100 transition-opacity">
                  <ScheduleFromFileModal
                    workflowId={w.id}
                    workflowName={w.name}
                    workflowEmoji={w.emoji}
                  />
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function NewFromTemplateButton({ template, onCreated }: { template: Workflow; onCreated: (id: string) => void }) {
  const [creating, setCreating] = useState(false)
  return (
    <Button size="sm" variant="outline" className="text-xs" disabled={creating} onClick={async () => {
      setCreating(true)
      try {
        const created = await createWorkflow({ name: template.name, description: template.description || undefined, emoji: template.emoji || undefined, from_template_id: template.id } as Partial<Workflow> & { name: string })
        toast.success(`Created from "${template.name}" template`)
        onCreated(created.id)
      } catch (e) { toast.error((e as Error).message) }
      finally { setCreating(false) }
    }}>
      <FileBox className="w-3 h-3 mr-1" /> {template.emoji} {template.name}
    </Button>
  )
}

function NewWorkflowDialog({ templates, onCreated }: { templates: Workflow[]; onCreated: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [emoji, setEmoji] = useState("⚙️")
  const [description, setDescription] = useState("")
  const [templateId, setTemplateId] = useState<string>("__blank__")
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
    setSubmitting(true)
    try {
      const created = await createWorkflow({
        name, emoji, description,
        ...(templateId !== "__blank__" ? { from_template_id: templateId } : {}),
      } as Partial<Workflow> & { name: string })
      toast.success("Workflow created")
      onCreated(created.id)
      setOpen(false)
      setName(""); setDescription("")
    } catch (e) { toast.error((e as Error).message) }
    finally { setSubmitting(false) }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="w-4 h-4 mr-1" /> New workflow</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New workflow</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-[80px_1fr] gap-3">
            <div>
              <Label>Emoji</Label>
              <Input value={emoji} onChange={e => setEmoji(e.target.value)} maxLength={4} />
            </div>
            <div>
              <Label>Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Daily report" />
            </div>
          </div>
          <div>
            <Label>Description</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="What this workflow does (one line)" />
          </div>
          <div>
            <Label>Start from</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__blank__">Blank canvas</SelectItem>
                {templates.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.emoji} {t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={submitting || !name.trim()}>{submitting ? "Creating..." : "Create + open"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
