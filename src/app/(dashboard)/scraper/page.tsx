"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { motion, AnimatePresence } from "framer-motion"
import {
  Search, Plus, Play, Loader2, Download, ChevronDown, ChevronUp,
  MapPin, Phone, Mail, Globe, Instagram, CheckCircle, XCircle,
  BarChart3, Users, ArrowRightLeft, Star, Filter, Trash2,
  ExternalLink, RefreshCw, Clock, Zap,
} from "lucide-react"

// ── Types ───────────────────────────────────────────────────────────────────

interface Stats {
  total_jobs: number
  running_jobs: number
  completed_jobs: number
  total_scraped: number
  unique_leads: number
  total_duplicates: number
  total_moved: number
  avg_quality_score: number
}

interface Job {
  id: string
  name: string
  search_query: string
  location: string
  depth_level: string
  status: string
  total_found: number
  total_enriched: number
  progress_pct: number
  estimated_time_minutes: number
  estimated_proxy_mb: number
  created_at: string
  started_at: string | null
  completed_at: string | null
  error_message: string | null
}

interface Lead {
  id: string
  scrape_job_id: string
  name: string
  address: string
  city: string
  state: string
  zip: string
  phone: string
  email: string
  website: string
  instagram_url: string
  facebook_url: string
  linkedin_url: string
  rating: number
  review_count: number
  category: string
  business_type: string
  quality_score: number
  enrichment_status: string
  is_duplicate: boolean
  ig_followers: number
  ig_bio: string
  all_emails: string[]
  created_at: string
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const qualityGrade = (score: number) => {
  if (score >= 75) return { label: "A", color: "text-green-400", bg: "bg-green-500/20", border: "border-green-500/30" }
  if (score >= 50) return { label: "B", color: "text-blue-400", bg: "bg-blue-500/20", border: "border-blue-500/30" }
  if (score >= 25) return { label: "C", color: "text-yellow-400", bg: "bg-yellow-500/20", border: "border-yellow-500/30" }
  return { label: "D", color: "text-red-400", bg: "bg-red-500/20", border: "border-red-500/30" }
}

const statusConfig: Record<string, { color: string; icon: typeof Clock }> = {
  pending: { color: "text-yellow-400", icon: Clock },
  scheduled: { color: "text-blue-400", icon: Clock },
  running: { color: "text-cyan-400", icon: Loader2 },
  completed: { color: "text-green-400", icon: CheckCircle },
  failed: { color: "text-red-400", icon: XCircle },
}

const container = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } }
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.5 } } }

// ── Component ───────────────────────────────────────────────────────────────

