"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from "@/components/ui/tabs"
import {
  Sparkles, Pin, PinOff, Archive, ArchiveRestore, Trash2, History,
  Eye, FileText, Hash, X as XIcon, Lightbulb,
} from "lucide-react"
import ReactMarkdown from "react-markdown"
import { motion } from "framer-motion"
import { SaveIndicator, type SaveState } from "./save-indicator"
import { VoiceButton } from "./voice-button"
import { TokenMeter } from "./token-meter"
import { VersionHistoryModal } from "./version-history-modal"
import {
  MEMORY_TYPES,
  estimateTokens,
  updateMemory,
  pinMemory,
  archiveMemory,
  deleteMemory,
  type Memory,
  type MemoryType,
  type Persona,
} from "@/lib/api/memory"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

const SAVE_DEBOUNCE_MS = 700

export function MemoryEditor({
  memory,
  personas,
  onChange,
  onDeleted,
}: {
  memory: Memory
  personas: Persona[]
  onChange: (m: Memory) => void
  onDeleted: (id: string) => void
}) {
  const [draft, setDraft] = useState<Memory>(memory)
  const [saveState, setSaveState] = useState<SaveState>("idle")
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(memory.updated_at ? new Date(memory.updated_at) : null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [tagInput, setTagInput] = useState("")
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevMemoryIdRef = useRef<string>(memory.id)

  // When user switches to a different memory, reset draft
  useEffect(() => {
    if (memory.id !== prevMemoryIdRef.current) {
      setDraft(memory)
      setSaveState("idle")
      setLastSavedAt(memory.updated_at ? new Date(memory.updated_at) : null)
      setErrorMsg(null)
      prevMemoryIdRef.current = memory.id
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [memory])

  // Auto-save logic
  function patch(partial: Partial<Memory>) {
    setDraft((d) => {
      const next = { ...d, ...partial }
      schedulePersist(next)
      return next
    })
  }

  function schedulePersist(next: Memory) {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setSaveState("saving")
    debounceRef.current = setTimeout(async () => {
      try {
        const result = await updateMemory(next.id, {
          title: next.title,
          description: next.description,
          body: next.body,
          emoji: next.emoji,
          tags: next.tags,
          type: next.type,
          persona_id: next.persona_id,
          injection_priority: next.injection_priority,
          why: next.why,
          how_to_apply: next.how_to_apply,
          trigger_keywords: next.trigger_keywords,
        })
        setSaveState("saved")
        setLastSavedAt(new Date())
        setErrorMsg(null)
        onChange(result)
      } catch (e) {
        setSaveState("error")
        setErrorMsg(e instanceof Error ? e.message : "Save failed")
      }
    }, SAVE_DEBOUNCE_MS)
  }

  // Manual flush before navigation
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  // Pin/archive/delete helpers (immediate, no debounce)
  async function handlePin() {
    try {
      const m = await pinMemory(draft.id, !draft.pinned)
      setDraft(m)
      onChange(m)
      toast.success(m.pinned ? "Pinned" : "Unpinned")
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed") }
  }
  async function handleArchive() {
    try {
      const m = await archiveMemory(draft.id, !draft.archived)
      setDraft(m)
      onChange(m)
      toast.success(m.archived ? "Archived" : "Unarchived")
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed") }
  }
  async function handleDelete() {
    if (!confirm("Delete this memory? This cannot be undone.")) return
    try {
      await deleteMemory(draft.id)
      toast.success("Deleted")
      onDeleted(draft.id)
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed") }
  }

  function addTag(t: string) {
    const norm = t.trim().replace(/^#/, "").toLowerCase()
    if (!norm) return
    if (draft.tags.includes(norm)) return
    patch({ tags: [...draft.tags, norm] })
    setTagInput("")
  }
  function removeTag(t: string) {
    patch({ tags: draft.tags.filter((x) => x !== t) })
  }

  const tokenEstimate = useMemo(
    () => estimateTokens([draft.title, draft.description, draft.body, draft.why, draft.how_to_apply].filter(Boolean).join("\n\n")),
    [draft.title, draft.description, draft.body, draft.why, draft.how_to_apply]
  )

  const personaOptions = useMemo(
    () => [{ id: "__null__", name: "Global (all personas)", emoji: "🌐" }, ...personas.map((p) => ({ id: p.id, name: p.name, emoji: p.emoji }))],
    [personas]
  )

  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const newEmoji = prompt("New emoji:", draft.emoji) || draft.emoji
              if (newEmoji && newEmoji !== draft.emoji) patch({ emoji: newEmoji })
            }}
            className="text-2xl hover:scale-110 transition-transform"
            title="Click to change emoji"
          >
            {draft.emoji}
          </button>
          <SaveIndicator state={saveState} lastSavedAt={lastSavedAt} errorMessage={errorMsg} />
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setHistoryOpen(true)}
            className="inline-flex items-center gap-1 rounded border border-border bg-secondary/40 px-2 py-1 text-xs hover:bg-secondary"
            title="Version history"
          >
            <History className="h-3.5 w-3.5" /> History
          </button>
          <button
            onClick={handlePin}
            className={cn(
              "inline-flex items-center gap-1 rounded border px-2 py-1 text-xs transition-all",
              draft.pinned ? "border-amber-400/50 bg-amber-500/15 text-amber-300" : "border-border bg-secondary/40 text-muted-foreground hover:bg-secondary"
            )}
          >
            {draft.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
            {draft.pinned ? "Unpin" : "Pin"}
          </button>
          <button
            onClick={handleArchive}
            className="inline-flex items-center gap-1 rounded border border-border bg-secondary/40 px-2 py-1 text-xs text-muted-foreground hover:bg-secondary"
          >
            {draft.archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
            {draft.archived ? "Unarchive" : "Archive"}
          </button>
          <button
            onClick={handleDelete}
            className="inline-flex items-center gap-1 rounded border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs text-red-400 hover:bg-red-500/20"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          {/* Title + voice */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Title</label>
            <div className="flex items-center gap-2">
              <Input
                value={draft.title}
                onChange={(e) => patch({ title: e.target.value })}
                placeholder="What is this memory about?"
                className="text-base font-semibold"
              />
              <VoiceButton onTranscript={(t) => patch({ title: t })} />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">One-line description</label>
            <Input
              value={draft.description || ""}
              onChange={(e) => patch({ description: e.target.value })}
              placeholder="Short hook used in lists and search"
            />
          </div>

          {/* Type + Persona row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Type</label>
              <Select value={draft.type} onValueChange={(v) => patch({ type: v as MemoryType })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MEMORY_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      <span className="mr-2">{t.emoji}</span>{t.label}
                      <span className="ml-2 text-xs text-muted-foreground">{t.help}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Persona scope</label>
              <Select
                value={draft.persona_id || "__null__"}
                onValueChange={(v) => patch({ persona_id: v === "__null__" ? null : v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {personaOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="mr-2">{p.emoji}</span>{p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Body editor with markdown preview */}
          <div>
            <Tabs defaultValue="write">
              <div className="mb-2 flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">Body</label>
                <TabsList className="h-7">
                  <TabsTrigger value="write" className="h-5 px-2 text-xs"><FileText className="mr-1 h-3 w-3" /> Write</TabsTrigger>
                  <TabsTrigger value="preview" className="h-5 px-2 text-xs"><Eye className="mr-1 h-3 w-3" /> Preview</TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="write" className="mt-0">
                <Textarea
                  value={draft.body}
                  onChange={(e) => patch({ body: e.target.value })}
                  placeholder="The actual memory content. Markdown supported."
                  className="min-h-[200px] font-mono text-sm"
                />
                <div className="mt-1 flex justify-end">
                  <VoiceButton onTranscript={(t) => patch({ body: (draft.body ? draft.body + "\n" : "") + t })} />
                </div>
              </TabsContent>
              <TabsContent value="preview" className="mt-0">
                <div className="prose prose-invert prose-sm min-h-[200px] max-w-none rounded-md border bg-card/30 p-4">
                  <ReactMarkdown>{draft.body || "_Nothing to preview yet._"}</ReactMarkdown>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {/* Why + How (Claude-memory format) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <Lightbulb className="h-3 w-3" /> Why this exists
              </label>
              <Textarea
                value={draft.why || ""}
                onChange={(e) => patch({ why: e.target.value })}
                placeholder="Reason — past incident, preference, constraint"
                className="min-h-[60px] text-xs"
              />
            </div>
            <div>
              <label className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <Sparkles className="h-3 w-3" /> How to apply
              </label>
              <Textarea
                value={draft.how_to_apply || ""}
                onChange={(e) => patch({ how_to_apply: e.target.value })}
                placeholder="When this kicks in"
                className="min-h-[60px] text-xs"
              />
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Tags</label>
            <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-transparent px-2 py-1.5">
              {draft.tags.map((t) => (
                <motion.span
                  key={t}
                  layout
                  className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-300"
                >
                  <Hash className="h-2.5 w-2.5" />{t}
                  <button onClick={() => removeTag(t)} className="ml-0.5 hover:text-amber-200">
                    <XIcon className="h-2.5 w-2.5" />
                  </button>
                </motion.span>
              ))}
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault()
                    addTag(tagInput)
                  } else if (e.key === "Backspace" && !tagInput && draft.tags.length > 0) {
                    removeTag(draft.tags[draft.tags.length - 1])
                  }
                }}
                placeholder={draft.tags.length === 0 ? "Press enter to add a tag" : ""}
                className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>

          {/* Trigger keywords */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Trigger keywords <span className="text-[10px]">(only inject when query mentions one of these — leave empty to always inject)</span>
            </label>
            <Input
              value={draft.trigger_keywords.join(", ")}
              onChange={(e) => patch({ trigger_keywords: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
              placeholder="e.g. outreach, dm, instagram"
              className="text-xs"
            />
          </div>

          {/* Injection priority */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">Injection priority</label>
              <span className="text-xs font-mono text-amber-300">{draft.injection_priority}</span>
            </div>
            <Slider
              value={[draft.injection_priority]}
              min={0} max={100} step={5}
              onValueChange={(v) => patch({ injection_priority: v[0] })}
            />
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
              <span>low (often pruned)</span>
              <span>high (always injected)</span>
            </div>
          </div>

          {/* Token estimate */}
          <div className="rounded-md border bg-card/40 p-3">
            <div className="mb-1 text-xs font-medium text-muted-foreground">This memory's footprint</div>
            <TokenMeter used={tokenEstimate} budget={500} />
          </div>
        </div>
      </div>

      <VersionHistoryModal
        memory={draft}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        onRestored={(m) => { setDraft(m); onChange(m); setLastSavedAt(new Date()) }}
      />
    </Card>
  )
}
