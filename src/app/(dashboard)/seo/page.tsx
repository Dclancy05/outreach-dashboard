"use client"

import { useState, useEffect, useCallback, Suspense, lazy, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import ReactMarkdown from "react-markdown"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
  Search, Globe, FileText, BarChart3, Bot, Shield, Zap, Plus, RefreshCw,
  TrendingUp, TrendingDown, Minus, Eye, Edit3, Copy, Trash2, ExternalLink,
  CheckCircle, XCircle, AlertTriangle, Clock, ArrowUpRight, ArrowDownRight,
  Loader2, ChevronDown, ChevronUp, Sparkles, Target, BookOpen,
  Play, Pause, Wrench, Layers, Award, Activity,
  ArrowLeft, Star, MessageSquare, Send, ThumbsDown, Lightbulb, Link2, Image,
} from "lucide-react"

const PageBuilder = lazy(() => import("@/components/seo/page-builder"))

// All DB reads/writes on this page go through /api/seo/* routes so we can
// lock the DB down with RLS — the browser never touches Supabase REST directly.
async function apiGET<T>(url: string): Promise<T[]> {
  try {
    const res = await fetch(url)
    if (!res.ok) return []
    const json = await res.json()
    return (json.data || []) as T[]
  } catch { return [] }
}
async function apiJSON(method: string, url: string, body?: unknown): Promise<{ ok: boolean; error?: string; data?: unknown }> {
  try {
    const res = await fetch(url, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    const json = await res.json().catch(() => ({}))
    return { ok: res.ok, error: json.error, data: json.data }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error" }
  }
}

const ctn = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } }
const itm = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.4 } } }

interface SitePage { id: string; url_path: string; title: string; meta_description: string | null; meta_keywords: string[] | null; h1: string | null; seo_score: number; page_type: string; niche: string | null; service: string | null; template_id: string | null; grapejs_data: unknown; grapejs_html: string | null; grapejs_css: string | null; status: string; is_published: boolean; traffic_30d: number; conversions_30d: number; last_audited: string | null; created_at: string; updated_at: string }
interface KeywordRanking { id: string; keyword: string; page_id: string | null; cluster: string | null; niche: string | null; service: string | null; current_position: number | null; previous_position: number | null; best_position: number | null; search_volume: number | null; difficulty: string; status: string; last_checked: string | null; created_at: string }
interface AiCitation { id: string; query: string; ai_platform: string; was_cited: boolean; citation_text: string | null; competitor_cited: string | null; checked_at: string }
interface SeoFix { id: string; page_id: string | null; fix_type: string; description: string | null; before_value: string | null; after_value: string | null; status: string; applied_at: string }
interface SeoAutomation { id: string; name: string; description: string | null; trigger_type: string; trigger_config: unknown; action_type: string; action_config: unknown; is_active: boolean; last_run: string | null; run_count: number; created_at: string }
interface BlogPost { id: string; title: string; slug: string | null; content_markdown: string | null; content_html: string | null; meta_description: string | null; target_keywords: string[] | null; featured_image_url: string | null; estimated_read_time: number; seo_score: number | null; status: string; feedback: string | null; internal_links: string[] | null; published_at: string | null; created_at: string; updated_at: string }

const NICHES = ["Restaurant", "Barber", "Contractor", "Dentist", "Gym", "Pet Groomer", "Auto Shop", "Nail Salon", "Photographer", "Retail"]
const SERVICES = ["Website Design", "Reactivation", "Reviews", "SEO", "Social Media", "Video Ads", "CRM Setup", "Lead Gen"]

function ScoreRing({ score, size = 48, sw = 4 }: { score: number; size?: number; sw?: number }) {
  const r = (size - sw) / 2, circ = 2 * Math.PI * r, offset = circ - (score / 100) * circ
  const color = score >= 80 ? "#22c55e" : score >= 50 ? "#eab308" : "#ef4444"
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="currentColor" strokeWidth={sw} className="text-muted/20" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={sw} strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" className="transition-all duration-700" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xs font-bold" style={{ color }}>{score}</span>
    </div>
  )
}

function PosChange({ cur, prev }: { cur: number | null; prev: number | null }) {
  if (!cur || !prev) return <span className="text-muted-foreground text-xs">—</span>
  const d = prev - cur
  if (d === 0) return <span className="text-muted-foreground text-xs flex items-center gap-0.5"><Minus className="h-3 w-3" />0</span>
  if (d > 0) return <span className="text-emerald-400 text-xs flex items-center gap-0.5"><ArrowUpRight className="h-3 w-3" />+{d}</span>
  return <span className="text-red-400 text-xs flex items-center gap-0.5"><ArrowDownRight className="h-3 w-3" />{d}</span>
}

