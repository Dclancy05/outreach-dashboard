"use client"

/**
 * Schedules subtab — table of cron schedules + a friendly create modal.
 * The actual scheduler is the every-minute Vercel cron at
 * /api/cron/workflow-tick which drains due rows into the Inngest queue.
 */

import { useState } from "react"
import useSWR from "swr"
import { toast } from "sonner"
import { CalendarClock, Plus, Trash2 } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { listSchedules, createSchedule, updateSchedule, deleteSchedule, humanizeCron, CRON_PRESETS, type Schedule } from "@/lib/api/schedules"
import { listWorkflows, type Workflow } from "@/lib/api/workflows"

export function SchedulesView() {
  const { data: schedules = [], mutate } = useSWR<Schedule[]>("schedules", () => listSchedules({}))
  const { data: workflows = [] } = useSWR<Workflow[]>("workflows-active", () => listWorkflows({ status: "active" }))
  const wfMap = new Map(workflows.map(w => [w.id, w]))

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-zinc-800/60 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
            <CalendarClock className="w-4 h-4" /> Schedules
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">Workflows that fire on a clock. Built for overnight jobs — your laptop can be off.</p>
        </div>
        <NewScheduleDialog workflows={workflows} onCreated={() => mutate()} />
      </div>

      {schedules.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 text-sm">
          <CalendarClock className="w-10 h-10 mb-3 text-zinc-700" />
          <div>No schedules yet.</div>
          <div className="text-xs text-zinc-600 mt-1 text-center max-w-md px-6">
            Pick a workflow, choose when it should run (Daily 2 AM is great for overnight jobs), and we'll fire it on schedule.
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-zinc-500 uppercase tracking-wider">
              <tr className="border-b border-zinc-800/60">
                <th className="text-left px-4 py-2 font-medium">Name</th>
                <th className="text-left px-4 py-2 font-medium">Workflow</th>
                <th className="text-left px-4 py-2 font-medium">When</th>
                <th className="text-left px-4 py-2 font-medium">Next fire</th>
                <th className="text-left px-4 py-2 font-medium">Last fire</th>
                <th className="text-left px-4 py-2 font-medium">On</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {schedules.map(s => {
                const wf = wfMap.get(s.workflow_id)
                return (
                  <tr key={s.id} className="border-b border-zinc-900/50 hover:bg-zinc-900/30">
                    <td className="px-4 py-2 text-zinc-200">{s.name || "—"}</td>
                    <td className="px-4 py-2">
                      {wf ? <span>{wf.emoji} {wf.name}</span> : <span className="text-zinc-500 text-xs">unknown workflow</span>}
                    </td>
                    <td className="px-4 py-2 text-xs text-zinc-400 font-mono">{humanizeCron(s.cron, s.timezone)}</td>
                    <td className="px-4 py-2 text-xs text-zinc-400">
                      {s.next_fire_at ? formatDistanceToNow(new Date(s.next_fire_at), { addSuffix: true }) : "—"}
                    </td>
                    <td className="px-4 py-2 text-xs text-zinc-500">
                      {s.last_fired_at ? formatDistanceToNow(new Date(s.last_fired_at), { addSuffix: true }) : <span className="italic">never</span>}
                    </td>
                    <td className="px-4 py-2">
                      <Switch
                        checked={s.enabled}
                        onCheckedChange={async (checked) => {
                          await updateSchedule(s.id, { enabled: checked })
                          mutate()
                        }}
                      />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-zinc-500 hover:text-red-400" onClick={async () => {
                        if (!confirm(`Delete schedule "${s.name || s.id}"?`)) return
                        await deleteSchedule(s.id)
                        toast.success("Schedule deleted")
                        mutate()
                      }}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── New schedule dialog ───────────────────────────────────────────────────

function NewScheduleDialog({ workflows, onCreated }: { workflows: Workflow[]; onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [workflowId, setWorkflowId] = useState("")
  const [presetIdx, setPresetIdx] = useState("1")
  const [customCron, setCustomCron] = useState("")
  const [timezone, setTimezone] = useState("America/New_York")
  const [payloadJson, setPayloadJson] = useState("{}")
  const [enabled, setEnabled] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const isCustom = presetIdx === "custom"
  const cron = isCustom ? customCron : (CRON_PRESETS[parseInt(presetIdx, 10)]?.cron || "")

  async function submit() {
    let payload: Record<string, unknown> = {}
    try { payload = JSON.parse(payloadJson || "{}") }
    catch { toast.error("Payload must be valid JSON"); return }
    if (!workflowId) { toast.error("Pick a workflow"); return }
    if (!cron) { toast.error("Pick or enter a cron expression"); return }

    setSubmitting(true)
    try {
      await createSchedule({ workflow_id: workflowId, name: name || null, cron, timezone, payload, enabled })
      toast.success("Schedule created")
      onCreated()
      setOpen(false)
      setName(""); setWorkflowId(""); setCustomCron(""); setPayloadJson("{}")
    } catch (e) {
      toast.error((e as Error).message)
    } finally { setSubmitting(false) }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="w-4 h-4 mr-1" /> New schedule</Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>New schedule</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div>
            <Label>Name (optional)</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Nightly metrics" />
          </div>
          <div>
            <Label>Workflow</Label>
            <Select value={workflowId} onValueChange={setWorkflowId}>
              <SelectTrigger><SelectValue placeholder="Pick a workflow" /></SelectTrigger>
              <SelectContent>
                {workflows.length === 0 && <SelectItem value="__none__" disabled>No active workflows yet — create one in the Workflows subtab</SelectItem>}
                {workflows.map(w => (
                  <SelectItem key={w.id} value={w.id}>{w.emoji} {w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>When</Label>
              <Select value={presetIdx} onValueChange={setPresetIdx}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CRON_PRESETS.map((p, i) => (
                    <SelectItem key={p.cron} value={String(i)}>{p.label}</SelectItem>
                  ))}
                  <SelectItem value="custom">Custom cron…</SelectItem>
                </SelectContent>
              </Select>
              {isCustom && (
                <Input value={customCron} onChange={e => setCustomCron(e.target.value)} placeholder="0 2 * * *" className="mt-2 font-mono text-xs" />
              )}
            </div>
            <div>
              <Label>Timezone</Label>
              <Input value={timezone} onChange={e => setTimezone(e.target.value)} placeholder="America/New_York" />
            </div>
          </div>
          <div>
            <Label>Initial input <span className="text-zinc-500 text-xs ml-1">(JSON sent to the trigger node)</span></Label>
            <Textarea value={payloadJson} onChange={e => setPayloadJson(e.target.value)} rows={4} className="font-mono text-xs" />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={enabled} onCheckedChange={setEnabled} />
            <span className="text-xs text-zinc-400">Enabled (uncheck to create disabled)</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={submitting}>{submitting ? "Creating..." : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
