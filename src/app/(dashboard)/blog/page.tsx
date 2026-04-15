"use client"

import { motion } from "framer-motion"

import { useState, useEffect } from "react"
import ReactMarkdown from "react-markdown"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import {
  ArrowLeft, Check, CheckCircle, Clock, Eye, FileText, MessageSquare,
  Send, Star, ThumbsDown, X, Lightbulb, Link2, Plus, Loader2,
  ChevronDown, ChevronUp, ImageIcon, RefreshCw, BarChart3,
  TrendingUp, PenTool, Sparkles, Hash, Type, AlignLeft
} from "lucide-react"
import { toast } from "sonner"

interface BlogPost {
  id: string; title: string; slug: string; content_markdown: string
  meta_description: string; target_keywords: string[]
  featured_image_url: string | null; estimated_read_time: number
  status: string; feedback: string | null; seo_score: number | null
  created_at: string; updated_at: string; published_at: string | null
}

interface BlogIdea {
  id: string; idea_text: string; reference_url: string | null
  status: string; created_at: string
}

const STATUS_TABS = ["pending_review", "draft", "approved", "published", "rejected"] as const
const STATUS_LABELS: Record<string, string> = {
  draft: "Draft", pending_review: "Pending Review", approved: "Approved",
  published: "Published", rejected: "Rejected"
}
const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground", pending_review: "bg-yellow-100 text-yellow-700",
  approved: "bg-green-100 text-green-700", published: "bg-blue-100 text-blue-700",
  rejected: "bg-red-100 text-red-700"
}
const IDEA_COLORS: Record<string, string> = {
  new: "bg-purple-100 text-purple-700", in_progress: "bg-yellow-100 text-yellow-700",
  written: "bg-green-100 text-green-700", dismissed: "bg-muted text-muted-foreground"
}

