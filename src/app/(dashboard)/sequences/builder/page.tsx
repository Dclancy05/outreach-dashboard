"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  Instagram,
  Facebook,
  Linkedin,
  Mail,
  MessageSquare,
  Phone,
  UserPlus,
  GripVertical,
  X,
  Plus,
  Save,
  Copy,
  BookTemplate,
  Eye,
  EyeOff,
  ArrowLeft,
  Loader2,
} from "lucide-react"
import { Suspense } from "react"

const PLATFORM_COLORS: Record<string, string> = {
  instagram: "#E4405F",
  facebook: "#1877F2",
  linkedin: "#0A66C2",
  email: "#FFB800",
  sms: "#10B981",
}

const PLATFORM_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  instagram: Instagram,
  facebook: Facebook,
  linkedin: Linkedin,
  email: Mail,
  sms: Phone,
}

interface ActionBlock {
  id: string
  platform: string
  action: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  hasMessage: boolean
  hasSubject: boolean
  category: string
}

const ACTION_BLOCKS: ActionBlock[] = [
  { id: "ig_dm", platform: "instagram", action: "message", label: "IG DM", icon: Instagram, hasMessage: true, hasSubject: false, category: "DM & Messaging" },
  { id: "fb_msg", platform: "facebook", action: "message", label: "FB Message", icon: Facebook, hasMessage: true, hasSubject: false, category: "DM & Messaging" },
  { id: "li_msg", platform: "linkedin", action: "message", label: "LI Message", icon: Linkedin, hasMessage: true, hasSubject: false, category: "DM & Messaging" },
  { id: "li_connect", platform: "linkedin", action: "connect", label: "LI Connect + Note", icon: UserPlus, hasMessage: true, hasSubject: false, category: "Connection" },
  { id: "ig_follow", platform: "instagram", action: "follow", label: "IG Follow", icon: UserPlus, hasMessage: false, hasSubject: false, category: "Connection" },
  { id: "fb_follow", platform: "facebook", action: "follow", label: "FB Follow", icon: UserPlus, hasMessage: false, hasSubject: false, category: "Connection" },
  { id: "email", platform: "email", action: "message", label: "Email", icon: Mail, hasMessage: true, hasSubject: true, category: "Email & SMS" },
  { id: "sms", platform: "sms", action: "message", label: "SMS", icon: Phone, hasMessage: true, hasSubject: false, category: "Email & SMS" },
]

const CATEGORIES = ["DM & Messaging", "Connection", "Email & SMS"]

interface SequenceStep {
  id: string
  platform: string
  action: string
  label: string
  day_offset: number
  messages: string[]
  subject: string | null
  hasMessage: boolean
  hasSubject: boolean
  showVariant: boolean
  showPreview: boolean
}

const VARIABLE_CHIPS = ["{{name}}", "{{niche}}", "{{business}}"]
const SAMPLE_DATA: Record<string, string> = { "{{name}}": "Joe's Pizza", "{{niche}}": "restaurant", "{{business}}": "Joe's Pizza LLC" }

function replaceVars(text: string): string {
  let result = text
  for (const [k, v] of Object.entries(SAMPLE_DATA)) {
    result = result.replaceAll(k, v)
  }
  return result
}

// Draggable sidebar block
function SidebarBlock({ block }: { block: ActionBlock }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({
    id: `sidebar-${block.id}`,
    data: { type: "sidebar-block", block },
  })
  const Icon = block.icon
  const color = PLATFORM_COLORS[block.platform] || "#888"

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{ transform: CSS.Transform.toString(transform), opacity: isDragging ? 0.4 : 1 }}
      className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 bg-card/60 backdrop-blur-sm border border-border/50 cursor-grab active:cursor-grabbing hover:border-border transition-all text-sm"
    >
      <div className="rounded-lg p-1.5" style={{ backgroundColor: `${color}20` }}>
        <span style={{ color }}><Icon className="h-4 w-4" /></span>
      </div>
      <span className="font-medium">{block.label}</span>
    </div>
  )
}

