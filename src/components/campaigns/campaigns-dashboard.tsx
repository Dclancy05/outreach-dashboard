// Re-exports the original campaigns page content as a component
// The actual content is kept in the page file — this wrapper allows embedding
"use client"

import { useState, useEffect, useCallback } from "react"
import useSWR from "swr"
import { dashboardApi } from "@/lib/api"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PageInstructions } from "@/components/page-instructions"
import { SetupBanner } from "@/components/setup-banner"
import {
  Target,
  Plus,
  Play,
  Pause,
  CheckCircle,
  FileEdit,
  Users,
  Send,
  MessageSquare,
  TrendingUp,
  Kanban,
  MoreVertical,
  Trash2,
  Copy,
  Search,
  ArrowRight,
  ArrowLeft,
  GitBranch,
  Zap,
  Calendar,
  Loader2,
  Sparkles,
  Check,
  Eye,
  RefreshCw,
} from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"

interface Campaign {
  id: string; name: string; description: string; sequence_id: string; sequence_name: string
  status: "draft" | "active" | "paused" | "completed"; business_id: string
  lead_filter_tier: string; lead_filter_tags: string; lead_filter_smart_list: string
  account_ids: string; leads_targeted: number; dms_sent: number; responses: number
  booked: number; created_at: string; updated_at: string
}
interface Sequence { id: string; name: string; steps_count: number }
interface Lead { lead_id: string; name: string; email: string; city: string; business_type: string; status: string; ranking_tier: string; instagram_url: string; tags: string }
interface GeneratedMessage { lead_id: string; body: string; platform: string; step_number: string; business_name: string }

const STATUS_CONFIG = {
  draft: { color: "bg-slate-500", icon: FileEdit, label: "Draft" },
  active: { color: "bg-green-500", icon: Play, label: "Active" },
  paused: { color: "bg-yellow-500", icon: Pause, label: "Paused" },
  completed: { color: "bg-blue-500", icon: CheckCircle, label: "Completed" },
}

type ViewMode = "list" | "wizard"
type WizardTab = "leads" | "sequence" | "generate" | "review"

const WIZARD_TABS: { id: WizardTab; label: string; icon: typeof Users; num: number }[] = [
  { id: "leads", label: "Leads", icon: Users, num: 1 },
  { id: "sequence", label: "Sequence", icon: GitBranch, num: 2 },
  { id: "generate", label: "Generate Messages", icon: Sparkles, num: 3 },
  { id: "review", label: "Review & Launch", icon: Target, num: 4 },
]

interface CampaignsDashboardProps {
  onNewCampaign?: () => void
  hideHeader?: boolean
}

