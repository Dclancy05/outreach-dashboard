"use client"

import { useState, useCallback } from "react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { StatCard } from "@/components/dashboard/stat-card"
import { PageInstructions } from "@/components/page-instructions"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Search,
  Briefcase,
  Send,
  CheckCircle,
  Users,
  RefreshCw,
  ExternalLink,
  Sparkles,
  Copy,
  Check,
  TrendingUp,
  Clock,
  Filter,
} from "lucide-react"

interface JobListing {
  id: string
  title: string
  company: string
  description: string
  url: string
  source: string
  location: string
  pay_type: string
  match_score: number
  status: string
  generated_pitch: string
  scraped_at: string
  created_at: string
}

const fetcher = async (url: string) => {
  const res = await fetch(url)
  const json = await res.json()
  if (!json.success) throw new Error(json.error)
  return json.data as JobListing[]
}

const statusColors: Record<string, string> = {
  new: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  applied: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  interview: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  converted: "bg-green-500/10 text-green-400 border-green-500/20",
  rejected: "bg-red-500/10 text-red-400 border-red-500/20",
}

const sourceColors: Record<string, string> = {
  Indeed: "bg-blue-600/20 text-blue-300",
  LinkedIn: "bg-sky-600/20 text-sky-300",
  ZipRecruiter: "bg-green-600/20 text-green-300",
  Glassdoor: "bg-emerald-600/20 text-emerald-300",
  Web: "bg-gray-600/20 text-gray-300",
}