// Sortable step in timeline
function SortableStep({
  step,
  index,
  onUpdate,
  onDelete,
}: {
  step: SequenceStep
  index: number
  onUpdate: (id: string, updates: Partial<SequenceStep>) => void
  onDelete: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id })
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const variantRef = useRef<HTMLTextAreaElement>(null)
  const Icon = PLATFORM_ICONS[step.platform] || MessageSquare
  const color = PLATFORM_COLORS[step.platform] || "#888"

  const insertVariable = (variable: string, isVariant?: boolean) => {
    const ref = isVariant ? variantRef : textareaRef
    const el = ref.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const text = el.value
    const newText = text.substring(0, start) + variable + text.substring(end)
    const msgIndex = isVariant ? 1 : 0
    const newMessages = [...step.messages]
    newMessages[msgIndex] = newText
    onUpdate(step.id, { messages: newMessages })
    setTimeout(() => {
      el.selectionStart = el.selectionEnd = start + variable.length
      el.focus()
    }, 0)
  }

  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }} className="relative">
      {/* Connector line */}
      {index > 0 && (
        <div className="absolute left-6 -top-4 w-0.5 h-4 bg-border/50" />
      )}

      <motion.div
        layout
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.3 }}
        className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 overflow-hidden"
        style={{ borderLeftWidth: 3, borderLeftColor: color }}
      >
        <div className="p-4 space-y-3">
          {/* Header row */}
          <div className="flex items-center gap-3">
            <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors">
              <GripVertical className="h-5 w-5" />
            </div>
            <Badge variant="outline" className="rounded-full text-xs font-bold px-2" style={{ borderColor: color, color }}>
              {index + 1}
            </Badge>
            <div className="flex items-center gap-2 flex-1">
              <span style={{ color }}><Icon className="h-4 w-4" /></span>
              <span className="font-semibold text-sm">{step.label}</span>
            </div>
            <div className="flex items-center gap-2">
              {step.hasMessage && (
                <button
                  onClick={() => onUpdate(step.id, { showPreview: !step.showPreview })}
                  className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-lg hover:bg-muted/50"
                  title="Preview"
                >
                  {step.showPreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              )}
              <button
                onClick={() => onDelete(step.id)}
                className="text-muted-foreground hover:text-red-400 transition-colors p-1 rounded-lg hover:bg-red-500/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Day offset */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Wait</span>
            <Input
              type="number"
              min={0}
              value={step.day_offset}
              onChange={(e) => onUpdate(step.id, { day_offset: parseInt(e.target.value) || 0 })}
              className="w-16 h-8 rounded-lg text-center text-sm bg-muted/30"
            />
            <span className="text-muted-foreground">days after previous step</span>
          </div>

          {/* Subject (email only) */}
          {step.hasSubject && (
            <Input
              placeholder="Email subject line... Use {{name}}, {{niche}}"
              value={step.subject || ""}
              onChange={(e) => onUpdate(step.id, { subject: e.target.value })}
              className="rounded-xl bg-muted/30 border-border/30"
            />
          )}

          {/* Message textarea */}
          {step.hasMessage && (
            <div className="space-y-2">
              {step.showPreview ? (
                <div className="rounded-xl bg-muted/20 border border-border/30 p-3 text-sm whitespace-pre-wrap">
                  {replaceVars(step.messages[0] || "")}
                </div>
              ) : (
                <>
                  <Textarea
                    ref={textareaRef}
                    placeholder="Write your message... Use {{name}}, {{niche}} for variables"
                    value={step.messages[0] || ""}
                    onChange={(e) => {
                      const newMessages = [...step.messages]
                      newMessages[0] = e.target.value
                      onUpdate(step.id, { messages: newMessages })
                    }}
                    className="rounded-xl bg-muted/30 border-border/30 min-h-[80px] resize-none"
                  />
                  <div className="flex gap-1.5 flex-wrap">
                    {VARIABLE_CHIPS.map((v) => (
                      <button
                        key={v}
                        onClick={() => insertVariable(v)}
                        className="text-xs px-2 py-1 rounded-lg bg-violet-500/10 text-violet-400 border border-violet-500/20 hover:bg-violet-500/20 transition-colors"
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* A/B Variant */}
              {step.showVariant ? (
                <div className="space-y-2 pt-2 border-t border-border/30">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-xs text-amber-400 border-amber-500/30">Variant B</Badge>
                    <button onClick={() => {
                      const newMessages = [step.messages[0] || ""]
                      onUpdate(step.id, { showVariant: false, messages: newMessages })
                    }} className="text-xs text-muted-foreground hover:text-red-400 transition-colors">Remove variant</button>
                  </div>
                  {step.showPreview ? (
                    <div className="rounded-xl bg-muted/20 border border-border/30 p-3 text-sm whitespace-pre-wrap">
                      {replaceVars(step.messages[1] || "")}
                    </div>
                  ) : (
                    <>
                      <Textarea
                        ref={variantRef}
                        placeholder="Write variant B message..."
                        value={step.messages[1] || ""}
                        onChange={(e) => {
                          const newMessages = [...step.messages]
                          newMessages[1] = e.target.value
                          onUpdate(step.id, { messages: newMessages })
                        }}
                        className="rounded-xl bg-muted/30 border-border/30 min-h-[80px] resize-none"
                      />
                      <div className="flex gap-1.5 flex-wrap">
                        {VARIABLE_CHIPS.map((v) => (
                          <button
                            key={v}
                            onClick={() => insertVariable(v, true)}
                            className="text-xs px-2 py-1 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-colors"
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => {
                    const newMessages = [...step.messages]
                    if (newMessages.length < 2) newMessages.push("")
                    onUpdate(step.id, { showVariant: true, messages: newMessages })
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                >
                  <Plus className="h-3 w-3" /> Add A/B variant
                </button>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}

function SequenceBuilderInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const editId = searchParams.get("id")

  const [sequenceId, setSequenceId] = useState<string | null>(editId)
  const [sequenceName, setSequenceName] = useState("New Sequence")
  const [steps, setSteps] = useState<SequenceStep[]>([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!!editId)
  const [activeDragId, setActiveDragId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  // Load existing sequence
  useEffect(() => {
    if (!editId) return
    setLoading(true)
    fetch(`/api/sequences?id=${encodeURIComponent(editId)}`)
      .then(r => r.json())
      .then(json => {
        const data = json?.data
        if (!data) {
          toast.error("Sequence not found")
          setLoading(false)
          return
        }
        setSequenceId(data.sequence_id)
        setSequenceName(data.sequence_name || "Untitled")
        const stepsData = data.steps || {}
        const loadedSteps: SequenceStep[] = Object.entries(stepsData)
          .sort(([a], [b]) => parseInt(a) - parseInt(b))
          .map(([, stepData]: [string, any]) => {
            const block = ACTION_BLOCKS.find(b => b.platform === stepData.platform && b.action === stepData.action)
            return {
              id: `step-${crypto.randomUUID()}`,
              platform: (stepData.platform as string) || "instagram",
              action: (stepData.action as string) || "message",
              label: block?.label || `${stepData.platform} ${stepData.action}`,
              day_offset: (stepData.day_offset as number) || 0,
              messages: (stepData.messages as string[]) || [""],
              subject: (stepData.subject as string) || null,
              hasMessage: block?.hasMessage ?? true,
              hasSubject: block?.hasSubject ?? false,
              showVariant: ((stepData.messages as string[])?.length || 0) > 1,
              showPreview: false,
            }
          })
        setSteps(loadedSteps)
        setLoading(false)
      })
      .catch(() => {
        toast.error("Failed to load sequence")
        setLoading(false)
      })
  }, [editId])

  const addStep = useCallback((block: ActionBlock, atIndex?: number) => {
    const newStep: SequenceStep = {
      id: `step-${crypto.randomUUID()}`,
      platform: block.platform,
      action: block.action,
      label: block.label,
      day_offset: steps.length === 0 ? 0 : 2,
      messages: [""],
      subject: block.hasSubject ? "" : null,
      hasMessage: block.hasMessage,
      hasSubject: block.hasSubject,
      showVariant: false,
      showPreview: false,
    }
    if (atIndex !== undefined) {
      const newSteps = [...steps]
      newSteps.splice(atIndex, 0, newStep)
      setSteps(newSteps)
    } else {
      setSteps((prev) => [...prev, newStep])
    }
  }, [steps])

  const updateStep = useCallback((id: string, updates: Partial<SequenceStep>) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)))
  }, [])

  const deleteStep = useCallback((id: string) => {
    setSteps((prev) => prev.filter((s) => s.id !== id))
  }, [])

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as string)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null)
    const { active, over } = event
    if (!over) return

    const activeData = active.data.current
    // Dragging from sidebar into timeline
    if (activeData?.type === "sidebar-block") {
      const block = activeData.block as ActionBlock
      if (over.id === "timeline-drop" || (over.id as string).startsWith("step-")) {
        const overIndex = steps.findIndex((s) => s.id === over.id)
        addStep(block, overIndex >= 0 ? overIndex + 1 : undefined)
      }
      return
    }

    // Reordering within timeline
    if (active.id !== over.id) {
      const oldIndex = steps.findIndex((s) => s.id === active.id)
      const newIndex = steps.findIndex((s) => s.id === over.id)
      if (oldIndex !== -1 && newIndex !== -1) {
        setSteps(arrayMove(steps, oldIndex, newIndex))
      }
    }
  }

  const saveSequence = async () => {
    setSaving(true)
    try {
      const id = sequenceId || crypto.randomUUID()
      const stepsJson: Record<string, unknown> = {}
      steps.forEach((step, i) => {
        stepsJson[String(i + 1)] = {
          platform: step.platform,
          action: step.action,
          day_offset: step.day_offset,
          messages: step.messages.filter((m) => m.trim()),
          subject: step.subject || null,
        }
      })

      const res = await fetch("/api/sequences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sequence_id: id,
          sequence_name: sequenceName,
          steps: stepsJson,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || "Save failed")
      setSequenceId(id)
      toast.success("Sequence saved!")
      if (!editId) {
        router.replace(`/sequences/builder?id=${id}`)
      }
    } catch (e) {
      toast.error(`Save failed: ${e instanceof Error ? e.message : "Unknown error"}`)
    }
    setSaving(false)
  }

  const cloneSequence = async () => {
    const newId = crypto.randomUUID()
    const stepsJson: Record<string, unknown> = {}
    steps.forEach((step, i) => {
      stepsJson[String(i + 1)] = {
        platform: step.platform,
        action: step.action,
        day_offset: step.day_offset,
        messages: step.messages.filter((m) => m.trim()),
        subject: step.subject || null,
      }
    })
    const res = await fetch("/api/sequences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sequence_id: newId,
        sequence_name: `${sequenceName} (Copy)`,
        steps: stepsJson,
      }),
    })
    if (!res.ok) {
      toast.error("Clone failed")
      return
    }
    toast.success("Sequence cloned!")
    router.push(`/sequences/builder?id=${newId}`)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="sm" className="rounded-xl gap-1.5" onClick={() => router.push("/campaigns?tab=sequences")}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <div className="flex-1" />
        <Button variant="outline" size="sm" className="rounded-xl gap-1.5" onClick={cloneSequence} disabled={!sequenceId}>
          <Copy className="h-4 w-4" /> Clone
        </Button>
        <Button size="sm" className="rounded-xl gap-1.5" onClick={saveSequence} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save
        </Button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-6">
          {/* Left sidebar - action blocks */}
          <div className="w-[260px] shrink-0 space-y-4 sticky top-6 self-start">
            <div className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 p-4">
              <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Action Blocks</h3>
              <SortableContext items={ACTION_BLOCKS.map((b) => `sidebar-${b.id}`)} strategy={verticalListSortingStrategy}>
                {CATEGORIES.map((cat) => (
                  <div key={cat} className="mb-4 last:mb-0">
                    <p className="text-xs font-medium text-muted-foreground/60 mb-2 uppercase tracking-wider">{cat}</p>
                    <div className="space-y-1.5">
                      {ACTION_BLOCKS.filter((b) => b.category === cat).map((block) => (
                        <SidebarBlock key={block.id} block={block} />
                      ))}
                    </div>
                  </div>
                ))}
              </SortableContext>
            </div>
          </div>

          {/* Right main - timeline */}
          <div className="flex-1 min-w-0 space-y-4">
            {/* Sequence name */}
            <Input
              value={sequenceName}
              onChange={(e) => setSequenceName(e.target.value)}
              className="text-2xl font-bold bg-transparent border-none shadow-none px-0 h-auto focus-visible:ring-0 placeholder:text-muted-foreground/40"
              placeholder="Sequence name..."
            />

            {/* Steps */}
            <SortableContext items={steps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              <AnimatePresence mode="popLayout">
                <div className="space-y-4">
                  {steps.map((step, i) => (
                    <SortableStep key={step.id} step={step} index={i} onUpdate={updateStep} onDelete={deleteStep} />
                  ))}
                </div>
              </AnimatePresence>
            </SortableContext>

            {/* Drop zone + add button */}
            <div className="space-y-3">
              <div className="rounded-2xl border-2 border-dashed border-border/50 p-6 text-center text-sm text-muted-foreground hover:border-violet-500/30 hover:text-violet-400 transition-all">
                Drag an action block here to add a step
              </div>
              <div className="flex gap-2 flex-wrap">
                {ACTION_BLOCKS.filter((b) => b.hasMessage).slice(0, 4).map((block) => {
                  const Icon = block.icon
                  const color = PLATFORM_COLORS[block.platform]
                  return (
                    <Button
                      key={block.id}
                      variant="outline"
                      size="sm"
                      className="rounded-xl gap-1.5 border-border/50"
                      onClick={() => addStep(block)}
                    >
                      <span style={{ color }}><Icon className="h-3.5 w-3.5" /></span>
                      {block.label}
                    </Button>
                  )
                })}
                <Button variant="outline" size="sm" className="rounded-xl gap-1.5" onClick={() => addStep(ACTION_BLOCKS[0])}>
                  <Plus className="h-3.5 w-3.5" /> Add Step
                </Button>
              </div>
            </div>

            {/* Save button */}
            <div className="pt-4">
              <Button size="lg" className="rounded-xl gap-2 w-full sm:w-auto" onClick={saveSequence} disabled={saving}>
                {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                Save Sequence
              </Button>
            </div>
          </div>
        </div>

        <DragOverlay>
          {activeDragId && activeDragId.startsWith("sidebar-") && (() => {
            const block = ACTION_BLOCKS.find((b) => `sidebar-${b.id}` === activeDragId)
            if (!block) return null
            const Icon = block.icon
            const color = PLATFORM_COLORS[block.platform]
            return (
              <div className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 bg-card border border-border shadow-xl text-sm">
                <div className="rounded-lg p-1.5" style={{ backgroundColor: `${color}20` }}>
                  <span style={{ color }}><Icon className="h-4 w-4" /></span>
                </div>
                <span className="font-medium">{block.label}</span>
              </div>
            )
          })()}
        </DragOverlay>
      </DndContext>
    </motion.div>
  )
}

export default function SequenceBuilderPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}>
      <SequenceBuilderInner />
    </Suspense>
  )
}
