"use client"

import { useState, useCallback } from "react"
import useSWR from "swr"
import { dashboardApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Palette, Plus, Pencil, Trash2, UserCircle, Hash, Zap } from "lucide-react"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { PageInstructions } from "@/components/page-instructions"
import type { ContentPersona } from "@/types"

const NICHE_COLORS: Record<string, string> = {
  "marketing tips": "bg-blue-500/20 text-blue-400",
  "agency": "bg-purple-500/20 text-purple-400",
  "entrepreneurship": "bg-orange-500/20 text-orange-400",
  "AI tips": "bg-cyan-500/20 text-cyan-400",
  "fitness": "bg-green-500/20 text-green-400",
  "default": "bg-gray-500/20 text-gray-400",
}

function getNicheColor(niche: string) {
  return NICHE_COLORS[niche] || NICHE_COLORS.default
}

export default function ContentPersonasPage() {
  const { data: personas, isLoading, mutate } = useSWR<ContentPersona[]>("get_content_personas", () => dashboardApi("get_content_personas"))
  const { data: accounts } = useSWR("get_outreach_accounts_for_personas", () => dashboardApi("get_outreach_accounts"))

  const [editing, setEditing] = useState<ContentPersona | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({
    name: "",
    description: "",
    niche: "",
    tone: "",
    content_types: "reels,images",
    hashtag_groups: "",
    posting_frequency: 5,
  })
  const [assigning, setAssigning] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const openCreate = () => {
    setForm({ name: "", description: "", niche: "", tone: "", content_types: "reels,images", hashtag_groups: "", posting_frequency: 5 })
    setCreating(true)
  }

  const openEdit = (p: ContentPersona) => {
    setForm({
      name: p.name,
      description: p.description,
      niche: p.niche,
      tone: p.tone,
      content_types: p.content_types,
      hashtag_groups: p.hashtag_groups,
      posting_frequency: p.posting_frequency,
    })
    setEditing(p)
  }

  const handleSave = useCallback(async () => {
    try {
      if (editing) {
        await dashboardApi("update_content_persona", { persona_id: editing.persona_id, ...form })
      } else {
        await dashboardApi("create_content_persona", form)
      }
      toast.success(editing ? "Persona updated" : "Persona created")
      setEditing(null)
      setCreating(false)
      mutate()
    } catch { toast.error("Failed to save persona") }
  }, [editing, form, mutate])

  const handleDelete = useCallback(async (id: string) => {
    try {
      await dashboardApi("delete_content_persona", { persona_id: id })
      toast.success("Persona deleted")
      mutate()
    } catch { toast.error("Failed to delete persona") }
    finally { setConfirmDeleteId(null) }
  }, [mutate])

  const handleAssign = useCallback(async (accountId: string, personaId: string | null) => {
    await dashboardApi("assign_persona_to_account", { account_id: accountId, persona_id: personaId })
    setAssigning(null)
    mutate()
  }, [mutate])

  const dialog = creating || editing

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Palette className="h-6 w-6 text-pink-400" />
            Content Personas
            <PageInstructions title="Content Personas" storageKey="instructions-content-personas" steps={[
              "Define the personality and niche for each account.",
              "Each persona determines what kind of content gets generated for that account.",
              "Set the account's niche, tone, target audience, and content themes.",
              "Create a new persona with the '+' button.",
              "Edit existing personas to refine content generation.",
            ]} />
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Define personalities for your IG accounts. Each persona shapes the content style.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" /> New Persona
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6 h-48" />
            </Card>
          ))}
        </div>
      ) : !personas?.length ? (
        <Card className="border-dashed">
          <CardContent className="p-12 text-center">
            <UserCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No personas yet</h3>
            <p className="text-muted-foreground mb-4">Create your first content persona to start planning content.</p>
            <Button onClick={openCreate} className="gap-2">
              <Plus className="h-4 w-4" /> Create Persona
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {personas.map((p) => (
            <Card key={p.persona_id} className="hover:border-primary/30 transition-colors">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{p.name}</CardTitle>
                    <Badge className={`mt-1 ${getNicheColor(p.niche)}`}>{p.niche || "general"}</Badge>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-300" onClick={() => setConfirmDeleteId(p.persona_id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground line-clamp-2">{p.description}</p>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Zap className="h-3 w-3" /> {p.posting_frequency}/week
                  </span>
                  <span className="text-muted-foreground">•</span>
                  <span className="text-muted-foreground italic">{p.tone}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {p.content_types.split(",").map(t => (
                    <Badge key={t} variant="outline" className="text-xs">{t.trim()}</Badge>
                  ))}
                </div>
                {p.hashtag_groups && (
                  <div className="flex items-start gap-1 text-xs text-muted-foreground">
                    <Hash className="h-3 w-3 mt-0.5 shrink-0" />
                    <span className="line-clamp-1">{p.hashtag_groups}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={!!dialog} onOpenChange={() => { setCreating(false); setEditing(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Persona" : "Create Persona"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. College Marketing Student" />
            </div>
            <div>
              <Label>Description</Label>
              <textarea
                className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[80px]"
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="Describe this persona's personality and content style..."
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Niche</Label>
                <Input value={form.niche} onChange={e => setForm({ ...form, niche: e.target.value })} placeholder="e.g. marketing tips" />
              </div>
              <div>
                <Label>Tone</Label>
                <Input value={form.tone} onChange={e => setForm({ ...form, tone: e.target.value })} placeholder="e.g. casual, gen-z" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Content Types</Label>
                <Input value={form.content_types} onChange={e => setForm({ ...form, content_types: e.target.value })} placeholder="reels,images,stories" />
              </div>
              <div>
                <Label>Posts/Week</Label>
                <Input type="number" value={form.posting_frequency} onChange={e => setForm({ ...form, posting_frequency: Number(e.target.value) })} />
              </div>
            </div>
            <div>
              <Label>Default Hashtags</Label>
              <Input value={form.hashtag_groups} onChange={e => setForm({ ...form, hashtag_groups: e.target.value })} placeholder="#marketing #tips #hustle" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setCreating(false); setEditing(null) }}>Cancel</Button>
              <Button onClick={handleSave} disabled={!form.name}>{editing ? "Save" : "Create"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={!!confirmDeleteId} onOpenChange={(open) => { if (!open) setConfirmDeleteId(null) }} title="Delete Persona" description="Delete this persona? This cannot be undone." onConfirm={() => confirmDeleteId && handleDelete(confirmDeleteId)} />
    </div>
  )
}
