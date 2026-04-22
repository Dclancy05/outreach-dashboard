"use client"

/**
 * Your Selectors — drag-and-drop workflow builder (Phase 3)
 *
 * Dylan records individual selectors via the recorder (each recorded click
 * becomes a step on an existing automation row). This page lets him compose a
 * brand-new automation by dragging those recorded steps from the left source
 * panel into a canvas on the right, re-ordering them, deleting ones he
 * doesn't want, and saving the result as a new automation.
 *
 * Implementation uses @dnd-kit/core (already in package.json).
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import {
  ArrowLeft, Wand2, Trash2, Save, Video, Plus, Filter, Search,
  Layers, Sparkles, AlertTriangle, ChevronRight, RefreshCw, GripVertical,
} from "lucide-react"
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor,
  useDraggable, useDroppable, useSensor, useSensors,
} from "@dnd-kit/core"
import {
  SortableContext, arrayMove, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

/* ─── Types ─────────────────────────────────────────────────────────── */

interface SourceAutomation {
  id: string
  name: string
  platform: string
  tag: string | null
  description: string | null
  steps: Array<{ description?: string; kind?: string; selectors?: Record<string, unknown>; coords?: unknown } & Record<string, unknown>>
}

interface SourceStep {
  id: string                // `<automationId>:<stepIndex>`
  automationId: string
  automationName: string
  platform: string
  stepIndex: number
  description: string
  kind: string
  selectors: Record<string, unknown>
  coords: unknown
}

interface CanvasStep extends SourceStep {
  canvasId: string          // unique id while on the canvas (allows same source step to appear twice)
}

/* ─── Platform helpers ──────────────────────────────────────────────── */

const PLATFORM_COLORS: Record<string, string> = {
  instagram: "from-pink-500/20 to-purple-500/20 border-pink-500/30",
  facebook: "from-blue-500/20 to-blue-600/20 border-blue-500/30",
  linkedin: "from-sky-500/20 to-blue-500/20 border-sky-500/30",
  tiktok: "from-zinc-700/30 to-zinc-800/30 border-zinc-600/40",
  youtube: "from-red-500/20 to-red-600/20 border-red-500/30",
  twitter: "from-zinc-500/20 to-zinc-600/20 border-zinc-500/30",
  snapchat: "from-yellow-400/20 to-yellow-500/20 border-yellow-500/30",
  pinterest: "from-rose-500/20 to-red-500/20 border-rose-500/30",
}
const PLATFORM_LABEL: Record<string, string> = {
  instagram: "Instagram", facebook: "Facebook", linkedin: "LinkedIn",
  tiktok: "TikTok", youtube: "YouTube", twitter: "X",
  snapchat: "Snapchat", pinterest: "Pinterest",
}

/* ─── Draggable source step card ─────────────────────────────────────── */

function SourceStepCard({ step }: { step: SourceStep }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `src-${step.id}`,
    data: { source: true, step },
  })
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`cursor-grab select-none rounded-xl border bg-gradient-to-br p-3 transition-all hover:-translate-y-0.5 ${PLATFORM_COLORS[step.platform] || "bg-muted/20 border-border/50"} ${isDragging ? "opacity-40" : ""}`}
    >
      <div className="flex items-start gap-2">
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
            {PLATFORM_LABEL[step.platform] || step.platform} · step {step.stepIndex + 1}
          </p>
          <p className="text-sm font-medium truncate">{step.description || "(no description)"}</p>
          <p className="text-[10px] text-muted-foreground truncate">from: {step.automationName}</p>
        </div>
      </div>
    </div>
  )
}

/* ─── Sortable step on the canvas ────────────────────────────────────── */