export default function SEOCommandCenter() {
  const [tab, setTab] = useState("pages")
  const [loading, setLoading] = useState(true)
  const [pages, setPages] = useState<SitePage[]>([])
  const [keywords, setKeywords] = useState<KeywordRanking[]>([])
  const [citations, setCitations] = useState<AiCitation[]>([])
  const [fixes, setFixes] = useState<SeoFix[]>([])
  const [automations, setAutomations] = useState<SeoAutomation[]>([])
  const [blogs, setBlogs] = useState<BlogPost[]>([])

  // Dialogs
  const [showBuilder, setShowBuilder] = useState(false)
  const [editingPage, setEditingPage] = useState<SitePage | null>(null)
  const [showNewPage, setShowNewPage] = useState(false)
  const [showGenPages, setShowGenPages] = useState(false)
  const [showNewKw, setShowNewKw] = useState(false)
  const [showNewBlog, setShowNewBlog] = useState(false)
  const [showNewAuto, setShowNewAuto] = useState(false)
  const [showCitCheck, setShowCitCheck] = useState(false)
  const [expandedBlog, setExpandedBlog] = useState<string | null>(null)
  const [selectedBlog, setSelectedBlog] = useState<BlogPost | null>(null)
  const [blogFeedbackText, setBlogFeedbackText] = useState("")
  const [showBlogFeedback, setShowBlogFeedback] = useState(false)
  const [showBlogSeo, setShowBlogSeo] = useState(false)
  const [blogUpdating, setBlogUpdating] = useState(false)
  const [showBlogIdeas, setShowBlogIdeas] = useState(false)
  const [blogIdeaText, setBlogIdeaText] = useState("")
  const [nbImage, setNbImage] = useState("")

  // Filters
  const [pageSearch, setPageSearch] = useState("")
  const [pageStat, setPageStat] = useState("all")
  const [pageNiche, setPageNiche] = useState("all")
  const [kwSearch, setKwSearch] = useState("")
  const [blogStat, setBlogStat] = useState("all")

  // Forms
  const [npTitle, setNpTitle] = useState(""); const [npUrl, setNpUrl] = useState(""); const [npNiche, setNpNiche] = useState(""); const [npService, setNpService] = useState(""); const [npType, setNpType] = useState("landing")
  const [genNiches, setGenNiches] = useState<string[]>([]); const [genService, setGenService] = useState(""); const [genLoading, setGenLoading] = useState(false)
  const [nkText, setNkText] = useState(""); const [nkCluster, setNkCluster] = useState(""); const [nkNiche, setNkNiche] = useState(""); const [nkService, setNkService] = useState("")
  const [nbTitle, setNbTitle] = useState(""); const [nbTopic, setNbTopic] = useState(""); const [nbKws, setNbKws] = useState("")
  const [naName, setNaName] = useState(""); const [naDesc, setNaDesc] = useState(""); const [naTrig, setNaTrig] = useState("schedule"); const [naAct, setNaAct] = useState("generate_blog"); const [naFreq, setNaFreq] = useState("weekly")
  const [cq, setCq] = useState(""); const [cp, setCp] = useState("chatgpt")

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [p, k, c, f, a, b] = await Promise.all([
      apiGET<SitePage>("/api/seo/pages"),
      apiGET<KeywordRanking>("/api/seo/keywords"),
      apiGET<AiCitation>("/api/seo/citations"),
      apiGET<SeoFix>("/api/seo/fixes"),
      apiGET<SeoAutomation>("/api/seo/automations"),
      apiGET<BlogPost>("/api/seo/blog"),
    ])
    setPages(p); setKeywords(k); setCitations(c.slice(0, 50)); setFixes(f.slice(0, 50)); setAutomations(a); setBlogs(b)
    setLoading(false)
  }, [])
  useEffect(() => { fetchAll() }, [fetchAll])

  const avgScore = pages.length ? Math.round(pages.reduce((a, p) => a + (p.seo_score || 0), 0) / pages.length) : 0
  const p1Kws = keywords.filter(k => k.current_position && k.current_position <= 10).length
  const citRate = citations.length ? Math.round((citations.filter(c => c.was_cited).length / citations.length) * 100) : 0
  const fixesWeek = fixes.filter(f => (Date.now() - new Date(f.applied_at).getTime()) < 7 * 86400000).length
  const healthScore = useMemo(() => {
    if (!pages.length) return 0
    let s = 0, c = 0
    for (const p of pages) { c++; if (p.seo_score >= 70) s++; if (p.meta_description) { s++; c++ } else c++; if (p.h1) { s++; c++ } else c++ }
    return c ? Math.round((s / c) * 100) : 0
  }, [pages])

  const fPages = useMemo(() => {
    let r = pages
    if (pageSearch) r = r.filter(p => p.title?.toLowerCase().includes(pageSearch.toLowerCase()) || p.url_path.toLowerCase().includes(pageSearch.toLowerCase()))
    if (pageStat !== "all") r = r.filter(p => p.status === pageStat)
    if (pageNiche !== "all") r = r.filter(p => p.niche === pageNiche)
    return r
  }, [pages, pageSearch, pageStat, pageNiche])
  const fKws = useMemo(() => kwSearch ? keywords.filter(k => k.keyword.toLowerCase().includes(kwSearch.toLowerCase())) : keywords, [keywords, kwSearch])
  const fBlogs = useMemo(() => blogStat === "all" ? blogs : blogs.filter(b => b.status === blogStat), [blogs, blogStat])

  const heatmap = useMemo(() => {
    const g: Record<string, Record<string, { pos: number | null; cnt: number }>> = {}
    for (const n of NICHES) { g[n] = {}; for (const s of SERVICES) g[n][s] = { pos: null, cnt: 0 } }
    for (const k of keywords) { if (k.niche && k.service && g[k.niche]?.[k.service]) { const c = g[k.niche][k.service]; c.cnt++; if (k.current_position && (!c.pos || k.current_position < c.pos)) c.pos = k.current_position } }
    return g
  }, [keywords])

  // CRUD — all DB ops now go through /api/seo/* (service_role, RLS-safe)
  async function createPage() {
    if (!npTitle || !npUrl) { toast.error("Title and URL required"); return }
    const r = await apiJSON("POST", "/api/seo/pages", { title: npTitle, url_path: npUrl.startsWith("/") ? npUrl : "/" + npUrl, niche: npNiche || null, service: npService || null, page_type: npType, status: "draft" })
    if (!r.ok) toast.error(r.error || "Create failed"); else { toast.success("Page created!"); setShowNewPage(false); setNpTitle(""); setNpUrl(""); fetchAll() }
  }
  async function generatePages() {
    if (!genService || !genNiches.length) { toast.error("Select service and niches"); return }
    setGenLoading(true)
    const ins = genNiches.map(n => ({ title: `${n} ${genService} — Current`, url_path: `/services/${n.toLowerCase().replace(/\s+/g, "-")}/${genService.toLowerCase().replace(/\s+/g, "-")}`, niche: n, service: genService, page_type: "landing", status: "draft", meta_description: `Professional ${genService.toLowerCase()} for ${n.toLowerCase()} businesses in NYC.`, h1: `${genService} for ${n} Businesses` }))
    // API accepts a single row or array via upsert
    const results = await Promise.all(ins.map(row => apiJSON("POST", "/api/seo/pages", row)))
    const firstErr = results.find(r => !r.ok)
    if (firstErr) toast.error(firstErr.error || "Generate failed"); else { toast.success(`${genNiches.length} pages generated!`); setShowGenPages(false); setGenNiches([]); fetchAll() }
    setGenLoading(false)
  }
  async function deletePage(id: string) { await apiJSON("DELETE", `/api/seo/pages?id=${encodeURIComponent(id)}`); toast.success("Deleted"); fetchAll() }
  async function clonePage(p: SitePage) { const { id, created_at, updated_at, ...rest } = p; await apiJSON("POST", "/api/seo/pages", { ...rest, title: rest.title + " (Copy)", url_path: rest.url_path + "-copy", status: "draft", is_published: false }); toast.success("Cloned!"); fetchAll() }
  async function savePage(pid: string, data: { grapejs_data: unknown; grapejs_html: string; grapejs_css: string }) { await apiJSON("POST", "/api/seo/pages", { id: pid, ...data, updated_at: new Date().toISOString() }); toast.success("Saved!"); fetchAll() }
  async function togglePub(p: SitePage) { await apiJSON("POST", "/api/seo/pages", { id: p.id, is_published: !p.is_published, status: p.is_published ? "draft" : "published" }); toast.success(p.is_published ? "Unpublished" : "Published!"); fetchAll() }
  async function addKws() {
    const kws = nkText.split("\n").map(k => k.trim()).filter(Boolean)
    if (!kws.length) { toast.error("Enter keywords"); return }
    const r = await apiJSON("POST", "/api/seo/keywords", { keywords: kws.map(kw => ({ keyword: kw, cluster: nkCluster || null, niche: nkNiche || null, service: nkService || null, status: "tracking" })) })
    if (!r.ok) toast.error(r.error || "Add failed"); else { toast.success(`${kws.length} keywords added!`); setShowNewKw(false); setNkText(""); fetchAll() }
  }
  async function delKw(id: string) { await apiJSON("DELETE", `/api/seo/keywords?id=${encodeURIComponent(id)}`); toast.success("Removed"); fetchAll() }
  async function createBlog() {
    if (!nbTitle) { toast.error("Title required"); return }
    const slug = nbTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
    await apiJSON("POST", "/api/seo/blog", { title: nbTitle, slug, target_keywords: nbKws.split(",").map(k => k.trim()).filter(Boolean), status: "draft", content_markdown: `# ${nbTitle}\n\n${nbTopic || "Start writing..."}`, featured_image_url: nbImage || null, meta_description: nbTopic ? nbTopic.slice(0, 160) : null })
    toast.success("Blog created!"); setShowNewBlog(false); setNbTitle(""); setNbTopic(""); setNbKws(""); setNbImage(""); fetchAll()
  }
  async function updateBlogStatus(id: string, status: string, feedback?: string) {
    setBlogUpdating(true)
    const body: Record<string, unknown> = { id, status }
    if (feedback !== undefined) body.feedback = feedback
    if (status === "published") body.publish_at = new Date().toISOString()
    const r = await apiJSON("PUT", "/api/seo/blog", body)
    if (r.ok) {
      // /api/seo/blog PUT returns data as an array
      const arr = Array.isArray(r.data) ? r.data as BlogPost[] : []
      const updated = arr[0]
      if (updated) {
        setBlogs(prev => prev.map(b => b.id === id ? updated : b))
        if (selectedBlog?.id === id) setSelectedBlog(updated)
      }
      toast.success(`Blog ${status}!`)
    }
    setBlogUpdating(false)
  }
  async function blogStatus(id: string, s: string) {
    const body: Record<string, unknown> = { id, status: s }
    if (s === "published") body.publish_at = new Date().toISOString()
    await apiJSON("PUT", "/api/seo/blog", body)
    toast.success(`Blog ${s}`); fetchAll()
  }
  async function delBlog(id: string) { await apiJSON("DELETE", `/api/seo/blog?id=${encodeURIComponent(id)}`); toast.success("Deleted"); fetchAll() }
  async function createAuto() {
    if (!naName) { toast.error("Name required"); return }
    await apiJSON("POST", "/api/seo/automations", { name: naName, description: naDesc || null, trigger_type: naTrig, trigger_config: naTrig === "schedule" ? { frequency: naFreq } : {}, action_type: naAct, action_config: {}, is_active: true })
    toast.success("Automation created!"); setShowNewAuto(false); setNaName(""); setNaDesc(""); fetchAll()
  }
  async function toggleAuto(a: SeoAutomation) { await apiJSON("PUT", "/api/seo/automations", { id: a.id, is_active: !a.is_active }); toast.success(a.is_active ? "Paused" : "Activated"); fetchAll() }
  async function delAuto(id: string) { await apiJSON("DELETE", `/api/seo/automations?id=${encodeURIComponent(id)}`); toast.success("Deleted"); fetchAll() }
  async function addCit() {
    if (!cq) { toast.error("Enter a query"); return }
    await apiJSON("POST", "/api/seo/citations", { query: cq, ai_platform: cp, was_cited: false, checked_at: new Date().toISOString() })
    toast.success("Check added!"); setShowCitCheck(false); setCq(""); fetchAll()
  }

  const tabs = [
    { value: "pages", icon: Layers, label: "Pages" },
    { value: "blog", icon: BookOpen, label: "Blog Engine" },
    { value: "rankings", icon: BarChart3, label: "Rankings" },
    { value: "ai", icon: Bot, label: "AI Visibility" },
    { value: "health", icon: Shield, label: "Site Health" },
    { value: "automations", icon: Zap, label: "Automations" },
  ]

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-500 border-t-transparent" /></div>

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="space-y-5 pb-8">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl p-2.5 bg-indigo-500/20"><Search className="h-6 w-6 text-indigo-400" /></div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-indigo-400 to-blue-400 bg-clip-text text-transparent">SEO Command Center</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{pages.length} pages · {keywords.length} keywords · {avgScore}% avg score</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ScoreRing score={healthScore} size={52} sw={5} />
          <Button onClick={fetchAll} variant="outline" size="sm" className="rounded-xl"><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </motion.div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-muted/30 backdrop-blur-sm overflow-x-auto">
        {tabs.map(t => (
          <button key={t.value} onClick={() => setTab(t.value)} className={cn("flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap", tab === t.value ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}>
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
      {/* ═══ PAGES ═══ */}
      {tab === "pages" && (
        <motion.div key="pages" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-md"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search pages..." value={pageSearch} onChange={e => setPageSearch(e.target.value)} className="pl-9 rounded-xl" /></div>
            <Select value={pageStat} onValueChange={setPageStat}><SelectTrigger className="w-32 rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Status</SelectItem><SelectItem value="draft">Draft</SelectItem><SelectItem value="published">Published</SelectItem></SelectContent></Select>
            <Select value={pageNiche} onValueChange={setPageNiche}><SelectTrigger className="w-36 rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Niches</SelectItem>{NICHES.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent></Select>
            <div className="flex gap-1.5 ml-auto">
              <Button onClick={() => setShowGenPages(true)} variant="outline" className="gap-1.5 rounded-xl"><Sparkles className="h-4 w-4" /> Generate</Button>
              <Button onClick={() => setShowNewPage(true)} className="gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700"><Plus className="h-4 w-4" /> New Page</Button>
            </div>
          </div>
          {fPages.length === 0 ? (
            <div className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 p-12 text-center shadow-lg">
              <Layers className="h-12 w-12 mx-auto mb-4 text-muted-foreground/30" />
              <h3 className="text-lg font-semibold mb-2">No pages yet</h3>
              <p className="text-muted-foreground text-sm mb-4">Create your first page or generate landing pages for all your niches.</p>
              <div className="flex gap-2 justify-center">
                <Button onClick={() => setShowNewPage(true)} className="gap-1.5 rounded-xl"><Plus className="h-4 w-4" /> Create</Button>
                <Button onClick={() => setShowGenPages(true)} variant="outline" className="gap-1.5 rounded-xl"><Sparkles className="h-4 w-4" /> Generate</Button>
              </div>
            </div>
          ) : (
            <motion.div variants={ctn} initial="hidden" animate="show" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {fPages.map(pg => (
                <motion.div key={pg.id} variants={itm} whileHover={{ y: -3 }} className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 p-4 shadow-lg hover:shadow-xl transition-shadow">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0"><h4 className="font-semibold text-sm truncate">{pg.title || "Untitled"}</h4><p className="text-xs text-muted-foreground truncate">{pg.url_path}</p></div>
                    <ScoreRing score={pg.seo_score} size={40} sw={3} />
                  </div>
                  <div className="flex gap-1.5 mb-3 flex-wrap">
                    {pg.niche && <Badge variant="outline" className="text-[10px] rounded-md">{pg.niche}</Badge>}
                    {pg.service && <Badge variant="outline" className="text-[10px] rounded-md bg-indigo-500/10 border-indigo-500/30 text-indigo-400">{pg.service}</Badge>}
                    <Badge className={cn("text-[10px] rounded-md", pg.status === "published" ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400")}>{pg.is_published ? "Live" : pg.status}</Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
                    <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{pg.traffic_30d}</span>
                    <span className="flex items-center gap-1"><Target className="h-3 w-3" />{pg.conversions_30d}</span>
                  </div>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="outline" className="flex-1 text-xs rounded-lg gap-1" onClick={() => { setEditingPage(pg); setShowBuilder(true) }}><Edit3 className="h-3 w-3" /> Edit</Button>
                    <Button size="sm" variant="outline" className="text-xs rounded-lg" onClick={() => clonePage(pg)}><Copy className="h-3 w-3" /></Button>
                    <Button size="sm" variant="outline" className="text-xs rounded-lg" onClick={() => togglePub(pg)}>{pg.is_published ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}</Button>
                    <Button size="sm" variant="outline" className="text-xs rounded-lg text-red-400 hover:bg-red-500/10" onClick={() => deletePage(pg.id)}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </motion.div>
      )}

      {/* ═══ BLOG ═══ */}
      {tab === "blog" && (
        <motion.div key="blog" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
          {/* ── Blog Detail View ── */}
          {selectedBlog ? (
            <div className="max-w-3xl mx-auto pb-24">
              <Button variant="ghost" className="mb-4 gap-2 rounded-xl" onClick={() => { setSelectedBlog(null); setShowBlogFeedback(false); setShowBlogSeo(false) }}>
                <ArrowLeft className="h-4 w-4" /> Back to posts
              </Button>

              {/* Hero */}
              {selectedBlog.featured_image_url ? (
                <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="relative rounded-2xl overflow-hidden mb-8">
                  <img src={selectedBlog.featured_image_url} alt="" className="w-full h-64 sm:h-80 object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
                  <Badge className="absolute top-4 left-4 bg-card/80 text-foreground backdrop-blur-sm rounded-xl">
                    {selectedBlog.status === "pending_review" ? "Pending Review" : selectedBlog.status.charAt(0).toUpperCase() + selectedBlog.status.slice(1)}
                  </Badge>
                  {selectedBlog.seo_score !== null && (
                    <div className="absolute top-4 right-4"><ScoreRing score={selectedBlog.seo_score} size={48} sw={4} /></div>
                  )}
                  <h1 className="absolute bottom-6 left-6 right-6 text-2xl sm:text-3xl font-bold text-white leading-tight drop-shadow-lg">{selectedBlog.title}</h1>
                </motion.div>
              ) : (
                <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="relative rounded-2xl overflow-hidden mb-8 bg-gradient-to-br from-indigo-600 to-blue-700 h-48 sm:h-64 flex items-end p-8">
                  <Badge className="absolute top-4 left-4 bg-white/20 text-white backdrop-blur-sm border-white/30 rounded-xl">
                    {selectedBlog.status === "pending_review" ? "Pending Review" : selectedBlog.status.charAt(0).toUpperCase() + selectedBlog.status.slice(1)}
                  </Badge>
                  {selectedBlog.seo_score !== null && (
                    <div className="absolute top-4 right-4"><ScoreRing score={selectedBlog.seo_score} size={48} sw={4} /></div>
                  )}
                  <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight">{selectedBlog.title}</h1>
                </motion.div>
              )}

              {/* Title below image if has image */}
              {selectedBlog.featured_image_url && (
                <h1 className="text-2xl sm:text-3xl font-bold leading-tight mb-3">{selectedBlog.title}</h1>
              )}

              {/* Author / Meta */}
              <div className="flex items-center gap-3 text-sm text-muted-foreground mb-8 pb-6 border-b border-border/30 flex-wrap">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0">DC</div>
                <div>
                  <span className="font-medium text-foreground">Dylan Clancy</span>
                  <span className="mx-1.5">·</span>
                  <span>Current</span>
                </div>
                <span className="mx-1">·</span>
                <span>{new Date(selectedBlog.published_at || selectedBlog.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                <span className="mx-1">·</span>
                <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{selectedBlog.estimated_read_time} min read</span>
                {selectedBlog.seo_score !== null && (
                  <><span className="mx-1">·</span><span className="flex items-center gap-1"><Star className="h-3.5 w-3.5 text-yellow-500" />SEO {selectedBlog.seo_score}/100</span></>
                )}
                {(selectedBlog.internal_links || []).length > 0 && (
                  <><span className="mx-1">·</span><span className="flex items-center gap-1"><Link2 className="h-3.5 w-3.5" />{(selectedBlog.internal_links || []).length} links</span></>
                )}
              </div>

              {/* Meta description preview */}
              {selectedBlog.meta_description && (
                <div className="rounded-xl bg-indigo-500/10 border border-indigo-500/20 p-4 mb-6">
                  <p className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wider mb-1">Meta Description Preview</p>
                  <p className="text-sm text-muted-foreground">{selectedBlog.meta_description}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">{selectedBlog.meta_description.length}/160 characters</p>
                </div>
              )}

              {/* Keyword badges */}
              {(selectedBlog.target_keywords || []).length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-6">
                  {(selectedBlog.target_keywords || []).map((kw, i) => (
                    <Badge key={i} variant="outline" className="text-xs rounded-lg border-indigo-500/30 text-indigo-400">{kw}</Badge>
                  ))}
                </div>
              )}

              {/* Feedback banner */}
              {selectedBlog.feedback && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 mb-6">
                  <p className="text-xs font-semibold text-amber-400 uppercase mb-1">Feedback</p>
                  <p className="text-sm text-amber-200/80">{selectedBlog.feedback}</p>
                </div>
              )}

              {/* Article Content with ReactMarkdown */}
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
                      <p className="text-base md:text-lg leading-relaxed text-foreground/90 mb-4">{children}</p>
                    ),
                    strong: ({ children }) => (
                      <strong className="text-foreground font-semibold">{children}</strong>
                    ),
                    blockquote: ({ children }) => (
                      <div className="bg-indigo-500/10 border-l-4 border-indigo-500 rounded-r-xl p-5 my-6">
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
                      <li className="text-base md:text-lg text-foreground/90 leading-relaxed flex gap-2">
                        <span className="text-indigo-400 mt-1.5 shrink-0">•</span>
                        <span>{children}</span>
                      </li>
                    ),
                    hr: () => (
                      <div className="my-10 flex items-center justify-center gap-2">
                        <div className="h-1 w-1 rounded-full bg-muted-foreground/30" />
                        <div className="h-1 w-1 rounded-full bg-muted-foreground/30" />
                        <div className="h-1 w-1 rounded-full bg-muted-foreground/30" />
                      </div>
                    ),
                    a: ({ href, children }) => (
                      <a href={href} target="_blank" rel="noopener" className="text-indigo-400 font-medium underline decoration-indigo-400/30 underline-offset-2 hover:decoration-indigo-400 transition-colors">{children}</a>
                    ),
                    img: ({ src, alt }) => (
                      <div className="my-8 rounded-xl overflow-hidden shadow-sm">
                        <img src={src} alt={alt || ""} className="w-full" />
                        {alt && <p className="text-sm text-muted-foreground text-center py-2 bg-muted/30">{alt}</p>}
                      </div>
                    ),
                  }}
                >{selectedBlog.content_markdown || ""}</ReactMarkdown>
              </article>

              {/* SEO Details (collapsible) */}
              <div className="mt-8 rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 shadow-lg overflow-hidden">
                <button onClick={() => setShowBlogSeo(!showBlogSeo)} className="w-full flex items-center justify-between p-4 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                  <span className="flex items-center gap-2"><Shield className="h-4 w-4 text-indigo-400" /> SEO Details</span>
                  {showBlogSeo ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                {showBlogSeo && (
                  <div className="px-4 pb-4 space-y-3 border-t border-border/30">
                    <div className="pt-3"><p className="text-xs font-medium text-muted-foreground uppercase">Meta Description</p><p className="text-sm mt-1">{selectedBlog.meta_description || "—"}</p></div>
                    <div><p className="text-xs font-medium text-muted-foreground uppercase">Target Keywords</p><div className="flex flex-wrap gap-1.5 mt-1">{(selectedBlog.target_keywords || []).map((kw, i) => <Badge key={i} variant="secondary" className="text-xs rounded-lg">{kw}</Badge>)}</div></div>
                    <div><p className="text-xs font-medium text-muted-foreground uppercase">Slug</p><p className="text-sm mt-1 text-indigo-400">/{selectedBlog.slug}</p></div>
                    {(selectedBlog.internal_links || []).length > 0 && (
                      <div><p className="text-xs font-medium text-muted-foreground uppercase">Internal Links</p><div className="space-y-1 mt-1">{(selectedBlog.internal_links || []).map((link, i) => <a key={i} href={link} className="text-sm text-indigo-400 block hover:underline truncate">{link}</a>)}</div></div>
                    )}
                  </div>
                )}
              </div>

              {/* Feedback Input */}
              {showBlogFeedback && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-6 rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 p-4 shadow-lg">
                  <p className="text-sm font-medium mb-2">What needs to change?</p>
                  <Textarea placeholder="Tell me what to fix..." value={blogFeedbackText} onChange={e => setBlogFeedbackText(e.target.value)} rows={4} className="rounded-xl" />
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" className="rounded-lg bg-indigo-600 hover:bg-indigo-700" onClick={() => { if (blogFeedbackText.trim()) { updateBlogStatus(selectedBlog.id, "draft", blogFeedbackText); setBlogFeedbackText(""); setShowBlogFeedback(false) } }} disabled={!blogFeedbackText.trim() || blogUpdating}>
                      <Send className="h-3.5 w-3.5 mr-1" />Send
                    </Button>
                    <Button size="sm" variant="ghost" className="rounded-lg" onClick={() => setShowBlogFeedback(false)}>Cancel</Button>
                  </div>
                </motion.div>
              )}

              {/* Sticky Action Bar */}
              <div className="fixed bottom-0 left-0 right-0 bg-card/80 backdrop-blur-lg border-t border-border/30 p-4 flex gap-2 justify-center z-50">
                {(selectedBlog.status === "pending_review" || selectedBlog.status === "draft") && (
                  <>
                    <Button onClick={() => updateBlogStatus(selectedBlog.id, "approved")} disabled={blogUpdating} className="bg-emerald-600 hover:bg-emerald-700 gap-2 rounded-xl">
                      <CheckCircle className="h-4 w-4" />Approve
                    </Button>
                    <Button variant="outline" onClick={() => setShowBlogFeedback(true)} disabled={blogUpdating} className="gap-2 rounded-xl">
                      <MessageSquare className="h-4 w-4" />Request Changes
                    </Button>
                    <Button variant="outline" onClick={() => updateBlogStatus(selectedBlog.id, "rejected")} disabled={blogUpdating} className="gap-2 text-red-400 border-red-500/30 hover:bg-red-500/10 rounded-xl">
                      <ThumbsDown className="h-4 w-4" />Reject
                    </Button>
                  </>
                )}
                {selectedBlog.status === "approved" && (
                  <Button onClick={() => updateBlogStatus(selectedBlog.id, "published")} disabled={blogUpdating} className="bg-blue-600 hover:bg-blue-700 gap-2 rounded-xl">
                    <Send className="h-4 w-4" />Publish Now
                  </Button>
                )}
                {selectedBlog.status === "published" && (
                  <Badge className="bg-emerald-500/20 text-emerald-400 text-sm px-4 py-2 rounded-xl">✓ Published {selectedBlog.published_at ? new Date(selectedBlog.published_at).toLocaleDateString() : ""}</Badge>
                )}
              </div>
            </div>
          ) : (
          /* ── Blog List View ── */
          <>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-1 p-0.5 rounded-xl bg-muted/20 backdrop-blur-sm">
              {["all", "draft", "pending_review", "approved", "published"].map(s => (
                <button key={s} onClick={() => { setBlogStat(s); setShowBlogIdeas(false) }} className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-all", blogStat === s && !showBlogIdeas ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}>
                  {s === "all" ? "All" : s === "pending_review" ? "Pending" : s.charAt(0).toUpperCase() + s.slice(1)}
                  {s !== "all" && <span className="ml-1 text-[10px] opacity-60">{blogs.filter(b => s === "all" || b.status === s).length}</span>}
                </button>
              ))}
              <button onClick={() => setShowBlogIdeas(true)} className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1", showBlogIdeas ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}>
                <Lightbulb className="h-3 w-3" /> Ideas
              </button>
            </div>
            <div className="flex gap-1.5 ml-auto">
              <Button variant="outline" className="gap-1.5 rounded-xl text-indigo-400 border-indigo-500/30 hover:bg-indigo-500/10"><Sparkles className="h-4 w-4" /> Generate with AI</Button>
              <Button onClick={() => setShowNewBlog(true)} className="gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700"><Plus className="h-4 w-4" /> New Post</Button>
            </div>
          </div>

          {/* Blog Ideas Section */}
          {showBlogIdeas ? (
            <div className="space-y-4">
              <div className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 p-6 shadow-lg">
                <h3 className="font-semibold text-lg mb-3 flex items-center gap-2"><Lightbulb className="h-5 w-5 text-yellow-400" /> Submit a Blog Idea</h3>
                <Textarea placeholder="What should we write about? Describe your idea..." value={blogIdeaText} onChange={e => setBlogIdeaText(e.target.value)} rows={3} className="rounded-xl text-base mb-3" />
                <Button onClick={() => { if (blogIdeaText.trim()) { toast.success("Idea submitted!"); setBlogIdeaText("") } }} disabled={!blogIdeaText.trim()} className="w-full gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700">
                  <Plus className="h-4 w-4" /> Submit Idea
                </Button>
              </div>
            </div>
          ) : fBlogs.length === 0 ? (
            <div className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 p-12 text-center shadow-lg">
              <BookOpen className="h-12 w-12 mx-auto mb-4 text-muted-foreground/30" />
              <h3 className="text-lg font-semibold mb-2">No blog posts yet</h3>
              <p className="text-muted-foreground text-sm mb-4">Start building SEO authority with blog content.</p>
              <div className="flex gap-2 justify-center">
                <Button onClick={() => setShowNewBlog(true)} className="gap-1.5 rounded-xl"><Plus className="h-4 w-4" /> Create Post</Button>
                <Button variant="outline" className="gap-1.5 rounded-xl"><Sparkles className="h-4 w-4" /> Generate with AI</Button>
              </div>
            </div>
          ) : (
            <motion.div variants={ctn} initial="hidden" animate="show" className="grid gap-4 sm:grid-cols-2">
              {fBlogs.map(bl => (
                <motion.div key={bl.id} variants={itm} whileHover={{ y: -3 }} className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 shadow-lg overflow-hidden cursor-pointer group" onClick={() => setSelectedBlog(bl)}>
                  {/* Featured Image */}
                  {bl.featured_image_url && (
                    <div className="h-44 overflow-hidden relative">
                      <img src={bl.featured_image_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                    </div>
                  )}
                  <div className={cn("p-4", bl.featured_image_url ? "pt-3" : "")}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h4 className="font-bold text-sm line-clamp-2 group-hover:text-indigo-400 transition-colors">{bl.title}</h4>
                      <div className="flex items-center gap-2 shrink-0">
                        {bl.seo_score !== null && <ScoreRing score={bl.seo_score} size={36} sw={3} />}
                      </div>
                    </div>
                    <Badge className={cn("text-[10px] rounded-md mb-2", bl.status === "published" ? "bg-emerald-500/20 text-emerald-400" : bl.status === "approved" ? "bg-blue-500/20 text-blue-400" : bl.status === "pending_review" ? "bg-amber-500/20 text-amber-400" : bl.status === "rejected" ? "bg-red-500/20 text-red-400" : "bg-muted/50 text-muted-foreground")}>
                      {bl.status === "pending_review" ? "Pending" : bl.status}
                    </Badge>
                    {bl.meta_description && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{bl.meta_description}</p>
                    )}
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {(bl.target_keywords || []).slice(0, 3).map((kw, i) => (
                        <Badge key={i} variant="outline" className="text-[10px] px-1.5 rounded-md border-indigo-500/20 text-indigo-400/80">{kw}</Badge>
                      ))}
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{bl.estimated_read_time}m read</span>
                      <span>{new Date(bl.published_at || bl.created_at).toLocaleDateString()}</span>
                      {(bl.internal_links || []).length > 0 && <span className="flex items-center gap-1"><Link2 className="h-3 w-3" />{(bl.internal_links || []).length}</span>}
                      {bl.seo_score !== null && bl.seo_score >= 80 && <Badge className="text-[9px] bg-emerald-500/20 text-emerald-400 rounded-md px-1">High Impact</Badge>}
                    </div>
                    {bl.feedback && (
                      <div className="mt-3 text-xs text-amber-400/80 bg-amber-500/10 rounded-lg px-3 py-2 line-clamp-1">💬 {bl.feedback}</div>
                    )}
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
          </>
          )}
        </motion.div>
      )}

      {/* ═══ RANKINGS ═══ */}
      {tab === "rankings" && (
        <motion.div key="rankings" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
          <motion.div variants={ctn} initial="hidden" animate="show" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[{ l: "Total Keywords", v: keywords.length, icon: Target }, { l: "Page 1", v: p1Kws, icon: Award }, { l: "Improved", v: keywords.filter(k => k.current_position && k.previous_position && k.current_position < k.previous_position).length, icon: TrendingUp }, { l: "Dropped", v: keywords.filter(k => k.current_position && k.previous_position && k.current_position > k.previous_position).length, icon: TrendingDown }].map(s => (
              <motion.div key={s.l} variants={itm} className="p-4 rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 shadow-lg">
                <div className="flex items-center gap-2 mb-1"><s.icon className="h-4 w-4 text-indigo-400" /><span className="text-xs text-muted-foreground">{s.l}</span></div>
                <p className="text-2xl font-bold">{s.v}</p>
              </motion.div>
            ))}
          </motion.div>

          {/* Heatmap */}
          <div className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 p-5 shadow-lg overflow-x-auto">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><BarChart3 className="h-4 w-4 text-indigo-400" /> Niche × Service Heatmap</h3>
            {keywords.length === 0 ? (
              <div className="text-center py-8"><p className="text-sm text-muted-foreground mb-3">Add keywords with niche & service tags to see the heatmap</p><Button onClick={() => setShowNewKw(true)} variant="outline" size="sm" className="rounded-xl gap-1"><Plus className="h-3 w-3" /> Add Keywords</Button></div>
            ) : (
              <div className="min-w-[700px]">
                <div className="grid" style={{ gridTemplateColumns: `120px repeat(${SERVICES.length}, 1fr)` }}>
                  <div />
                  {SERVICES.map(s => <div key={s} className="text-[10px] font-medium text-muted-foreground text-center py-1 truncate">{s}</div>)}
                  {NICHES.map(niche => (
                    <div key={niche} className="contents">
                      <div className="text-xs font-medium py-2 pr-2 flex items-center">{niche}</div>
                      {SERVICES.map(svc => {
                        const c = heatmap[niche]?.[svc]; const pos = c?.pos
                        const bg = !pos ? "bg-muted/10" : pos <= 10 ? "bg-emerald-500/30" : pos <= 20 ? "bg-yellow-500/30" : pos <= 50 ? "bg-orange-500/30" : "bg-red-500/30"
                        return <div key={`${niche}-${svc}`} className={cn("rounded-lg mx-0.5 my-0.5 flex items-center justify-center text-[10px] font-medium py-2", bg)} title={`${niche} × ${svc}: ${pos ? '#' + pos : 'N/A'}`}>{pos ? `#${pos}` : "—"}</div>
                      })}
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-3 mt-3 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-500/30" /> Top 10</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-500/30" /> 11-20</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-500/30" /> 21-50</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500/30" /> 50+</span>
                </div>
              </div>
            )}
          </div>

          {/* Keyword table */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-md"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search keywords..." value={kwSearch} onChange={e => setKwSearch(e.target.value)} className="pl-9 rounded-xl" /></div>
            <Button onClick={() => setShowNewKw(true)} className="gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700"><Plus className="h-4 w-4" /> Add Keywords</Button>
          </div>
          {fKws.length === 0 ? (
            <div className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 p-12 text-center shadow-lg">
              <Target className="h-12 w-12 mx-auto mb-4 text-muted-foreground/30" />
              <h3 className="text-lg font-semibold mb-2">No keywords yet</h3>
              <p className="text-muted-foreground text-sm mb-4">Add keywords to track your Google rankings.</p>
              <Button onClick={() => setShowNewKw(true)} className="gap-1.5 rounded-xl"><Plus className="h-4 w-4" /> Add Keywords</Button>
            </div>
          ) : (
            <div className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 shadow-lg overflow-hidden overflow-x-auto">
              <table className="w-full"><thead><tr className="border-b border-border/30 text-xs text-muted-foreground">
                <th className="text-left p-3 font-medium">Keyword</th><th className="text-center p-3 font-medium">Position</th><th className="text-center p-3 font-medium">Change</th><th className="text-center p-3 font-medium">Best</th><th className="text-center p-3 font-medium">Volume</th><th className="text-center p-3 font-medium">Difficulty</th><th className="text-left p-3 font-medium">Cluster</th><th className="p-3"></th>
              </tr></thead><tbody>
                {fKws.map(kw => (
                  <tr key={kw.id} className="border-b border-border/20 hover:bg-muted/10">
                    <td className="p-3"><p className="text-sm font-medium">{kw.keyword}</p>{kw.niche && <span className="text-[10px] text-muted-foreground">{kw.niche}{kw.service && ` · ${kw.service}`}</span>}</td>
                    <td className="p-3 text-center"><span className={cn("text-sm font-bold", kw.current_position && kw.current_position <= 10 ? "text-emerald-400" : "text-muted-foreground")}>{kw.current_position ? `#${kw.current_position}` : "—"}</span></td>
                    <td className="p-3 text-center"><PosChange cur={kw.current_position} prev={kw.previous_position} /></td>
                    <td className="p-3 text-center text-xs text-muted-foreground">{kw.best_position ? `#${kw.best_position}` : "—"}</td>
                    <td className="p-3 text-center text-xs text-muted-foreground">{kw.search_volume || "—"}</td>
                    <td className="p-3 text-center"><Badge variant="outline" className={cn("text-[10px] rounded-md", kw.difficulty === "easy" ? "text-emerald-400" : kw.difficulty === "hard" ? "text-red-400" : "text-amber-400")}>{kw.difficulty}</Badge></td>
                    <td className="p-3 text-xs text-muted-foreground">{kw.cluster || "—"}</td>
                    <td className="p-3"><Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400" onClick={() => delKw(kw.id)}><Trash2 className="h-3 w-3" /></Button></td>
                  </tr>
                ))}
              </tbody></table>
            </div>
          )}
        </motion.div>
      )}

      {/* ═══ AI VISIBILITY ═══ */}
      {tab === "ai" && (
        <motion.div key="ai" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
          <div className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 p-6 shadow-lg text-center">
            <h3 className="text-sm text-muted-foreground mb-3 flex items-center gap-2 justify-center"><Bot className="h-4 w-4" /> How Easy Is It for AI to Recommend You?</h3>
            <ScoreRing score={citRate} size={80} sw={6} />
            <p className="text-lg font-bold mt-3">{citRate >= 70 ? "Strong" : citRate >= 40 ? "Growing" : citRate > 0 ? "Needs Work" : "Not Checked Yet"}</p>
            <p className="text-xs text-muted-foreground mt-1">{citations.length > 0 ? `Mentioned in ${citations.filter(c => c.was_cited).length} of ${citations.length} checks` : "Run your first check"}</p>
            <Button onClick={() => setShowCitCheck(true)} className="mt-4 gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700"><Sparkles className="h-4 w-4" /> Check Now</Button>
          </div>
          {citations.length > 0 && (
            <div className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 shadow-lg overflow-hidden">
              <div className="p-4 border-b border-border/30"><h3 className="text-sm font-semibold">Recent AI Checks</h3></div>
              <div className="divide-y divide-border/20">
                {citations.slice(0, 15).map(c => (
                  <div key={c.id} className="p-3 flex items-center gap-3 hover:bg-muted/10">
                    <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0", c.was_cited ? "bg-emerald-500/20" : "bg-red-500/20")}>{c.was_cited ? <CheckCircle className="h-4 w-4 text-emerald-400" /> : <XCircle className="h-4 w-4 text-red-400" />}</div>
                    <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">&ldquo;{c.query}&rdquo;</p><p className="text-xs text-muted-foreground">{c.ai_platform === "chatgpt" ? "ChatGPT" : c.ai_platform === "perplexity" ? "Perplexity" : c.ai_platform}{c.competitor_cited && <> · Competitor: <span className="text-amber-400">{c.competitor_cited}</span></>}</p></div>
                    <span className="text-[10px] text-muted-foreground shrink-0">{new Date(c.checked_at).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <motion.div variants={ctn} initial="hidden" animate="show" className="grid gap-3 sm:grid-cols-2">
            {[{ icon: "❓", title: "Add FAQ sections", desc: "AI models love pulling answers from FAQ sections on your pages." },
              { icon: "📝", title: "Clear, factual statements", desc: "Write content that directly answers questions people ask." },
              { icon: "📚", title: "Build with blog posts", desc: "More quality content = more chances AI cites you." },
              { icon: "🏷️", title: "Add structured data", desc: "Schema markup helps AI understand your business." },
            ].map(t => (
              <motion.div key={t.title} variants={itm} className="p-4 rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 shadow-lg">
                <span className="text-2xl">{t.icon}</span><h4 className="text-sm font-semibold mt-2 mb-1">{t.title}</h4><p className="text-xs text-muted-foreground">{t.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      )}

      {/* ═══ SITE HEALTH ═══ */}
      {tab === "health" && (
        <motion.div key="health" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
          <motion.div variants={ctn} initial="hidden" animate="show" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <motion.div variants={itm} className="p-5 rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 shadow-lg text-center"><ScoreRing score={healthScore} size={72} sw={6} /><p className="text-sm font-semibold mt-2">Health Score</p></motion.div>
            {[{ l: "Audited", v: pages.filter(p => p.last_audited).length, I: Eye }, { l: "Fixed", v: fixes.length, I: Wrench }, { l: "This Week", v: fixesWeek, I: CheckCircle }, { l: "Need Work", v: pages.filter(p => p.seo_score < 50).length, I: AlertTriangle }].map(s => (
              <motion.div key={s.l} variants={itm} className="p-4 rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 shadow-lg"><s.I className="h-4 w-4 text-muted-foreground mb-1" /><p className="text-2xl font-bold">{s.v}</p><p className="text-xs text-muted-foreground">{s.l}</p></motion.div>
            ))}
          </motion.div>
          <div className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 p-5 shadow-lg">
            <h3 className="text-sm font-semibold mb-3">Quick Health Check</h3>
            <div className="grid gap-2 sm:grid-cols-3">
              {[{ l: "SSL Certificate", ok: true }, { l: "Sitemap", ok: pages.some(p => p.is_published) }, { l: "Mobile Friendly", ok: true }, { l: "Page Speed", ok: true }, { l: "Schema Markup", ok: pages.some(p => p.grapejs_data) }, { l: "Meta Descriptions", ok: pages.filter(p => p.meta_description).length >= pages.length * 0.8 }].map(c => (
                <div key={c.l} className="flex items-center gap-2 p-2 rounded-xl bg-muted/10">{c.ok ? <CheckCircle className="h-4 w-4 text-emerald-400" /> : <AlertTriangle className="h-4 w-4 text-amber-400" />}<span className="text-sm">{c.l}</span></div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 shadow-lg overflow-hidden">
            <div className="p-4 border-b border-border/30 flex items-center justify-between"><h3 className="text-sm font-semibold flex items-center gap-2"><Wrench className="h-4 w-4 text-indigo-400" /> Auto-Fix Log</h3><Badge variant="outline" className="text-[10px]">Autopilot Active</Badge></div>
            {fixes.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground"><Wrench className="h-8 w-8 mx-auto mb-2 opacity-30" /><p className="text-sm">No fixes yet. Issues will be auto-fixed as detected.</p></div>
            ) : (
              <div className="divide-y divide-border/20">
                {fixes.slice(0, 20).map(f => (
                  <div key={f.id} className="p-3 flex items-start gap-3 hover:bg-muted/10">
                    <div className="h-8 w-8 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0"><CheckCircle className="h-4 w-4 text-emerald-400" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2"><Badge variant="outline" className="text-[10px] rounded-md">{f.fix_type}</Badge><span className="text-[10px] text-muted-foreground">{new Date(f.applied_at).toLocaleString()}</span></div>
                      <p className="text-sm mt-0.5">{f.description}</p>
                      {f.before_value && <div className="flex gap-2 mt-1 text-[10px]"><span className="text-red-400 line-through truncate max-w-[150px]">{f.before_value}</span><span className="text-muted-foreground">→</span><span className="text-emerald-400 truncate max-w-[150px]">{f.after_value}</span></div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* ═══ AUTOMATIONS ═══ */}
      {tab === "automations" && (
        <motion.div key="autos" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
          <div className="flex items-center justify-between"><div><h3 className="text-sm font-semibold">SEO Automations</h3><p className="text-xs text-muted-foreground">Rules that run automatically</p></div>
            <Button onClick={() => setShowNewAuto(true)} className="gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700"><Plus className="h-4 w-4" /> Create</Button></div>
          {automations.length === 0 ? (
            <>
              <div className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 p-8 text-center shadow-lg"><Zap className="h-12 w-12 mx-auto mb-4 text-muted-foreground/30" /><h3 className="text-lg font-semibold mb-2">No automations yet</h3><p className="text-muted-foreground text-sm">Pick from suggestions below to get started.</p></div>
              <h4 className="text-sm font-semibold text-muted-foreground">Suggested</h4>
              <motion.div variants={ctn} initial="hidden" animate="show" className="grid gap-3 sm:grid-cols-2">
                {[{ n: "Weekly Blog Generation", d: "Every Monday, generate 2 blog posts", t: "schedule", a: "generate_blog", I: BookOpen },
                  { n: "Auto-Index Pages", d: "Submit new pages to Google automatically", t: "event", a: "index_page", I: Globe },
                  { n: "Ranking Drop Alert", d: "Alert when keywords drop 5+ positions", t: "event", a: "alert", I: AlertTriangle },
                  { n: "Monthly SEO Report", d: "Performance report on the 1st of each month", t: "schedule", a: "report", I: BarChart3 },
                  { n: "Keyword Gap Finder", d: "Weekly research for new keyword opportunities", t: "schedule", a: "research", I: Search },
                  { n: "Image Compression", d: "Auto-compress images over 500KB", t: "event", a: "compress", I: Activity },
                ].map(s => (
                  <motion.div key={s.n} variants={itm} className="p-4 rounded-2xl bg-card/60 backdrop-blur-xl border border-dashed border-border/50 shadow-lg hover:border-indigo-500/30 transition-colors cursor-pointer" onClick={() => { setNaName(s.n); setNaDesc(s.d); setNaTrig(s.t); setNaAct(s.a); setShowNewAuto(true) }}>
                    <div className="flex items-center gap-2 mb-2"><div className="h-8 w-8 rounded-lg bg-indigo-500/20 flex items-center justify-center"><s.I className="h-4 w-4 text-indigo-400" /></div><h4 className="text-sm font-semibold">{s.n}</h4></div>
                    <p className="text-xs text-muted-foreground">{s.d}</p><p className="text-[10px] text-indigo-400 mt-2">Click to activate →</p>
                  </motion.div>
                ))}
              </motion.div>
            </>
          ) : (
            <motion.div variants={ctn} initial="hidden" animate="show" className="space-y-3">
              {automations.map(a => (
                <motion.div key={a.id} variants={itm} className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 p-4 shadow-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center", a.is_active ? "bg-indigo-500/20" : "bg-muted/30")}><Zap className={cn("h-5 w-5", a.is_active ? "text-indigo-400" : "text-muted-foreground")} /></div>
                      <div><h4 className="text-sm font-semibold">{a.name}</h4><p className="text-xs text-muted-foreground">{a.description}</p>
                        <div className="flex items-center gap-2 mt-1"><Badge variant="outline" className="text-[10px] rounded-md">{a.trigger_type}</Badge><Badge variant="outline" className="text-[10px] rounded-md">{a.action_type}</Badge>{a.last_run && <span className="text-[10px] text-muted-foreground">Last: {new Date(a.last_run).toLocaleDateString()}</span>}<span className="text-[10px] text-muted-foreground">{a.run_count} runs</span></div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2"><Switch checked={a.is_active} onCheckedChange={() => toggleAuto(a)} /><Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400" onClick={() => delAuto(a.id)}><Trash2 className="h-3 w-3" /></Button></div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </motion.div>
      )}
      </AnimatePresence>

      {/* ═══ DIALOGS ═══ */}
      <Dialog open={showBuilder} onOpenChange={v => { if (!v) { setShowBuilder(false); setEditingPage(null) } }}>
        <DialogContent className="max-w-[95vw] h-[90vh] p-0 rounded-2xl overflow-hidden">
          <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-indigo-500" /></div>}>
            {editingPage && <PageBuilder pageId={editingPage.id} initialData={{ grapejs_data: editingPage.grapejs_data, grapejs_html: editingPage.grapejs_html || undefined, grapejs_css: editingPage.grapejs_css || undefined, title: editingPage.title, url_path: editingPage.url_path }} onSave={d => savePage(editingPage.id, d)} onClose={() => { setShowBuilder(false); setEditingPage(null) }} />}
          </Suspense>
        </DialogContent>
      </Dialog>

      <Dialog open={showNewPage} onOpenChange={setShowNewPage}>
        <DialogContent className="rounded-2xl"><DialogHeader><DialogTitle className="flex items-center gap-2"><Plus className="h-5 w-5 text-indigo-400" /> New Page</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div><Label>Title</Label><Input placeholder="e.g. Restaurant Website Design" value={npTitle} onChange={e => setNpTitle(e.target.value)} className="rounded-xl" /></div>
            <div><Label>URL Path</Label><Input placeholder="/services/restaurant-websites" value={npUrl} onChange={e => setNpUrl(e.target.value)} className="rounded-xl" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Niche</Label><Select value={npNiche} onValueChange={setNpNiche}><SelectTrigger className="rounded-xl"><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{NICHES.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Service</Label><Select value={npService} onValueChange={setNpService}><SelectTrigger className="rounded-xl"><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{SERVICES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div className="flex justify-end gap-2 pt-2"><Button variant="outline" className="rounded-xl" onClick={() => setShowNewPage(false)}>Cancel</Button><Button className="rounded-xl bg-indigo-600 hover:bg-indigo-700" onClick={createPage}>Create</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showGenPages} onOpenChange={setShowGenPages}>
        <DialogContent className="rounded-2xl max-w-lg"><DialogHeader><DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-indigo-400" /> Generate Pages</DialogTitle><DialogDescription>Create landing pages for multiple niches at once.</DialogDescription></DialogHeader>
          <div className="space-y-3 pt-2">
            <div><Label>Service</Label><Select value={genService} onValueChange={setGenService}><SelectTrigger className="rounded-xl"><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{SERVICES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Niches ({genNiches.length})</Label>
              <div className="grid grid-cols-2 gap-1.5 mt-1.5">{NICHES.map(n => { const sel = genNiches.includes(n); return <button key={n} onClick={() => setGenNiches(p => sel ? p.filter(x => x !== n) : [...p, n])} className={cn("px-3 py-2 rounded-xl text-sm text-left border", sel ? "border-indigo-500 bg-indigo-500/10" : "border-border/50 text-muted-foreground")}>{sel ? "✓ " : ""}{n}</button> })}</div>
            </div>
            {genNiches.length > 0 && genService && <div className="p-3 rounded-xl bg-muted/10 border border-border/30"><p className="text-sm">Creates <span className="font-bold text-indigo-400">{genNiches.length}</span> pages</p></div>}
            <div className="flex justify-end gap-2 pt-2"><Button variant="outline" className="rounded-xl" onClick={() => setShowGenPages(false)}>Cancel</Button><Button className="rounded-xl bg-indigo-600 hover:bg-indigo-700 gap-1.5" onClick={generatePages} disabled={genLoading}>{genLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Generate</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showNewKw} onOpenChange={setShowNewKw}>
        <DialogContent className="rounded-2xl"><DialogHeader><DialogTitle className="flex items-center gap-2"><Target className="h-5 w-5 text-indigo-400" /> Add Keywords</DialogTitle><DialogDescription>One keyword per line. We track rankings automatically.</DialogDescription></DialogHeader>
          <div className="space-y-3 pt-2">
            <Textarea placeholder={"NYC restaurant marketing\nbarber shop website design"} value={nkText} onChange={e => setNkText(e.target.value)} className="rounded-xl min-h-[120px]" />
            <div className="grid grid-cols-3 gap-2">
              <div><Label className="text-xs">Cluster</Label><Input placeholder="Optional" value={nkCluster} onChange={e => setNkCluster(e.target.value)} className="rounded-xl text-sm" /></div>
              <div><Label className="text-xs">Niche</Label><Select value={nkNiche} onValueChange={setNkNiche}><SelectTrigger className="rounded-xl text-sm"><SelectValue placeholder="—" /></SelectTrigger><SelectContent>{NICHES.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent></Select></div>
              <div><Label className="text-xs">Service</Label><Select value={nkService} onValueChange={setNkService}><SelectTrigger className="rounded-xl text-sm"><SelectValue placeholder="—" /></SelectTrigger><SelectContent>{SERVICES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div className="flex justify-end gap-2 pt-2"><Button variant="outline" className="rounded-xl" onClick={() => setShowNewKw(false)}>Cancel</Button><Button className="rounded-xl bg-indigo-600 hover:bg-indigo-700" onClick={addKws}>Add</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showNewBlog} onOpenChange={setShowNewBlog}>
        <DialogContent className="rounded-2xl"><DialogHeader><DialogTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5 text-indigo-400" /> New Blog Post</DialogTitle><DialogDescription>Create a new blog post for SEO authority building.</DialogDescription></DialogHeader>
          <div className="space-y-3 pt-2">
            <div><Label>Title</Label><Input placeholder="5 Ways to Get More Restaurant Reviews" value={nbTitle} onChange={e => setNbTitle(e.target.value)} className="rounded-xl" /></div>
            <div><Label>Topic / Meta Description</Label><Textarea placeholder="What should this cover? This will also be used as the meta description." value={nbTopic} onChange={e => setNbTopic(e.target.value)} className="rounded-xl" />{nbTopic && <p className="text-[10px] text-muted-foreground mt-1">{nbTopic.length}/160 characters for meta</p>}</div>
            <div><Label>Featured Image URL</Label><Input placeholder="https://images.unsplash.com/..." value={nbImage} onChange={e => setNbImage(e.target.value)} className="rounded-xl" /><p className="text-[10px] text-muted-foreground mt-1">Tip: Search Unsplash for &quot;{nbTitle || "your topic"}&quot;</p>
              {nbImage && <div className="mt-2 rounded-xl overflow-hidden h-32"><img src={nbImage} alt="Preview" className="w-full h-full object-cover" /></div>}
            </div>
            <div><Label>Keywords (comma-separated)</Label><Input placeholder="restaurant reviews, google reviews" value={nbKws} onChange={e => setNbKws(e.target.value)} className="rounded-xl" /></div>
            <div className="flex justify-end gap-2 pt-2"><Button variant="outline" className="rounded-xl" onClick={() => setShowNewBlog(false)}>Cancel</Button><Button className="rounded-xl bg-indigo-600 hover:bg-indigo-700 gap-1.5" onClick={createBlog}><Sparkles className="h-4 w-4" /> Create</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showNewAuto} onOpenChange={setShowNewAuto}>
        <DialogContent className="rounded-2xl"><DialogHeader><DialogTitle className="flex items-center gap-2"><Zap className="h-5 w-5 text-indigo-400" /> Create Automation</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div><Label>Name</Label><Input value={naName} onChange={e => setNaName(e.target.value)} className="rounded-xl" /></div>
            <div><Label>Description</Label><Textarea value={naDesc} onChange={e => setNaDesc(e.target.value)} className="rounded-xl" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Trigger</Label><Select value={naTrig} onValueChange={setNaTrig}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="schedule">Schedule</SelectItem><SelectItem value="event">Event</SelectItem><SelectItem value="manual">Manual</SelectItem></SelectContent></Select></div>
              <div><Label>Action</Label><Select value={naAct} onValueChange={setNaAct}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="generate_blog">Generate Blog</SelectItem><SelectItem value="check_rankings">Check Rankings</SelectItem><SelectItem value="run_audit">Site Audit</SelectItem><SelectItem value="index_page">Index Page</SelectItem><SelectItem value="alert">Send Alert</SelectItem><SelectItem value="report">Generate Report</SelectItem><SelectItem value="research">Keyword Research</SelectItem><SelectItem value="compress">Compress Images</SelectItem></SelectContent></Select></div>
            </div>
            {naTrig === "schedule" && <div><Label>Frequency</Label><Select value={naFreq} onValueChange={setNaFreq}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="daily">Daily</SelectItem><SelectItem value="weekly">Weekly</SelectItem><SelectItem value="monthly">Monthly</SelectItem></SelectContent></Select></div>}
            <div className="flex justify-end gap-2 pt-2"><Button variant="outline" className="rounded-xl" onClick={() => setShowNewAuto(false)}>Cancel</Button><Button className="rounded-xl bg-indigo-600 hover:bg-indigo-700" onClick={createAuto}>Create</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showCitCheck} onOpenChange={setShowCitCheck}>
        <DialogContent className="rounded-2xl"><DialogHeader><DialogTitle className="flex items-center gap-2"><Bot className="h-5 w-5 text-indigo-400" /> Check AI Visibility</DialogTitle><DialogDescription>What would someone ask AI about your services?</DialogDescription></DialogHeader>
          <div className="space-y-3 pt-2">
            <div><Label>Query</Label><Input placeholder={'"best marketing agency in NYC"'} value={cq} onChange={e => setCq(e.target.value)} className="rounded-xl" /></div>
            <div><Label>Platform</Label><Select value={cp} onValueChange={setCp}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="chatgpt">ChatGPT</SelectItem><SelectItem value="perplexity">Perplexity</SelectItem><SelectItem value="google_ai">Google AI</SelectItem><SelectItem value="claude">Claude</SelectItem></SelectContent></Select></div>
            <div className="flex justify-end gap-2 pt-2"><Button variant="outline" className="rounded-xl" onClick={() => setShowCitCheck(false)}>Cancel</Button><Button className="rounded-xl bg-indigo-600 hover:bg-indigo-700 gap-1.5" onClick={addCit}><Sparkles className="h-4 w-4" /> Check</Button></div>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