export default function JobFinderPage() {
  const { data: jobs, mutate, isLoading } = useSWR("/api/scrape-jobs", fetcher, {
    refreshInterval: 60000,
  })

  const [scraping, setScraping] = useState(false)
  const [generatingPitch, setGeneratingPitch] = useState<string | null>(null)
  const [pitchModal, setPitchModal] = useState<JobListing | null>(null)
  const [copied, setCopied] = useState(false)
  const [sourceFilter, setSourceFilter] = useState("all")
  const [sortBy, setSortBy] = useState("match_score")
  const [statusFilter, setStatusFilter] = useState("all")

  const scrapeJobs = useCallback(async () => {
    setScraping(true)
    try {
      await fetch("/api/scrape-jobs", { method: "POST" })
      await mutate()
    } finally {
      setScraping(false)
    }
  }, [mutate])

  const generatePitch = useCallback(async (job: JobListing) => {
    setGeneratingPitch(job.id)
    try {
      const res = await fetch("/api/generate-pitch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: job.id }),
      })
      const json = await res.json()
      if (json.success) {
        await mutate()
        setPitchModal({ ...job, generated_pitch: json.pitch })
      }
    } finally {
      setGeneratingPitch(null)
    }
  }, [mutate])

  const updateStatus = useCallback(async (id: string, status: string) => {
    await fetch("/api/scrape-jobs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    })
    await mutate()
  }, [mutate])

  const copyPitch = useCallback((text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [])

  // Filter and sort
  const filtered = (jobs || [])
    .filter(j => sourceFilter === "all" || j.source === sourceFilter)
    .filter(j => statusFilter === "all" || j.status === statusFilter)
    .sort((a, b) => {
      if (sortBy === "match_score") return b.match_score - a.match_score
      if (sortBy === "date") return new Date(b.scraped_at).getTime() - new Date(a.scraped_at).getTime()
      return 0
    })

  // Stats
  const all = jobs || []
  const totalMatches = all.length
  const applied = all.filter(j => j.status === "applied").length
  const interviews = all.filter(j => j.status === "interview").length
  const converted = all.filter(j => j.status === "converted").length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Job Finder</h1>
          <PageInstructions
            title="Job Finder"
            storageKey="job-finder-instructions"
            steps={[
              "Click 'Scrape Jobs' to search Indeed, LinkedIn, and ZipRecruiter for commission-based remote appointment setting roles.",
              "Jobs are ranked by match score — higher scores mean better fit for your skills.",
              "Use 'Generate Pitch' to create a tailored application message with AI.",
              "Copy the pitch and apply directly. Mark status to track your progress.",
              "Filter by source, status, or sort by match score and date.",
            ]}
          />
        </div>
        <Button
          onClick={scrapeJobs}
          disabled={scraping}
          className="bg-purple-600 hover:bg-purple-700"
        >
          {scraping ? (
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Search className="h-4 w-4 mr-2" />
          )}
          {scraping ? "Scraping..." : "Scrape Jobs"}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Total Matches" value={totalMatches} icon={Briefcase} color="blue" />
        <StatCard title="Applied" value={applied} icon={Send} color="orange" />
        <StatCard title="Interviews" value={interviews} icon={Users} color="purple" />
        <StatCard title="Converted" value={converted} icon={CheckCircle} color="green" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            <SelectItem value="Indeed">Indeed</SelectItem>
            <SelectItem value="LinkedIn">LinkedIn</SelectItem>
            <SelectItem value="ZipRecruiter">ZipRecruiter</SelectItem>
            <SelectItem value="Web">Web</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="applied">Applied</SelectItem>
            <SelectItem value="interview">Interview</SelectItem>
            <SelectItem value="converted">Converted</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="match_score">Match Score</SelectItem>
            <SelectItem value="date">Date Posted</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Job Listings */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading jobs...</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Briefcase className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">No jobs found yet</p>
            <p className="text-sm mt-1">Click &quot;Scrape Jobs&quot; to search for commission-based remote roles</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((job) => (
            <Card key={job.id} className="hover:border-purple-500/30 transition-colors">
              <CardContent className="p-4">
                <div className="flex flex-col md:flex-row md:items-start gap-4">
                  {/* Left: Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2 flex-wrap">
                      <h3 className="font-semibold text-base truncate">{job.title}</h3>
                      <Badge variant="outline" className={sourceColors[job.source] || sourceColors.Web}>
                        {job.source}
                      </Badge>
                      <Badge variant="outline" className={statusColors[job.status] || statusColors.new}>
                        {job.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 mt-1.5 text-sm text-muted-foreground">
                      <span>{job.company}</span>
                      <span>📍 {job.location}</span>
                      <span>💰 {job.pay_type}</span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(job.scraped_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{job.description}</p>
                  </div>

                  {/* Right: Score + Actions */}
                  <div className="flex items-center gap-3 shrink-0">
                    {/* Match Score */}
                    <div className="text-center">
                      <div className={`text-2xl font-bold ${
                        job.match_score >= 70 ? "text-green-400" :
                        job.match_score >= 40 ? "text-yellow-400" : "text-red-400"
                      }`}>
                        {job.match_score}
                      </div>
                      <div className="text-[10px] text-muted-foreground uppercase">Match</div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs"
                        onClick={() => job.generated_pitch ? setPitchModal(job) : generatePitch(job)}
                        disabled={generatingPitch === job.id}
                      >
                        {generatingPitch === job.id ? (
                          <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <Sparkles className="h-3 w-3 mr-1" />
                        )}
                        {job.generated_pitch ? "View Pitch" : "Generate Pitch"}
                      </Button>

                      <Select
                        value={job.status}
                        onValueChange={(v) => updateStatus(job.id, v)}
                      >
                        <SelectTrigger className="h-7 text-xs w-[120px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="new">New</SelectItem>
                          <SelectItem value="applied">Applied</SelectItem>
                          <SelectItem value="interview">Interview</SelectItem>
                          <SelectItem value="converted">Converted</SelectItem>
                          <SelectItem value="rejected">Rejected</SelectItem>
                        </SelectContent>
                      </Select>

                      <a href={job.url} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" variant="ghost" className="text-xs w-full">
                          <ExternalLink className="h-3 w-3 mr-1" />
                          View Job
                        </Button>
                      </a>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pitch Modal */}
      <Dialog open={!!pitchModal} onOpenChange={() => setPitchModal(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-400" />
              Generated Pitch
            </DialogTitle>
          </DialogHeader>
          {pitchModal && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                For: <span className="text-foreground font-medium">{pitchModal.title}</span> at {pitchModal.company}
              </div>
              <div className="bg-secondary/50 rounded-lg p-4 text-sm whitespace-pre-wrap leading-relaxed">
                {pitchModal.generated_pitch}
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => copyPitch(pitchModal.generated_pitch)}
                  className="flex-1"
                >
                  {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                  {copied ? "Copied!" : "Copy Pitch"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => generatePitch(pitchModal)}
                  disabled={generatingPitch === pitchModal.id}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${generatingPitch === pitchModal.id ? "animate-spin" : ""}`} />
                  Regenerate
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
