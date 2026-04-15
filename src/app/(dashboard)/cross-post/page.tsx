"use client"

import { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { AnimatedNumber, PageTransition } from "@/components/motion"
import { toast } from "sonner"
import {
  Share2, Plus, Send, Clock, Check, X, Trash2, ExternalLink,
  Image, Video, Calendar, Globe, RefreshCw, Eye, Upload,
  Instagram, Youtube, Facebook, Linkedin, Twitter,
} from "lucide-react"

interface CrossPost {
  id: string
  content: string
  media_url: string | null
  platforms: string[]
  schedule_at: string | null
  status: string
  created_at: string
  cross_post_results?: CrossPostResult[]
}

interface CrossPostResult {
  id: string
  cross_post_id: string
  platform: string
  status: string
  platform_post_id: string | null
  error_message: string | null
  sent_at: string | null
}

const PLATFORMS = [
  { id: "tiktok", name: "TikTok", icon: "🎵", color: "bg-pink-500/10 text-pink-400 border-pink-500/30" },
  { id: "youtube", name: "YouTube", icon: "▶️", color: "bg-red-500/10 text-red-400 border-red-500/30" },
  { id: "instagram", name: "Instagram", icon: "📸", color: "bg-purple-500/10 text-purple-400 border-purple-500/30" },
  { id: "facebook", name: "Facebook", icon: "👤", color: "bg-blue-500/10 text-blue-400 border-blue-500/30" },
  { id: "linkedin", name: "LinkedIn", icon: "💼", color: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30" },
  { id: "pinterest", name: "Pinterest", icon: "📌", color: "bg-red-500/10 text-red-300 border-red-500/30" },
  { id: "reddit", name: "Reddit", icon: "🤖", color: "bg-orange-500/10 text-orange-400 border-orange-500/30" },
  { id: "twitter", name: "X / Twitter", icon: "𝕏", color: "bg-zinc-500/10 text-zinc-300 border-zinc-500/30" },
  { id: "threads", name: "Threads", icon: "🧵", color: "bg-zinc-500/10 text-zinc-400 border-zinc-500/30" },
  { id: "bluesky", name: "Bluesky", icon: "🦋", color: "bg-sky-500/10 text-sky-400 border-sky-500/30" },
]

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
  scheduled: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  sending: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  sent: "bg-green-500/20 text-green-400 border-green-500/30",
  partial: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  failed: "bg-red-500/20 text-red-400 border-red-500/30",
  pending: "bg-blue-500/20 text-blue-400 border-blue-500/30",
}

export default function CrossPostPage() {
  const [posts, setPosts] = useState<CrossPost[]>([])
  const [loading, setLoading] = useState(true)
  const [showCompose, setShowCompose] = useState(false)

  // Compose state
  const [content, setContent] = useState("")
  const [mediaUrl, setMediaUrl] = useState("")
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([])
  const [scheduleDate, setScheduleDate] = useState("")
  const [sending, setSending] = useState(false)

  const totalPosts = posts.length
  const sentPosts = posts.filter(p => p.status === "sent").length
  const scheduledPosts = posts.filter(p => p.status === "scheduled").length

  const fetchPosts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/cross-post")
      const data = await res.json()
      setPosts(data.data || [])
    } catch { toast.error("Failed to load posts") }
    setLoading(false)
  }, [])

  useEffect(() => { fetchPosts() }, [fetchPosts])

  const togglePlatform = (id: string) => {
    setSelectedPlatforms(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    )
  }

  const createAndSend = async (sendNow: boolean) => {
    if (!content.trim()) { toast.error("Content is required"); return }
    if (!selectedPlatforms.length) { toast.error("Select at least one platform"); return }

    setSending(true)
    try {
      // Create the post
      const createRes = await fetch("/api/cross-post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          media_url: mediaUrl || null,
          platforms: selectedPlatforms,
          schedule_at: !sendNow && scheduleDate ? new Date(scheduleDate).toISOString() : null,
        }),
      })
      const createData = await createRes.json()

      if (sendNow && createData.data?.id) {
        // Send immediately
        const sendRes = await fetch("/api/cross-post/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cross_post_id: createData.data.id }),
        })
        const sendData = await sendRes.json()
        const successes = sendData.results?.filter((r: any) => r.status === "sent").length || 0
        const failures = sendData.results?.filter((r: any) => r.status === "failed").length || 0
        
        if (failures === 0) toast.success(`Posted to ${successes} platform${successes > 1 ? "s" : ""}!`)
        else toast.warning(`${successes} sent, ${failures} failed`)
      } else {
        toast.success(scheduleDate ? "Post scheduled!" : "Post saved as draft!")
      }

      // Reset form
      setContent(""); setMediaUrl(""); setSelectedPlatforms([]); setScheduleDate("")
      setShowCompose(false)
      fetchPosts()
    } catch { toast.error("Failed to create post") }
    setSending(false)
  }

  const deletePost = async (id: string) => {
    await fetch(`/api/cross-post?id=${id}`, { method: "DELETE" })
    setPosts(prev => prev.filter(p => p.id !== id))
    toast.success("Post deleted")
  }

  const resendPost = async (postId: string) => {
    setSending(true)
    try {
      const res = await fetch("/api/cross-post/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cross_post_id: postId }),
      })
      const data = await res.json()
      toast.success("Resending...")
      fetchPosts()
    } catch { toast.error("Resend failed") }
    setSending(false)
  }

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <div className="rounded-xl bg-pink-500/10 p-2.5">
                <Share2 className="h-7 w-7 text-pink-400" />
              </div>
              Cross-Post
            </h1>
            <p className="text-muted-foreground mt-1">Distribute content across all platforms at once</p>
          </div>
          <Button onClick={() => setShowCompose(true)} className="gap-2">
            <Plus className="h-4 w-4" /> New Post
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total Posts", value: totalPosts, icon: Share2, color: "text-pink-400", bg: "bg-pink-500/10" },
            { label: "Sent", value: sentPosts, icon: Check, color: "text-green-400", bg: "bg-green-500/10" },
            { label: "Scheduled", value: scheduledPosts, icon: Clock, color: "text-blue-400", bg: "bg-blue-500/10" },
          ].map((stat, i) => (
            <motion.div key={stat.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card className="border-border/50 bg-card/60 backdrop-blur-xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                    <p className={`text-2xl font-bold mt-1 ${stat.color}`}><AnimatedNumber value={stat.value} /></p>
                  </div>
                  <div className={`rounded-xl p-2.5 ${stat.bg}`}>
                    <stat.icon className={`h-5 w-5 ${stat.color}`} />
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Compose Modal */}
        <AnimatePresence>
          {showCompose && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}>
              <Card className="border-border/50 bg-card/60 backdrop-blur-xl p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Compose Post</h2>
                  <Button variant="ghost" size="sm" onClick={() => setShowCompose(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                {/* Content */}
                <div>
                  <Label>Content</Label>
                  <Textarea
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    placeholder="Write your post content here..."
                    className="mt-1 min-h-[120px]"
                  />
                  <p className="text-xs text-muted-foreground mt-1">{content.length} characters</p>
                </div>

                {/* Media URL */}
                <div>
                  <Label>Media URL (optional)</Label>
                  <div className="flex gap-2 mt-1">
                    <Input value={mediaUrl} onChange={e => setMediaUrl(e.target.value)} placeholder="https://example.com/image.jpg" />
                  </div>
                </div>

                {/* Platform Selector */}
                <div>
                  <Label>Select Platforms</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 mt-2">
                    {PLATFORMS.map(platform => {
                      const isSelected = selectedPlatforms.includes(platform.id)
                      return (
                        <button
                          key={platform.id}
                          onClick={() => togglePlatform(platform.id)}
                          className={`
                            flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium border transition-all duration-200
                            ${isSelected
                              ? platform.color + " shadow-sm"
                              : "border-border/30 text-muted-foreground hover:bg-muted/30"
                            }
                          `}
                        >
                          <span className="text-base">{platform.icon}</span>
                          <span className="truncate text-xs">{platform.name}</span>
                          {isSelected && <Check className="h-3 w-3 ml-auto shrink-0" />}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Preview */}
                {content && selectedPlatforms.length > 0 && (
                  <div>
                    <Label className="flex items-center gap-2"><Eye className="h-3.5 w-3.5" /> Preview</Label>
                    <div className="grid gap-2 mt-2 md:grid-cols-2">
                      {selectedPlatforms.map(pid => {
                        const plat = PLATFORMS.find(p => p.id === pid)
                        const charLimit = pid === "twitter" ? 280 : pid === "linkedin" ? 3000 : 2200
                        const truncated = content.length > charLimit
                        return (
                          <Card key={pid} className="border-border/30 bg-muted/20 p-3">
                            <div className="flex items-center gap-2 mb-2">
                              <span>{plat?.icon}</span>
                              <span className="text-xs font-medium">{plat?.name}</span>
                              {truncated && <Badge variant="destructive" className="text-[9px]">Exceeds limit ({charLimit})</Badge>}
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-3">{content}</p>
                            {mediaUrl && (
                              <div className="mt-2 rounded-lg bg-muted/30 h-16 flex items-center justify-center text-xs text-muted-foreground">
                                <Image className="h-4 w-4 mr-1" /> Media attached
                              </div>
                            )}
                          </Card>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Schedule */}
                <div>
                  <Label>Schedule (optional)</Label>
                  <Input
                    type="datetime-local"
                    value={scheduleDate}
                    onChange={e => setScheduleDate(e.target.value)}
                    className="mt-1 w-auto"
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <Button onClick={() => createAndSend(true)} disabled={sending} className="gap-2 flex-1">
                    <Send className="h-4 w-4" /> {sending ? "Sending..." : "Post Now"}
                  </Button>
                  <Button variant="outline" onClick={() => createAndSend(false)} disabled={sending} className="gap-2">
                    <Calendar className="h-4 w-4" /> {scheduleDate ? "Schedule" : "Save Draft"}
                  </Button>
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Post History */}
        <div>
          <h2 className="text-lg font-semibold mb-3">Post History</h2>
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : posts.length === 0 ? (
            <Card className="p-12 text-center border-border/50 bg-card/60 backdrop-blur-xl">
              <Share2 className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">No posts yet. Create your first cross-post!</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {posts.map((post, i) => (
                <motion.div key={post.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                  <Card className="border-border/50 bg-card/60 backdrop-blur-xl p-5 hover:border-border/80 transition-all">
                    <div className="flex items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge className={STATUS_COLORS[post.status]}>{post.status}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(post.created_at).toLocaleString()}
                          </span>
                          {post.schedule_at && (
                            <span className="text-xs text-blue-400 flex items-center gap-1">
                              <Clock className="h-3 w-3" /> Scheduled: {new Date(post.schedule_at).toLocaleString()}
                            </span>
                          )}
                        </div>
                        <p className="text-sm mb-3 line-clamp-2">{post.content}</p>
                        
                        {/* Platform Results */}
                        <div className="flex flex-wrap gap-1.5">
                          {post.platforms?.map(pid => {
                            const plat = PLATFORMS.find(p => p.id === pid)
                            const result = post.cross_post_results?.find(r => r.platform === pid)
                            const resultStatus = result?.status || "pending"
                            return (
                              <Badge key={pid} variant="outline" className={`text-[10px] gap-1 ${STATUS_COLORS[resultStatus] || ""}`}>
                                <span>{plat?.icon}</span>
                                {plat?.name}
                                {resultStatus === "sent" && <Check className="h-2.5 w-2.5" />}
                                {resultStatus === "failed" && <X className="h-2.5 w-2.5" />}
                              </Badge>
                            )
                          })}
                        </div>

                        {/* Error Messages */}
                        {post.cross_post_results?.filter(r => r.error_message).map(r => (
                          <p key={r.id} className="text-xs text-red-400 mt-1">
                            {PLATFORMS.find(p => p.id === r.platform)?.name}: {r.error_message}
                          </p>
                        ))}
                      </div>

                      <div className="flex gap-1.5 shrink-0">
                        {(post.status === "draft" || post.status === "failed" || post.status === "partial") && (
                          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => resendPost(post.id)} disabled={sending}>
                            <Send className="h-3.5 w-3.5" /> Send
                          </Button>
                        )}
                        <Button size="sm" variant="outline" className="text-red-400 hover:bg-red-500/10" onClick={() => deletePost(post.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </PageTransition>
  )
}