export default function LeadScraperPage() {
  // Stats
  const [stats, setStats] = useState<Stats | null>(null)

  // Jobs
  const [jobs, setJobs] = useState<Job[]>([])
  const [jobsLoading, setJobsLoading] = useState(true)
  const [expandedJob, setExpandedJob] = useState<string | null>(null)
  const [jobLeads, setJobLeads] = useState<Record<string, Lead[]>>({})

  // New job modal
  const [showNewJob, setShowNewJob] = useState(false)
  const [newJob, setNewJob] = useState({ name: "", search_query: "", location: "", depth_level: "basic" })
  const [creating, setCreating] = useState(false)

  // Leads
  const [leads, setLeads] = useState<Lead[]>([])
  const [leadsLoading, setLeadsLoading] = useState(false)
  const [leadsPage, setLeadsPage] = useState(1)
  const [leadsTotalPages, setLeadsTotalPages] = useState(1)
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set())
  const [moving, setMoving] = useState(false)

  // Filters
  const [searchQuery, setSearchQuery] = useState("")
  const [filterJob, setFilterJob] = useState("all")
  const [filterGrade, setFilterGrade] = useState("all")
  const [filterHasEmail, setFilterHasEmail] = useState(false)
  const [filterHasPhone, setFilterHasPhone] = useState(false)
  const [filterHasIG, setFilterHasIG] = useState(false)
  const [showFilters, setShowFilters] = useState(false)

  // Business selector for moving
  const [businesses, setBusinesses] = useState<{ id: string; name: string; icon: string }[]>([])
  const [targetBusiness, setTargetBusiness] = useState("")

  // ── Data Fetching ───────────────────────────────────────────────────────

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/scraper/stats")
      const data = await res.json()
      setStats(data)
    } catch { }
  }, [])

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/scraper/jobs?limit=50")
      const data = await res.json()
      setJobs(data.data || [])
    } catch { }
    setJobsLoading(false)
  }, [])

  const fetchLeadsForJob = useCallback(async (jobId: string) => {
    try {
      const res = await fetch(`/api/scraper/jobs/${jobId}/leads?pageSize=100&hideDuplicates=true`)
      const data = await res.json()
      setJobLeads(prev => ({ ...prev, [jobId]: data.data || [] }))
    } catch { }
  }, [])

  const fetchAllLeads = useCallback(async (page = 1) => {
    setLeadsLoading(true)
    try {
      let url = ""
      if (filterJob !== "all") {
        url = `/api/scraper/jobs/${filterJob}/leads?page=${page}&pageSize=50&hideDuplicates=true`
        if (searchQuery) url += `&search=${encodeURIComponent(searchQuery)}`
        if (filterGrade !== "all") {
          const ranges: Record<string, [number, number]> = { A: [75, 100], B: [50, 74], C: [25, 49], D: [0, 24] }
          const [min, max] = ranges[filterGrade] || [0, 100]
          url += `&minScore=${min}&maxScore=${max}`
        }
      } else {
        const allLeads: Lead[] = []
        for (const job of jobs.slice(0, 10)) {
          let jUrl = `/api/scraper/jobs/${job.id}/leads?pageSize=200&hideDuplicates=true`
          if (searchQuery) jUrl += `&search=${encodeURIComponent(searchQuery)}`
          if (filterGrade !== "all") {
            const ranges: Record<string, [number, number]> = { A: [75, 100], B: [50, 74], C: [25, 49], D: [0, 24] }
            const [min, max] = ranges[filterGrade] || [0, 100]
            jUrl += `&minScore=${min}&maxScore=${max}`
          }
          try {
            const res = await fetch(jUrl)
            const data = await res.json()
            allLeads.push(...(data.data || []))
          } catch { }
        }
        let filtered = allLeads
        if (filterHasEmail) filtered = filtered.filter(l => l.email)
        if (filterHasPhone) filtered = filtered.filter(l => l.phone)
        if (filterHasIG) filtered = filtered.filter(l => l.instagram_url)
        filtered.sort((a, b) => b.quality_score - a.quality_score)
        setLeads(filtered)
        setLeadsTotalPages(1)
        setLeadsLoading(false)
        return
      }

      const res = await fetch(url)
      const data = await res.json()
      let filtered = data.data || []
      if (filterHasEmail) filtered = filtered.filter((l: Lead) => l.email)
      if (filterHasPhone) filtered = filtered.filter((l: Lead) => l.phone)
      if (filterHasIG) filtered = filtered.filter((l: Lead) => l.instagram_url)
      setLeads(filtered)
      setLeadsTotalPages(data.totalPages || 1)
    } catch { }
    setLeadsLoading(false)
  }, [filterJob, filterGrade, filterHasEmail, filterHasPhone, filterHasIG, searchQuery, jobs])

  useEffect(() => {
    fetchStats()
    fetchJobs()
    fetch("/api/businesses").then(r => r.json()).then(d => setBusinesses(d.data || [])).catch(() => { })
  }, [fetchStats, fetchJobs])

  useEffect(() => {
    if (jobs.length > 0) fetchAllLeads(leadsPage)
  }, [jobs, leadsPage, filterJob, filterGrade, filterHasEmail, filterHasPhone, filterHasIG, searchQuery, fetchAllLeads])

  // Auto-refresh running jobs
  useEffect(() => {
    const hasRunning = jobs.some(j => j.status === "running")
    if (!hasRunning) return
    const interval = setInterval(() => { fetchJobs(); fetchStats() }, 10000)
    return () => clearInterval(interval)
  }, [jobs, fetchJobs, fetchStats])

  // ── Actions ─────────────────────────────────────────────────────────────

  const createJob = async () => {
    if (!newJob.name || !newJob.search_query || !newJob.location) {
      toast.error("Fill in all required fields")
      return
    }
    setCreating(true)
    try {
      const res = await fetch("/api/scraper/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newJob),
      })
      const data = await res.json()
      if (data.error) { toast.error(data.error); return }
      toast.success(`Job created! Est. ${data.estimates?.estimated_leads || "?"} leads`)
      setNewJob({ name: "", search_query: "", location: "", depth_level: "basic" })
      setShowNewJob(false)
      fetchJobs()
      fetchStats()
    } catch { toast.error("Failed to create job") }
    setCreating(false)
  }

  const startJob = async (jobId: string) => {
    try {
      const res = await fetch(`/api/scraper/jobs/${jobId}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (data.error) { toast.error(data.error); return }
      toast.success("Job started!")
      fetchJobs()
    } catch { toast.error("Failed to start job") }
  }

  const deleteJob = async (jobId: string) => {
    try {
      await fetch(`/api/scraper/jobs/${jobId}`, { method: "DELETE" })
      toast.success("Job deleted")
      fetchJobs()
      fetchStats()
    } catch { toast.error("Failed to delete job") }
  }

  const moveLeads = async () => {
    if (selectedLeads.size === 0) { toast.error("Select leads first"); return }
    if (!targetBusiness) { toast.error("Select a target business"); return }
    setMoving(true)
    try {
      const res = await fetch("/api/scraper/leads/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_ids: Array.from(selectedLeads), business_id: targetBusiness }),
      })
      const data = await res.json()
      if (data.error) { toast.error(data.error); return }
      toast.success(`${data.moved} leads moved to business!`)
      setSelectedLeads(new Set())
      fetchAllLeads(leadsPage)
      fetchStats()
    } catch { toast.error("Failed to move leads") }
    setMoving(false)
  }

  const exportLeads = async () => {
    try {
      const body: Record<string, unknown> = {}
      if (filterJob !== "all") body.job_id = filterJob
      if (selectedLeads.size > 0) body.lead_ids = Array.from(selectedLeads)
      const res = await fetch("/api/scraper/leads/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `leads-export-${Date.now()}.csv`
      a.click()
      toast.success("Exported!")
    } catch { toast.error("Export failed") }
  }

  const toggleLead = (id: string) => {
    setSelectedLeads(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAllLeads = () => {
    if (selectedLeads.size === leads.length) {
      setSelectedLeads(new Set())
    } else {
      setSelectedLeads(new Set(leads.map(l => l.id)))
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

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
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <div className="rounded-xl p-2.5 bg-yellow-500/20">
                <Search className="h-6 w-6 text-yellow-400" />
              </div>
              Lead Scraper
            </h1>
            <p className="text-muted-foreground mt-1">Find, scrape, and import leads into your pipeline</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { fetchJobs(); fetchStats(); fetchAllLeads(leadsPage) }} className="rounded-xl">
              <RefreshCw className="h-4 w-4 mr-1" /> Refresh
            </Button>
            <Dialog open={showNewJob} onOpenChange={setShowNewJob}>
              <DialogTrigger asChild>
                <Button className="gap-2 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-black font-semibold rounded-xl">
                  <Plus className="h-4 w-4" /> New Scrape
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-yellow-400" /> New Scrape Job
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div>
                    <Label>Job Name *</Label>
                    <Input placeholder="e.g. NYC Restaurants Q1" value={newJob.name} onChange={e => setNewJob(p => ({ ...p, name: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Search Query *</Label>
                    <Input placeholder="e.g. restaurant, hair salon, gym" value={newJob.search_query} onChange={e => setNewJob(p => ({ ...p, search_query: e.target.value }))} />
                    <p className="text-xs text-muted-foreground mt-1">What type of business to search for on Google Maps</p>
                  </div>
                  <div>
                    <Label>Location (City/State) *</Label>
                    <Input placeholder="e.g. Miami, FL" value={newJob.location} onChange={e => setNewJob(p => ({ ...p, location: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Depth Level</Label>
                    <Select value={newJob.depth_level} onValueChange={v => setNewJob(p => ({ ...p, depth_level: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="basic">Basic — Fast, names + phone + address</SelectItem>
                        <SelectItem value="enhanced">Enhanced — + emails, websites, socials</SelectItem>
                        <SelectItem value="full">Full — + IG/FB enrichment, deep scrape</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="rounded-2xl bg-yellow-500/10 border border-yellow-500/20 p-4 text-sm space-y-1">
                    <p className="font-medium text-yellow-400">💡 Estimated Output</p>
                    <p className="text-muted-foreground">Cost: <span className="text-foreground font-medium">$0</span> (proxy bandwidth only)</p>
                    <p className="text-muted-foreground">Est. leads: <span className="text-foreground font-medium">500 — 10,000+</span> depending on city size</p>
                    <p className="text-muted-foreground">Time: <span className="text-foreground font-medium">~5–60 min</span> depending on depth</p>
                  </div>
                </div>
                <DialogFooter>
                  <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                  <Button onClick={createJob} disabled={creating} className="gap-2 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-black font-semibold">
                    {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                    {creating ? "Creating..." : "Create Job"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </motion.div>

      {/* Stats Bar */}
      {stats && (
        <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <motion.div variants={item} whileHover={{ scale: 1.02, y: -2 }} className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 p-5 shadow-lg shadow-yellow-500/20">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground font-medium">Total Scraped</p>
                <p className="text-3xl font-bold mt-1 tabular-nums">{stats.total_scraped}</p>
                <p className="text-xs text-muted-foreground mt-1">{stats.unique_leads} unique</p>
              </div>
              <div className="rounded-xl p-2.5 bg-yellow-500/20">
                <Search className="h-5 w-5 text-yellow-400" />
              </div>
            </div>
          </motion.div>
          <motion.div variants={item} whileHover={{ scale: 1.02, y: -2 }} className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 p-5 shadow-lg shadow-emerald-500/20">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground font-medium">Moved to Business</p>
                <p className="text-3xl font-bold mt-1 tabular-nums">{stats.total_moved}</p>
                <p className="text-xs text-muted-foreground mt-1">Imported to pipeline</p>
              </div>
              <div className="rounded-xl p-2.5 bg-emerald-500/20">
                <ArrowRightLeft className="h-5 w-5 text-emerald-400" />
              </div>
            </div>
          </motion.div>
          <motion.div variants={item} whileHover={{ scale: 1.02, y: -2 }} className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 p-5 shadow-lg shadow-blue-500/20">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground font-medium">Pending Review</p>
                <p className="text-3xl font-bold mt-1 tabular-nums">{stats.unique_leads - stats.total_moved}</p>
                <p className="text-xs text-muted-foreground mt-1">Ready to import</p>
              </div>
              <div className="rounded-xl p-2.5 bg-blue-500/20">
                <Clock className="h-5 w-5 text-blue-400" />
              </div>
            </div>
          </motion.div>
          <motion.div variants={item} whileHover={{ scale: 1.02, y: -2 }} className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 p-5 shadow-lg shadow-purple-500/20">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground font-medium">Avg Quality</p>
                <p className="text-3xl font-bold mt-1 tabular-nums">{stats.avg_quality_score > 0 ? `${stats.avg_quality_score}` : "—"}</p>
                <p className="text-xs text-muted-foreground mt-1">{stats.avg_quality_score >= 60 ? "Good quality" : "Needs enrichment"}</p>
              </div>
              <div className="rounded-xl p-2.5 bg-purple-500/20">
                <Star className="h-5 w-5 text-purple-400" />
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Scrape Jobs */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.5 }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Zap className="h-5 w-5 text-orange-400" /> Scrape Jobs
          </h2>
          <Badge variant="outline" className="text-muted-foreground">
            {jobs.length} jobs · {jobs.filter(j => j.status === "running").length} running
          </Badge>
        </div>

        {jobsLoading ? (
          <div className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 p-8 text-center shadow-lg">
            <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 p-12 text-center shadow-lg">
            <Search className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground">No scrape jobs yet. Click &quot;New Scrape&quot; to get started!</p>
          </div>
        ) : (
          <div className="space-y-2">
            <AnimatePresence>
              {jobs.map((job, idx) => {
                const sc = statusConfig[job.status] || statusConfig.pending
                const StatusIcon = sc.icon
                const isExpanded = expandedJob === job.id
                return (
                  <motion.div
                    key={job.id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ delay: idx * 0.05 }}
                  >
                    <div className={cn(
                      "rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 shadow-lg transition-all hover:shadow-xl",
                      job.status === "running" && "shadow-cyan-500/10 border-cyan-500/30",
                      job.status === "completed" && "shadow-green-500/10 border-green-500/20",
                      job.status === "failed" && "shadow-red-500/10 border-red-500/20",
                    )}>
                      <div className="p-4">
                        <div className="flex items-center gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold truncate text-foreground">{job.name}</h3>
                              <Badge variant="outline" className={cn("text-xs", sc.color)}>
                                <StatusIcon className={cn("h-3 w-3 mr-1", job.status === "running" && "animate-spin")} />
                                {job.status}
                              </Badge>
                              <Badge variant="outline" className="text-xs text-muted-foreground">{job.depth_level}</Badge>
                            </div>
                            <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1"><Search className="h-3 w-3" />{job.search_query}</span>
                              <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{job.location}</span>
                              <span>{job.total_found || 0} leads found</span>
                              <span>{new Date(job.created_at).toLocaleDateString()}</span>
                            </div>
                            {job.status === "running" && job.progress_pct > 0 && (
                              <div className="mt-2 h-1.5 bg-muted/30 rounded-full overflow-hidden">
                                <motion.div
                                  className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full"
                                  initial={{ width: 0 }}
                                  animate={{ width: `${job.progress_pct}%` }}
                                />
                              </div>
                            )}
                            {job.error_message && (
                              <p className="text-xs text-red-400 mt-1">⚠️ {job.error_message}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            {(job.status === "pending" || job.status === "scheduled") && (
                              <Button size="sm" variant="outline" onClick={() => startJob(job.id)} className="gap-1 rounded-xl">
                                <Play className="h-3 w-3" /> Start
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" onClick={() => {
                              if (isExpanded) { setExpandedJob(null) } else {
                                setExpandedJob(job.id)
                                if (!jobLeads[job.id]) fetchLeadsForJob(job.id)
                              }
                            }} className="rounded-xl text-muted-foreground hover:text-foreground">
                              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => deleteJob(job.id)} className="text-red-400 hover:text-red-300 rounded-xl">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        {/* Expanded leads preview */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="mt-4 pt-4 border-t border-border/30 space-y-2">
                                {!jobLeads[job.id] ? (
                                  <div className="text-center py-4"><Loader2 className="h-4 w-4 animate-spin mx-auto" /></div>
                                ) : jobLeads[job.id].length === 0 ? (
                                  <p className="text-sm text-muted-foreground text-center py-4">No leads found for this job yet</p>
                                ) : (
                                  <>
                                    <p className="text-xs text-muted-foreground mb-2">{jobLeads[job.id].length} leads (showing first 10)</p>
                                    {jobLeads[job.id].slice(0, 10).map((lead) => {
                                      const grade = qualityGrade(lead.quality_score)
                                      return (
                                        <div key={lead.id} className="flex items-center gap-3 p-2 rounded-xl bg-muted/20 text-sm">
                                          <span className={cn("w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold", grade.bg, grade.color)}>
                                            {grade.label}
                                          </span>
                                          <div className="flex-1 min-w-0">
                                            <span className="font-medium truncate block text-foreground">{lead.name}</span>
                                            <span className="text-xs text-muted-foreground">{lead.city}{lead.state ? `, ${lead.state}` : ""}</span>
                                          </div>
                                          <div className="flex gap-2 text-muted-foreground">
                                            {lead.phone && <Phone className="h-3 w-3 text-green-400" />}
                                            {lead.email && <Mail className="h-3 w-3 text-blue-400" />}
                                            {lead.website && <Globe className="h-3 w-3 text-purple-400" />}
                                            {lead.instagram_url && <Instagram className="h-3 w-3 text-pink-400" />}
                                          </div>
                                          <span className="text-xs text-muted-foreground">{lead.quality_score}pts</span>
                                        </div>
                                      )
                                    })}
                                  </>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        )}
      </motion.div>

      {/* Scraped Leads */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.5 }}>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-400" /> Scraped Leads
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            {selectedLeads.size > 0 && (
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex items-center gap-2">
                <Badge className="bg-primary/20 text-primary">{selectedLeads.size} selected</Badge>
                <Select value={targetBusiness} onValueChange={setTargetBusiness}>
                  <SelectTrigger className="w-44 h-8 text-xs"><SelectValue placeholder="Target business..." /></SelectTrigger>
                  <SelectContent>
                    {businesses.map(b => (
                      <SelectItem key={b.id} value={b.id}>{b.icon} {b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={moveLeads} disabled={moving || !targetBusiness} className="gap-1 bg-green-600 hover:bg-green-700 rounded-xl">
                  {moving ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRightLeft className="h-3 w-3" />}
                  Move to Business
                </Button>
              </motion.div>
            )}
            <Button size="sm" variant="outline" onClick={exportLeads} className="gap-1 rounded-xl">
              <Download className="h-3 w-3" /> Export CSV
            </Button>
            <Button size="sm" variant={showFilters ? "default" : "outline"} onClick={() => setShowFilters(!showFilters)} className="gap-1 rounded-xl">
              <Filter className="h-3 w-3" /> Filters
            </Button>
          </div>
        </div>

        {/* Filter bar */}
        <AnimatePresence>
          {showFilters && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="rounded-2xl bg-card/60 backdrop-blur-xl border border-blue-500/20 p-4 mb-3 shadow-lg">
                <div className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
                  <div>
                    <Label className="text-xs">Search</Label>
                    <Input placeholder="Business name..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="h-8 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs">Job</Label>
                    <Select value={filterJob} onValueChange={setFilterJob}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Jobs</SelectItem>
                        {jobs.map(j => <SelectItem key={j.id} value={j.id}>{j.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Quality</Label>
                    <Select value={filterGrade} onValueChange={setFilterGrade}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Grades</SelectItem>
                        <SelectItem value="A">🟢 A (75+)</SelectItem>
                        <SelectItem value="B">🔵 B (50-74)</SelectItem>
                        <SelectItem value="C">🟡 C (25-49)</SelectItem>
                        <SelectItem value="D">🔴 D (0-24)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <Checkbox checked={filterHasEmail} onCheckedChange={(v) => setFilterHasEmail(!!v)} />
                      <Mail className="h-3 w-3" /> Email
                    </label>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <Checkbox checked={filterHasPhone} onCheckedChange={(v) => setFilterHasPhone(!!v)} />
                      <Phone className="h-3 w-3" /> Phone
                    </label>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <Checkbox checked={filterHasIG} onCheckedChange={(v) => setFilterHasIG(!!v)} />
                      <Instagram className="h-3 w-3" /> Instagram
                    </label>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Leads list */}
        {leadsLoading ? (
          <div className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 p-8 text-center shadow-lg">
            <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
          </div>
        ) : leads.length === 0 ? (
          <div className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 p-12 text-center shadow-lg">
            <Users className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground">No leads yet. Create and run a scrape job to find leads!</p>
          </div>
        ) : (
          <>
            {/* Select all header */}
            <div className="flex items-center gap-3 px-4 py-2 text-xs text-muted-foreground border-b border-border/30">
              <Checkbox checked={selectedLeads.size === leads.length && leads.length > 0} onCheckedChange={toggleAllLeads} />
              <span className="flex-1">Business Name</span>
              <span className="w-20 text-center hidden md:block">Quality</span>
              <span className="w-24 text-center hidden md:block">Location</span>
              <span className="w-32 text-center hidden md:block">Contact Info</span>
              <span className="w-16 text-center hidden md:block">Score</span>
            </div>

            <div className="space-y-1">
              {leads.map((lead, idx) => {
                const grade = qualityGrade(lead.quality_score)
                const isSelected = selectedLeads.has(lead.id)
                return (
                  <motion.div
                    key={lead.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.02, duration: 0.3 }}
                  >
                    <div
                      className={cn(
                        "rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 shadow-sm transition-all cursor-pointer hover:shadow-md hover:border-border",
                        isSelected && "border-primary/40 bg-primary/5",
                      )}
                      onClick={() => toggleLead(lead.id)}
                    >
                      <div className="p-3 flex items-center gap-3">
                        <Checkbox checked={isSelected} onCheckedChange={() => toggleLead(lead.id)} onClick={e => e.stopPropagation()} />

                        <span className={cn("w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0", grade.bg, grade.color, grade.border, "border")}>
                          {grade.label}
                        </span>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm truncate text-foreground">{lead.name}</span>
                            {lead.category && <Badge variant="outline" className="text-[10px] hidden md:inline-flex">{lead.category}</Badge>}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                            {lead.city && <span className="flex items-center gap-0.5"><MapPin className="h-3 w-3" />{lead.city}{lead.state ? `, ${lead.state}` : ""}</span>}
                            {lead.rating > 0 && <span>⭐ {lead.rating} ({lead.review_count})</span>}
                          </div>
                        </div>

                        {/* Contact icons */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {lead.phone && (
                            <a href={`tel:${lead.phone}`} onClick={e => e.stopPropagation()} title={lead.phone}>
                              <Phone className="h-3.5 w-3.5 text-green-400 hover:text-green-300" />
                            </a>
                          )}
                          {lead.email && (
                            <a href={`mailto:${lead.email}`} onClick={e => e.stopPropagation()} title={lead.email}>
                              <Mail className="h-3.5 w-3.5 text-blue-400 hover:text-blue-300" />
                            </a>
                          )}
                          {lead.website && (
                            <a href={lead.website} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} title={lead.website}>
                              <Globe className="h-3.5 w-3.5 text-purple-400 hover:text-purple-300" />
                            </a>
                          )}
                          {lead.instagram_url && (
                            <a href={lead.instagram_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} title="Instagram">
                              <Instagram className="h-3.5 w-3.5 text-pink-400 hover:text-pink-300" />
                            </a>
                          )}
                        </div>

                        <span className={cn("text-xs font-mono font-medium w-10 text-right", grade.color)}>
                          {lead.quality_score}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </div>

            {/* Pagination */}
            {leadsTotalPages > 1 && (
              <div className="flex justify-center gap-2 pt-4">
                <Button size="sm" variant="outline" disabled={leadsPage <= 1} onClick={() => setLeadsPage(p => p - 1)} className="rounded-xl">Prev</Button>
                <span className="text-sm text-muted-foreground self-center">Page {leadsPage} of {leadsTotalPages}</span>
                <Button size="sm" variant="outline" disabled={leadsPage >= leadsTotalPages} onClick={() => setLeadsPage(p => p + 1)} className="rounded-xl">Next</Button>
              </div>
            )}
          </>
        )}
      </motion.div>
    </motion.div>
  )
}
