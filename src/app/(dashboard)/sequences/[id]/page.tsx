"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useBusinessId } from "@/lib/use-business"
import useSWR from "swr"
import { dashboardApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { motion, AnimatePresence } from "framer-motion"
import {
  ArrowLeft, Plus, Trash2, Pencil, Check, X, ChevronDown, ChevronUp,
  Users, MessageSquare, TrendingUp, Play, Loader2, GitBranch, Beaker,
  Copy, UserPlus, BarChart3, Clock, CircleDot
} from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"

const container = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } }
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.5 } } }

const PLATFORM_OPTIONS = [
  { value: "instagram", label: "IG", emoji: "📱", color: "bg-pink-500", border: "border-pink-500/50", bg: "bg-pink-500/10", text: "text-pink-400" },
  { value: "facebook", label: "FB", emoji: "📘", color: "bg-blue-500", border: "border-blue-500/50", bg: "bg-blue-500/10", text: "text-blue-400" },
  { value: "linkedin", label: "LI", emoji: "🔷", color: "bg-blue-700", border: "border-blue-500/50", bg: "bg-blue-500/10", text: "text-blue-400" },
  { value: "email", label: "Email", emoji: "📧", color: "bg-green-500", border: "border-green-500/50", bg: "bg-green-500/10", text: "text-green-400" },
  { value: "sms", label: "SMS", emoji: "💬", color: "bg-yellow-500", border: "border-yellow-500/50", bg: "bg-yellow-500/10", text: "text-yellow-400" },
]

const getPlatform = (p: string) => PLATFORM_OPTIONS.find(o => o.value === p) || PLATFORM_OPTIONS[0]
const platformLabel = (p: string) => getPlatform(p).label
const platformColor = (p: string) => getPlatform(p).color

interface SeqTag { id: string; name: string; color: string | null }

interface StepVariant {
  id: string; step_id: string; variant_label: string; message_text: string
  is_active: boolean; times_sent: number; times_responded: number; created_at: string
  platform: string | null
}

interface Step {
  id: string; sequence_id: string; step_number: number; step_type: string
  delay_days: number; condition: string; created_at: string; variants: StepVariant[]
  step_name: string | null; platform: string | null
}

interface SeqDetail {
  sequence: {
    id: string; name: string; platform: string; platforms: string[]; niche: string; description: string
    is_active: boolean; cloned_from: string | null; created_at: string; tags: SeqTag[]
  }
  steps: Step[]
  stats: { total: number; active: number; responded: number; completed: number; exited: number }
  clones: { id: string; name: string; niche: string; total_enrolled: number; total_responded: number; response_rate: number }[]
}

const STEP_TYPES = [
  { value: "first_touch", label: "First Touch" },
  { value: "follow_up", label: "Follow Up" },
  { value: "re_engage", label: "Re-engage" },
]
const CONDITIONS = [
  { value: "no_reply", label: "No Reply" },
  { value: "always", label: "Always" },
]

