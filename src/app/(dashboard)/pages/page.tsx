"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { motion, AnimatePresence } from "framer-motion"
import {
  AlertTriangle,
  BarChart3,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  Globe,
  Mail,
  MousePointer,
  Palette,
  Search,
  TreePine,
  X,
  Zap,
  Plus,
} from "lucide-react"

// ─── Types ───────────────────────────────────────────────────
interface SitePage {
  id: string
  url_path: string
  title: string
  meta_description: string | null
  seo_score: number | null
  has_email_capture: boolean
  has_cta: boolean
  last_audited: string | null
  created_at: string
}

interface Recommendation {
  id: string
  page_id: string
  recommendation_type: string
  severity: string
  title: string
  description: string
  current_value: string | null
  suggested_value: string | null
  section_selector: string | null
  screenshot_url: string | null
  status: string
  created_at: string
}

interface Variant {
  id: string
  page_id: string
  variant_label: string
  changes_description: string
  traffic_percentage: number
  visits: number
  conversions: number
  conversion_rate: number
  is_active: boolean
  created_at: string
}

interface TreeNode {
  path: string
  segment: string
  page: SitePage | null
  children: TreeNode[]
  depth: number
}

// ─── Constants ───────────────────────────────────────────────
const SEVERITY_COLORS: Record<string, string> = {
  high: "bg-red-500/10 text-red-400 border-red-500/20",
  medium: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  low: "bg-blue-500/10 text-blue-400 border-blue-500/20",
}
const SEVERITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 }
const TYPE_ICONS: Record<string, typeof Search> = {
  seo: Search, copy: FileText, cta: MousePointer, speed: Zap, design: Palette,
}

function seoScoreColor(score: number | null): string {
  if (score === null) return "#6b7280"
  if (score >= 80) return "#22c55e"
  if (score >= 60) return "#eab308"
  return "#ef4444"
}

function seoColorClass(score: number | null): string {
  if (score === null) return "text-muted-foreground bg-muted"
  if (score >= 80) return "text-green-400 bg-green-500/10"
  if (score >= 60) return "text-yellow-400 bg-yellow-500/10"
  return "text-red-400 bg-red-500/10"
}