function CanvasStepCard({
  step, index, onDelete,
}: { step: CanvasStep; index: number; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: step.canvasId,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative rounded-xl border bg-gradient-to-br p-3 ${PLATFORM_COLORS[step.platform] || "bg-muted/20 border-border/50"} ${isDragging ? "opacity-50 z-10" : ""}`}
    >
      <div className="flex items-start gap-2">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none rounded p-1 hover:bg-muted/30 transition-colors mt-0.5"
          aria-label="Reorder step"
        >
          <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
        <div className="flex-shrink-0 h-6 w-6 rounded-full bg-muted/30 flex items-center justify-center text-[11px] font-bold">
          {index + 1}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
            {PLATFORM_LABEL[step.platform] || step.platform} · from {step.automationName}
          </p>
          <p className="text-sm font-medium">{step.description || "(no description)"}</p>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-red-500/20 text-red-400 transition-all"
          title="Remove step"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

/* ─── Canvas drop zone ───────────────────────────────────────────────── */

function CanvasDropZone({
  steps, onDelete,
}: { steps: CanvasStep[]; onDelete: (canvasId: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: "canvas" })
  return (
    <div
      ref={setNodeRef}
      className={`rounded-2xl border-2 border-dashed p-4 min-h-[400px] transition-colors ${
        isOver ? "border-orange-500 bg-orange-500/5" : "border-border/40 bg-muted/5"
      }`}
    >
      {steps.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[360px] text-center text-muted-foreground">
          <Layers className="h-8 w-8 mb-2 opacity-40" />
          <p className="text-sm font-medium">Drag steps from the left panel</p>
          <p className="text-[11px] mt-1">
            The workflow will run them top-to-bottom when the automation fires.
          </p>
        </div>
      ) : (
        <SortableContext items={steps.map(s => s.canvasId)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {steps.map((s, i) => (
              <CanvasStepCard
                key={s.canvasId}
                step={s}
                index={i}
                onDelete={() => onDelete(s.canvasId)}
              />
            ))}
          </div>
        </SortableContext>
      )}
    </div>
  )
}

/* ─── Page ───────────────────────────────────────────────────────────── */

export default function SelectorsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<{ id: string; name: string } | null>(null)

  const [sourceAutomations, setSourceAutomations] = useState<SourceAutomation[]>([])
  const [canvas, setCanvas] = useState<CanvasStep[]>([])

  const [workflowName, setWorkflowName] = useState("")
  const [workflowTag, setWorkflowTag] = useState<"outreach_action" | "lead_enrichment" | "utility">("utility")
  const [targetPlatform, setTargetPlatform] = useState("instagram")
  const [platformFilter, setPlatformFilter] = useState<string>("all")
  const [query, setQuery] = useState("")
  const [activeDragId, setActiveDragId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/automations")
      const data = await res.json()
      if (data.errors?.automations) {
        setError(data.errors.automations)
      }
      setSourceAutomations(data.data || [])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  /** Flatten recorded automations into individual draggable steps. */
  const allSourceSteps = useMemo<SourceStep[]>(() => {
    const out: SourceStep[] = []
    for (const a of sourceAutomations) {
      if (!Array.isArray(a.steps)) continue
      a.steps.forEach((step, idx) => {
        const desc = typeof step?.description === "string" ? step.description : ""
        out.push({
          id: `${a.id}:${idx}`,
          automationId: a.id,
          automationName: a.name,
          platform: a.platform,
          stepIndex: idx,
          description: desc,
          kind: typeof step?.kind === "string" ? step.kind : "pending",
          selectors: (step?.selectors as Record<string, unknown>) || {},
          coords: step?.coords ?? null,
        })
      })
    }
    return out
  }, [sourceAutomations])

  const filteredSourceSteps = useMemo(() => {
    const q = query.trim().toLowerCase()
    return allSourceSteps.filter(s => {
      if (platformFilter !== "all" && s.platform !== platformFilter) return false
      if (!q) return true
      return (
        s.description.toLowerCase().includes(q) ||
        s.automationName.toLowerCase().includes(q)
      )
    })
  }, [allSourceSteps, platformFilter, query])

  const availablePlatforms = useMemo(() => {
    const set = new Set(sourceAutomations.map(a => a.platform))
    return Array.from(set)
  }, [sourceAutomations])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const handleDragStart = (e: DragStartEvent) => {
    setActiveDragId(String(e.active.id))
  }

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveDragId(null)
    const { active, over } = e
    if (!over) return

    const activeId = String(active.id)
    const overId = String(over.id)

    // Case 1: dragging a source step somewhere
    if (activeId.startsWith("src-")) {
      const srcStep = active.data.current?.step as SourceStep | undefined
      if (!srcStep) return
      // Only accept drops on the canvas or on an existing canvas step
      if (overId !== "canvas" && !canvas.find(s => s.canvasId === overId)) return

      const newStep: CanvasStep = {
        ...srcStep,
        canvasId: `canvas-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      }
      if (overId === "canvas") {
        setCanvas(prev => [...prev, newStep])
      } else {
        const idx = canvas.findIndex(s => s.canvasId === overId)
        setCanvas(prev => {
          const next = [...prev]
          next.splice(idx >= 0 ? idx : next.length, 0, newStep)
          return next
        })
      }
      return
    }

    // Case 2: reordering within the canvas
    if (activeId.startsWith("canvas-")) {
      if (activeId === overId) return
      setCanvas(prev => {
        const from = prev.findIndex(s => s.canvasId === activeId)
        const to = prev.findIndex(s => s.canvasId === overId)
        if (from < 0 || to < 0) return prev
        return arrayMove(prev, from, to)
      })
    }
  }

  const removeFromCanvas = (canvasId: string) => {
    setCanvas(prev => prev.filter(s => s.canvasId !== canvasId))
  }

  const clearCanvas = () => setCanvas([])

  const saveWorkflow = async () => {
    if (!workflowName.trim()) { setError("Give the workflow a name"); return }
    if (canvas.length === 0) { setError("Drop at least one step onto the canvas"); return }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/automations/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: workflowName.trim(),
          platform: targetPlatform,
          tag: workflowTag,
          steps: canvas.map((s, i) => ({
            index: i,
            description: s.description,
            kind: s.kind,
            selectors: s.selectors,
            coords: s.coords,
            composed_from: { automation_id: s.automationId, step_index: s.stepIndex },
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Save failed")
        return
      }
      setSaved({ id: data.data.id, name: data.data.name })
      setCanvas([])
      setWorkflowName("")
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const draggingSourceStep = useMemo(() => {
    if (!activeDragId || !activeDragId.startsWith("src-")) return null
    const id = activeDragId.slice(4)
    return allSourceSteps.find(s => s.id === id) || null
  }, [activeDragId, allSourceSteps])

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="min-h-[calc(100vh-6rem)] space-y-5"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/automations"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Automations
          </Link>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wand2 className="h-6 w-6 text-orange-400" /> Your Selectors
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Drag recorded steps into a canvas to compose a new automation.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border/50 bg-muted/20 px-3 py-2 text-xs font-medium hover:bg-muted/30 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Reload
          </button>
        </div>
      </div>

      {/* Empty-state hint when there are zero automations */}
      {!loading && sourceAutomations.length === 0 && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 flex items-start gap-3">
          <Video className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-300">Record some automations first</p>
            <p className="text-xs text-muted-foreground mt-1">
              This builder pulls its steps from your existing recorded automations. Head over to the
              Your Automations tab and record at least one, then come back here to compose them into a workflow.
            </p>
            <Link
              href="/automations"
              className="inline-flex items-center gap-1.5 mt-3 rounded-xl bg-orange-500 hover:bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors"
            >
              <ChevronRight className="h-3.5 w-3.5" /> Go to Your Automations
            </Link>
          </div>
        </div>
      )}

      {/* Save bar */}
      <div className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 p-4 shadow-lg">
        <div className="grid gap-3 md:grid-cols-[1.5fr_1fr_1fr_auto] items-end">
          <div>
            <label className="text-xs font-medium mb-1 block text-muted-foreground">Workflow name</label>
            <input
              value={workflowName}
              onChange={e => setWorkflowName(e.target.value)}
              placeholder="e.g. Warm IG profile then DM"
              className="w-full rounded-xl border border-border/50 bg-muted/20 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block text-muted-foreground">Platform</label>
            <select
              value={targetPlatform}
              onChange={e => setTargetPlatform(e.target.value)}
              className="w-full rounded-xl border border-border/50 bg-muted/20 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              {Object.entries(PLATFORM_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block text-muted-foreground">Tag</label>
            <select
              value={workflowTag}
              onChange={e => setWorkflowTag(e.target.value as typeof workflowTag)}
              className="w-full rounded-xl border border-border/50 bg-muted/20 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="outreach_action">Outreach Action</option>
              <option value="lead_enrichment">Lead Enrichment</option>
              <option value="utility">Utility</option>
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button
              onClick={clearCanvas}
              disabled={canvas.length === 0 || saving}
              className="rounded-xl border border-border/50 bg-muted/20 px-3 py-2 text-sm font-medium hover:bg-muted/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Clear
            </button>
            <button
              onClick={saveWorkflow}
              disabled={saving || canvas.length === 0 || !workflowName.trim()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save workflow
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-xl bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-300 flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5" /> {error}
          </div>
        )}
        {saved && (
          <div className="mt-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-3 py-2 text-xs text-emerald-300 flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5" /> Saved &quot;{saved.name}&quot; ({saved.id.slice(0, 8)}…) — open it on the Automations page to record selectors.
          </div>
        )}
      </div>

      {/* Builder grid */}
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
          {/* ─── Source panel ─── */}
          <aside className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 p-4 shadow-lg space-y-3 h-fit sticky top-4">
            <div>
              <h2 className="text-sm font-semibold flex items-center gap-1.5">
                <Layers className="h-4 w-4 text-orange-400" /> Recorded steps
              </h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {allSourceSteps.length} step{allSourceSteps.length === 1 ? "" : "s"} across {sourceAutomations.length} automation{sourceAutomations.length === 1 ? "" : "s"}
              </p>
            </div>

            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search…"
                  className="w-full rounded-xl border border-border/50 bg-muted/20 pl-8 pr-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Filter className="h-3 w-3" /> Platform:
                </span>
                <button
                  onClick={() => setPlatformFilter("all")}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                    platformFilter === "all" ? "bg-orange-500/20 text-orange-300 border border-orange-500/40" : "bg-muted/20 text-muted-foreground border border-border/40 hover:text-foreground"
                  }`}
                >
                  All
                </button>
                {availablePlatforms.map(p => (
                  <button
                    key={p}
                    onClick={() => setPlatformFilter(p)}
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                      platformFilter === p ? "bg-orange-500/20 text-orange-300 border border-orange-500/40" : "bg-muted/20 text-muted-foreground border border-border/40 hover:text-foreground"
                    }`}
                  >
                    {PLATFORM_LABEL[p] || p}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2 max-h-[calc(100vh-22rem)] overflow-y-auto pr-1">
              {loading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground p-3">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Loading automations…
                </div>
              ) : filteredSourceSteps.length === 0 ? (
                <div className="text-xs text-muted-foreground p-3 rounded-xl bg-muted/10 border border-border/40">
                  No steps match — adjust filters or record more.
                </div>
              ) : (
                filteredSourceSteps.map(s => <SourceStepCard key={s.id} step={s} />)
              )}
            </div>
          </aside>

          {/* ─── Canvas ─── */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold flex items-center gap-1.5">
                <Plus className="h-4 w-4 text-orange-400" /> Workflow canvas
              </h2>
              <p className="text-[11px] text-muted-foreground">
                {canvas.length} step{canvas.length === 1 ? "" : "s"} · drag to reorder
              </p>
            </div>

            <CanvasDropZone steps={canvas} onDelete={removeFromCanvas} />
          </section>
        </div>

        <DragOverlay>
          {draggingSourceStep ? (
            <div className={`rounded-xl border bg-gradient-to-br p-3 shadow-xl ${PLATFORM_COLORS[draggingSourceStep.platform] || "bg-muted/20 border-border/50"}`}>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                {PLATFORM_LABEL[draggingSourceStep.platform] || draggingSourceStep.platform} · step {draggingSourceStep.stepIndex + 1}
              </p>
              <p className="text-sm font-medium">{draggingSourceStep.description || "(no description)"}</p>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </motion.div>
  )
}
