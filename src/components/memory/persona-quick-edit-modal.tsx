"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select"
import { createPersona, updatePersona, type Persona } from "@/lib/api/memory"
import { toast } from "sonner"

const PERSONA_EMOJIS = ["🤖", "✍️", "📊", "🎯", "🧠", "🦾", "🧙", "🧑‍💻", "📣", "🎙️", "🔬", "🎨", "🛠️", "🧮", "🪄"]

export function PersonaQuickEditModal({
  open,
  onOpenChange,
  persona,
  personas,
  onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  persona: Persona | null
  personas: Persona[]
  onSaved: (p: Persona) => void
}) {
  const isEdit = !!persona
  const [draft, setDraft] = useState<Partial<Persona>>(
    persona || { name: "", emoji: "🤖", description: "", system_prompt: "", tone_terse: 50, tone_formal: 50, emoji_mode: "auto" }
  )
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setDraft(persona || { name: "", emoji: "🤖", description: "", system_prompt: "", tone_terse: 50, tone_formal: 50, emoji_mode: "auto" })
    }
  }, [open, persona])

  async function handleSave() {
    if (!draft.name?.trim()) {
      toast.error("Name is required")
      return
    }
    setSaving(true)
    try {
      const result = isEdit && persona
        ? await updatePersona(persona.id, draft)
        : await createPersona({ ...draft, name: draft.name } as Persona)
      onSaved(result)
      toast.success(isEdit ? "Persona updated" : "Persona created")
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit persona" : "Create persona"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-[auto_1fr] items-end gap-3">
            <div>
              <Label className="text-xs">Emoji</Label>
              <Select value={draft.emoji} onValueChange={(v) => setDraft((d) => ({ ...d, emoji: v }))}>
                <SelectTrigger className="w-[80px] text-2xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PERSONA_EMOJIS.map((e) => <SelectItem key={e} value={e}><span className="text-2xl">{e}</span></SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Name</Label>
              <Input
                value={draft.name || ""}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="e.g. Coding Agent"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs">Description</Label>
            <Input
              value={draft.description || ""}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              placeholder="One-line description shown on the persona card"
            />
          </div>

          <div>
            <Label className="text-xs">System prompt</Label>
            <Textarea
              value={draft.system_prompt || ""}
              onChange={(e) => setDraft((d) => ({ ...d, system_prompt: e.target.value }))}
              placeholder="The system prompt prepended to every conversation that uses this persona."
              className="min-h-[120px] font-mono text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="mb-1 flex items-center justify-between"><Label className="text-xs">Terse ↔ Verbose</Label><span className="text-xs font-mono">{draft.tone_terse}</span></div>
              <Slider value={[draft.tone_terse ?? 50]} min={0} max={100} step={5} onValueChange={(v) => setDraft((d) => ({ ...d, tone_terse: v[0] }))} />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between"><Label className="text-xs">Casual ↔ Formal</Label><span className="text-xs font-mono">{draft.tone_formal}</span></div>
              <Slider value={[draft.tone_formal ?? 50]} min={0} max={100} step={5} onValueChange={(v) => setDraft((d) => ({ ...d, tone_formal: v[0] }))} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Emoji mode</Label>
              <Select value={draft.emoji_mode || "auto"} onValueChange={(v) => setDraft((d) => ({ ...d, emoji_mode: v as "off" | "auto" | "on" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="off">Off — never emoji</SelectItem>
                  <SelectItem value="auto">Auto — context dependent</SelectItem>
                  <SelectItem value="on">On — encouraged</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Inherits from</Label>
              <Select
                value={draft.parent_persona_id || "__none__"}
                onValueChange={(v) => setDraft((d) => ({ ...d, parent_persona_id: v === "__none__" ? null : v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {personas.filter((p) => p.id !== persona?.id).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.emoji} {p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-amber-500 hover:bg-amber-600 text-amber-950">
            {saving ? "Saving…" : (isEdit ? "Save changes" : "Create persona")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
