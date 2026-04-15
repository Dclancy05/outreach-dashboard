"use client"

import { useState, useCallback, useEffect } from "react"
import useSWR from "swr"
import { dashboardApi } from "@/lib/api"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  ArrowLeft,
  CalendarDays,
  Check,
  CheckCircle,
  Film,
  Image,
  LayoutGrid,
  Loader2,
  Palette,
  Plus,
  Search,
  Send,
  Sparkles,
  TrendingUp,
  Upload,
  Wand2,
  X,
  XCircle,
} from "lucide-react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { toast } from "sonner"

const CalendarContent = dynamic(() => import("../content-calendar/page"), { loading: () => <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-2 border-violet-500 border-t-transparent" /></div> })
const CreatorContent = dynamic(() => import("../content-creator/page"), { loading: () => <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-2 border-violet-500 border-t-transparent" /></div> })
const PublisherContent = dynamic(() => import("../content-publisher/page"), { loading: () => <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-2 border-violet-500 border-t-transparent" /></div> })

// ─── Types ──────────────────────────────────────────────────────────

interface Brand {
  id: string
  name: string
  description: string
  niche: string
  tone: string
  emoji: string
  gradientFrom: string
  gradientTo: string
  accountCount: number
  scheduledThisWeek: number
}

interface ContentIdea {
  id: string
  brand_id: string | null
  title: string
  description: string
  source_url: string
  content_type: string
  status: "pending" | "approved" | "rejected" | "created"
  created_at: string
}

// ─── Default Brands ─────────────────────────────────────────────────

const DEFAULT_BRANDS: Brand[] = [
  {
    id: "brand-1",
    name: "College Hustler",
    description: "Relatable college student building a side business. Authentic, raw, Gen-Z energy.",
    niche: "college entrepreneurship",
    tone: "casual",
    emoji: "🎓",
    gradientFrom: "#a855f7",
    gradientTo: "#7c3aed",
    accountCount: 0,
    scheduledThisWeek: 0,
  },
  {
    id: "brand-2",
    name: "Agency Pro",
    description: "Professional digital marketing agency. B2B-focused, case studies, thought leadership.",
    niche: "digital marketing agency",
    tone: "professional",
    emoji: "🏢",
    gradientFrom: "#3b82f6",
    gradientTo: "#06b6d4",
    accountCount: 0,
    scheduledThisWeek: 0,
  },
]

// ─── Sub-tab type ───────────────────────────────────────────────────

type ContentTab = "brands" | "calendar" | "creator" | "publisher"

const TABS: { id: ContentTab; label: string; icon: typeof Palette }[] = [
  { id: "brands", label: "Brands", icon: Palette },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "creator", label: "Creator", icon: Wand2 },
  { id: "publisher", label: "Publisher", icon: Upload },
]

// ─── Content type helpers ───────────────────────────────────────────

const TYPE_BADGE: Record<string, { icon: typeof Image; color: string; label: string }> = {
  reel: { icon: Film, color: "bg-pink-500/20 text-pink-400", label: "Reel" },
  image: { icon: Image, color: "bg-blue-500/20 text-blue-400", label: "Image" },
  carousel: { icon: LayoutGrid, color: "bg-cyan-500/20 text-cyan-400", label: "Carousel" },
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN CONTENT PAGE
// ═══════════════════════════════════════════════════════════════════════

export default function ContentPage() {
  const [activeTab, setActiveTab] = useState<ContentTab>("brands")
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null)
  const [brands] = useState<Brand[]>(DEFAULT_BRANDS)

  // If a brand is selected, show the detail view
  if (selectedBrand) {
    return (
      <BrandDetail
        brand={selectedBrand}
        onBack={() => setSelectedBrand(null)}
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Content Hub</h1>
            <p className="text-sm text-muted-foreground">
              {brands.length} brands · {brands.reduce((s, b) => s + b.accountCount, 0)} accounts · {brands.reduce((s, b) => s + b.scheduledThisWeek, 0)} posts this week
            </p>
          </div>
        </div>
        <Button className="gap-2 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white border-0">
          <Plus className="h-4 w-4" /> New Brand
        </Button>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 bg-secondary/50 p-1 rounded-xl overflow-x-auto scrollbar-none">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 whitespace-nowrap transition-all ${
              activeTab === tab.id
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-card/50"
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "brands" && (
        <BrandsGrid brands={brands} onSelectBrand={setSelectedBrand} />
      )}
      {activeTab === "calendar" && <CalendarContent />}
      {activeTab === "creator" && <CreatorContent />}
      {activeTab === "publisher" && <PublisherContent />}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// BRANDS GRID
// ═══════════════════════════════════════════════════════════════════════

function BrandsGrid({ brands, onSelectBrand }: { brands: Brand[]; onSelectBrand: (b: Brand) => void }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
      {brands.map((brand) => (
        <button
          key={brand.id}
          onClick={() => onSelectBrand(brand)}
          className="group text-left transition-all duration-300 hover:scale-[1.02] hover:shadow-xl rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <div
            className="relative overflow-hidden rounded-2xl p-6 h-full"
            style={{
              background: `linear-gradient(135deg, ${brand.gradientFrom}, ${brand.gradientTo})`,
            }}
          >
            {/* Decorative circles */}
            <div
              className="absolute -top-8 -right-8 w-32 h-32 rounded-full opacity-20"
              style={{ background: brand.gradientTo }}
            />
            <div
              className="absolute -bottom-6 -left-6 w-24 h-24 rounded-full opacity-15"
              style={{ background: brand.gradientFrom }}
            />

            {/* Emoji mascot */}
            <div className="relative mb-4">
              <div className="w-20 h-20 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-4xl mx-auto shadow-lg group-hover:scale-110 transition-transform duration-300">
                {brand.emoji}
              </div>
            </div>

            {/* Name + description */}
            <div className="relative text-center text-white">
              <h3 className="text-lg font-bold mb-1">{brand.name}</h3>
              <p className="text-sm text-white/70 line-clamp-2 mb-4">{brand.description}</p>
            </div>

            {/* Stats bar */}
            <div className="relative flex items-center justify-between text-white/80 text-xs mt-2 pt-3 border-t border-white/20">
              <span className="flex items-center gap-1">
                👤 {brand.accountCount} accounts
              </span>
              <span className="flex items-center gap-1">
                📅 {brand.scheduledThisWeek} this week
              </span>
            </div>
          </div>
        </button>
      ))}

      {/* Add brand card */}
      <button className="group text-left transition-all duration-300 hover:scale-[1.02] rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/50">
        <div className="relative overflow-hidden rounded-2xl p-6 h-full border-2 border-dashed border-muted-foreground/20 hover:border-primary/40 flex flex-col items-center justify-center min-h-[220px] transition-colors">
          <div className="w-16 h-16 rounded-2xl bg-secondary/80 flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors">
            <Plus className="h-7 w-7 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
          <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
            Add New Brand
          </span>
        </div>
      </button>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// BRAND DETAIL VIEW
// ═══════════════════════════════════════════════════════════════════════

function BrandDetail({ brand, onBack }: { brand: Brand; onBack: () => void }) {
  const [ideas, setIdeas] = useState<ContentIdea[]>([])
  const [researching, setResearching] = useState(false)
  const [activeSection, setActiveSection] = useState<"research" | "queue">("research")

  const approvedIdeas = ideas.filter((i) => i.status === "approved")
  const pendingIdeas = ideas.filter((i) => i.status === "pending")

  const handleResearch = useCallback(async () => {
    setResearching(true)
    try {
      const res = await fetch("/api/content/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandId: brand.id,
          niche: brand.niche,
          tone: brand.tone,
        }),
      })
      const data = await res.json()
      if (data.success && data.ideas) {
        setIdeas((prev) => [...data.ideas, ...prev])
        toast.success(`Found ${data.ideas.length} trending ideas!`)
      } else {
        toast.error(data.error || "Research failed")
      }
    } catch {
      toast.error("Failed to research trends")
    }
    setResearching(false)
  }, [brand])

  const updateIdeaStatus = (id: string, status: ContentIdea["status"]) => {
    setIdeas((prev) =>
      prev.map((idea) => (idea.id === id ? { ...idea, status } : idea))
    )
    if (status === "approved") {
      toast.success("Idea approved! Moved to creation queue.")
    }
  }

  return (
    <div className="space-y-6">
      {/* Header with gradient */}
      <div
        className="relative overflow-hidden rounded-2xl p-6"
        style={{
          background: `linear-gradient(135deg, ${brand.gradientFrom}, ${brand.gradientTo})`,
        }}
      >
        <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full opacity-20" style={{ background: brand.gradientTo }} />
        <div className="absolute -bottom-8 -left-8 w-28 h-28 rounded-full opacity-15" style={{ background: brand.gradientFrom }} />

        <div className="relative flex items-start gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="text-white/80 hover:text-white hover:bg-white/20 -ml-2 -mt-1"
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
        </div>

        <div className="relative flex items-center gap-5 mt-2">
          <div className="w-20 h-20 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-4xl shadow-lg shrink-0">
            {brand.emoji}
          </div>
          <div className="text-white flex-1">
            <h1 className="text-2xl font-bold">{brand.name}</h1>
            <p className="text-white/70 text-sm mt-1">{brand.description}</p>
            <div className="flex items-center gap-4 mt-3 text-sm text-white/80">
              <span>📈 {brand.niche}</span>
              <span>👤 {brand.accountCount} accounts</span>
              <span>📅 {brand.scheduledThisWeek} scheduled</span>
            </div>
          </div>
        </div>
      </div>

      {/* Section Toggle */}
      <div className="flex gap-2">
        <Button
          variant={activeSection === "research" ? "default" : "outline"}
          onClick={() => setActiveSection("research")}
          className="gap-2"
        >
          <Search className="h-4 w-4" /> Research & Ideas
          {pendingIdeas.length > 0 && (
            <Badge variant="secondary" className="ml-1 text-xs">{pendingIdeas.length}</Badge>
          )}
        </Button>
        <Button
          variant={activeSection === "queue" ? "default" : "outline"}
          onClick={() => setActiveSection("queue")}
          className="gap-2"
        >
          <Send className="h-4 w-4" /> Content Queue
          {approvedIdeas.length > 0 && (
            <Badge variant="secondary" className="ml-1 text-xs bg-green-500/20 text-green-400">{approvedIdeas.length}</Badge>
          )}
        </Button>
      </div>

      {/* Research Section */}
      {activeSection === "research" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Trending Ideas</h2>
              <p className="text-sm text-muted-foreground">Research trending content for the {brand.niche} niche</p>
            </div>
            <Button
              onClick={handleResearch}
              disabled={researching}
              className="gap-2 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white border-0"
            >
              {researching ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Researching...</>
              ) : (
                <><Search className="h-4 w-4" /> Research Now</>
              )}
            </Button>
          </div>

          {ideas.length === 0 && !researching && (
            <Card className="border-dashed">
              <CardContent className="p-12 text-center">
                <TrendingUp className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                <h3 className="text-lg font-medium mb-2">No ideas yet</h3>
                <p className="text-muted-foreground mb-4">Hit &quot;Research Now&quot; to discover trending content in the {brand.niche} space.</p>
              </CardContent>
            </Card>
          )}

          {researching && ideas.length === 0 && (
            <div className="flex flex-col items-center gap-4 py-12">
              <div className="relative">
                <div className="w-16 h-16 rounded-full border-4 border-violet-500/30 border-t-violet-500 animate-spin" />
                <Search className="h-6 w-6 text-violet-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
              </div>
              <p className="text-sm text-muted-foreground">Searching for trending {brand.niche} content...</p>
            </div>
          )}

          <div className="space-y-3">
            {ideas
              .filter((i) => i.status !== "approved")
              .map((idea) => {
                const typeBadge = TYPE_BADGE[idea.content_type] || TYPE_BADGE.image
                const isRejected = idea.status === "rejected"
                return (
                  <Card
                    key={idea.id}
                    className={`transition-all duration-300 ${
                      isRejected ? "opacity-40 scale-[0.98]" : "hover:border-primary/30"
                    }`}
                  >
                    <CardContent className="p-4 flex items-start gap-4">
                      {/* Trend icon */}
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-lg">📈</span>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2 mb-1">
                          <h4 className="font-semibold text-sm leading-tight">{idea.title}</h4>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{idea.description}</p>
                        <div className="flex items-center gap-2">
                          <Badge className={`text-[10px] ${typeBadge.color} border-0`}>
                            <typeBadge.icon className="h-3 w-3 mr-1" />
                            {typeBadge.label}
                          </Badge>
                          {idea.source_url && (
                            <a
                              href={idea.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] text-muted-foreground hover:text-primary truncate max-w-[200px]"
                            >
                              {new URL(idea.source_url).hostname}
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      {!isRejected && (
                        <div className="flex gap-1.5 shrink-0">
                          <Button
                            size="sm"
                            className="h-9 w-9 p-0 bg-green-600 hover:bg-green-700 text-white"
                            onClick={() => updateIdeaStatus(idea.id, "approved")}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-9 w-9 p-0 hover:bg-red-500/20 hover:text-red-400 hover:border-red-400"
                            onClick={() => updateIdeaStatus(idea.id, "rejected")}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
          </div>
        </div>
      )}

      {/* Content Queue Section */}
      {activeSection === "queue" && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Content Queue</h2>
            <p className="text-sm text-muted-foreground">Approved ideas being created or ready to post</p>
          </div>

          {approvedIdeas.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-12 text-center">
                <CheckCircle className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                <h3 className="text-lg font-medium mb-2">Queue is empty</h3>
                <p className="text-muted-foreground mb-4">Approve ideas from the Research tab to fill the creation queue.</p>
                <Button variant="outline" onClick={() => setActiveSection("research")} className="gap-2">
                  <Search className="h-4 w-4" /> Go to Research
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {approvedIdeas.map((idea) => {
                const typeBadge = TYPE_BADGE[idea.content_type] || TYPE_BADGE.image
                return (
                  <Card key={idea.id} className="border-green-500/20 bg-green-500/5">
                    <CardContent className="p-4 flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center shrink-0">
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-sm">{idea.title}</h4>
                        <p className="text-xs text-muted-foreground truncate">{idea.description}</p>
                      </div>
                      <Badge className={`text-[10px] ${typeBadge.color} border-0`}>
                        <typeBadge.icon className="h-3 w-3 mr-1" />
                        {typeBadge.label}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] text-yellow-400 border-yellow-400/30">
                        Creating...
                      </Badge>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// EmbeddedPage removed — content pages are now rendered inline via dynamic imports