export default function SequenceDetailPage() {
  const params = useParams()
  const router = useRouter()
  const businessId = useBusinessId()
  const seqId = params.id as string

  const { data, isLoading, mutate } = useSWR<SeqDetail>(
    seqId ? `seq_detail_${seqId}` : null,
    () => dashboardApi("get_sequence_detail_v2", { id: seqId }).then((d: any) => d)
  )

  const [expandedStep, setExpandedStep] = useState<string | null>(null)
  const [addStepOpen, setAddStepOpen] = useState(false)
  const [addVariantStepId, setAddVariantStepId] = useState<string | null>(null)
  const [editVariant, setEditVariant] = useState<StepVariant | null>(null)
  const [deleteStep, setDeleteStep] = useState<string | null>(null)
  const [deleteVariant, setDeleteVariant] = useState<string | null>(null)
  const [assignOpen, setAssignOpen] = useState(false)

  const [stepName, setStepName] = useState("")
  const [stepPlatform, setStepPlatform] = useState("")
  const [stepType, setStepType] = useState("follow_up")
  const [delayDays, setDelayDays] = useState("1")
  const [stepCondition, setStepCondition] = useState("no_reply")

  const [variantLabel, setVariantLabel] = useState("A")
  const [variantText, setVariantText] = useState("")

  const { data: leadsData } = useSWR(
    assignOpen ? `leads_for_assign_${businessId}` : null,
    () => dashboardApi("get_leads", { business_id: businessId || undefined, pageSize: 500 }).then((d: any) => d)
  )
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set())
  const [leadSearch, setLeadSearch] = useState("")

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  )

  if (!data?.sequence) return (
    <div className="text-center py-12">
      <p className="text-muted-foreground">Sequence not found</p>
      <Link href="/sequences"><Button variant="link" className="mt-2">← Back to Sequences</Button></Link>
    </div>
  )

  const { sequence: seq, steps, stats, clones } = data
  const platforms = seq.platforms || []
  const tags = seq.tags || []
  const responseRate = stats.total > 0 ? ((stats.responded / stats.total) * 100).toFixed(1) : "0"

  async function handleAddStep() {
    const nextNum = steps.length > 0 ? Math.max(...steps.map(s => s.step_number)) + 1 : 1
    if (!stepName.trim()) return toast.error("Step name is required")
    if (!stepPlatform) return toast.error("Select a platform")
    try {
      await dashboardApi("add_sequence_step_v2", {
        sequence_id: seqId,
        step_number: nextNum,
        step_type: nextNum === 1 ? "first_touch" : stepType,
        delay_days: Number(delayDays) || 0,
        condition: stepCondition,
        step_name: stepName.trim(),
        platform: stepPlatform,
      })
      toast.success("Step added!")
      setAddStepOpen(false)
      setStepName(""); setStepPlatform(""); setStepType("follow_up"); setDelayDays("1"); setStepCondition("no_reply")
      mutate()
    } catch (e: any) { toast.error(e.message) }
  }

  async function handleAddVariant() {
    if (!addVariantStepId || !variantText.trim()) return toast.error("Message text is required")
    const step = steps.find(s => s.id === addVariantStepId)
    try {
      await dashboardApi("add_step_variant", {
        step_id: addVariantStepId,
        variant_label: variantLabel,
        message_text: variantText,
        platform: step?.platform || null,
      })
      toast.success("Variant added!")
      setAddVariantStepId(null)
      setVariantLabel("A"); setVariantText("")
      mutate()
    } catch (e: any) { toast.error(e.message) }
  }

  async function handleUpdateVariant() {
    if (!editVariant) return
    try {
      await dashboardApi("update_step_variant", {
        id: editVariant.id,
        message_text: editVariant.message_text,
        variant_label: editVariant.variant_label,
        platform: editVariant.platform,
      })
      toast.success("Variant updated!")
      setEditVariant(null)
      mutate()
    } catch (e: any) { toast.error(e.message) }
  }

  async function handleDeleteStep() {
    if (!deleteStep) return
    try {
      await dashboardApi("delete_sequence_step_v2", { id: deleteStep })
      toast.success("Step deleted")
      setDeleteStep(null)
      if (expandedStep === deleteStep) setExpandedStep(null)
      mutate()
    } catch (e: any) { toast.error(e.message) }
  }

  async function handleDeleteVariant() {
    if (!deleteVariant) return
    try {
      await dashboardApi("delete_step_variant", { id: deleteVariant })
      toast.success("Variant deleted")
      setDeleteVariant(null)
      mutate()
    } catch (e: any) { toast.error(e.message) }
  }

  async function handleAssignLeads() {
    if (selectedLeads.size === 0) return toast.error("Select at least one lead")
    try {
      await dashboardApi("assign_leads_to_sequence_v2", {
        sequence_id: seqId,
        lead_ids: [...selectedLeads],
        business_id: businessId || undefined,
      })
      toast.success(`Assigned ${selectedLeads.size} leads!`)
      setAssignOpen(false)
      setSelectedLeads(new Set())
      mutate()
    } catch (e: any) { toast.error(e.message) }
  }

  function getVariantColor(variant: StepVariant, allVariants: StepVariant[]) {
    if (allVariants.length <= 1) return ""
    const rates = allVariants.map(v => v.times_sent > 0 ? v.times_responded / v.times_sent : 0)
    const rate = variant.times_sent > 0 ? variant.times_responded / variant.times_sent : 0
    const max = Math.max(...rates)
    const min = Math.min(...rates)
    if (max === min) return ""
    if (rate === max) return "border-emerald-500/50 bg-emerald-500/5"
    if (rate === min) return "border-red-500/50 bg-red-500/5"
    return ""
  }

  const filteredLeads = (leadsData || []).filter((l: any) =>
    !leadSearch || l.name?.toLowerCase().includes(leadSearch.toLowerCase()) || l.lead_id?.toLowerCase().includes(leadSearch.toLowerCase())
  )

  function getBestVariant(step: Step) {
    if (step.variants.length <= 1) return null
    return step.variants.reduce((best, v) => {
      const rate = v.times_sent > 0 ? v.times_responded / v.times_sent : 0
      const bestRate = best.times_sent > 0 ? best.times_responded / best.times_sent : 0
      return rate > bestRate ? v : best
    }, step.variants[0])
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="space-y-6 pb-8"
    >
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/sequences"><Button variant="ghost" size="sm" className="rounded-xl"><ArrowLeft className="h-4 w-4" /></Button></Link>
            <div>
              <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2 flex-wrap">
                {seq.name}
                {!seq.is_active && <Badge variant="secondary" className="text-[10px]">Paused</Badge>}
              </h1>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {platforms.map(p => (
                  <span key={p} className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold text-primary-foreground ${platformColor(p)}`}>
                    {platformLabel(p)}
                  </span>
                ))}
                {seq.niche && <Badge variant="outline" className="text-[10px]">{seq.niche}</Badge>}
                {tags.map(tag => (
                  <span key={tag.id} className="inline-flex items-center px-1.5 py-0 rounded-full text-[10px] font-medium border" style={{ borderColor: tag.color || "#6366f1", color: tag.color || "#6366f1" }}>
                    {tag.name}
                  </span>
                ))}
              </div>
              {seq.description && <p className="text-sm text-muted-foreground mt-0.5">{seq.description}</p>}
            </div>
          </div>
          <Button onClick={() => setAssignOpen(true)} className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl px-4 py-2 font-medium transition-colors">
            <UserPlus className="h-4 w-4" /> Assign Leads
          </Button>
        </div>
      </motion.div>

      {/* Stats */}
      <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Enrolled", value: stats.total, icon: Users, color: "blue" },
          { label: "Active", value: stats.active, icon: Play, color: "emerald" },
          { label: "Responded", value: stats.responded, icon: MessageSquare, color: "amber" },
          { label: "Exited", value: stats.exited, icon: X, color: "red" },
          { label: "Response Rate", value: `${responseRate}%`, icon: TrendingUp, color: "purple" },
        ].map(s => (
          <motion.div key={s.label} variants={item} whileHover={{ scale: 1.02, y: -2 }}
            className={`rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 p-5 shadow-lg shadow-${s.color}-500/20`}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground font-medium">{s.label}</p>
                <p className="text-3xl font-bold mt-1 tabular-nums">{s.value}</p>
              </div>
              <div className={`rounded-xl p-2.5 bg-${s.color}-500/20`}>
                <s.icon className={`h-5 w-5 text-${s.color}-400`} />
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Cross-Niche Comparison */}
      {clones.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 p-5 shadow-lg"
        >
          <h3 className="font-semibold text-sm flex items-center gap-2 mb-3">
            <Beaker className="h-4 w-4 text-violet-400" /> Cross-Niche Comparison
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-xl border-2 border-violet-500/30 bg-violet-500/10 p-3">
              <div className="text-sm font-medium">{seq.name}</div>
              <div className="text-xs text-muted-foreground">{seq.niche || "No niche"}</div>
              <div className="mt-2 flex gap-3 text-xs">
                <span>{stats.total} enrolled</span>
                <span className="text-emerald-400">{responseRate}% rate</span>
              </div>
            </div>
            {clones.map(c => (
              <Link key={c.id} href={`/sequences/${c.id}`}>
                <div className="rounded-xl border border-border/50 p-3 hover:border-violet-500/30 transition-colors cursor-pointer bg-card/40">
                  <div className="text-sm font-medium">{c.name}</div>
                  <div className="text-xs text-muted-foreground">{c.niche || "No niche"}</div>
                  <div className="mt-2 flex gap-3 text-xs">
                    <span>{c.total_enrolled} enrolled</span>
                    <span className="text-emerald-400">{c.response_rate}% rate</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </motion.div>
      )}

      {/* WORKFLOW BUILDER */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
        <h2 className="font-semibold flex items-center gap-2 mb-6">
          <GitBranch className="h-5 w-5 text-violet-400" /> Workflow
        </h2>

        <div className="flex flex-col items-center">
          {/* START NODE */}
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-full bg-emerald-500 text-primary-foreground flex items-center justify-center shadow-md shadow-emerald-500/30">
              <Play className="h-4 w-4 ml-0.5" />
            </div>
            <span className="text-sm font-medium text-muted-foreground">Sequence begins when lead is assigned</span>
          </div>

          {steps.length > 0 && (
            <div className="w-0.5 h-6 bg-border/50" />
          )}

          {/* STEP NODES */}
          {steps.map((step, i) => {
            const isExpanded = expandedStep === step.id
            const plat = getPlatform(step.platform || platforms[0] || "instagram")
            const bestVariant = getBestVariant(step)
            const displayName = step.step_name || step.step_type.replace(/_/g, " ")

            return (
              <div key={step.id} className="flex flex-col items-center w-full max-w-lg">
                {i > 0 && step.delay_days > 0 && (
                  <>
                    <div className="w-0.5 h-4 bg-border/50" />
                    <div className="flex items-center gap-2 py-1.5 px-4 rounded-full bg-muted/30 border border-dashed border-border/50 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>Wait {step.delay_days} day{step.delay_days !== 1 ? "s" : ""}</span>
                      {step.condition === "no_reply" && <span className="text-muted-foreground/60">(if no reply)</span>}
                    </div>
                    <div className="w-0.5 h-4 bg-border/50" />
                  </>
                )}
                {i > 0 && step.delay_days === 0 && (
                  <div className="w-0.5 h-4 bg-border/50" />
                )}
                {i === 0 && step.delay_days > 0 && (
                  <>
                    <div className="w-0.5 h-4 bg-border/50" />
                    <div className="flex items-center gap-2 py-1.5 px-4 rounded-full bg-muted/30 border border-dashed border-border/50 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>Wait {step.delay_days} day{step.delay_days !== 1 ? "s" : ""}</span>
                    </div>
                    <div className="w-0.5 h-4 bg-border/50" />
                  </>
                )}

                <div className="text-muted-foreground/40 text-xs leading-none mb-1">▼</div>

                {/* NODE CARD */}
                <div className={`w-full rounded-2xl border-2 shadow-lg transition-all backdrop-blur-xl ${isExpanded ? `${plat.border} shadow-md bg-card/60` : "border-border/50 bg-card/60 hover:border-border hover:shadow-xl"}`}>
                  <div
                    className="flex items-center gap-3 p-4 cursor-pointer select-none"
                    onClick={() => setExpandedStep(isExpanded ? null : step.id)}
                  >
                    <div className={`w-11 h-11 rounded-xl ${plat.bg} flex items-center justify-center text-xl shrink-0`}>
                      {plat.emoji}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold text-primary-foreground ${plat.color}`}>
                          {plat.label}
                        </span>
                        <span className="text-xs text-muted-foreground capitalize">{step.step_type.replace(/_/g, " ")}</span>
                      </div>
                      <h3 className="font-semibold text-sm mt-0.5 truncate">{displayName}</h3>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-xs text-muted-foreground">
                          {step.variants.length} variant{step.variants.length !== 1 ? "s" : ""}
                        </span>
                        {bestVariant && step.variants.length > 1 && (
                          <Badge className="text-[10px] bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20">
                            Best: {bestVariant.variant_label} ({bestVariant.times_sent > 0 ? ((bestVariant.times_responded / bestVariant.times_sent) * 100).toFixed(0) : 0}%)
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-400 hover:text-red-500 hover:bg-red-500/10 rounded-xl" onClick={(e) => { e.stopPropagation(); setDeleteStep(step.id) }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                      {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </div>

                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="border-t border-border/30 p-4 space-y-3 bg-muted/10">
                          {step.variants.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-4">No variants yet. Add message variants to A/B test.</p>
                          ) : (
                            step.variants.map(v => {
                              const rate = v.times_sent > 0 ? ((v.times_responded / v.times_sent) * 100).toFixed(1) : "0"
                              return (
                                <div key={v.id} className={`rounded-xl border bg-card/80 p-3 ${getVariantColor(v, step.variants)}`}>
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                      <div className="w-7 h-7 rounded-full bg-violet-500/20 text-violet-400 flex items-center justify-center text-xs font-bold">
                                        {v.variant_label}
                                      </div>
                                      <div className="flex gap-3 text-xs text-muted-foreground">
                                        <span>{v.times_sent} sent</span>
                                        <span className="text-emerald-400">{v.times_responded} replied</span>
                                        <span className="font-medium text-foreground">{rate}%</span>
                                      </div>
                                    </div>
                                    <div className="flex gap-1">
                                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-lg" onClick={() => setEditVariant({ ...v })}>
                                        <Pencil className="h-3 w-3" />
                                      </Button>
                                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400 rounded-lg" onClick={() => setDeleteVariant(v.id)}>
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  </div>
                                  <p className="text-sm whitespace-pre-wrap bg-muted/30 rounded-lg p-2.5 text-foreground/80">{v.message_text}</p>
                                  {v.times_sent > 0 && (
                                    <div className="mt-2 h-1.5 bg-muted/30 rounded-full overflow-hidden">
                                      <div
                                        className="h-full bg-gradient-to-r from-violet-500 to-emerald-500 rounded-full transition-all"
                                        style={{ width: `${Math.min(100, parseFloat(rate))}%` }}
                                      />
                                    </div>
                                  )}
                                </div>
                              )
                            })
                          )}
                          <Button
                            variant="outline" size="sm" className="w-full gap-1.5 border-dashed rounded-xl"
                            onClick={() => {
                              const nextLabel = String.fromCharCode(65 + step.variants.length)
                              setVariantLabel(nextLabel)
                              setVariantText("")
                              setAddVariantStepId(step.id)
                            }}
                          >
                            <Plus className="h-3.5 w-3.5" /> Add Variant {String.fromCharCode(65 + step.variants.length)}
                          </Button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {i < steps.length - 1 && (
                  <div className="w-0.5 h-2 bg-border/50" />
                )}
              </div>
            )
          })}

          <div className="w-0.5 h-6 bg-border/50" />

          <button
            onClick={() => {
              setStepPlatform(platforms[0] || "instagram")
              setAddStepOpen(true)
            }}
            className="w-full max-w-lg rounded-2xl border-2 border-dashed border-border/50 hover:border-violet-400 hover:bg-violet-500/5 transition-all p-4 flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-violet-400 cursor-pointer"
          >
            <Plus className="h-4 w-4" /> Add Step
          </button>

          <div className="w-0.5 h-6 bg-border/50" />

          <div className="text-muted-foreground/40 text-xs leading-none mb-1">▼</div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-muted text-muted-foreground flex items-center justify-center shadow-md">
              <CircleDot className="h-4 w-4" />
            </div>
            <div>
              <span className="text-sm font-medium text-muted-foreground">Sequence complete</span>
              <p className="text-xs text-muted-foreground/60">Lead exits if responded at any point</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Per-Step Stats */}
      {steps.some(s => s.variants.some(v => v.times_sent > 0)) && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
          className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 p-5 shadow-lg"
        >
          <h3 className="font-semibold text-sm flex items-center gap-2 mb-3">
            <BarChart3 className="h-4 w-4 text-violet-400" /> Per-Step Performance
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/30">
                  <th className="text-left p-2 text-xs text-muted-foreground uppercase tracking-wider font-medium">Step</th>
                  <th className="text-left p-2 text-xs text-muted-foreground uppercase tracking-wider font-medium">Variant</th>
                  <th className="text-left p-2 text-xs text-muted-foreground uppercase tracking-wider font-medium">Platform</th>
                  <th className="text-right p-2 text-xs text-muted-foreground uppercase tracking-wider font-medium">Sent</th>
                  <th className="text-right p-2 text-xs text-muted-foreground uppercase tracking-wider font-medium">Responded</th>
                  <th className="text-right p-2 text-xs text-muted-foreground uppercase tracking-wider font-medium">Rate</th>
                </tr>
              </thead>
              <tbody>
                {steps.flatMap(step =>
                  step.variants.map(v => {
                    const rate = v.times_sent > 0 ? ((v.times_responded / v.times_sent) * 100).toFixed(1) : "—"
                    const p = step.platform || v.platform
                    return (
                      <tr key={v.id} className="border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="p-2 font-medium">{step.step_name || `Step ${step.step_number}`}</td>
                        <td className="p-2">
                          <Badge variant="outline" className="text-[10px]">{v.variant_label}</Badge>
                        </td>
                        <td className="p-2">
                          {p ? (
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold text-primary-foreground ${platformColor(p)}`}>{platformLabel(p)}</span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">All</span>
                          )}
                        </td>
                        <td className="p-2 text-right">{v.times_sent}</td>
                        <td className="p-2 text-right text-emerald-400">{v.times_responded}</td>
                        <td className="p-2 text-right font-medium">{rate}{rate !== "—" ? "%" : ""}</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {/* Add Step Dialog */}
      <Dialog open={addStepOpen} onOpenChange={setAddStepOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Step</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Step Name</label>
              <Input placeholder='e.g. "Introduction Message"' value={stepName} onChange={(e) => setStepName(e.target.value)} className="rounded-xl" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Platform</label>
              <Select value={stepPlatform} onValueChange={setStepPlatform}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select platform" /></SelectTrigger>
                <SelectContent>
                  {platforms.map(p => {
                    const pl = getPlatform(p)
                    return <SelectItem key={p} value={p}>{pl.emoji} {pl.label} — {p}</SelectItem>
                  })}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Step Type</label>
              <Select value={stepType} onValueChange={setStepType}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STEP_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Wait (days before this step)</label>
              <Input type="number" min="0" value={delayDays} onChange={(e) => setDelayDays(e.target.value)} className="rounded-xl" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Condition</label>
              <Select value={stepCondition} onValueChange={setStepCondition}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONDITIONS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full rounded-xl" onClick={handleAddStep}><Plus className="h-4 w-4 mr-2" /> Add Step</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Variant Dialog */}
      <Dialog open={!!addVariantStepId} onOpenChange={(o) => { if (!o) setAddVariantStepId(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add Variant {variantLabel}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Label</label>
              <Input value={variantLabel} onChange={(e) => setVariantLabel(e.target.value)} maxLength={2} className="w-20 rounded-xl" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Message Text</label>
              <Textarea
                placeholder="Hey {{name}}, I noticed your {{business_type}} in {{city}}..."
                value={variantText}
                onChange={(e) => setVariantText(e.target.value)}
                rows={5}
                className="rounded-xl"
              />
              <p className="text-[10px] text-muted-foreground mt-1">Use {"{{name}}"}, {"{{city}}"}, {"{{business_type}}"} for personalization</p>
            </div>
            <Button className="w-full rounded-xl" onClick={handleAddVariant}><Plus className="h-4 w-4 mr-2" /> Add Variant</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Variant Dialog */}
      <Dialog open={!!editVariant} onOpenChange={(o) => { if (!o) setEditVariant(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit Variant {editVariant?.variant_label}</DialogTitle></DialogHeader>
          {editVariant && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Label</label>
                <Input value={editVariant.variant_label} onChange={(e) => setEditVariant({ ...editVariant, variant_label: e.target.value })} className="w-20 rounded-xl" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Message Text</label>
                <Textarea value={editVariant.message_text} onChange={(e) => setEditVariant({ ...editVariant, message_text: e.target.value })} rows={5} className="rounded-xl" />
              </div>
              <Button className="w-full rounded-xl" onClick={handleUpdateVariant}><Check className="h-4 w-4 mr-2" /> Save</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Assign Leads Dialog */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader><DialogTitle>Assign Leads to Sequence</DialogTitle></DialogHeader>
          <div className="space-y-3 flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Input placeholder="Search leads..." value={leadSearch} onChange={(e) => setLeadSearch(e.target.value)} className="pl-3 rounded-xl" />
              </div>
              <Button variant="outline" size="sm" className="rounded-xl" onClick={() => {
                if (selectedLeads.size === filteredLeads.length) setSelectedLeads(new Set())
                else setSelectedLeads(new Set(filteredLeads.map((l: any) => l.lead_id)))
              }}>
                {selectedLeads.size === filteredLeads.length && filteredLeads.length > 0 ? "Deselect All" : "Select All"}
              </Button>
            </div>
            <p className="text-sm"><span className="text-violet-400 font-semibold">{selectedLeads.size}</span> selected</p>
            <div className="flex-1 overflow-y-auto border border-border/50 rounded-xl">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 sticky top-0">
                  <tr>
                    <th className="p-2 w-10 text-xs text-muted-foreground uppercase tracking-wider font-medium"></th>
                    <th className="p-2 text-left text-xs text-muted-foreground uppercase tracking-wider font-medium">Name</th>
                    <th className="p-2 text-left hidden md:table-cell text-xs text-muted-foreground uppercase tracking-wider font-medium">Type</th>
                    <th className="p-2 text-left text-xs text-muted-foreground uppercase tracking-wider font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLeads.map((lead: any) => (
                    <tr key={lead.lead_id} className="border-t border-border/30 hover:bg-muted/20 cursor-pointer transition-colors" onClick={() => {
                      const next = new Set(selectedLeads)
                      next.has(lead.lead_id) ? next.delete(lead.lead_id) : next.add(lead.lead_id)
                      setSelectedLeads(next)
                    }}>
                      <td className="p-2"><input type="checkbox" checked={selectedLeads.has(lead.lead_id)} readOnly /></td>
                      <td className="p-2 font-medium">{lead.name || lead.lead_id}</td>
                      <td className="p-2 text-muted-foreground hidden md:table-cell">{lead.business_type || "—"}</td>
                      <td className="p-2"><Badge variant="secondary" className="text-[10px]">{lead.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button className="w-full rounded-xl" onClick={handleAssignLeads} disabled={selectedLeads.size === 0}>
              <UserPlus className="h-4 w-4 mr-2" /> Assign {selectedLeads.size} Leads
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteStep} onOpenChange={(o) => { if (!o) setDeleteStep(null) }} title="Delete Step" description="This will delete the step and all its variants." onConfirm={handleDeleteStep} />
      <ConfirmDialog open={!!deleteVariant} onOpenChange={(o) => { if (!o) setDeleteVariant(null) }} title="Delete Variant" description="Delete this message variant?" onConfirm={handleDeleteVariant} />
    </motion.div>
  )
}
