"use client"

import { useState, useEffect, useCallback } from "react"
import useSWR, { mutate } from "swr"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Slider } from "@/components/ui/slider"
import {
  Wand2, Play, ChevronDown, Check, RefreshCw, Trash2, Clock,
  Sparkles, Zap, TrendingUp, Video, Image, Loader2, CheckCircle2,
  AlertCircle, ChevronRight, Calendar, Hash, Music,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ── Types ───────────────────────────────────────────────────────

interface ContentPiece {
  id: string
  title: string
  persona_id: string
  persona_emoji: string
  persona_name: string
  status: string
  format: string
  platform: string
  scheduled_date?: string
  script?: string
  body?: string
  hook_used?: string
  trending_sound?: string
  hashtags?: string[]
  visual_direction?: string
  research_notes?: any
  mood?: string
  batch_id?: string
}

interface Persona {
  id: string
  name: string
  emoji: string
  description: string
}

interface BatchJob {
  id: string
  status: string
  config: any
  progress: any
  total_pieces: number
  completed_pieces: number
  error_message?: string
  created_at: string
}

// ── Config ──────────────────────────────────────────────────────

const statusConfig: Record<string, { label: string; className: string; icon: any }> = {
  draft: { label: "Draft", className: "bg-zinc-500/20 text-zinc-400", icon: Clock },
  generating: { label: "Generating", className: "bg-blue-500/20 text-blue-400 animate-pulse", icon: Loader2 },
  review: { label: "Review", className: "bg-yellow-500/20 text-yellow-400", icon: AlertCircle },
  approved: { label: "Approved", className: "bg-green-500/20 text-green-400", icon: CheckCircle2 },
  scheduled: { label: "Scheduled", className: "bg-purple-500/20 text-purple-400", icon: Calendar },
  posted: { label: "Posted", className: "bg-emerald-500/20 text-emerald-400", icon: Check },
}

const batchStatusConfig: Record<string, { label: string; className: string }> = {
  pending: { label: "Starting...", className: "text-zinc-400" },
  scanning: { label: "Scanning Trends", className: "text-blue-400 animate-pulse" },
  researching: { label: "Researching", className: "text-cyan-400 animate-pulse" },
  generating: { label: "Generating Content", className: "text-purple-400 animate-pulse" },
  editing: { label: "Quality Check", className: "text-yellow-400 animate-pulse" },
  saving: { label: "Saving", className: "text-green-400 animate-pulse" },
  complete: { label: "Complete", className: "text-emerald-400" },
  error: { label: "Error", className: "text-red-400" },
}

const PLATFORMS = [
  { id: "ig", label: "Instagram", emoji: "📸" },
  { id: "fb", label: "Facebook", emoji: "👥" },
  { id: "li", label: "LinkedIn", emoji: "💼" },
  { id: "tiktok", label: "TikTok", emoji: "🎵" },
  { id: "x", label: "X (Twitter)", emoji: "𝕏" },
]

const fetcher = (url: string) => fetch(url).then((r) => r.json())

// ── Component ───────────────────────────────────────────────────

export default function FactoryPage() {
  // Batch state
  const [selectedPersonas, setSelectedPersonas] = useState<string[]>([])
  const [postsPerPersona, setPostsPerPersona] = useState(10)
  const [videoRatio, setVideoRatio] = useState(75)
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(["ig"])
  const [dateStart, setDateStart] = useState(() => new Date().toISOString().split("T")[0])
  const [dateEnd, setDateEnd] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 7)
    return d.toISOString().split("T")[0]
  })
  const [batchRunning, setBatchRunning] = useState(false)
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null)

  // Existing single-gen state
  const [persona, setPersona] = useState("")
  const [hook, setHook] = useState("")
  const [format, setFormat] = useState("")
  const [generating, setGenerating] = useState(false)
  const [generatedScript, setGeneratedScript] = useState("")

  // Expansion
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null)

  // Data
  const { data: personasData } = useSWR<Persona[]>("/api/content/personas", fetcher)
  const personas = Array.isArray(personasData) ? personasData : []

  const { data: piecesData, isLoading } = useSWR<ContentPiece[]>("/api/content/pieces?limit=50", fetcher)
  const pieces = Array.isArray(piecesData) ? piecesData : []

  const { data: batchesData, mutate: mutateBatches } = useSWR<BatchJob[]>("/api/content/batch?limit=10", fetcher)
  const batches = Array.isArray(batchesData) ? batchesData : []

  // Poll active batch
  const { data: activeBatchData } = useSWR(
    activeBatchId ? `/api/content/batch/status?id=${activeBatchId}` : null,
    fetcher,
    { refreshInterval: activeBatchId ? 2000 : 0 }
  )

  useEffect(() => {
    if (activeBatchData?.batch?.status === "complete" || activeBatchData?.batch?.status === "error") {
      setBatchRunning(false)
      mutateBatches()
      mutate("/api/content/pieces?limit=50")
    }
  }, [activeBatchData?.batch?.status, mutateBatches])

  // Stats
  const statusCounts = {
    draft: pieces.filter((p) => p.status === "draft").length,
    generating: pieces.filter((p) => p.status === "generating").length,
    review: pieces.filter((p) => p.status === "review").length,
    approved: pieces.filter((p) => p.status === "approved").length,
    total: pieces.length,
  }

  const videoCount = pieces.filter(p => p.format === "reel" || p.format === "talking_head" || p.format === "text_overlay" || p.format === "tutorial" || p.format === "story_time" || p.format === "before_after" || p.format === "reaction").length
  const imageCount = pieces.length - videoCount

  // ── Handlers ──────────────────────────────────────────────────

  const togglePersona = (id: string) => {
    setSelectedPersonas((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    )
  }

  const togglePlatform = (id: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    )
  }

  const runBatch = async () => {
    if (selectedPlatforms.length === 0) return
    setBatchRunning(true)

    try {
      const res = await fetch("/api/content/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          persona_ids: selectedPersonas,
          posts_per_persona: postsPerPersona,
          date_start: dateStart,
          date_end: dateEnd,
          video_ratio: videoRatio,
          platforms: selectedPlatforms,
        }),
      })
      const data = await res.json()
      if (data.batch_id) {
        setActiveBatchId(data.batch_id)
      } else if (data.error) {
        alert(`Error: ${data.error}`)
        setBatchRunning(false)
      }
    } catch (err) {
      console.error(err)
      setBatchRunning(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-purple-400" />
            Content Factory
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Batch generate high-quality, trend-matched content for every persona
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="gap-1">
            <Video className="h-3 w-3" /> {videoCount} videos
          </Badge>
          <Badge variant="outline" className="gap-1">
            <Image className="h-3 w-3" /> {imageCount} images
          </Badge>
          <Badge variant="outline">{statusCounts.total} total</Badge>
        </div>
      </div>

      {/* ═══ BATCH GENERATOR ═══ */}
      <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-purple-400" />
          <h2 className="text-lg font-semibold">Batch Generate</h2>
          <Badge className="bg-purple-500/20 text-purple-300 text-xs">AI-Powered</Badge>
        </div>

        {/* Persona Selection */}
        <div>
          <label className="text-sm text-zinc-400 mb-2 block">Select Personas</label>
          <div className="flex flex-wrap gap-2">
            {personas.length === 0 && (
              <p className="text-zinc-500 text-sm">No personas found. Create one in Personas tab first.</p>
            )}
            {personas.map((p) => (
              <button
                key={p.id}
                onClick={() => togglePersona(p.id)}
                className={cn(
                  "px-3 py-1.5 rounded-lg border text-sm transition-all",
                  selectedPersonas.includes(p.id)
                    ? "border-purple-500 bg-purple-500/20 text-purple-300"
                    : "border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-600"
                )}
              >
                {p.emoji} {p.name}
              </button>
            ))}
            {personas.length > 0 && (
              <button
                onClick={() =>
                  setSelectedPersonas(
                    selectedPersonas.length === personas.length ? [] : personas.map((p) => p.id)
                  )
                }
                className="px-3 py-1.5 rounded-lg border border-dashed border-zinc-700 text-zinc-500 text-sm hover:border-zinc-500"
              >
                {selectedPersonas.length === personas.length ? "Deselect All" : "Select All"}
              </button>
            )}
          </div>
        </div>

        {/* Config Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Posts Per Persona */}
          <div>
            <label className="text-sm text-zinc-400 mb-2 block">
              Posts per persona: <span className="text-white font-mono">{postsPerPersona}</span>
            </label>
            <Slider
              value={[postsPerPersona]}
              onValueChange={([v]) => setPostsPerPersona(v)}
              min={1}
              max={50}
              step={1}
              className="mt-2"
            />
          </div>

          {/* Video/Image Ratio */}
          <div>
            <label className="text-sm text-zinc-400 mb-2 block">
              Video/Image: <span className="text-white font-mono">{videoRatio}% / {100 - videoRatio}%</span>
            </label>
            <Slider
              value={[videoRatio]}
              onValueChange={([v]) => setVideoRatio(v)}
              min={0}
              max={100}
              step={5}
              className="mt-2"
            />
            <div className="flex justify-between text-xs text-zinc-500 mt-1">
              <span>🖼️ All images</span>
              <span>🎬 All video</span>
            </div>
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-sm text-zinc-400 mb-2 block">Start</label>
              <input
                type="date"
                value={dateStart}
                onChange={(e) => setDateStart(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white"
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-2 block">End</label>
              <input
                type="date"
                value={dateEnd}
                onChange={(e) => setDateEnd(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white"
              />
            </div>
          </div>
        </div>

        {/* Platforms */}
        <div>
          <label className="text-sm text-zinc-400 mb-2 block">Platforms</label>
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map((p) => (
              <button
                key={p.id}
                onClick={() => togglePlatform(p.id)}
                className={cn(
                  "px-3 py-1.5 rounded-lg border text-sm transition-all",
                  selectedPlatforms.includes(p.id)
                    ? "border-cyan-500 bg-cyan-500/20 text-cyan-300"
                    : "border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-600"
                )}
              >
                {p.emoji} {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Summary + Generate */}
        <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
          <div className="text-sm text-zinc-400">
            {selectedPersonas.length > 0 ? (
              <>
                <span className="text-white font-semibold">
                  {(selectedPersonas.length || personas.length) * postsPerPersona}
                </span>{" "}
                pieces across{" "}
                <span className="text-white">
                  {selectedPersonas.length || personas.length}
                </span>{" "}
                persona{(selectedPersonas.length || personas.length) > 1 ? "s" : ""} •{" "}
                <span className="text-purple-300">
                  {Math.round(postsPerPersona * (videoRatio / 100))} videos
                </span>{" "}
                +{" "}
                <span className="text-cyan-300">
                  {postsPerPersona - Math.round(postsPerPersona * (videoRatio / 100))} images
                </span>{" "}
                each
              </>
            ) : (
              <>Select personas or generate for all</>
            )}
          </div>
          <Button
            onClick={runBatch}
            disabled={batchRunning || selectedPlatforms.length === 0}
            className="bg-purple-600 hover:bg-purple-500 text-white gap-2"
            size="lg"
          >
            {batchRunning ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4" />
                Generate Batch
              </>
            )}
          </Button>
        </div>

        {/* Active Batch Progress */}
        {activeBatchId && activeBatchData?.batch && (
          <div className="rounded-lg border border-zinc-700 bg-zinc-900/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className={cn("text-sm font-medium", batchStatusConfig[activeBatchData.batch.status]?.className)}>
                {batchStatusConfig[activeBatchData.batch.status]?.label || activeBatchData.batch.status}
              </span>
              <span className="text-xs text-zinc-500">
                {activeBatchData.batch.completed_pieces}/{activeBatchData.batch.total_pieces} pieces
              </span>
            </div>
            <div className="w-full bg-zinc-800 rounded-full h-2">
              <div
                className="bg-purple-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${activeBatchData.batch.progress?.pct || 0}%` }}
              />
            </div>
            <p className="text-xs text-zinc-500">
              {activeBatchData.batch.progress?.detail || "Starting..."}
            </p>
            {activeBatchData.batch.status === "complete" && (
              <div className="flex items-center gap-2 text-emerald-400 text-sm">
                <CheckCircle2 className="h-4 w-4" />
                Batch complete! {activeBatchData.batch.completed_pieces} pieces generated.
              </div>
            )}
            {activeBatchData.batch.status === "error" && (
              <div className="flex items-center gap-2 text-red-400 text-sm">
                <AlertCircle className="h-4 w-4" />
                {activeBatchData.batch.error_message || "Unknown error"}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══ BATCH HISTORY ═══ */}
      {batches.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Clock className="h-5 w-5 text-zinc-400" />
            Batch History
          </h2>
          {batches.map((batch) => (
            <Collapsible
              key={batch.id}
              open={expandedBatchId === batch.id}
              onOpenChange={() => setExpandedBatchId(expandedBatchId === batch.id ? null : batch.id)}
            >
              <CollapsibleTrigger className="w-full">
                <div className="flex items-center justify-between p-3 rounded-lg border border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 transition-all">
                  <div className="flex items-center gap-3">
                    <ChevronRight
                      className={cn(
                        "h-4 w-4 text-zinc-500 transition-transform",
                        expandedBatchId === batch.id && "rotate-90"
                      )}
                    />
                    <Badge className={batchStatusConfig[batch.status]?.className || "bg-zinc-500/20"}>
                      {batchStatusConfig[batch.status]?.label || batch.status}
                    </Badge>
                    <span className="text-sm text-zinc-300">
                      {batch.total_pieces} pieces • {batch.config?.platforms?.join(", ") || "—"}
                    </span>
                  </div>
                  <span className="text-xs text-zinc-500">
                    {new Date(batch.created_at).toLocaleDateString()}
                  </span>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="ml-7 mt-2 p-3 rounded-lg border border-zinc-800 bg-zinc-900/30 text-sm text-zinc-400 space-y-1">
                  <p>Personas: {batch.config?.persona_ids?.length || "all"}</p>
                  <p>Posts/persona: {batch.config?.posts_per_persona}</p>
                  <p>Video ratio: {batch.config?.video_ratio}%</p>
                  <p>Completed: {batch.completed_pieces}/{batch.total_pieces}</p>
                  {batch.error_message && (
                    <p className="text-red-400">Error: {batch.error_message}</p>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      )}

      {/* ═══ GENERATED CONTENT ═══ */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-zinc-400" />
            Generated Content
            <Badge variant="outline">{pieces.length}</Badge>
          </h2>
          <div className="flex gap-2 text-xs">
            {Object.entries(statusCounts).filter(([k]) => k !== "total").map(([key, count]) => (
              <Badge key={key} variant="outline" className={statusConfig[key]?.className}>
                {statusConfig[key]?.label}: {count}
              </Badge>
            ))}
          </div>
        </div>

        {isLoading && (
          <div className="text-center py-12 text-zinc-500">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
            Loading content...
          </div>
        )}

        {!isLoading && pieces.length === 0 && (
          <div className="text-center py-12 text-zinc-500">
            <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No content yet. Run a batch to get started!</p>
          </div>
        )}

        {pieces.map((piece) => (
          <Collapsible
            key={piece.id}
            open={expandedId === piece.id}
            onOpenChange={() => setExpandedId(expandedId === piece.id ? null : piece.id)}
          >
            <CollapsibleTrigger className="w-full">
              <div className="flex items-center justify-between p-3 rounded-lg border border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 transition-all">
                <div className="flex items-center gap-3">
                  <ChevronRight
                    className={cn(
                      "h-4 w-4 text-zinc-500 transition-transform",
                      expandedId === piece.id && "rotate-90"
                    )}
                  />
                  <span className="text-lg">{piece.persona_emoji || "📝"}</span>
                  <div className="text-left">
                    <p className="text-sm font-medium text-zinc-200 truncate max-w-[300px]">
                      {piece.title || "Untitled"}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {piece.persona_name} • {piece.format} • {piece.platform}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {piece.trending_sound && (
                    <Badge variant="outline" className="text-xs gap-1">
                      <Music className="h-3 w-3" /> Sound
                    </Badge>
                  )}
                  {piece.scheduled_date && (
                    <span className="text-xs text-zinc-500">{piece.scheduled_date}</span>
                  )}
                  <Badge className={statusConfig[piece.status]?.className || "bg-zinc-500/20"}>
                    {statusConfig[piece.status]?.label || piece.status}
                  </Badge>
                </div>
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="ml-7 mt-2 space-y-3 p-4 rounded-lg border border-zinc-800 bg-zinc-900/30">
                {/* Hook */}
                {piece.hook_used && (
                  <div>
                    <p className="text-xs text-zinc-500 mb-1">🪝 Hook</p>
                    <p className="text-sm text-yellow-300 font-medium">{piece.hook_used}</p>
                  </div>
                )}

                {/* Script (video) */}
                {piece.script && (
                  <div>
                    <p className="text-xs text-zinc-500 mb-1">🎬 Script</p>
                    <pre className="text-sm text-zinc-300 whitespace-pre-wrap bg-zinc-900 rounded-lg p-3 max-h-64 overflow-y-auto font-mono text-xs">
                      {piece.script}
                    </pre>
                  </div>
                )}

                {/* Caption */}
                {piece.body && (
                  <div>
                    <p className="text-xs text-zinc-500 mb-1">📝 Caption</p>
                    <p className="text-sm text-zinc-300 whitespace-pre-wrap">{piece.body}</p>
                  </div>
                )}

                {/* Trending Sound */}
                {piece.trending_sound && (
                  <div>
                    <p className="text-xs text-zinc-500 mb-1">🎵 Trending Sound</p>
                    <p className="text-sm text-purple-300">{piece.trending_sound}</p>
                  </div>
                )}

                {/* Visual Direction */}
                {piece.visual_direction && (
                  <div>
                    <p className="text-xs text-zinc-500 mb-1">🎨 Visual Direction</p>
                    <pre className="text-sm text-zinc-400 whitespace-pre-wrap bg-zinc-900 rounded-lg p-3 font-mono text-xs">
                      {piece.visual_direction}
                    </pre>
                  </div>
                )}

                {/* Hashtags */}
                {piece.hashtags && Array.isArray(piece.hashtags) && piece.hashtags.length > 0 && (
                  <div>
                    <p className="text-xs text-zinc-500 mb-1"># Hashtags</p>
                    <div className="flex flex-wrap gap-1">
                      {piece.hashtags.map((tag: string, i: number) => (
                        <Badge key={i} variant="outline" className="text-xs text-cyan-400">
                          #{tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Research Notes */}
                {piece.research_notes && (
                  <div>
                    <p className="text-xs text-zinc-500 mb-1">🔬 Research</p>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {piece.research_notes.niche && (
                        <Badge variant="outline">Niche: {piece.research_notes.niche}</Badge>
                      )}
                      {piece.research_notes.topic && (
                        <Badge variant="outline">Topic: {piece.research_notes.topic}</Badge>
                      )}
                      {piece.research_notes.hook_category && (
                        <Badge variant="outline">Hook: {piece.research_notes.hook_category}</Badge>
                      )}
                      {piece.research_notes.quality_score !== undefined && (
                        <Badge
                          variant="outline"
                          className={
                            piece.research_notes.quality_score >= 5
                              ? "text-green-400"
                              : piece.research_notes.quality_score >= 3
                                ? "text-yellow-400"
                                : "text-red-400"
                          }
                        >
                          Quality: {piece.research_notes.quality_score}/{piece.research_notes.quality_max}
                        </Badge>
                      )}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-2 border-t border-zinc-800">
                  <Button size="sm" variant="outline" className="text-xs">
                    <Check className="h-3 w-3 mr-1" /> Approve
                  </Button>
                  <Button size="sm" variant="outline" className="text-xs">
                    <RefreshCw className="h-3 w-3 mr-1" /> Regenerate
                  </Button>
                  <Button size="sm" variant="outline" className="text-xs text-red-400">
                    <Trash2 className="h-3 w-3 mr-1" /> Delete
                  </Button>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        ))}
      </div>
    </div>
  )
}