export function CampaignsDashboard({ onNewCampaign, hideHeader }: CampaignsDashboardProps) {
  const [businessId, setBusinessId] = useState("")
  const [viewMode, setViewMode] = useState<ViewMode>("list")
  const [wizardTab, setWizardTab] = useState<WizardTab>("leads")
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null)
  const [statusFilter, setStatusFilter] = useState("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [actionMenuId, setActionMenuId] = useState<string | null>(null)

  const [campaignName, setCampaignName] = useState("")
  const [campaignDesc, setCampaignDesc] = useState("")
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set())
  const [leadSearch, setLeadSearch] = useState("")
  const [leadFilter, setLeadFilter] = useState("all")
  const [selectedSequence, setSelectedSequence] = useState("")
  const [generating, setGenerating] = useState(false)
  const [generateProgress, setGenerateProgress] = useState(0)
  const [generateDone, setGenerateDone] = useState(false)
  const [generatedMessages, setGeneratedMessages] = useState<GeneratedMessage[]>([])
  const [showMessagePreview, setShowMessagePreview] = useState(false)
  const [allLeads, setAllLeads] = useState<Lead[]>([])
  const [leadsLoading, setLeadsLoading] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem("selected_business")
      if (stored) setBusinessId(JSON.parse(stored).id || "")
    } catch {}
  }, [])

  const { data: campaigns, mutate } = useSWR<Campaign[]>(
    businessId ? `campaigns-${businessId}` : "campaigns-all",
    () => dashboardApi("get_campaigns", { business_id: businessId || undefined })
  )
  const { data: sequences } = useSWR<Sequence[]>(
    businessId ? `sequences-${businessId}` : "sequences-all",
    () => dashboardApi("get_sequences", { business_id: businessId || undefined })
  )

  interface Approach { id: string; name: string; description?: string; tone?: string; style?: string; template?: string }
  const { data: approaches } = useSWR<Approach[]>(
    businessId ? `approaches-${businessId}` : "approaches-all",
    async () => {
      try { return await dashboardApi("get_approaches", { business_id: businessId || undefined }) }
      catch { return [] }
    }
  )
  const [selectedApproach, setSelectedApproach] = useState("")

  const allCampaigns = (campaigns || []).filter((c) => {
    if (statusFilter !== "all" && c.status !== statusFilter) return false
    if (searchQuery && !c.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  const stats = {
    total: (campaigns || []).length,
    active: (campaigns || []).filter((c) => c.status === "active").length,
    totalLeads: (campaigns || []).reduce((s, c) => s + (c.leads_targeted || 0), 0),
    totalSent: (campaigns || []).reduce((s, c) => s + (c.dms_sent || 0), 0),
    totalResponses: (campaigns || []).reduce((s, c) => s + (c.responses || 0), 0),
    totalBooked: (campaigns || []).reduce((s, c) => s + (c.booked || 0), 0),
  }

  const loadLeads = useCallback(async () => {
    setLeadsLoading(true)
    try {
      const data = await dashboardApi("get_leads", {
        business_id: businessId || undefined,
        pageSize: 500,
        search: leadSearch,
        statusFilter: leadFilter !== "all" ? leadFilter : "",
      })
      setAllLeads(data || [])
    } catch { setAllLeads([]) }
    setLeadsLoading(false)
  }, [businessId, leadSearch, leadFilter])

  useEffect(() => {
    if (viewMode === "wizard" && wizardTab === "leads") loadLeads()
  }, [viewMode, wizardTab, loadLeads])

  const openWizard = () => {
    setCampaignName("")
    setCampaignDesc("")
    setSelectedLeads(new Set())
    setLeadSearch("")
    setLeadFilter("all")
    setSelectedSequence("")
    setGenerating(false)
    setGenerateProgress(0)
    setGenerateDone(false)
    setGeneratedMessages([])
    setWizardTab("leads")
    setViewMode("wizard")
  }

  const toggleLead = (id: string) => {
    setSelectedLeads(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const selectAllLeads = () => {
    if (selectedLeads.size === allLeads.length) setSelectedLeads(new Set())
    else setSelectedLeads(new Set(allLeads.map(l => l.lead_id)))
  }

  const handleGenerate = async () => {
    setGenerating(true)
    setGenerateProgress(0)
    setGeneratedMessages([])
    const interval = setInterval(() => {
      setGenerateProgress(p => {
        if (p >= 95) { clearInterval(interval); return 95 }
        return p + Math.random() * 15
      })
    }, 500)

    try {
      const res = await fetch("/api/generate-messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobs: [...selectedLeads].map(lead_id => ({
            lead_id,
            sequence_id: selectedSequence,
            approach_id: selectedApproach || "default",
            prompt_file: "default",
          })),
        }),
      })
      const data = await res.json()
      clearInterval(interval)
      setGenerateProgress(100)
      if (data.success) {
        toast.success(`Generated ${data.total_created} messages!`)
        setTimeout(() => {
          setGenerateDone(true)
          setGenerating(false)
        }, 500)
      } else {
        toast.error(data.error || "Generation failed")
        setGenerating(false)
      }
    } catch (e) {
      clearInterval(interval)
      toast.error("Message generation failed")
      setGenerating(false)
    }
  }

  const handleLaunch = async () => {
    try {
      await dashboardApi("create_campaign", {
        business_id: businessId || undefined,
        name: campaignName || `Campaign ${new Date().toLocaleDateString()}`,
        description: campaignDesc,
        sequence_id: selectedSequence,
        leads_targeted: selectedLeads.size,
        status: "active",
      })
      if (selectedLeads.size > 0) {
        await dashboardApi("bulk_update_leads", {
          lead_ids: [...selectedLeads],
          status: "in_sequence",
          sequence_id: selectedSequence,
        })
      }
      mutate()
      setViewMode("list")
      toast.success("🚀 Campaign launched!")
    } catch {
      toast.error("Failed to create campaign")
    }
  }

  const handleStatusChange = async (id: string, status: string) => {
    await dashboardApi("update_campaign", { id, status }); mutate(); setActionMenuId(null)
  }
  const handleDelete = async (id: string) => {
    if (!confirm("Delete this campaign?")) return
    await dashboardApi("delete_campaign", { id }); mutate(); setActionMenuId(null)
  }
  const handleDuplicate = async (c: Campaign) => {
    await dashboardApi("create_campaign", { business_id: c.business_id, name: `${c.name} (Copy)`, description: c.description, sequence_id: c.sequence_id, status: "draft" })
    mutate(); setActionMenuId(null)
  }

  const conversionRate = (c: Campaign) => c.dms_sent ? ((c.responses / c.dms_sent) * 100).toFixed(1) + "%" : "0%"

  // WIZARD VIEW
  if (viewMode === "wizard") {
    return (
      <div className="space-y-6 animate-slide-up">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setViewMode("list")} className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Sparkles className="h-6 w-6 text-violet-400" />
                New Campaign
              </h1>
              <p className="text-sm text-muted-foreground">Walk through each step to build your campaign</p>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <Input value={campaignName} onChange={(e) => setCampaignName(e.target.value)} placeholder="Campaign name (e.g. NYC Restaurants Q1)" className="max-w-md" />
          <Input value={campaignDesc} onChange={(e) => setCampaignDesc(e.target.value)} placeholder="Description (optional)" className="flex-1" />
        </div>

        <div className="flex gap-1 bg-secondary/50 p-1 rounded-lg overflow-x-auto scrollbar-none">
          {WIZARD_TABS.map((t, i) => {
            const isComplete = WIZARD_TABS.findIndex(wt => wt.id === wizardTab) > i
            const isCurrent = wizardTab === t.id
            return (
              <button key={t.id} onClick={() => setWizardTab(t.id)} className={`px-4 py-2.5 rounded-md text-sm font-medium flex items-center gap-2 whitespace-nowrap transition-all ${isCurrent ? "bg-primary text-primary-foreground" : isComplete ? "text-green-400 hover:bg-secondary/80" : "text-muted-foreground hover:text-foreground hover:bg-secondary/80"}`}>
                {isComplete ? <Check className="h-4 w-4 text-green-400" /> : <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] font-bold ${isCurrent ? "border-primary-foreground" : "border-muted-foreground/40"}`}>{t.num}</span>}
                {t.label}
              </button>
            )
          })}
        </div>

        {wizardTab === "leads" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search leads..." value={leadSearch} onChange={(e) => setLeadSearch(e.target.value)} className="pl-9" />
              </div>
              <Select value={leadFilter} onValueChange={setLeadFilter}>
                <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="messages_ready">Messages Ready</SelectItem>
                  <SelectItem value="in_sequence">In Sequence</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={selectAllLeads}>
                {selectedLeads.size === allLeads.length && allLeads.length > 0 ? "Deselect All" : "Select All"}
              </Button>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium"><span className="text-primary">{selectedLeads.size}</span> of {allLeads.length} leads selected</div>
              <Button variant="outline" size="sm" onClick={loadLeads} className="gap-1"><RefreshCw className="h-3 w-3" /> Refresh</Button>
            </div>
            <div className="max-h-[50vh] overflow-y-auto border rounded-lg">
              {leadsLoading ? (
                <div className="p-8 text-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" /> Loading leads...</div>
              ) : allLeads.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p>No leads found. <Link href="/leads" className="text-primary hover:underline">Import leads first →</Link></p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-secondary/50 sticky top-0">
                    <tr>
                      <th className="p-2 text-left w-10"><input type="checkbox" checked={selectedLeads.size === allLeads.length && allLeads.length > 0} onChange={selectAllLeads} /></th>
                      <th className="p-2 text-left">Name</th>
                      <th className="p-2 text-left hidden md:table-cell">City</th>
                      <th className="p-2 text-left hidden md:table-cell">Type</th>
                      <th className="p-2 text-left">Status</th>
                      <th className="p-2 text-left">Tier</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allLeads.map((lead) => (
                      <tr key={lead.lead_id} className={`border-t hover:bg-secondary/30 cursor-pointer ${selectedLeads.has(lead.lead_id) ? "bg-primary/5" : ""}`} onClick={() => toggleLead(lead.lead_id)}>
                        <td className="p-2"><input type="checkbox" checked={selectedLeads.has(lead.lead_id)} onChange={() => toggleLead(lead.lead_id)} /></td>
                        <td className="p-2 font-medium">{lead.name || lead.lead_id}</td>
                        <td className="p-2 text-muted-foreground hidden md:table-cell">{lead.city || "—"}</td>
                        <td className="p-2 text-muted-foreground hidden md:table-cell">{lead.business_type || "—"}</td>
                        <td className="p-2"><Badge variant="secondary" className="text-[10px]">{lead.status}</Badge></td>
                        <td className="p-2"><Badge variant="outline" className="text-[10px]">{lead.ranking_tier || "—"}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="flex justify-end">
              <Button onClick={() => setWizardTab("sequence")} disabled={selectedLeads.size === 0} className="gap-2">Next: Pick Sequence <ArrowRight className="h-4 w-4" /></Button>
            </div>
          </div>
        )}

        {wizardTab === "sequence" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Choose a message sequence for your <span className="text-primary font-semibold">{selectedLeads.size}</span> selected leads.</p>
            <div className="grid gap-2">
              {(sequences || []).map((seq) => (
                <Card key={seq.id} className={`cursor-pointer transition-all ${selectedSequence === seq.id ? "border-primary bg-primary/5" : "hover:border-primary/30"}`} onClick={() => setSelectedSequence(seq.id)}>
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${selectedSequence === seq.id ? "bg-primary text-primary-foreground" : "bg-secondary"}`}><GitBranch className="h-4 w-4" /></div>
                    <div className="flex-1"><div className="font-medium">{seq.name}</div><div className="text-xs text-muted-foreground">{seq.steps_count || 0} steps</div></div>
                    {selectedSequence === seq.id && <Check className="h-5 w-5 text-primary" />}
                  </CardContent>
                </Card>
              ))}
              {!(sequences || []).length && (
                <Card className="border-dashed"><CardContent className="p-8 text-center text-muted-foreground"><GitBranch className="h-10 w-10 mx-auto mb-3 opacity-30" /><p>No sequences yet.</p><Link href="/sequences"><Button variant="link" className="mt-2">Create a sequence first →</Button></Link></CardContent></Card>
              )}
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setWizardTab("leads")} className="gap-2"><ArrowLeft className="h-4 w-4" /> Back</Button>
              <Button onClick={() => setWizardTab("generate")} disabled={!selectedSequence} className="gap-2">Next: Generate Messages <ArrowRight className="h-4 w-4" /></Button>
            </div>
          </div>
        )}

        {wizardTab === "generate" && (
          <div className="space-y-6">
            <Card><CardContent className="p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Leads selected:</span><span className="font-semibold text-primary">{selectedLeads.size}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Sequence:</span><span className="font-semibold">{sequences?.find(s => s.id === selectedSequence)?.name || "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Engine:</span><span className="font-semibold text-green-400">Template Engine (free, instant)</span></div>
            </CardContent></Card>
            {(approaches || []).length > 0 && !generating && !generateDone && (
              <Card><CardContent className="p-4 space-y-2">
                <p className="text-sm font-medium">Choose an approach</p>
                <div className="grid gap-2">
                  {(approaches || []).map((a) => (
                    <div key={a.id} className={`p-3 rounded-lg border cursor-pointer transition-all ${selectedApproach === a.id ? "border-violet-500 bg-violet-500/10" : "hover:border-violet-500/30"}`} onClick={() => setSelectedApproach(a.id)}>
                      <div className="flex items-center justify-between"><span className="font-medium text-sm">{a.name}</span>{selectedApproach === a.id && <Check className="h-4 w-4 text-violet-400" />}</div>
                      {a.description && <p className="text-xs text-muted-foreground mt-1">{a.description}</p>}
                    </div>
                  ))}
                </div>
              </CardContent></Card>
            )}
            {!generating && !generateDone && (
              <div className="flex flex-col items-center gap-4 py-6">
                <Sparkles className="h-12 w-12 text-violet-400" />
                <h3 className="text-lg font-semibold">Ready to Generate</h3>
                <p className="text-sm text-muted-foreground text-center max-w-md">The template engine will create personalized messages for each lead based on their business type, location, and profile. Zero API cost.</p>
                <Button onClick={handleGenerate} size="lg" className="gap-2 mt-2"><Sparkles className="h-4 w-4" /> Generate {selectedLeads.size} Messages</Button>
              </div>
            )}
            {generating && !generateDone && (
              <div className="space-y-4 py-6">
                <div className="relative h-4 bg-secondary rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-violet-500 via-purple-500 to-pink-500 rounded-full transition-all duration-500 animate-pulse" style={{ width: `${generateProgress}%` }} /></div>
                <div className="text-center text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline mr-2" />Generating personalized messages... {Math.round(generateProgress)}%</div>
              </div>
            )}
            {generateDone && (
              <div className="space-y-4">
                <div className="text-center py-4">
                  <div className="w-16 h-16 mx-auto rounded-full bg-green-500/20 flex items-center justify-center mb-3"><CheckCircle className="h-8 w-8 text-green-500" /></div>
                  <p className="text-green-500 font-semibold text-lg">Messages Generated!</p>
                  <p className="text-sm text-muted-foreground mt-1">All messages are saved and ready for review in the Queue.</p>
                </div>
                <div className="flex justify-center gap-3">
                  <Button variant="outline" onClick={handleGenerate} className="gap-2"><RefreshCw className="h-4 w-4" /> Regenerate</Button>
                  <Link href="/queue"><Button variant="outline" className="gap-2"><Eye className="h-4 w-4" /> Preview in Queue</Button></Link>
                </div>
              </div>
            )}
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setWizardTab("sequence")} className="gap-2"><ArrowLeft className="h-4 w-4" /> Back</Button>
              <Button onClick={() => setWizardTab("review")} className="gap-2">{generateDone ? "Next: Review & Launch" : "Skip to Review"} <ArrowRight className="h-4 w-4" /></Button>
            </div>
          </div>
        )}

        {wizardTab === "review" && (
          <div className="space-y-6">
            <div className="text-center py-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-violet-500/20 flex items-center justify-center mb-3"><Target className="h-8 w-8 text-violet-400" /></div>
              <h3 className="text-xl font-bold">Campaign Summary</h3>
              <p className="text-sm text-muted-foreground mt-1">Review everything before launching</p>
            </div>
            <Card><CardContent className="p-5 space-y-3">
              <div className="flex justify-between py-2 border-b"><span className="text-muted-foreground">Campaign Name</span><span className="font-semibold">{campaignName || "Untitled Campaign"}</span></div>
              {campaignDesc && <div className="flex justify-between py-2 border-b"><span className="text-muted-foreground">Description</span><span className="text-sm">{campaignDesc}</span></div>}
              <div className="flex justify-between py-2 border-b"><span className="text-muted-foreground">Leads Selected</span><span className="font-semibold text-blue-400">{selectedLeads.size}</span></div>
              <div className="flex justify-between py-2 border-b"><span className="text-muted-foreground">Sequence</span><span className="font-semibold">{sequences?.find(s => s.id === selectedSequence)?.name || "—"}</span></div>
              <div className="flex justify-between py-2"><span className="text-muted-foreground">Messages</span><span className={`font-semibold ${generateDone ? "text-green-400" : "text-yellow-400"}`}>{generateDone ? "✓ Generated" : "⚠ Not generated yet"}</span></div>
            </CardContent></Card>
            {!generateDone && (
              <Card className="border-yellow-500/30 bg-yellow-500/5"><CardContent className="p-4 flex items-start gap-3">
                <Sparkles className="h-5 w-5 text-yellow-400 mt-0.5" />
                <div><p className="text-sm font-medium text-yellow-400">Messages not generated</p><p className="text-xs text-muted-foreground mt-1">You can still launch — messages can be generated later from the Generate tab or the Queue page.</p></div>
              </CardContent></Card>
            )}
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setWizardTab("generate")} className="gap-2"><ArrowLeft className="h-4 w-4" /> Back</Button>
              <Button onClick={handleLaunch} size="lg" className="gap-2 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700"><Zap className="h-4 w-4" /> Launch Campaign</Button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // LIST VIEW
  return (
    <div className="space-y-6 animate-slide-up">
      {!hideHeader && (
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <Target className="h-8 w-8 text-violet-400" />
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                Campaigns
                <PageInstructions title="Campaigns" storageKey="instructions-campaigns" steps={[
                  "Click '+ New Campaign' to walk through the wizard: select leads → pick sequence → generate messages → launch.",
                  "Each campaign targets a set of leads with personalized message sequences.",
                ]} />
              </h1>
              <p className="text-sm text-muted-foreground">{stats.total} campaigns · {stats.active} active</p>
            </div>
          </div>
        </div>
      )}

      <SetupBanner storageKey="campaigns" title="Get started with Campaigns" steps={[
        { id: "approaches", label: "Set up a messaging approach", complete: (approaches || []).length > 0, href: "/settings", linkLabel: "Go to Settings" },
        { id: "sequences", label: "Create a message sequence", complete: (sequences || []).length > 0, href: "/campaigns?tab=sequences", linkLabel: "Create Sequence" },
        { id: "leads", label: "Import leads to target", complete: stats.totalLeads > 0, href: "/campaigns?tab=leads", linkLabel: "Import Leads" },
      ]} />

      <Card><CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2"><Sparkles className="h-5 w-5 text-violet-400" />Messaging Approaches</h2>
          <Link href="/settings"><Button variant="outline" size="sm" className="gap-1"><Plus className="h-3 w-3" /> New Approach</Button></Link>
        </div>
        {(approaches || []).length === 0 ? (
          <div className="text-center py-6 text-muted-foreground"><Sparkles className="h-10 w-10 mx-auto mb-3 opacity-30" /><p className="text-sm mb-2">No approaches set up yet.</p><Link href="/settings"><Button variant="link" className="text-amber-400">Go to Settings to create one →</Button></Link></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {(approaches || []).map((approach) => (
              <div key={approach.id} className="rounded-lg border bg-secondary/30 p-4 hover:border-violet-500/30 transition-colors">
                <h3 className="font-semibold mb-1">{approach.name}</h3>
                {approach.description && <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{approach.description}</p>}
                <div className="flex gap-2 flex-wrap">
                  {approach.tone && <Badge variant="secondary" className="text-[10px]">Tone: {approach.tone}</Badge>}
                  {approach.style && <Badge variant="secondary" className="text-[10px]">Style: {approach.style}</Badge>}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent></Card>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {[
          { label: "Total", value: stats.total, icon: Target, color: "text-violet-400" },
          { label: "Active", value: stats.active, icon: Zap, color: "text-green-400" },
          { label: "Leads", value: stats.totalLeads, icon: Users, color: "text-blue-400" },
          { label: "DMs Sent", value: stats.totalSent, icon: Send, color: "text-cyan-400" },
          { label: "Responses", value: stats.totalResponses, icon: MessageSquare, color: "text-yellow-400" },
          { label: "Booked", value: stats.totalBooked, icon: TrendingUp, color: "text-emerald-400" },
        ].map((s) => (
          <Card key={s.label}><CardContent className="p-3 flex items-center gap-3">
            <s.icon className={`h-5 w-5 ${s.color}`} />
            <div><div className="text-lg font-bold">{s.value}</div><div className="text-[10px] text-muted-foreground">{s.label}</div></div>
          </CardContent></Card>
        ))}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search campaigns..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
        </div>
        <div className="flex gap-1">
          {["all", "draft", "active", "paused", "completed"].map((s) => (
            <Button key={s} variant={statusFilter === s ? "default" : "ghost"} size="sm" className="text-xs capitalize" onClick={() => setStatusFilter(s)}>
              {s === "all" ? "All" : STATUS_CONFIG[s as keyof typeof STATUS_CONFIG]?.label}
            </Button>
          ))}
        </div>
      </div>

      {allCampaigns.length === 0 ? (
        <Card className="p-12 text-center">
          <Target className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No campaigns yet</h3>
          <p className="text-muted-foreground mb-4">Create your first campaign to start targeted outreach</p>
          <Button onClick={openWizard} className="gap-2"><Plus className="h-4 w-4" /> New Campaign</Button>
        </Card>
      ) : (
        <div className="grid gap-3">
          {allCampaigns.map((campaign) => {
            const config = STATUS_CONFIG[campaign.status] || STATUS_CONFIG.draft
            const StatusIcon = config.icon
            return (
              <Card key={campaign.id} className="hover:border-primary/30 transition-all cursor-pointer group" onClick={() => setSelectedCampaign(campaign)}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-lg ${config.color}/20 flex items-center justify-center shrink-0`}><StatusIcon className={`h-5 w-5 ${config.color.replace("bg-", "text-")}`} /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold truncate group-hover:text-primary transition-colors">{campaign.name}</h3>
                        <Badge variant="secondary" className={`text-[10px] ${config.color} text-white`}>{config.label}</Badge>
                      </div>
                      {campaign.description && <p className="text-sm text-muted-foreground line-clamp-1 mb-2">{campaign.description}</p>}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3 flex-wrap">
                        {campaign.sequence_name && <span className="flex items-center gap-1"><GitBranch className="h-3 w-3" /> {campaign.sequence_name}</span>}
                        <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {new Date(campaign.created_at).toLocaleDateString()}</span>
                      </div>
                      <div className="grid grid-cols-4 gap-4">
                        <div><div className="text-sm font-bold">{campaign.leads_targeted || 0}</div><div className="text-[10px] text-muted-foreground">Leads</div></div>
                        <div><div className="text-sm font-bold">{campaign.dms_sent || 0}</div><div className="text-[10px] text-muted-foreground">DMs Sent</div></div>
                        <div><div className="text-sm font-bold text-yellow-400">{campaign.responses || 0} <span className="text-[10px] font-normal text-muted-foreground">({conversionRate(campaign)})</span></div><div className="text-[10px] text-muted-foreground">Responses</div></div>
                        <div><div className="text-sm font-bold text-green-400">{campaign.booked || 0}</div><div className="text-[10px] text-muted-foreground">Booked</div></div>
                      </div>
                      {campaign.leads_targeted > 0 && (
                        <div className="mt-2 h-1.5 bg-secondary rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-violet-500 to-blue-500 rounded-full transition-all" style={{ width: `${Math.min(100, ((campaign.dms_sent || 0) / campaign.leads_targeted) * 100)}%` }} /></div>
                      )}
                    </div>
                    <div className="relative shrink-0">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(e) => { e.stopPropagation(); setActionMenuId(actionMenuId === campaign.id ? null : campaign.id) }}><MoreVertical className="h-4 w-4" /></Button>
                      {actionMenuId === campaign.id && (
                        <div className="absolute right-0 top-9 z-20 w-48 rounded-lg border bg-card shadow-xl p-1">
                          {campaign.status === "draft" && <button onClick={(e) => { e.stopPropagation(); handleStatusChange(campaign.id, "active") }} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-secondary rounded-md text-green-400"><Play className="h-3.5 w-3.5" /> Activate</button>}
                          {campaign.status === "active" && <button onClick={(e) => { e.stopPropagation(); handleStatusChange(campaign.id, "paused") }} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-secondary rounded-md text-yellow-400"><Pause className="h-3.5 w-3.5" /> Pause</button>}
                          {campaign.status === "paused" && <button onClick={(e) => { e.stopPropagation(); handleStatusChange(campaign.id, "active") }} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-secondary rounded-md text-green-400"><Play className="h-3.5 w-3.5" /> Resume</button>}
                          <button onClick={(e) => { e.stopPropagation(); handleDuplicate(campaign) }} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-secondary rounded-md"><Copy className="h-3.5 w-3.5" /> Duplicate</button>
                          <button onClick={(e) => { e.stopPropagation(); handleDelete(campaign.id) }} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-secondary rounded-md text-red-400"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={!!selectedCampaign} onOpenChange={() => setSelectedCampaign(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {selectedCampaign && (
            <>
              <DialogHeader><DialogTitle className="flex items-center gap-3">{selectedCampaign.name}<Badge variant="secondary" className="capitalize">{selectedCampaign.status}</Badge></DialogTitle></DialogHeader>
              {selectedCampaign.description && <p className="text-sm text-muted-foreground">{selectedCampaign.description}</p>}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card><CardContent className="p-3 text-center"><div className="text-2xl font-bold">{selectedCampaign.leads_targeted || 0}</div><div className="text-xs text-muted-foreground">Leads</div></CardContent></Card>
                <Card><CardContent className="p-3 text-center"><div className="text-2xl font-bold text-blue-400">{selectedCampaign.dms_sent || 0}</div><div className="text-xs text-muted-foreground">DMs Sent</div></CardContent></Card>
                <Card><CardContent className="p-3 text-center"><div className="text-2xl font-bold text-yellow-400">{selectedCampaign.responses || 0}</div><div className="text-xs text-muted-foreground">Responses</div></CardContent></Card>
                <Card><CardContent className="p-3 text-center"><div className="text-2xl font-bold text-green-400">{selectedCampaign.booked || 0}</div><div className="text-xs text-muted-foreground">Booked</div></CardContent></Card>
              </div>
              <div className="flex gap-2">
                <Link href={`/pipeline?campaign=${selectedCampaign.id}`} className="flex-1"><Button variant="outline" className="w-full gap-2"><Kanban className="h-4 w-4" /> View in Pipeline</Button></Link>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {actionMenuId && <div className="fixed inset-0 z-10" onClick={() => setActionMenuId(null)} />}
    </div>
  )
}
