"use client"

import { useState, useEffect, useRef } from "react"
import useSWR from "swr"
import { dashboardApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { LeadDetailPopup } from "@/components/lead-detail-popup"
import { SetupBanner } from "@/components/setup-banner"
import {
  Kanban,
  Plus,
  GripVertical,
  Calendar,
  Pencil,
  Trash2,
  X,
  Check,
  ChevronLeft,
  ChevronRight,
  Settings,
  Instagram,
  Filter,
} from "lucide-react"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/confirm-dialog"
import type { Lead, SmartList } from "@/types"

interface PipelineLead {
  lead_id: string
  name: string
  city: string
  business_type: string
  total_score: number
  ranking_tier: string
  status: string
  pipeline_stage: string
  tags: string
  last_contacted_at: string
  instagram_url: string
  email: string
  phone: string
}

interface PipelineStage {
  id: string
  label: string
  color: string
}

const DEFAULT_STAGES: PipelineStage[] = [
  { id: "new", label: "New", color: "bg-slate-500" },
  { id: "contacted", label: "Contacted", color: "bg-blue-500" },
  { id: "responded", label: "Responded", color: "bg-yellow-500" },
  { id: "interested", label: "Interested", color: "bg-green-500" },
  { id: "booked", label: "Booked", color: "bg-purple-500" },
  { id: "closed_won", label: "Closed Won", color: "bg-emerald-500" },
  { id: "closed_lost", label: "Closed Lost", color: "bg-red-500" },
]

const TIER_COLORS: Record<string, string> = {
  A: "text-green-400 bg-green-400/10",
  B: "text-blue-400 bg-blue-400/10",
  C: "text-yellow-400 bg-yellow-400/10",
  D: "text-orange-400 bg-orange-400/10",
  F: "text-red-400 bg-red-400/10",
  X: "text-gray-400 bg-gray-400/10",
}

const STAGES_STORAGE_KEY = "pipeline_stages"

export default function PipelinePage() {
  const [businessId, setBusinessId] = useState("")
  const [stages, setStages] = useState<PipelineStage[]>(DEFAULT_STAGES)
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null)
  const [dragOverStage, setDragOverStage] = useState<string | null>(null)
  const [selectedLead, setSelectedLead] = useState<PipelineLead | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [newStageName, setNewStageName] = useState("")
  const [editingStageId, setEditingStageId] = useState<string | null>(null)
  const [editingStageName, setEditingStageName] = useState("")
  const [tierFilter, setTierFilter] = useState<string>("all")
  const [tagFilter, setTagFilter] = useState("")
  const [campaignFilter, setCampaignFilter] = useState<string>("all")
  const [confirmDeleteStageId, setConfirmDeleteStageId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try {
      const stored = localStorage.getItem("selected_business")
      if (stored) setBusinessId(JSON.parse(stored).id || "")
    } catch {}
    const params = new URLSearchParams(window.location.search)
    const campaignParam = params.get("campaign")
    if (campaignParam) setCampaignFilter(campaignParam)
    try {
      const savedStages = localStorage.getItem(STAGES_STORAGE_KEY)
      if (savedStages) setStages(JSON.parse(savedStages))
    } catch {}
  }, [])

  const saveStages = (newStages: PipelineStage[]) => {
    setStages(newStages)
    localStorage.setItem(STAGES_STORAGE_KEY, JSON.stringify(newStages))
  }

  const { data: leads, isLoading, mutate } = useSWR(
    businessId ? `pipeline-leads-${businessId}` : "pipeline-leads",
    () => dashboardApi("get_pipeline_leads", { business_id: businessId || undefined })
  )

  const { data: smartListsData } = useSWR<SmartList[]>("get_smart_lists", () => dashboardApi("get_smart_lists"))

  const { data: campaignsData } = useSWR(
    "get_campaigns_for_filter",
    () => dashboardApi("get_campaigns", { business_id: businessId || undefined })
  )

  const allLeads: PipelineLead[] = (leads || []).filter((l: PipelineLead) => {
    if (tierFilter !== "all" && l.ranking_tier !== tierFilter) return false
    if (tagFilter && l.tags && !l.tags.toLowerCase().includes(tagFilter.toLowerCase())) return false
    if (tagFilter && !l.tags) return false
    return true
  })

  const leadsByStage = stages.reduce((acc, stage) => {
    acc[stage.id] = allLeads.filter((l) => (l.pipeline_stage || "new") === stage.id)
    return acc
  }, {} as Record<string, PipelineLead[]>)

  // Orphan leads go to "new"
  const knownStageIds = new Set(stages.map((s) => s.id))
  const orphanLeads = allLeads.filter((l) => l.pipeline_stage && !knownStageIds.has(l.pipeline_stage))
  if (orphanLeads.length > 0 && leadsByStage["new"]) {
    leadsByStage["new"] = [...leadsByStage["new"], ...orphanLeads]
  }

  const handleDragStart = (e: React.DragEvent, leadId: string) => {
    setDraggedLeadId(leadId)
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData("text/plain", leadId)
  }

  const handleDragOver = (e: React.DragEvent, stageId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    setDragOverStage(stageId)
  }

  const handleDrop = async (e: React.DragEvent, stageId: string) => {
    e.preventDefault()
    setDragOverStage(null)
    const leadId = e.dataTransfer.getData("text/plain") || draggedLeadId
    if (!leadId) return
    setDraggedLeadId(null)

    const lead = allLeads.find((l) => l.lead_id === leadId)
    if (lead && (lead.pipeline_stage || "new") !== stageId) {
      try {
        await dashboardApi("update_pipeline_stage", { lead_id: leadId, pipeline_stage: stageId })
        mutate()
      } catch (err) {
        console.error("Failed to move lead:", err)
      }
    }
  }

  const handleDragEnd = () => {
    setDraggedLeadId(null)
    setDragOverStage(null)
  }

  const addStage = () => {
    if (!newStageName.trim()) return
    const id = newStageName.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "")
    const colors = ["bg-teal-500", "bg-indigo-500", "bg-pink-500", "bg-amber-500", "bg-lime-500", "bg-cyan-500"]
    const color = colors[stages.length % colors.length]
    saveStages([...stages.slice(0, -1), { id, label: newStageName.trim(), color }, stages[stages.length - 1]])
    setNewStageName("")
  }

  const removeStage = (id: string) => {
    if (stages.length <= 2) return
    saveStages(stages.filter((s) => s.id !== id))
    toast.success("Stage removed")
    const leadsToMove = leadsByStage[id] || []
    leadsToMove.forEach((l) => {
      dashboardApi("update_pipeline_stage", { lead_id: l.lead_id, pipeline_stage: "new" })
    })
    mutate()
  }

  const renameStage = (id: string) => {
    if (!editingStageName.trim()) return
    saveStages(stages.map((s) => (s.id === id ? { ...s, label: editingStageName.trim() } : s)))
    setEditingStageId(null)
    setEditingStageName("")
  }

  const scrollLeft = () => scrollRef.current?.scrollBy({ left: -300, behavior: "smooth" })
  const scrollRight = () => scrollRef.current?.scrollBy({ left: 300, behavior: "smooth" })

  // Convert PipelineLead to Lead for LeadDetailPopup
  const toFullLead = (pl: PipelineLead): Lead => ({
    lead_id: pl.lead_id,
    name: pl.name,
    city: pl.city,
    state: "",
    business_type: pl.business_type,
    phone: pl.phone,
    email: pl.email,
    website: "",
    instagram_url: pl.instagram_url,
    facebook_url: "",
    linkedin_url: "",
    total_score: pl.total_score,
    ranking_tier: pl.ranking_tier,
    status: pl.status,
    sequence_id: "",
    current_step: 0,
    next_action_date: "",
    last_platform_sent: "",
    scraped_at: "",
    messages_generated: "",
    notes: "",
    _raw_scrape_data: "",
    message_count: "",
    tags: pl.tags,
    smart_list: "",
    platform_profile: "",
  })

  return (
    <div className="space-y-4 h-[calc(100vh-6rem)]">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Kanban className="h-8 w-8 text-violet-400" />
          <div>
            <h1 className="text-2xl font-bold">Pipeline</h1>
            <p className="text-sm text-muted-foreground">
              {allLeads.length} leads across {stages.length} stages
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Tier filter */}
          <div className="flex items-center gap-1">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            {["all", "A", "B", "C", "D"].map((t) => (
              <Button
                key={t}
                variant={tierFilter === t ? "default" : "ghost"}
                size="sm"
                className="text-xs h-7 px-2"
                onClick={() => setTierFilter(t)}
              >
                {t === "all" ? "All" : `Tier ${t}`}
              </Button>
            ))}
          </div>
          <Input
            placeholder="Filter tags..."
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            className="h-7 w-28 text-xs"
          />
          <select
            value={campaignFilter}
            onChange={(e) => setCampaignFilter(e.target.value)}
            className="h-7 text-xs rounded-md border bg-background px-2"
          >
            <option value="all">All Campaigns</option>
            {(campaignsData || []).map((c: { id: string; name: string }) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 h-7"
            onClick={() => setShowSettings(!showSettings)}
          >
            <Settings className="h-3.5 w-3.5" />
            Stages
          </Button>
        </div>
      </div>

      {/* Stage Settings */}
      {showSettings && (
        <Card className="shrink-0">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Customize Stages</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowSettings(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {stages.map((stage) => (
                <div key={stage.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-secondary/30">
                  <div className={`w-2.5 h-2.5 rounded-full ${stage.color}`} />
                  {editingStageId === stage.id ? (
                    <div className="flex items-center gap-1">
                      <Input
                        value={editingStageName}
                        onChange={(e) => setEditingStageName(e.target.value)}
                        className="h-6 w-24 text-xs px-1"
                        onKeyDown={(e) => e.key === "Enter" && renameStage(stage.id)}
                        autoFocus
                      />
                      <button onClick={() => renameStage(stage.id)} className="p-0.5 hover:text-green-400"><Check className="h-3 w-3" /></button>
                      <button onClick={() => setEditingStageId(null)} className="p-0.5 hover:text-red-400"><X className="h-3 w-3" /></button>
                    </div>
                  ) : (
                    <>
                      <span className="text-xs font-medium">{stage.label}</span>
                      <button onClick={() => { setEditingStageId(stage.id); setEditingStageName(stage.label) }} className="p-0.5 text-muted-foreground hover:text-foreground"><Pencil className="h-3 w-3" /></button>
                      <button onClick={() => setConfirmDeleteStageId(stage.id)} className="p-0.5 text-muted-foreground hover:text-red-400"><Trash2 className="h-3 w-3" /></button>
                    </>
                  )}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Input placeholder="New stage name..." value={newStageName} onChange={(e) => setNewStageName(e.target.value)} className="h-8 text-sm" onKeyDown={(e) => e.key === "Enter" && addStage()} />
              <Button size="sm" onClick={addStage} disabled={!newStageName.trim()}><Plus className="h-4 w-4" /></Button>
            </div>
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => saveStages(DEFAULT_STAGES)}>Reset to defaults</Button>
          </CardContent>
        </Card>
      )}

      {/* Empty pipeline guidance */}
      {!isLoading && allLeads.length === 0 && (
        <SetupBanner
          storageKey="pipeline-empty"
          title="Your pipeline is empty"
          steps={[
            { id: "leads", label: "Import leads to populate your pipeline", complete: false, href: "/leads", linkLabel: "Import Leads" },
            { id: "campaigns", label: "Run a campaign to move leads through stages", complete: false, href: "/campaigns", linkLabel: "Go to Campaigns" },
          ]}
        />
      )}

      {/* Kanban Board */}
      <div className="relative flex-1 min-h-0">
        <button onClick={scrollLeft} className="absolute left-0 top-1/2 -translate-y-1/2 z-10 h-10 w-10 rounded-full bg-card/90 border shadow-lg flex items-center justify-center hover:bg-secondary transition-all">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button onClick={scrollRight} className="absolute right-0 top-1/2 -translate-y-1/2 z-10 h-10 w-10 rounded-full bg-card/90 border shadow-lg flex items-center justify-center hover:bg-secondary transition-all">
          <ChevronRight className="h-5 w-5" />
        </button>

        <div ref={scrollRef} className="flex gap-3 overflow-x-auto pb-4 h-full scrollbar-thin px-12">
          {stages.map((stage) => {
            const stageLeads = leadsByStage[stage.id] || []
            const isDragOver = dragOverStage === stage.id

            return (
              <div
                key={stage.id}
                className={`flex-shrink-0 w-[280px] flex flex-col rounded-xl border transition-all ${
                  isDragOver ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border bg-card/50"
                }`}
                onDragOver={(e) => handleDragOver(e, stage.id)}
                onDragLeave={() => setDragOverStage(null)}
                onDrop={(e) => handleDrop(e, stage.id)}
              >
                {/* Column Header */}
                <div className="flex items-center gap-2 p-3 border-b">
                  <div className={`w-3 h-3 rounded-full ${stage.color}`} />
                  <span className="text-sm font-semibold flex-1">{stage.label}</span>
                  <Badge variant="secondary" className="text-xs">{stageLeads.length}</Badge>
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[200px]">
                  {isLoading ? (
                    <div className="space-y-2">
                      {[1, 2].map((i) => (
                        <div key={i} className="h-24 rounded-lg bg-secondary/20 animate-pulse" />
                      ))}
                    </div>
                  ) : stageLeads.length === 0 ? (
                    <div className="flex items-center justify-center h-20 text-xs text-muted-foreground/50 border border-dashed rounded-lg">
                      Drop leads here
                    </div>
                  ) : (
                    stageLeads.map((lead) => (
                      <div
                        key={lead.lead_id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, lead.lead_id)}
                        onDragEnd={handleDragEnd}
                        onClick={() => { setSelectedLead(lead); setDetailOpen(true) }}
                        className={`rounded-lg border bg-card p-3 cursor-grab active:cursor-grabbing hover:border-primary/30 hover:shadow-md transition-all ${
                          draggedLeadId === lead.lead_id ? "opacity-40 scale-95" : ""
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <GripVertical className="h-4 w-4 text-muted-foreground/30 mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium truncate flex-1">{lead.name}</p>
                              {lead.instagram_url && (
                                <a
                                  href={lead.instagram_url.startsWith("http") ? lead.instagram_url : `https://instagram.com/${lead.instagram_url}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-pink-400 hover:text-pink-300 shrink-0"
                                >
                                  <Instagram className="h-3.5 w-3.5" />
                                </a>
                              )}
                            </div>
                            {lead.business_type && (
                              <p className="text-xs text-muted-foreground truncate">{lead.business_type}</p>
                            )}
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              {lead.ranking_tier && (
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${TIER_COLORS[lead.ranking_tier] || "text-muted-foreground"}`}>
                                  {lead.ranking_tier}
                                </span>
                              )}
                              {lead.total_score > 0 && (
                                <span className="text-[10px] text-muted-foreground font-mono">{lead.total_score}</span>
                              )}
                              {lead.last_contacted_at && (
                                <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                  <Calendar className="h-2.5 w-2.5" />
                                  {new Date(lead.last_contacted_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                                </span>
                              )}
                            </div>
                            {lead.tags && (
                              <div className="flex gap-1 mt-1.5 flex-wrap">
                                {lead.tags.split(",").filter(Boolean).slice(0, 3).map((tag) => (
                                  <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                                    {tag.trim()}
                                  </span>
                                ))}
                                {lead.tags.split(",").filter(Boolean).length > 3 && (
                                  <span className="text-[10px] text-muted-foreground">+{lead.tags.split(",").filter(Boolean).length - 3}</span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Lead Detail Popup */}
      {selectedLead && (
        <LeadDetailPopup
          lead={toFullLead(selectedLead)}
          open={detailOpen}
          onOpenChange={(open) => { setDetailOpen(open); if (!open) setSelectedLead(null) }}
          smartLists={smartListsData || []}
          onUpdate={() => { mutate(); setDetailOpen(false); setSelectedLead(null) }}
        />
      )}
      <ConfirmDialog open={!!confirmDeleteStageId} onOpenChange={(open) => { if (!open) setConfirmDeleteStageId(null) }} title="Remove Stage" description={`Remove "${stages.find((s) => s.id === confirmDeleteStageId)?.label}" stage? Leads will move to "New".`} onConfirm={() => { if (confirmDeleteStageId) removeStage(confirmDeleteStageId); setConfirmDeleteStageId(null) }} confirmLabel="Remove" />
    </div>
  )
}