// ─── Tree Builder ────────────────────────────────────────────
function buildTree(pages: SitePage[]): TreeNode {
  const root: TreeNode = { path: "/", segment: "Site Root", page: null, children: [], depth: 0 }
  const rootPage = pages.find(p => p.url_path === "/" || p.url_path === "")
  if (rootPage) root.page = rootPage

  for (const page of pages) {
    if (page.url_path === "/" || page.url_path === "") continue
    const segments = page.url_path.replace(/^\//, "").replace(/\/$/, "").split("/")
    let current = root
    let builtPath = ""
    for (let i = 0; i < segments.length; i++) {
      builtPath += "/" + segments[i]
      let child = current.children.find(c => c.path === builtPath)
      if (!child) {
        child = { path: builtPath, segment: segments[i], page: null, children: [], depth: i + 1 }
        current.children.push(child)
      }
      if (i === segments.length - 1) child.page = page
      current = child
    }
  }
  return root
}

// ─── Tree Item Component ─────────────────────────────────────
function TreeItem({
  node,
  level,
  selectedId,
  onSelect,
  getRecCount,
  isLast,
  parentLines,
}: {
  node: TreeNode
  level: number
  selectedId: string | null
  onSelect: (n: TreeNode) => void
  getRecCount: (id: string) => number
  isLast: boolean
  parentLines: boolean[]
}) {
  const [open, setOpen] = useState(level < 2)
  const hasChildren = node.children.length > 0
  const score = node.page?.seo_score ?? null
  const recCount = node.page ? getRecCount(node.page.id) : 0
  const title = node.page?.title || node.segment.charAt(0).toUpperCase() + node.segment.slice(1)
  const isSelected = node.page?.id === selectedId

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: level * 0.03, duration: 0.2 }}
        className={`flex items-center h-9 cursor-pointer group relative transition-colors
          ${isSelected
            ? "bg-violet-500/10 border-l-2 border-l-violet-500"
            : "border-l-2 border-l-transparent hover:bg-secondary/50"
          }`}
        onClick={() => {
          if (node.page) onSelect(node)
          if (hasChildren) setOpen(!open)
        }}
      >
        {/* Tree connector lines */}
        <div className="flex items-center h-full" style={{ width: `${level * 20 + 12}px`, minWidth: `${level * 20 + 12}px` }}>
          {Array.from({ length: level }).map((_, i) => (
            <div
              key={i}
              className="h-full flex-shrink-0"
              style={{ width: "20px", position: "relative" }}
            >
              {parentLines[i] && (
                <div className="absolute left-[9px] top-0 bottom-0 w-px bg-border/60" />
              )}
            </div>
          ))}
          {level > 0 && (
            <div className="relative h-full flex-shrink-0" style={{ width: "12px" }}>
              {/* Vertical line from top to middle */}
              <div className={`absolute left-[-11px] top-0 w-px bg-border/60 ${isLast ? "h-1/2" : "h-full"}`} />
              {/* Horizontal line from left to node */}
              <div className="absolute left-[-11px] top-1/2 h-px w-[16px] bg-border/60" />
            </div>
          )}
        </div>

        {/* Expand/collapse chevron */}
        <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
          {hasChildren ? (
            <motion.div animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.15 }}>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            </motion.div>
          ) : (
            <div className="w-1 h-1 rounded-full bg-border/40" />
          )}
        </div>

        {/* SEO score dot */}
        <div
          className="w-2.5 h-2.5 rounded-full flex-shrink-0 mx-1.5"
          style={{ backgroundColor: seoScoreColor(score) }}
        />

        {/* Title */}
        <span className="text-sm font-medium truncate text-foreground flex-1 min-w-0">{title}</span>

        {/* Path */}
        <span className="text-xs text-muted-foreground truncate max-w-[120px] mx-2 hidden sm:block">
          {node.path}
        </span>

        {/* Badges */}
        <div className="flex items-center gap-1 pr-3 flex-shrink-0">
          {recCount > 0 && (
            <span className="text-[10px] leading-none px-1.5 py-0.5 rounded-full bg-yellow-500/15 text-yellow-500 font-medium">
              {recCount}
            </span>
          )}
          {node.page?.has_email_capture && <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />}
          {node.page?.has_cta && <span className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />}
          {score !== null && (
            <span className={`text-[10px] leading-none font-bold px-1.5 py-0.5 rounded-full ${seoColorClass(score)}`}>
              {score}
            </span>
          )}
        </div>
      </motion.div>

      {/* Children */}
      <AnimatePresence initial={false}>
        {open && hasChildren && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            {node.children.map((child, i) => (
              <TreeItem
                key={child.path}
                node={child}
                level={level + 1}
                selectedId={selectedId}
                onSelect={onSelect}
                getRecCount={getRecCount}
                isLast={i === node.children.length - 1}
                parentLines={[...parentLines, !isLast || level === 0 ? (i < node.children.length - 1 || level === 0) : false]}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Detail Panel ────────────────────────────────────────────
function DetailPanel({
  selectedPage, pageRecs, pageVariants, appliedCount, expandedRecs, toggleRec, updateRecommendation, onClose
}: {
  selectedPage: SitePage
  pageRecs: Recommendation[]
  pageVariants: Variant[]
  appliedCount: number
  expandedRecs: Set<string>
  toggleRec: (id: string) => void
  updateRecommendation: (id: string, status: string) => void
  onClose: () => void
}) {
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border/50">
        <h2 className="text-base font-bold text-foreground truncate pr-2">{selectedPage.title}</h2>
        <Button variant="ghost" size="sm" onClick={onClose} className="flex-shrink-0">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Page Info */}
        <div className="bg-secondary/30 backdrop-blur-sm rounded-xl p-4 border border-border/30">
          <p className="text-sm text-muted-foreground mb-2">{selectedPage.url_path}</p>
          <div className="flex flex-wrap gap-2">
            <Badge className={seoColorClass(selectedPage.seo_score)}>
              SEO: {selectedPage.seo_score ?? "N/A"}
            </Badge>
            {selectedPage.has_email_capture && (
              <Badge variant="secondary" className="gap-1 text-xs"><Mail className="h-3 w-3" />Email Capture</Badge>
            )}
            {selectedPage.has_cta && (
              <Badge variant="secondary" className="gap-1 text-xs"><MousePointer className="h-3 w-3" />CTA</Badge>
            )}
            {appliedCount > 0 && (
              <Badge variant="outline" className="gap-1 text-xs text-green-400 border-green-500/30">
                <Check className="h-3 w-3" />{appliedCount} applied
              </Badge>
            )}
          </div>
          {selectedPage.meta_description && (
            <p className="text-xs text-muted-foreground mt-3 italic">&ldquo;{selectedPage.meta_description}&rdquo;</p>
          )}
        </div>

        {/* Recommendations */}
        <div>
          <h3 className="font-semibold text-sm mb-2 flex items-center gap-2 text-foreground">
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
            Recommendations ({pageRecs.length})
          </h3>
          {pageRecs.length === 0 ? (
            <div className="bg-secondary/30 rounded-xl py-6 text-center text-muted-foreground text-sm">
              <Check className="h-6 w-6 mx-auto mb-2 text-green-500" />
              All recommendations addressed!
            </div>
          ) : (
            <div className="space-y-2">
              {pageRecs.map(rec => {
                const expanded = expandedRecs.has(rec.id)
                const Icon = TYPE_ICONS[rec.recommendation_type] || Search
                return (
                  <motion.div
                    key={rec.id}
                    layout
                    className={`border rounded-xl overflow-hidden transition-colors ${
                      expanded ? "border-primary/30 bg-card" : "border-border/50 bg-card/60"
                    }`}
                  >
                    <button className="w-full text-left p-3" onClick={() => toggleRec(rec.id)}>
                      <div className="flex items-start gap-2">
                        <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">{rec.title}</span>
                            <Badge className={`${SEVERITY_COLORS[rec.severity]} text-[10px]`}>{rec.severity}</Badge>
                          </div>
                          {!expanded && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{rec.description}</p>}
                        </div>
                        {expanded ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                      </div>
                    </button>
                    <AnimatePresence>
                      {expanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="px-3 pb-3 pt-0 space-y-3">
                            <p className="text-sm text-muted-foreground">{rec.description}</p>
                            {(rec.current_value || rec.suggested_value) && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {rec.current_value && (
                                  <div className="bg-red-500/10 rounded-lg p-2.5">
                                    <p className="text-[10px] font-medium text-red-400 uppercase mb-1">Current</p>
                                    <p className="text-xs text-red-300">{rec.current_value}</p>
                                  </div>
                                )}
                                {rec.suggested_value && (
                                  <div className="bg-green-500/10 rounded-lg p-2.5">
                                    <p className="text-[10px] font-medium text-green-400 uppercase mb-1">Suggested</p>
                                    <p className="text-xs text-green-300">{rec.suggested_value}</p>
                                  </div>
                                )}
                              </div>
                            )}
                            <div className="flex gap-2">
                              <Button size="sm" className="gap-1 bg-green-600 hover:bg-green-700 text-green-50" onClick={() => updateRecommendation(rec.id, "applied")}>
                                <Check className="h-3.5 w-3.5" />Apply
                              </Button>
                              <Button size="sm" variant="ghost" className="gap-1 text-muted-foreground" onClick={() => updateRecommendation(rec.id, "dismissed")}>
                                <X className="h-3.5 w-3.5" />Dismiss
                              </Button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )
              })}
            </div>
          )}
        </div>

        {/* A/B Test Variants */}
        {pageVariants.length > 0 && (
          <div>
            <h3 className="font-semibold text-sm mb-2 flex items-center gap-2 text-foreground">
              <BarChart3 className="h-4 w-4 text-blue-500" />
              A/B Test Variants
            </h3>
            <div className="grid gap-2">
              {pageVariants.map(v => (
                <div key={v.id} className={`border border-border/50 rounded-xl p-3 bg-card/60 ${!v.is_active ? "opacity-60" : ""}`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-foreground">Variant {v.variant_label}</span>
                      {v.is_active ? (
                        <Badge className="bg-green-500/10 text-green-400 text-[10px]">Active</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">Inactive</Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">{v.traffic_percentage}% traffic</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">{v.changes_description}</p>
                  <div className="flex gap-4 text-xs">
                    <div><span className="text-muted-foreground">Visits:</span> <span className="font-medium text-foreground">{v.visits.toLocaleString()}</span></div>
                    <div><span className="text-muted-foreground">Conv:</span> <span className="font-medium text-foreground">{v.conversions.toLocaleString()}</span></div>
                    <div><span className="text-muted-foreground">Rate:</span> <span className="font-bold text-primary">{v.conversion_rate}%</span></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Page Component ─────────────────────────────────────
export default function SitePagesPage() {
  const [pages, setPages] = useState<SitePage[]>([])
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [variants, setVariants] = useState<Variant[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPage, setSelectedPage] = useState<SitePage | null>(null)
  const [expandedRecs, setExpandedRecs] = useState<Set<string>>(new Set())

  const fetchData = async () => {
    try {
      const res = await fetch("/api/site-pages")
      const json = await res.json()
      setPages(json.data || [])
      setRecommendations(json.recommendations || [])
      setVariants(json.variants || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const tree = useMemo(() => buildTree(pages), [pages])

  const getRecCount = useCallback((pageId: string) => {
    return recommendations.filter(r => r.page_id === pageId && r.status === "pending").length
  }, [recommendations])

  const handleNodeClick = useCallback((node: TreeNode) => {
    if (node.page) setSelectedPage(node.page)
  }, [])

  const toggleRec = (id: string) => {
    setExpandedRecs(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const updateRecommendation = async (id: string, status: string) => {
    try {
      await fetch("/api/site-pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_recommendation", id, status }),
      })
      setRecommendations(prev => prev.map(r => r.id === id ? { ...r, status } : r))
    } catch (e) {
      console.error(e)
    }
  }

  const pageRecs = selectedPage
    ? recommendations
        .filter(r => r.page_id === selectedPage.id && r.status === "pending")
        .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9))
    : []

  const pageVariants = selectedPage
    ? variants.filter(v => v.page_id === selectedPage.id)
    : []

  const appliedCount = selectedPage
    ? recommendations.filter(r => r.page_id === selectedPage.id && r.status === "applied").length
    : 0

  const totalPages = pages.length
  const avgScore = totalPages > 0
    ? Math.round(pages.reduce((s, p) => s + (p.seo_score ?? 0), 0) / totalPages)
    : 0
  const pagesNeedingFixes = pages.filter(p =>
    recommendations.some(r => r.page_id === p.id && r.status === "pending")
  ).length

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: "linear" }}>
          <Globe className="h-8 w-8 text-primary" />
        </motion.div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-6"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10">
            <TreePine className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Site Pages</h1>
            <p className="text-sm text-muted-foreground">Interactive sitemap tree</p>
          </div>
        </div>
      </motion.div>

      {/* Stats Bar */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6"
      >
        <div className="bg-card/60 backdrop-blur-sm border border-border/50 rounded-xl px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Total Pages</p>
          <p className="text-2xl font-bold text-foreground">{totalPages}</p>
        </div>
        <div className="bg-card/60 backdrop-blur-sm border border-border/50 rounded-xl px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Avg SEO Score</p>
          <p className={`text-2xl font-bold ${avgScore >= 80 ? "text-green-400" : avgScore >= 60 ? "text-yellow-400" : "text-red-400"}`}>
            {avgScore}
          </p>
        </div>
        <div className="bg-card/60 backdrop-blur-sm border border-border/50 rounded-xl px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Need Fixes</p>
          <p className="text-2xl font-bold text-yellow-400">{pagesNeedingFixes}</p>
        </div>
        <div className="bg-card/60 backdrop-blur-sm border border-border/50 rounded-xl px-4 py-3 flex items-center justify-center">
          <Button variant="outline" size="sm" className="gap-1.5 w-full">
            <Plus className="h-3.5 w-3.5" /> Add Page
          </Button>
        </div>
      </motion.div>

      {/* Empty State */}
      {pages.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-24 text-center"
        >
          <div className="relative mb-6">
            <svg width="200" height="160" className="text-border/20">
              <circle cx="100" cy="20" r="16" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" />
              <line x1="100" y1="36" x2="60" y2="70" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 4" />
              <line x1="100" y1="36" x2="140" y2="70" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 4" />
              <circle cx="60" cy="85" r="12" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" />
              <circle cx="140" cy="85" r="12" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" />
              <line x1="60" y1="97" x2="40" y2="120" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 4" />
              <line x1="60" y1="97" x2="80" y2="120" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 4" />
              <circle cx="40" cy="135" r="10" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" />
              <circle cx="80" cy="135" r="10" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">No pages mapped yet</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            Run a site audit to discover your pages. They&apos;ll appear here as an interactive tree.
          </p>
        </motion.div>
      ) : (
        <div className="flex flex-col md:flex-row gap-4" style={{ minHeight: "500px" }}>
          {/* Left: Tree Panel */}
          <div className="w-full md:w-[380px] md:flex-shrink-0 bg-card/60 backdrop-blur-sm border border-border/50 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border/50">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Page Tree</p>
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 320px)" }}>
              <TreeItem
                node={tree}
                level={0}
                selectedId={selectedPage?.id ?? null}
                onSelect={handleNodeClick}
                getRecCount={getRecCount}
                isLast={true}
                parentLines={[]}
              />
            </div>
          </div>

          {/* Right: Detail Panel */}
          <div className="flex-1 min-w-0">
            <AnimatePresence mode="wait">
              {selectedPage ? (
                <motion.div
                  key={selectedPage.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.2 }}
                  className="bg-card/60 backdrop-blur-sm border border-border/50 rounded-xl overflow-hidden h-full"
                >
                  <DetailPanel
                    selectedPage={selectedPage}
                    pageRecs={pageRecs}
                    pageVariants={pageVariants}
                    appliedCount={appliedCount}
                    expandedRecs={expandedRecs}
                    toggleRec={toggleRec}
                    updateRecommendation={updateRecommendation}
                    onClose={() => setSelectedPage(null)}
                  />
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center justify-center h-full bg-card/30 border border-border/30 rounded-xl min-h-[300px]"
                >
                  <div className="text-center text-muted-foreground">
                    <TreePine className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Select a page to view details</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Mobile bottom sheet for detail (when on small screens with a selection) */}
      <div className="md:hidden">
        <AnimatePresence>
          {selectedPage && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-background/60 backdrop-blur-sm z-40"
                onClick={() => setSelectedPage(null)}
              />
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="fixed bottom-0 left-0 right-0 max-h-[85vh] bg-card border-t border-border rounded-t-2xl z-50 overflow-hidden"
              >
                <div className="w-10 h-1 bg-border rounded-full mx-auto mt-2 mb-1" />
                <DetailPanel
                  selectedPage={selectedPage}
                  pageRecs={pageRecs}
                  pageVariants={pageVariants}
                  appliedCount={appliedCount}
                  expandedRecs={expandedRecs}
                  toggleRec={toggleRec}
                  updateRecommendation={updateRecommendation}
                  onClose={() => setSelectedPage(null)}
                />
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
