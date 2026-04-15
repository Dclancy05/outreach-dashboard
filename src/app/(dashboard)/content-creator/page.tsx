"use client"

import { useState, useCallback, useEffect } from "react"
import useSWR from "swr"
import { dashboardApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
  Wand2,
  Image,
  Film,
  LayoutGrid,
  MessageCircle,
  Loader2,
  Check,
  RefreshCw,
  Pencil,
  Sparkles,
  Video,
  Trash2,
  Clock,
  AlertCircle,
  Play,
  Monitor,
  Smartphone,
  Square,
  Upload,
  FileUp,
  Eye,
} from "lucide-react"
import { PageInstructions } from "@/components/page-instructions"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { toast } from "sonner"
import type { ContentCalendarItem, ContentPersona, VideoGeneration } from "@/types"

const TYPE_ICONS: Record<string, typeof Image> = {
  image: Image,
  reel: Film,
  carousel: LayoutGrid,
  story: MessageCircle,
}

const MEDIA_STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-400",
  generating: "bg-blue-500/20 text-blue-400",
  ready: "bg-green-500/20 text-green-400",
  failed: "bg-red-500/20 text-red-400",
  queued: "bg-purple-500/20 text-purple-400",
}

const STYLES = [
  { value: "testimonial", label: "📣 Testimonial", desc: "Customer review / success story" },
  { value: "before_after", label: "🔄 Before/After", desc: "Transformation showcase" },
  { value: "promo", label: "🎯 Promo", desc: "Service/product promotion" },
  { value: "educational", label: "📚 Educational", desc: "Tips, how-to, industry insights" },
]

const DURATIONS = [
  { value: 5, label: "5s", desc: "Quick hook" },
  { value: 10, label: "10s", desc: "Short clip" },
  { value: 15, label: "15s", desc: "Story length" },
  { value: 30, label: "30s", desc: "Reel length" },
]

const ASPECT_RATIOS = [
  { value: "9:16", label: "9:16 Portrait", icon: Smartphone, desc: "IG Reels / Stories" },
  { value: "1:1", label: "1:1 Square", icon: Square, desc: "IG Feed posts" },
  { value: "16:9", label: "16:9 Landscape", icon: Monitor, desc: "YouTube / Web" },
]

type TabType = "media" | "video" | "upload"

