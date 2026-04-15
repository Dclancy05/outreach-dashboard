"use client"

import { useState, useMemo } from "react"
import { useBusinessId } from "@/lib/use-business"
import useSWR from "swr"
import { dashboardApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { GitBranch, Plus, ChevronDown, ChevronUp, Trash2, Pencil, Check, X, Loader2, Search } from "lucide-react"
import { toast } from "sonner"
import { EmptyState } from "@/components/empty-state"
import { PageInstructions } from "@/components/page-instructions"
import type { Sequence } from "@/types"

const platformColors: Record<string, string> = {
  linkedin: "bg-blue-600", linkedin_connect: "bg-blue-400",
  instagram_dm: "bg-pink-600", instagram_follow: "bg-pink-400",
  facebook_dm: "bg-blue-500", email: "bg-green-600", sms: "bg-yellow-600", message: "bg-gray-500",
}
const platformLabels: Record<string, string> = {
  linkedin: "LI", linkedin_connect: "LI+", instagram_dm: "IG", instagram_follow: "IG+",
  facebook_dm: "FB", email: "EM", sms: "SMS", message: "MSG",
}

export default function SequencesPage() {
  const businessId = useBusinessId()
  const { data: sequences, isLoading, mutate } = useSWR<Sequence[]>(businessId ? `get_sequences-${businessId}` : "get_sequences", () => dashboardApi("get_sequences", { business_id: businessId || undefined }))
  const [expanded, setExpanded] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [newId, setNewId] = useState("")
  const [newName, setNewName] = useState("")
  const [confirmDeleteSeq, setConfirmDeleteSeq] = useState<string | null>(null)
  const [editingSeq, setEditingSeq] = useState<string | null>(null)
  const [editSteps, setEditSteps] = useState<Record<string, string>>({})
  const [savingSteps, setSavingSteps] = useState(false)
  const [search, setSearch] = useState("")

  const seqs = (sequences || []).filter(s => !search || s.sequence_name?.toLowerCase().includes(search.toLowerCase()) || s.sequence_id?.toLowerCase().includes(search.toLowerCase()))

  function getSteps(seq: Sequence) {
    const raw = typeof seq.steps === "string" ? JSON.parse(seq.steps) : seq.steps
    const steps: { day: number; platform: string }[] = []
    for (let i = 1; i <= 180; i++) {
      const key = `day_${i}`
      if (raw[key]) steps.push({ day: i, platform: raw[key] })
    }
    return steps
  }

  async function handleCreate() {
    if (!newId || !newName) return
    try {
      await dashboardApi("create_sequence", { sequence_id: newId, sequence_name: newName })
      toast.success("Sequence created"); setCreateOpen(false); setNewId(""); setNewName(""); mutate()
    } catch (e) { console.error(e); toast.error("Failed to create sequence") }
  }

  async function handleDeleteSequence(seqId: string) {
    try { await dashboardApi("delete_sequences", { sequence_ids: [seqId] }); toast.success("Sequence deleted"); mutate() }
    catch (e) { console.error(e); toast.error("Failed to delete sequence") } finally { setConfirmDeleteSeq(null) }
  }

  function startEditSteps(seq: Sequence) {
    const raw = typeof seq.steps === "string" ? JSON.parse(seq.steps) : seq.steps
    setEditingSeq(seq.sequence_id); setEditSteps({ ...raw })
  }

  async function saveSteps(seqId: string) {
    setSavingSteps(true)
    try { await dashboardApi("update_sequence_steps", { sequence_id: seqId, steps: editSteps }); toast.success("Steps saved"); setEditingSeq(null); mutate() }
    catch (e) { console.error(e); toast.error("Failed to save steps") } finally { setSavingSteps(false) }
  }

  function StepEditor({ steps, onChange, onSave, onCancel, saving }: {
    steps: Record<string, string>; onChange: (s: Record<string, string>) => void; onSave: () => void; onCancel: () => void; saving: boolean
  }) {
    const [newDay, setNewDay] = useState(""); const [newPlatform, setNewPlatform] = useState("email")
    const sortedSteps = Object.entries(steps).filter(([, v]) => v).sort(([a], [b]) => parseInt(a.replace("day_", "")) - parseInt(b.replace("day_", "")))
    const dropdownOptions = Object.entries(platformLabels).map(([val, label]) => ({ value: val, label: `${label} (${val})` }))

    function addStep() {
      const dayNum = parseInt(newDay); if (!dayNum || dayNum < 1) return
      onChange({ ...steps, [`day_${dayNum}`]: newPlatform }); setNewDay("")
    }
    function removeStep(key: string) { const next = { ...steps }; delete next[key]; onChange(next) }

    return (
      <div className="border rounded-lg p-4 bg-secondary/30 space-y-3">
        <h4 className="text-sm font-medium">Edit Steps</h4>
        <div className="space-y-1">
          {sortedSteps.map(([key, platform]) => (
            <div key={key} className="flex items-center gap-2 bg-secondary rounded-lg px-3 py-2">
              <Input type="number" min={1} max={180} value={key.replace("day_", "")} onChange={(e) => { const next = { ...steps }; delete next[key]; next[`day_${e.target.value}`] = platform; onChange(next) }} className="w-16 h-7 text-xs" />
              <span className="text-xs text-muted-foreground">Day</span>
              <select className="flex-1 h-7 rounded-md border border-input bg-transparent px-2 text-xs" value={platform} onChange={(e) => onChange({ ...steps, [key]: e.target.value })}>
                {dropdownOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
              <button onClick={() => removeStep(key)} className="text-red-400 hover:text-red-300 p-1"><X className="h-3 w-3" /></button>
            </div>
          ))}
        </div>
        <div className="flex gap-2 items-center">
          <Input type="number" min={1} max={180} placeholder="Day #" value={newDay} onChange={(e) => setNewDay(e.target.value)} className="w-20 h-8 text-xs" />
          <select className="h-8 rounded-md border border-input bg-transparent px-2 text-xs" value={newPlatform} onChange={(e) => setNewPlatform(e.target.value)}>
            {dropdownOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={addStep}><Plus className="h-3 w-3 mr-1" /> Add</Button>
        </div>
        <div className="flex gap-2 pt-2 border-t">
          <Button size="sm" variant="outline" className="gap-1 text-green-400" onClick={onSave} disabled={saving}>
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Save
          </Button>
          <Button size="sm" variant="ghost" className="gap-1" onClick={onCancel}><X className="h-3 w-3" /> Cancel</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><GitBranch className="h-6 w-6 text-neon-green" /> Sequences
            <PageInstructions title="Sequences" storageKey="instructions-sequences" steps={[
              "Sequences define the order of your outreach steps.",
              "Each step is a platform action (IG DM, follow, etc.) scheduled for a specific day.",
              "Create a new sequence with the '+' button.",
              "Add steps to define what happens on each day of outreach.",
              "Leads assigned to a sequence will follow these steps automatically.",
            ]} />
          </h1>
          <p className="text-muted-foreground text-sm mt-1">{seqs.length} sequences</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild><Button variant="neon" size="sm" className="gap-1"><Plus className="h-3.5 w-3.5" /> New</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Sequence</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <Input placeholder="Sequence ID" value={newId} onChange={(e) => setNewId(e.target.value)} />
              <Input placeholder="Display Name" value={newName} onChange={(e) => setNewName(e.target.value)} />
              <Button variant="neon" className="w-full" onClick={handleCreate}>Create</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search sequences..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(platformLabels).map(([key, label]) => (
          <div key={key} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded-sm ${platformColors[key]}`} />
            <span className="text-xs text-muted-foreground">{label} = {key.replace(/_/g, " ")}</span>
          </div>
        ))}
      </div>

      {isLoading ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">Loading...</CardContent></Card>
      ) : seqs.length === 0 ? (
        <EmptyState icon={GitBranch} title="No sequences yet" description="Sequences define the order of your outreach steps. Create your first one to get started." actionLabel="Create your first sequence" onAction={() => setCreateOpen(true)} />
      ) : seqs.map((seq) => {
        const steps = getSteps(seq); const isOpen = expanded === seq.sequence_id; const isEditing = editingSeq === seq.sequence_id
        return (
          <Card key={seq.sequence_id} className="hover:border-green-500/20 transition-all">
            <CardHeader className="cursor-pointer py-3" onClick={() => setExpanded(isOpen ? null : seq.sequence_id)}>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">{seq.sequence_name}</CardTitle>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary" className="text-[10px]">{steps.length} steps</Badge>
                    <span className="text-[10px] text-muted-foreground">ID: {seq.sequence_id}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex gap-1 flex-wrap">
                    {steps.slice(0, 10).map((s, i) => (
                      <div key={i} className={`w-6 h-6 rounded text-[9px] font-bold flex items-center justify-center text-white ${platformColors[s.platform] || "bg-gray-600"}`} title={`Day ${s.day}: ${s.platform}`}>
                        {platformLabels[s.platform] || "?"}
                      </div>
                    ))}
                    {steps.length > 10 && <span className="text-xs text-muted-foreground self-center">+{steps.length - 10}</span>}
                  </div>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-blue-400" onClick={(e) => { e.stopPropagation(); startEditSteps(seq) }}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400" onClick={(e) => { e.stopPropagation(); setConfirmDeleteSeq(seq.sequence_id) }}><Trash2 className="h-3.5 w-3.5" /></Button>
                  {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </div>
            </CardHeader>
            {isOpen && (
              <CardContent>
                {isEditing ? (
                  <StepEditor steps={editSteps} onChange={setEditSteps} onSave={() => saveSteps(seq.sequence_id)} onCancel={() => setEditingSeq(null)} saving={savingSteps} />
                ) : (
                  <div className="border rounded-lg p-4 bg-secondary/30">
                    <h4 className="text-sm font-medium mb-3">Timeline</h4>
                    <div className="flex flex-wrap gap-2">
                      {steps.map((s, i) => (
                        <div key={i} className="flex flex-col items-center gap-1">
                          <div className={`w-10 h-10 rounded-lg text-xs font-bold flex items-center justify-center text-white ${platformColors[s.platform] || "bg-gray-600"}`}>{platformLabels[s.platform] || "?"}</div>
                          <span className="text-[10px] text-muted-foreground">Day {s.day}</span>
                        </div>
                      ))}
                      {steps.length === 0 && <p className="text-sm text-muted-foreground">No steps yet. Click edit to add.</p>}
                    </div>
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        )
      })}

      <ConfirmDialog open={!!confirmDeleteSeq} onOpenChange={(open) => { if (!open) setConfirmDeleteSeq(null) }} title="Delete Sequence" description="Delete this sequence? This cannot be undone." onConfirm={() => confirmDeleteSeq && handleDeleteSequence(confirmDeleteSeq)} />
    </div>
  )
}