export default function BlogContentPage() {
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [ideas, setIdeas] = useState<BlogIdea[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<string>("pending_review")
  const [showIdeas, setShowIdeas] = useState(false)
  const [selectedPost, setSelectedPost] = useState<BlogPost | null>(null)
  const [feedbackText, setFeedbackText] = useState("")
  const [showFeedback, setShowFeedback] = useState(false)
  const [showSeo, setShowSeo] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [ideaText, setIdeaText] = useState("")
  const [ideaUrl, setIdeaUrl] = useState("")
  const [submittingIdea, setSubmittingIdea] = useState(false)

  const fetchPosts = async () => {
    try {
      const res = await fetch("/api/blog-posts")
      const json = await res.json()
      setPosts(json.data || [])
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }

  const fetchIdeas = async () => {
    try {
      const res = await fetch("/api/blog-posts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "list_ideas" })
      })
      const json = await res.json()
      setIdeas(json.data || [])
    } catch (e) { console.error(e) }
  }

  useEffect(() => { fetchPosts(); fetchIdeas() }, [])

  const updatePost = async (id: string, updates: Record<string, unknown>) => {
    setUpdating(true)
    try {
      const res = await fetch("/api/blog-posts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", id, ...updates })
      })
      const json = await res.json()
      if (json.data) {
        setPosts(prev => prev.map(p => p.id === id ? json.data : p))
        if (selectedPost?.id === id) setSelectedPost(json.data)
        toast.success("Updated!")
      }
    } catch (e) { console.error(e) } finally { setUpdating(false) }
  }

  const submitIdea = async () => {
    if (!ideaText.trim()) return toast.error("Write your idea first")
    setSubmittingIdea(true)
    try {
      const res = await fetch("/api/blog-posts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_idea", idea_text: ideaText, reference_url: ideaUrl || null })
      })
      const json = await res.json()
      if (json.data) {
        setIdeas(prev => [json.data, ...prev])
        setIdeaText(""); setIdeaUrl("")
        toast.success("Idea submitted! I'll write it up for you.")
      }
    } catch (e) { console.error(e) } finally { setSubmittingIdea(false) }
  }

  const handleApprove = (id: string) => updatePost(id, { status: "approved" })
  const handleReject = (id: string) => updatePost(id, { status: "rejected" })
  const handlePublish = (id: string) => updatePost(id, { status: "published" })
  const handleRequestChanges = (id: string) => {
    if (!feedbackText.trim()) return
    updatePost(id, { status: "draft", feedback: feedbackText })
    setFeedbackText(""); setShowFeedback(false)
  }

  const [showEditor, setShowEditor] = useState(false)
  const [editTitle, setEditTitle] = useState("")
  const [editContent, setEditContent] = useState("")
  const [editMeta, setEditMeta] = useState("")
  const [editKeywords, setEditKeywords] = useState("")
  const [editImage, setEditImage] = useState("")
  const [generatingImage, setGeneratingImage] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  const filtered = posts.filter(p => p.status === activeTab)
  const tabCounts = STATUS_TABS.reduce((acc, s) => {
    acc[s] = posts.filter(p => p.status === s).length; return acc
  }, {} as Record<string, number>)

  // Analytics
  const totalPosts = posts.length
  const publishedCount = posts.filter(p => p.status === "published").length
  const draftCount = posts.filter(p => p.status === "draft").length
  const avgSeo = posts.filter(p => p.seo_score).length > 0
    ? Math.round(posts.filter(p => p.seo_score).reduce((sum, p) => sum + (p.seo_score || 0), 0) / posts.filter(p => p.seo_score).length)
    : 0
  const thisMonth = posts.filter(p => {
    const d = new Date(p.created_at)
    const now = new Date()
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }).length

  // SEO score calculator for editor
  const calcSeoScore = () => {
    let score = 0
    if (editTitle.length > 20 && editTitle.length < 70) score += 15
    if (editMeta.length >= 120 && editMeta.length <= 160) score += 15
    if (editContent.split(/\s+/).length >= 800) score += 20
    if (editContent.includes("##")) score += 10
    if (editKeywords && editTitle.toLowerCase().includes(editKeywords.split(",")[0]?.trim().toLowerCase())) score += 15
    if (editImage) score += 10
    if (editContent.split(/\s+/).length >= 300) score += 15
    return Math.min(score, 100)
  }

  const generateImage = async () => {
    setGeneratingImage(true)
    const keywords = editKeywords || editTitle
    const searchTerms = keywords.split(",")[0]?.trim() || "business marketing"
    // Use picsum for reliable images (Unsplash source is deprecated)
    const imageUrl = `https://picsum.photos/seed/${encodeURIComponent(searchTerms.replace(/\s+/g, '-'))}/1200/630`
    setEditImage(imageUrl)
    setTimeout(() => setGeneratingImage(false), 800)
  }

  const startNewPost = () => {
    setEditTitle("")
    setEditContent("")
    setEditMeta("")
    setEditKeywords("")
    setEditImage("")
    setShowEditor(true)
    setShowPreview(false)
  }

  const saveNewPost = async () => {
    if (!editTitle.trim() || !editContent.trim()) return toast.error("Title and content required")
    setUpdating(true)
    try {
      const slug = editTitle.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').substring(0, 80)
      const wordCount = editContent.split(/\s+/).length
      const res = await fetch("/api/blog-posts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          title: editTitle,
          slug,
          content_markdown: editContent,
          meta_description: editMeta,
          target_keywords: editKeywords.split(",").map((k: string) => k.trim()).filter(Boolean),
          featured_image_url: editImage || null,
          estimated_read_time: Math.ceil(wordCount / 200),
          status: "draft",
          seo_score: calcSeoScore(),
        })
      })
      const json = await res.json()
      if (json.data) {
        setPosts(prev => [json.data, ...prev])
        setShowEditor(false)
        toast.success("Post saved as draft!")
      }
    } catch (e) { console.error(e); toast.error("Failed to save") } finally { setUpdating(false) }
  }

  // Selected post detail view — article-style preview
  if (selectedPost) {
    return (
      <div className="max-w-3xl mx-auto pb-24">
        <Button variant="ghost" className="mb-4 gap-2" onClick={() => { setSelectedPost(null); setShowFeedback(false); setShowSeo(false) }}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>

        {/* Featured Image / Hero */}
        {selectedPost.featured_image_url ? (
          <div className="relative rounded-2xl overflow-hidden mb-8">
            <img src={selectedPost.featured_image_url} alt="" className="w-full h-64 sm:h-80 object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
            <Badge className="absolute top-4 left-4 bg-card/90 text-foreground backdrop-blur-sm">
              {STATUS_LABELS[selectedPost.status]}
            </Badge>
          </div>
        ) : (
          <div className="relative rounded-2xl overflow-hidden mb-8 bg-gradient-to-br from-violet-500 to-indigo-600 h-48 sm:h-64 flex items-end p-8">
            <Badge className="absolute top-4 left-4 bg-card/20 text-primary-foreground backdrop-blur-sm border-white/30">
              {STATUS_LABELS[selectedPost.status]}
            </Badge>
            <h1 className="text-2xl sm:text-3xl font-bold text-primary-foreground leading-tight">{selectedPost.title}</h1>
          </div>
        )}

        {/* Title (if has image, show below) */}
        {selectedPost.featured_image_url && (
          <h1 className="text-2xl sm:text-3xl font-bold leading-tight mb-3">{selectedPost.title}</h1>
        )}

        {/* Author / Meta line */}
        <div className="flex items-center gap-3 text-sm text-muted-foreground mb-8 pb-6 border-b">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-primary-foreground text-xs font-bold">DC</div>
          <div>
            <span className="font-medium text-foreground">Dylan Clancy</span>
            <span className="mx-1.5">·</span>
            <span>Current</span>
          </div>
          <span className="mx-1">·</span>
          <span>{new Date(selectedPost.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
          <span className="mx-1">·</span>
          <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{selectedPost.estimated_read_time} min</span>
          {selectedPost.seo_score !== null && (
            <><span className="mx-1">·</span><span className="flex items-center gap-1"><Star className="h-3.5 w-3.5 text-yellow-500" />SEO {selectedPost.seo_score}</span></>
          )}
        </div>

        {/* Feedback banner */}
        {selectedPost.feedback && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6">
            <p className="text-xs font-semibold text-yellow-700 uppercase mb-1">Your Feedback</p>
            <p className="text-sm text-yellow-800">{selectedPost.feedback}</p>
          </div>
        )}

        {/* Article Content */}
        <article className="max-w-none space-y-6">
          <ReactMarkdown
            components={{
              h2: ({ children }) => (
                <h2 className="text-2xl font-bold tracking-tight mt-12 mb-4 pb-2 border-b border-border/30">{children}</h2>
              ),
              h3: ({ children }) => (
                <h3 className="text-xl font-bold mt-8 mb-3">{children}</h3>
              ),
              p: ({ children }) => (
                <p className="text-base md:text-lg leading-relaxed text-foreground mb-4">{children}</p>
              ),
              strong: ({ children }) => (
                <strong className="text-foreground font-semibold">{children}</strong>
              ),
              blockquote: ({ children }) => (
                <div className="bg-violet-50 border-l-4 border-violet-500 rounded-r-xl p-5 my-6">
                  <div className="text-foreground text-base [&>p]:mb-0 [&>p]:text-foreground">{children}</div>
                </div>
              ),
              ul: ({ children }) => (
                <ul className="space-y-2 my-4 ml-1">{children}</ul>
              ),
              ol: ({ children }) => (
                <ol className="space-y-2 my-4 ml-1 list-decimal list-inside">{children}</ol>
              ),
              li: ({ children }) => (
                <li className="text-base md:text-lg text-foreground leading-relaxed flex gap-2">
                  <span className="text-violet-500 mt-1.5 shrink-0">•</span>
                  <span>{children}</span>
                </li>
              ),
              hr: () => (
                <div className="my-10 flex items-center justify-center gap-2">
                  <div className="h-1 w-1 rounded-full bg-gray-300" />
                  <div className="h-1 w-1 rounded-full bg-gray-300" />
                  <div className="h-1 w-1 rounded-full bg-gray-300" />
                </div>
              ),
              a: ({ href, children }) => (
                <a href={href} target="_blank" rel="noopener" className="text-violet-600 font-medium underline decoration-violet-300 underline-offset-2 hover:decoration-violet-500 transition-colors">{children}</a>
              ),
              img: ({ src, alt }) => (
                <div className="my-8 rounded-xl overflow-hidden shadow-sm">
                  <img src={src} alt={alt || ""} className="w-full" />
                  {alt && <p className="text-sm text-muted-foreground text-center py-2 bg-muted/30">{alt}</p>}
                </div>
              ),
            }}
          >{selectedPost.content_markdown}</ReactMarkdown>
        </article>

        {/* SEO Details (collapsible) */}
        <div className="mt-8 border rounded-xl">
          <button
            onClick={() => setShowSeo(!showSeo)}
            className="w-full flex items-center justify-between p-4 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <span>SEO Details</span>
            {showSeo ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {showSeo && (
            <div className="px-4 pb-4 space-y-3 border-t">
              <div className="pt-3">
                <p className="text-xs font-medium text-muted-foreground uppercase">Meta Description</p>
                <p className="text-sm mt-1">{selectedPost.meta_description || "—"}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase">Target Keywords</p>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {(selectedPost.target_keywords || []).map((kw, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">{kw}</Badge>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Feedback Input */}
        {showFeedback && (
          <div className="mt-6 border rounded-xl p-4">
            <p className="text-sm font-medium mb-2">What needs to change?</p>
            <Textarea placeholder="Tell me what to fix..." value={feedbackText} onChange={e => setFeedbackText(e.target.value)} rows={4} />
            <div className="flex gap-2 mt-3">
              <Button size="sm" onClick={() => handleRequestChanges(selectedPost.id)} disabled={!feedbackText.trim() || updating}>
                <Send className="h-3.5 w-3.5 mr-1" />Send
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowFeedback(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {/* Sticky Action Bar */}
        <div className="fixed bottom-0 left-0 right-0 bg-card/80 backdrop-blur-lg border-t p-4 flex gap-2 justify-center z-50">
          {(selectedPost.status === "pending_review" || selectedPost.status === "draft") && (
            <>
              <Button onClick={() => handleApprove(selectedPost.id)} disabled={updating} className="bg-green-600 hover:bg-green-700 gap-2">
                <CheckCircle className="h-4 w-4" />Approve
              </Button>
              <Button variant="outline" onClick={() => setShowFeedback(true)} disabled={updating} className="gap-2">
                <MessageSquare className="h-4 w-4" />Changes
              </Button>
              <Button variant="outline" onClick={() => handleReject(selectedPost.id)} disabled={updating} className="gap-2 text-red-600 border-red-200 hover:bg-red-50">
                <ThumbsDown className="h-4 w-4" />Reject
              </Button>
            </>
          )}
          {selectedPost.status === "approved" && (
            <Button onClick={() => handlePublish(selectedPost.id)} disabled={updating} className="bg-blue-600 hover:bg-blue-700 gap-2">
              <Send className="h-4 w-4" />Publish
            </Button>
          )}
        </div>
      </div>
    )
  }

  // Editor view
  if (showEditor) {
    const seoScore = calcSeoScore()
    const wordCount = editContent.split(/\s+/).filter(Boolean).length
    const keywordDensity = editKeywords && editContent
      ? ((editContent.toLowerCase().split(editKeywords.split(",")[0]?.trim().toLowerCase()).length - 1) / Math.max(wordCount, 1) * 100).toFixed(1)
      : "0.0"
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-5xl mx-auto pb-8">
        <Button variant="ghost" className="mb-4 gap-2" onClick={() => setShowEditor(false)}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2"><PenTool className="h-6 w-6 text-violet-500" />New Post</h1>
          <div className="flex items-center gap-3">
            <button onClick={() => setShowPreview(!showPreview)} className="text-sm text-violet-600 font-medium hover:underline">
              {showPreview ? "Edit" : "Preview"}
            </button>
            <Button onClick={saveNewPost} disabled={updating} className="bg-violet-600 hover:bg-violet-700 gap-2">
              {updating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Save Draft
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <Input placeholder="Post title..." value={editTitle} onChange={e => setEditTitle(e.target.value)} className="text-lg font-semibold h-12" />
            {!showPreview ? (
              <Textarea placeholder="Write your post in Markdown..." value={editContent} onChange={e => setEditContent(e.target.value)} rows={20} className="font-mono text-sm" />
            ) : (
              <Card><CardContent className="pt-6 prose prose-sm max-w-none">
                <ReactMarkdown>{editContent}</ReactMarkdown>
              </CardContent></Card>
            )}
          </div>

          <div className="space-y-4">
            {/* SEO Score Ring */}
            <Card>
              <CardContent className="pt-6 text-center">
                <div className="relative w-24 h-24 mx-auto mb-3">
                  <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="42" fill="none" stroke="#e5e7eb" strokeWidth="8" />
                    <circle cx="50" cy="50" r="42" fill="none"
                      stroke={seoScore >= 80 ? "#10B981" : seoScore >= 50 ? "#F59E0B" : "#EF4444"}
                      strokeWidth="8" strokeLinecap="round"
                      strokeDasharray={`${seoScore * 2.64} 264`} />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-2xl font-bold">{seoScore}</span>
                  </div>
                </div>
                <p className="text-sm font-medium text-muted-foreground">SEO Score</p>
              </CardContent>
            </Card>

            {/* Meta */}
            <Card>
              <CardContent className="pt-4 space-y-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1"><AlignLeft className="h-3 w-3" />Meta Description</label>
                  <Textarea placeholder="155 characters max..." value={editMeta} onChange={e => setEditMeta(e.target.value)} rows={3} className="mt-1 text-sm" />
                  <p className={`text-xs mt-1 ${editMeta.length >= 120 && editMeta.length <= 160 ? "text-green-600" : "text-muted-foreground"}`}>{editMeta.length}/160</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Hash className="h-3 w-3" />Keywords (comma-separated)</label>
                  <Input placeholder="seo, marketing, nyc..." value={editKeywords} onChange={e => setEditKeywords(e.target.value)} className="mt-1 text-sm" />
                  {editKeywords && <p className="text-xs mt-1 text-muted-foreground">Density: {keywordDensity}%</p>}
                </div>
              </CardContent>
            </Card>

            {/* Featured Image */}
            <Card>
              <CardContent className="pt-4 space-y-3">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1"><ImageIcon className="h-3 w-3" />Featured Image</label>
                {editImage ? (
                  <div className="relative rounded-lg overflow-hidden">
                    <img src={editImage} alt="" className="w-full h-32 object-cover" />
                    <button onClick={() => setEditImage("")} className="absolute top-2 right-2 bg-black/50 rounded-full p-1 text-white hover:bg-black/70">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <div className="border-2 border-dashed rounded-lg p-6 text-center">
                    <ImageIcon className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                    <p className="text-xs text-muted-foreground">No image yet</p>
                  </div>
                )}
                <Button variant="outline" size="sm" onClick={generateImage} disabled={generatingImage} className="w-full gap-2">
                  {generatingImage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  Generate Image
                </Button>
                <Input placeholder="Or paste image URL..." value={editImage} onChange={e => setEditImage(e.target.value)} className="text-xs" />
              </CardContent>
            </Card>

            {/* Stats */}
            <Card>
              <CardContent className="pt-4">
                <div className="grid grid-cols-2 gap-3 text-center">
                  <div><p className="text-lg font-bold">{wordCount}</p><p className="text-xs text-muted-foreground">Words</p></div>
                  <div><p className="text-lg font-bold">{Math.ceil(wordCount / 200)}</p><p className="text-xs text-muted-foreground">Min read</p></div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </motion.div>
    )
  }

  // Main list view
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="max-w-5xl mx-auto space-y-6 pb-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-violet-500" />
          <h1 className="text-2xl font-bold">Content</h1>
        </div>
        <Button onClick={startNewPost} className="bg-violet-600 hover:bg-violet-700 gap-2">
          <Plus className="h-4 w-4" />New Post
        </Button>
      </div>

      {/* Analytics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Total Posts", value: totalPosts, icon: FileText, color: "#8B5CF6" },
          { label: "Published", value: publishedCount, icon: CheckCircle, color: "#10B981" },
          { label: "This Month", value: thisMonth, icon: TrendingUp, color: "#0066FF" },
          { label: "Avg SEO Score", value: avgSeo, icon: Star, color: "#F59E0B" },
        ].map((stat) => {
          const StatIcon = stat.icon
          return (
            <motion.div key={stat.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border bg-white p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${stat.color}15` }}>
                <StatIcon className="w-5 h-5" style={{ color: stat.color }} />
              </div>
              <div>
                <p className="text-xl font-bold">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Tabs — status + ideas */}
      <div className="flex gap-1 overflow-x-auto pb-2 mb-6 -mx-1 px-1">
        {STATUS_TABS.map(tab => (
          <button key={tab} onClick={() => { setActiveTab(tab); setShowIdeas(false) }}
            className={`px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
              activeTab === tab && !showIdeas ? "bg-violet-600 text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted"
            }`}>
            {STATUS_LABELS[tab]}
            {tabCounts[tab] > 0 && <span className="ml-1.5 bg-card/20 rounded-full px-1.5 py-0.5 text-xs">{tabCounts[tab]}</span>}
          </button>
        ))}
        <button onClick={() => setShowIdeas(true)}
          className={`px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all flex items-center gap-1.5 ${
            showIdeas ? "bg-violet-600 text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted"
          }`}>
          <Lightbulb className="h-3.5 w-3.5" />Ideas
          {ideas.filter(i => i.status === "new").length > 0 && (
            <span className="bg-card/20 rounded-full px-1.5 py-0.5 text-xs">{ideas.filter(i => i.status === "new").length}</span>
          )}
        </button>
      </div>

      {/* Ideas Tab */}
      {showIdeas && (
        <div className="space-y-6">
          <Card>
            <CardContent className="pt-6 space-y-4">
              <h3 className="font-semibold text-lg">💡 Submit a Blog Idea</h3>
              <Textarea
                placeholder="What should we write about? Describe your idea, share a topic, or paste something that inspired you..."
                value={ideaText} onChange={e => setIdeaText(e.target.value)} rows={3}
                className="text-base"
              />
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-muted-foreground shrink-0" />
                <Input placeholder="Reference link (optional)" value={ideaUrl} onChange={e => setIdeaUrl(e.target.value)} />
              </div>
              <Button onClick={submitIdea} disabled={submittingIdea || !ideaText.trim()} className="w-full gap-2 bg-violet-600 hover:bg-violet-700">
                {submittingIdea ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Submit Idea
              </Button>
            </CardContent>
          </Card>

          {ideas.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase">Your Ideas</h3>
              {ideas.map(idea => (
                <Card key={idea.id}>
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className="text-sm">{idea.idea_text}</p>
                        {idea.reference_url && (
                          <a href={idea.reference_url} target="_blank" rel="noopener" className="text-xs text-violet-600 flex items-center gap-1 mt-1.5">
                            <Link2 className="h-3 w-3" />{idea.reference_url}
                          </a>
                        )}
                        <p className="text-xs text-muted-foreground mt-2">{new Date(idea.created_at).toLocaleDateString()}</p>
                      </div>
                      <Badge className={IDEA_COLORS[idea.status] || "bg-muted text-muted-foreground"}>{idea.status.replace("_", " ")}</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Posts Grid */}
      {!showIdeas && (
        <>
          {loading ? (
            <div className="text-center py-12"><Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>No {STATUS_LABELS[activeTab].toLowerCase()} posts</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {filtered.map(post => (
                <Card key={post.id} className="cursor-pointer hover:shadow-lg transition-all group overflow-hidden" onClick={() => setSelectedPost(post)}>
                  {post.featured_image_url && (
                    <div className="h-40 overflow-hidden">
                      <img src={post.featured_image_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    </div>
                  )}
                  <CardContent className={post.featured_image_url ? "pt-4" : "pt-6"}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-bold text-base line-clamp-2 group-hover:text-violet-600 transition-colors">{post.title}</h3>
                      <Badge className={`${STATUS_COLORS[post.status]} shrink-0 text-[10px]`}>{STATUS_LABELS[post.status]}</Badge>
                    </div>
                    {post.meta_description && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{post.meta_description}</p>
                    )}
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {(post.target_keywords || []).slice(0, 3).map((kw, i) => (
                        <Badge key={i} variant="outline" className="text-[10px] px-1.5">{kw}</Badge>
                      ))}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{post.estimated_read_time} min</span>
                      <span>{new Date(post.created_at).toLocaleDateString()}</span>
                      {post.seo_score !== null && <span className="flex items-center gap-1"><Star className="h-3 w-3 text-yellow-500" />{post.seo_score}</span>}
                    </div>
                    {post.feedback && (
                      <div className="mt-3 text-xs text-yellow-700 bg-yellow-50 rounded-lg px-3 py-2 line-clamp-1">💬 {post.feedback}</div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </motion.div>
  )
}