export default function ContentCreatorPage() {
  const [activeTab, setActiveTab] = useState<TabType>("video")

  // ─── Media Generation (existing) ───────────────────────────────
  const { data: content, isLoading, mutate } = useSWR<ContentCalendarItem[]>(
    "content_creator_pending",
    () => dashboardApi("get_content_calendar", { post_status: "draft" })
  )
  const { data: personas } = useSWR<ContentPersona[]>("get_content_personas_cr", () => dashboardApi("get_content_personas"))

  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set())
  const [editItem, setEditItem] = useState<ContentCalendarItem | null>(null)
  const [editForm, setEditForm] = useState({ caption: "", hashtags: "", ai_prompt: "" })
  const [bulkGenerating, setBulkGenerating] = useState(false)

  // ─── Video Generator ───────────────────────────────────────────
  const [videoPrompt, setVideoPrompt] = useState("")
  const [videoStyle, setVideoStyle] = useState("promo")
  const [videoDuration, setVideoDuration] = useState(10)
  const [videoAspectRatio, setVideoAspectRatio] = useState("9:16")
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false)
  const [videoError, setVideoError] = useState("")
  const [tableMissing, setTableMissing] = useState(false)

  // ─── Upload & Caption Generator ────────────────────────────────
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadPreview, setUploadPreview] = useState("")
  const [uploadCaption, setUploadCaption] = useState("")
  const [uploadHashtags, setUploadHashtags] = useState("")
  const [uploadContentType, setUploadContentType] = useState("image")
  const [uploadPersonaId, setUploadPersonaId] = useState("")
  const [uploadScheduledFor, setUploadScheduledFor] = useState("")
  const [isGeneratingCaption, setIsGeneratingCaption] = useState(false)
  const [uploadSaving, setUploadSaving] = useState(false)
  const [uploadSuccess, setUploadSuccess] = useState(false)
  const [confirmDeleteVideoId, setConfirmDeleteVideoId] = useState<string | null>(null)

  const { data: videoData, mutate: mutateVideos } = useSWR<{ data: VideoGeneration[]; count: number }>(
    "video_generations",
    async () => {
      const res = await fetch("/api/generate-video?limit=50")
      const json = await res.json()
      if (json.table_missing) setTableMissing(true)
      return json
    },
    { refreshInterval: 10000 }
  )
  const videos = videoData?.data || []

  const personaMap: Record<string, ContentPersona> = {}
  personas?.forEach(p => { personaMap[p.persona_id] = p })

  // ─── Media Handlers ────────────────────────────────────────────
  const handleGenerateMedia = useCallback(async (item: ContentCalendarItem) => {
    setGeneratingIds(prev => new Set([...prev, item.content_id]))
    try {
      await dashboardApi("update_content_item", { content_id: item.content_id, media_status: "generating" })
      const res = await fetch("/api/generate-media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content_id: item.content_id, prompt: item.ai_prompt, content_type: item.content_type }),
      })
      const result = await res.json()
      if (result.placeholder) {
        await dashboardApi("update_content_item", { content_id: item.content_id, media_status: "pending" })
        toast.error("Kling AI not configured yet. Add KLING_API_KEY to .env.local")
      } else if (result.success) {
        await dashboardApi("update_content_item", { content_id: item.content_id, media_status: "generating" })
      } else {
        await dashboardApi("update_content_item", { content_id: item.content_id, media_status: "failed" })
      }
      mutate()
    } catch {
      await dashboardApi("update_content_item", { content_id: item.content_id, media_status: "failed" })
      mutate()
    } finally {
      setGeneratingIds(prev => { const n = new Set(prev); n.delete(item.content_id); return n })
    }
  }, [mutate])

  const handleBulkGenerate = useCallback(async () => {
    const pendingItems = content?.filter(c => c.media_status === "pending") || []
    if (!pendingItems.length) return
    setBulkGenerating(true)
    for (const item of pendingItems) await handleGenerateMedia(item)
    setBulkGenerating(false)
  }, [content, handleGenerateMedia])

  const handleApprove = useCallback(async (item: ContentCalendarItem) => {
    try {
      await dashboardApi("update_content_item", { content_id: item.content_id, post_status: "scheduled" })
      toast.success("Content approved & scheduled")
      mutate()
    } catch { toast.error("Failed to approve content") }
  }, [mutate])

  const openEdit = (item: ContentCalendarItem) => {
    setEditForm({ caption: item.caption, hashtags: item.hashtags, ai_prompt: item.ai_prompt })
    setEditItem(item)
  }

  const handleSaveEdit = useCallback(async () => {
    if (!editItem) return
    try {
      await dashboardApi("update_content_item", { content_id: editItem.content_id, ...editForm })
      toast.success("Content updated")
      setEditItem(null)
      mutate()
    } catch { toast.error("Failed to update content") }
  }, [editItem, editForm, mutate])

  // ─── Video Handlers ────────────────────────────────────────────
  const handleGenerateVideo = useCallback(async () => {
    if (!videoPrompt.trim()) return
    setIsGeneratingVideo(true)
    setVideoError("")
    try {
      const res = await fetch("/api/generate-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: videoPrompt,
          style: videoStyle,
          duration: videoDuration,
          aspect_ratio: videoAspectRatio,
        }),
      })
      const result = await res.json()
      if (result.table_missing) {
        setTableMissing(true)
        setVideoError("Table 'video_generations' not found. Run the migration SQL first.")
        return
      }
      if (result.error && !result.success) {
        setVideoError(result.error)
        return
      }
      setVideoPrompt("")
      mutateVideos()
    } catch (e) {
      setVideoError(e instanceof Error ? e.message : "Failed to submit")
    } finally {
      setIsGeneratingVideo(false)
    }
  }, [videoPrompt, videoStyle, videoDuration, videoAspectRatio, mutateVideos])

  const handleDeleteVideo = useCallback(async (id: string) => {
    try {
      await fetch(`/api/generate-video?id=${id}`, { method: "DELETE" })
      toast.success("Video deleted")
      mutateVideos()
    } catch { toast.error("Failed to delete video") }
    finally { setConfirmDeleteVideoId(null) }
  }, [mutateVideos])

  // ─── Upload Handlers ─────────────────────────────────────────
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadFile(file)
    setUploadSuccess(false)
    const url = URL.createObjectURL(file)
    setUploadPreview(url)
    // Auto-detect content type
    if (file.type.startsWith("video/")) setUploadContentType("reel")
    else setUploadContentType("image")
  }, [])

  const handleGenerateCaption = useCallback(async () => {
    const persona = uploadPersonaId ? personaMap[uploadPersonaId] : null
    setIsGeneratingCaption(true)
    try {
      const res = await fetch("/api/generate-caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content_type: uploadContentType,
          persona: persona ? { name: persona.name, niche: persona.niche, tone: persona.tone, hashtag_groups: persona.hashtag_groups } : null,
          existing_caption: uploadCaption,
        }),
      })
      const result = await res.json()
      if (result.caption) setUploadCaption(result.caption)
      if (result.hashtags) setUploadHashtags(result.hashtags)
    } catch {
      // fallback caption
      const persona = uploadPersonaId ? personaMap[uploadPersonaId] : null
      setUploadCaption(`✨ New ${uploadContentType} content${persona ? ` from ${persona.name}` : ""}!\n\nDouble-tap if you love this 👇`)
      setUploadHashtags(persona?.hashtag_groups || "#content #socialmedia")
    } finally {
      setIsGeneratingCaption(false)
    }
  }, [uploadContentType, uploadPersonaId, uploadCaption, personaMap])

  const handleSaveUpload = useCallback(async () => {
    if (!uploadFile) return
    setUploadSaving(true)
    try {
      // For now, create content item with a local reference
      // In production, upload to Supabase storage first
      await dashboardApi("create_content_item", {
        title: uploadFile.name.replace(/\.[^.]+$/, ""),
        caption: uploadCaption,
        hashtags: uploadHashtags,
        content_type: uploadContentType,
        persona_id: uploadPersonaId || null,
        scheduled_for: uploadScheduledFor || null,
        media_status: "ready",
        post_status: "draft",
        ai_prompt: "",
        media_url: "", // Would be supabase storage URL after upload
      })
      toast.success("Content saved as draft")
      setUploadSuccess(true)
      setUploadFile(null)
      setUploadPreview("")
      setUploadCaption("")
      setUploadHashtags("")
      setUploadScheduledFor("")
      mutate()
    } catch (e) {
      toast.error("Error saving: " + (e instanceof Error ? e.message : String(e)))
    } finally {
      setUploadSaving(false)
    }
  }, [uploadFile, uploadCaption, uploadHashtags, uploadContentType, uploadPersonaId, uploadScheduledFor, mutate])

  const pendingCount = content?.filter(c => c.media_status === "pending").length || 0
  const readyCount = content?.filter(c => c.media_status === "ready").length || 0
  const queuedVideos = videos.filter(v => v.status === "queued").length
  const generatingVideos = videos.filter(v => v.status === "generating").length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wand2 className="h-6 w-6 text-yellow-400" />
            Content Creator
            <PageInstructions title="Content Creator" storageKey="instructions-content-creator" steps={[
              "Generate AI videos and media for Instagram content.",
              "Use the Video Generator tab to create videos with AI prompts.",
              "Choose style, duration, and aspect ratio for each video.",
              "Videos are queued — configure KLING_API_KEY for auto-generation.",
              "The Media tab handles images/videos from the content calendar.",
            ]} />
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Generate AI videos, create media, and approve content for publishing.
          </p>
        </div>
        <div className="flex gap-2">
          {activeTab === "video" && (
            <>
              <Badge variant="outline" className="text-sm py-1 text-purple-400">{queuedVideos} queued</Badge>
              <Badge variant="outline" className="text-sm py-1 text-blue-400">{generatingVideos} generating</Badge>
            </>
          )}
          {activeTab === "media" && (
            <>
              <Badge variant="outline" className="text-sm py-1">{pendingCount} pending</Badge>
              <Badge variant="outline" className="text-sm py-1 text-green-400">{readyCount} ready</Badge>
              {pendingCount > 0 && (
                <Button onClick={handleBulkGenerate} disabled={bulkGenerating} className="gap-2">
                  {bulkGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Bulk Generate ({pendingCount})
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-1 p-1 rounded-lg bg-secondary/50 w-fit">
        <button
          onClick={() => setActiveTab("video")}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === "video" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Video className="h-4 w-4" /> AI Video Generator
        </button>
        <button
          onClick={() => setActiveTab("upload")}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === "upload" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Upload className="h-4 w-4" /> Upload & Caption
        </button>
        <button
          onClick={() => setActiveTab("media")}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === "media" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Image className="h-4 w-4" /> Calendar Media
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* VIDEO GENERATOR TAB */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {activeTab === "video" && (
        <div className="space-y-6">
          {/* Table Missing Warning */}
          {tableMissing && (
            <Card className="border-yellow-500/50 bg-yellow-500/5">
              <CardContent className="p-4 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-yellow-400 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-yellow-400">Database table not found</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Run the migration SQL in your Supabase SQL Editor to create the <code className="text-xs bg-secondary px-1 py-0.5 rounded">video_generations</code> table.
                    File: <code className="text-xs bg-secondary px-1 py-0.5 rounded">migration-video-generations.sql</code>
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Generator Form */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Video className="h-5 w-5 text-purple-400" />
                Generate AI Video
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Prompt */}
              <div className="space-y-2">
                <Label htmlFor="video-prompt">Video Description</Label>
                <textarea
                  id="video-prompt"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[100px] resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Describe the video you want to create...&#10;&#10;Example: A cinematic slow-motion shot of a barber shop in NYC, warm golden lighting, a barber carefully styling a client's hair, professional atmosphere, Instagram-worthy aesthetic"
                  value={videoPrompt}
                  onChange={e => setVideoPrompt(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Be specific about scene, lighting, movement, and mood for best results.
                </p>
              </div>

              {/* Controls Row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Style */}
                <div className="space-y-2">
                  <Label>Style</Label>
                  <Select value={videoStyle} onValueChange={setVideoStyle}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STYLES.map(s => (
                        <SelectItem key={s.value} value={s.value}>
                          <div>
                            <span>{s.label}</span>
                            <span className="text-xs text-muted-foreground ml-2">{s.desc}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Duration */}
                <div className="space-y-2">
                  <Label>Duration</Label>
                  <div className="flex gap-1.5">
                    {DURATIONS.map(d => (
                      <button
                        key={d.value}
                        onClick={() => setVideoDuration(d.value)}
                        className={`flex-1 px-2 py-2 rounded-md text-xs font-medium border transition-colors ${
                          videoDuration === d.value
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-secondary/50 text-muted-foreground border-border hover:border-primary/50"
                        }`}
                        title={d.desc}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Aspect Ratio */}
                <div className="space-y-2">
                  <Label>Aspect Ratio</Label>
                  <div className="flex gap-1.5">
                    {ASPECT_RATIOS.map(ar => {
                      const Icon = ar.icon
                      return (
                        <button
                          key={ar.value}
                          onClick={() => setVideoAspectRatio(ar.value)}
                          className={`flex-1 flex flex-col items-center gap-0.5 px-2 py-2 rounded-md text-xs border transition-colors ${
                            videoAspectRatio === ar.value
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-secondary/50 text-muted-foreground border-border hover:border-primary/50"
                          }`}
                          title={ar.desc}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          <span>{ar.value}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Error */}
              {videoError && (
                <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
                  {videoError}
                </div>
              )}

              {/* Generate Button */}
              <Button
                onClick={handleGenerateVideo}
                disabled={!videoPrompt.trim() || isGeneratingVideo || tableMissing}
                className="w-full gap-2"
                size="lg"
              >
                {isGeneratingVideo ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {isGeneratingVideo ? "Submitting..." : "Generate Video"}
              </Button>

              {/* Provider Info */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <AlertCircle className="h-3.5 w-3.5" />
                <span>Videos are queued for processing. Add <code className="bg-secondary px-1 rounded">KLING_API_KEY</code> to .env.local for auto-generation via Kling AI (free tier: ~66 videos/month).</span>
              </div>
            </CardContent>
          </Card>

          {/* Video Gallery */}
          <div>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Film className="h-5 w-5" />
              Generated Videos
              <Badge variant="outline" className="ml-2">{videos.length}</Badge>
            </h2>

            {videos.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="p-12 text-center">
                  <Video className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No videos yet</h3>
                  <p className="text-muted-foreground text-sm">Use the form above to generate your first AI video.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {videos.map(video => (
                  <Card key={video.id} className="overflow-hidden hover:border-primary/30 transition-colors">
                    {/* Video Preview */}
                    <div className={`relative bg-secondary/30 flex items-center justify-center border-b ${
                      video.aspect_ratio === "9:16" ? "aspect-[9/16] max-h-[300px]" :
                      video.aspect_ratio === "1:1" ? "aspect-square" : "aspect-video"
                    }`}>
                      {video.video_url ? (
                        <video
                          src={video.video_url}
                          className="w-full h-full object-cover"
                          controls
                          poster={video.thumbnail_url || undefined}
                        />
                      ) : (
                        <div className="text-center p-4">
                          {video.status === "generating" ? (
                            <Loader2 className="h-10 w-10 mx-auto text-blue-400 animate-spin mb-2" />
                          ) : video.status === "failed" ? (
                            <AlertCircle className="h-10 w-10 mx-auto text-red-400 mb-2" />
                          ) : (
                            <Clock className="h-10 w-10 mx-auto text-purple-400/50 mb-2" />
                          )}
                          <Badge className={MEDIA_STATUS_COLORS[video.status] || MEDIA_STATUS_COLORS.queued}>
                            {video.status}
                          </Badge>
                        </div>
                      )}
                      {/* Badges overlay */}
                      <div className="absolute top-2 left-2 flex gap-1.5">
                        <Badge variant="outline" className="bg-card/80 backdrop-blur text-[10px]">
                          {video.aspect_ratio}
                        </Badge>
                        <Badge variant="outline" className="bg-card/80 backdrop-blur text-[10px]">
                          {video.duration}s
                        </Badge>
                      </div>
                      <div className="absolute top-2 right-2">
                        <Badge variant="outline" className="bg-card/80 backdrop-blur text-[10px] capitalize">
                          {video.style?.replace("_", "/")}
                        </Badge>
                      </div>
                    </div>

                    <CardContent className="p-3 space-y-2">
                      <p className="text-xs text-muted-foreground line-clamp-3">{video.prompt}</p>

                      {video.error_message && (
                        <p className="text-[10px] text-red-400 line-clamp-2">{video.error_message}</p>
                      )}

                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground">
                          {video.provider} • {video.created_at ? new Date(video.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : ""}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400"
                          onClick={() => setConfirmDeleteVideoId(video.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* UPLOAD & CAPTION TAB */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {activeTab === "upload" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Upload + Form */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileUp className="h-5 w-5 text-orange-400" />
                Upload Custom Media
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* File Drop Zone */}
              <label className="block border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors">
                <input type="file" accept="image/*,video/*" className="hidden" onChange={handleFileSelect} />
                <Upload className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">Click or drag to upload image/video</p>
                <p className="text-xs text-muted-foreground/60 mt-1">JPG, PNG, MP4, MOV supported</p>
              </label>

              {/* Persona Select */}
              <div>
                <Label>Persona (influences caption style)</Label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={uploadPersonaId}
                  onChange={e => setUploadPersonaId(e.target.value)}
                >
                  <option value="">None</option>
                  {personas?.map(p => (
                    <option key={p.persona_id} value={p.persona_id}>{p.name} — {p.niche}</option>
                  ))}
                </select>
              </div>

              {/* Content Type */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Content Type</Label>
                  <select
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={uploadContentType}
                    onChange={e => setUploadContentType(e.target.value)}
                  >
                    <option value="image">Image Post</option>
                    <option value="reel">Reel</option>
                    <option value="carousel">Carousel</option>
                    <option value="story">Story</option>
                  </select>
                </div>
                <div>
                  <Label>Schedule For</Label>
                  <Input
                    type="datetime-local"
                    value={uploadScheduledFor}
                    onChange={e => setUploadScheduledFor(e.target.value)}
                  />
                </div>
              </div>

              {/* Caption */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label>Caption</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs gap-1"
                    onClick={handleGenerateCaption}
                    disabled={isGeneratingCaption}
                  >
                    {isGeneratingCaption ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    AI Generate
                  </Button>
                </div>
                <textarea
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[120px] resize-y"
                  placeholder="Write your caption or use AI Generate..."
                  value={uploadCaption}
                  onChange={e => setUploadCaption(e.target.value)}
                />
              </div>

              {/* Hashtags */}
              <div>
                <Label>Hashtags</Label>
                <Input
                  value={uploadHashtags}
                  onChange={e => setUploadHashtags(e.target.value)}
                  placeholder="#marketing #growth #business"
                />
              </div>

              {/* Save */}
              {uploadSuccess && (
                <div className="text-sm text-green-400 bg-green-500/10 border border-green-500/20 rounded-md px-3 py-2 flex items-center gap-2">
                  <Check className="h-4 w-4" /> Content saved as draft!
                </div>
              )}

              <Button
                className="w-full gap-2"
                size="lg"
                onClick={handleSaveUpload}
                disabled={!uploadFile || uploadSaving}
              >
                {uploadSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Save as Draft
              </Button>
            </CardContent>
          </Card>

          {/* Preview Panel */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Eye className="h-5 w-5 text-blue-400" />
                Preview
              </CardTitle>
            </CardHeader>
            <CardContent>
              {uploadPreview ? (
                <div className="space-y-4">
                  {/* Phone Frame Mock */}
                  <div className="mx-auto max-w-[320px] bg-black rounded-[2rem] p-2 shadow-2xl">
                    <div className="bg-white rounded-[1.5rem] overflow-hidden">
                      {/* IG Header */}
                      <div className="flex items-center gap-2 px-3 py-2 border-b">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 to-yellow-500" />
                        <span className="text-xs font-semibold text-black">
                          {uploadPersonaId && personaMap[uploadPersonaId] ? personaMap[uploadPersonaId].name : "your_account"}
                        </span>
                      </div>
                      {/* Media */}
                      <div className="aspect-square bg-gray-100">
                        {uploadFile?.type.startsWith("video/") ? (
                          <video src={uploadPreview} className="w-full h-full object-cover" controls />
                        ) : (
                          <img src={uploadPreview} alt="Preview" className="w-full h-full object-cover" />
                        )}
                      </div>
                      {/* Caption */}
                      <div className="px-3 py-2">
                        {uploadCaption && (
                          <p className="text-xs text-black whitespace-pre-wrap line-clamp-6">{uploadCaption}</p>
                        )}
                        {uploadHashtags && (
                          <p className="text-[10px] text-blue-600 mt-1">{uploadHashtags}</p>
                        )}
                        {!uploadCaption && !uploadHashtags && (
                          <p className="text-xs text-gray-400 italic">Caption will appear here...</p>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-center">
                    <Badge variant="outline" className="text-xs">{uploadContentType}</Badge>
                    {uploadFile && <span className="text-xs text-muted-foreground ml-2">{uploadFile.name}</span>}
                  </div>
                </div>
              ) : (
                <div className="text-center py-16">
                  <Image className="h-16 w-16 mx-auto text-muted-foreground/20 mb-3" />
                  <p className="text-sm text-muted-foreground">Upload media to see preview</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Shows how your post will look on Instagram</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* CALENDAR MEDIA TAB (existing functionality) */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {activeTab === "media" && (
        <>
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map(i => (
                <Card key={i} className="animate-pulse"><CardContent className="p-6 h-64" /></Card>
              ))}
            </div>
          ) : !content?.length ? (
            <Card className="border-dashed">
              <CardContent className="p-12 text-center">
                <Wand2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No draft content</h3>
                <p className="text-muted-foreground">Generate content from the Calendar page first, then come here to create media.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {content.map(item => {
                const TypeIcon = TYPE_ICONS[item.content_type] || Image
                const persona = item.persona_id ? personaMap[item.persona_id] : null
                const isGenerating = generatingIds.has(item.content_id)

                return (
                  <Card key={item.content_id} className="overflow-hidden hover:border-primary/30 transition-colors">
                    <div className="relative aspect-square bg-secondary/30 flex items-center justify-center border-b">
                      {item.media_url ? (
                        item.content_type === "reel" || item.content_type === "story" ? (
                          <video src={item.media_url} className="w-full h-full object-cover" controls />
                        ) : (
                          <img src={item.media_url} alt={item.title} className="w-full h-full object-cover" />
                        )
                      ) : (
                        <div className="text-center p-4">
                          <TypeIcon className="h-12 w-12 mx-auto text-muted-foreground/30 mb-2" />
                          <Badge className={MEDIA_STATUS_COLORS[item.media_status] || MEDIA_STATUS_COLORS.pending}>
                            {isGenerating ? "Generating..." : item.media_status}
                          </Badge>
                        </div>
                      )}
                      <div className="absolute top-2 right-2">
                        <Badge variant="outline" className="bg-card/80 backdrop-blur text-xs">
                          <TypeIcon className="h-3 w-3 mr-1" />{item.content_type}
                        </Badge>
                      </div>
                    </div>

                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-semibold text-sm">{item.title || "Untitled"}</h3>
                          {persona && <span className="text-xs text-muted-foreground">{persona.name}</span>}
                        </div>
                        {item.scheduled_for && (
                          <span className="text-xs text-muted-foreground">
                            {new Date(item.scheduled_for).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-3">{item.caption}</p>
                      {item.hashtags && <p className="text-[10px] text-blue-400/70 line-clamp-1">{item.hashtags}</p>}
                      <div className="flex gap-1.5 pt-1">
                        <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => openEdit(item)}>
                          <Pencil className="h-3 w-3 mr-1" /> Edit
                        </Button>
                        {item.media_status === "pending" && (
                          <Button size="sm" className="flex-1 text-xs" onClick={() => handleGenerateMedia(item)} disabled={isGenerating}>
                            {isGenerating ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Wand2 className="h-3 w-3 mr-1" />}
                            Generate
                          </Button>
                        )}
                        {item.media_status === "ready" && item.post_status === "draft" && (
                          <Button size="sm" className="flex-1 text-xs bg-green-600 hover:bg-green-700" onClick={() => handleApprove(item)}>
                            <Check className="h-3 w-3 mr-1" /> Approve
                          </Button>
                        )}
                        {item.media_status === "failed" && (
                          <Button size="sm" variant="outline" className="flex-1 text-xs text-yellow-400" onClick={() => handleGenerateMedia(item)} disabled={isGenerating}>
                            <RefreshCw className="h-3 w-3 mr-1" /> Retry
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </>
      )}

      <ConfirmDialog open={!!confirmDeleteVideoId} onOpenChange={(open) => { if (!open) setConfirmDeleteVideoId(null) }} title="Delete Video" description="Delete this generated video? This cannot be undone." onConfirm={() => confirmDeleteVideoId && handleDeleteVideo(confirmDeleteVideoId)} />

      {/* Edit Dialog */}
      <Dialog open={!!editItem} onOpenChange={() => setEditItem(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit Content</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Caption</Label>
              <textarea
                className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[120px]"
                value={editForm.caption}
                onChange={e => setEditForm({ ...editForm, caption: e.target.value })}
              />
            </div>
            <div>
              <Label>Hashtags</Label>
              <Input value={editForm.hashtags} onChange={e => setEditForm({ ...editForm, hashtags: e.target.value })} />
            </div>
            <div>
              <Label>AI Generation Prompt</Label>
              <textarea
                className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[80px]"
                value={editForm.ai_prompt}
                onChange={e => setEditForm({ ...editForm, ai_prompt: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditItem(null)}>Cancel</Button>
              <Button onClick={handleSaveEdit}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
