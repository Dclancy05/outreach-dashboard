"use client"

import { useState, useCallback, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import useSWR from "swr"
import { dashboardApi } from "@/lib/api"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import {
  Copy,
  Check,
  SkipForward,
  FileText,
  XCircle,
  Send,
  Instagram,
  MapPin,
  Star,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Settings,
  MessageCircle,
  Facebook,
  Linkedin,
  X,
  Search,
  BarChart3,
  Zap,
  AlertTriangle,
  Sparkles,
  ClipboardCheck,
} from "lucide-react"
import { toast } from "sonner"
import Link from "next/link"

type Platform = "instagram" | "facebook" | "linkedin"

interface TemplateItem {
  id: string
  template_group: string
  platform: string
  label: string
  emoji: string
  body: string
  sort_order: number
}

interface DailyLimits {
  instagram: number
  facebook: number
  linkedin: number
  email: number
  sms: number
}

const PLATFORM_CONFIG: Record<Platform, { icon: typeof Instagram; color: string; urlField: string; label: string }> = {
  instagram: { icon: Instagram, color: "text-pink-400", urlField: "instagram_url", label: "Instagram" },
  facebook: { icon: Facebook, color: "text-blue-400", urlField: "facebook_url", label: "Facebook" },
  linkedin: { icon: Linkedin, color: "text-sky-400", urlField: "linkedin_url", label: "LinkedIn" },
}

function extractUsername(url: string, platform: Platform): string {
  if (!url) return ""
  if (platform === "instagram") {
    const match = url.replace(/\/+$/, "").match(/instagram\.com\/([^/?]+)/)
    return match ? match[1] : url
  }
  if (platform === "facebook") {
    const match = url.replace(/\/+$/, "").match(/facebook\.com\/([^/?]+)/)
    return match ? match[1] : url
  }
  if (platform === "linkedin") {
    const match = url.replace(/\/+$/, "").match(/linkedin\.com\/(?:in|company)\/([^/?]+)/)
    return match ? match[1] : url
  }
  return url
}

// NICHE auto-replace: swap "NICHE" in template with lead's business type
const NICHE_MAP: Record<string, string> = {
  "Hair salon": "salons, barbershops, etc.",
  "Barber shop": "barbershops, salons, etc.",
  "Nail salon": "nail salons, spas, etc.",
  "Spa": "spas, salons, etc.",
  "Tanning salon": "tanning salons, spas, etc.",
  "Dentist": "dentists, clinics, etc.",
  "Restaurant": "restaurants, cafes, etc.",
  "Gym": "gyms, fitness studios, etc.",
  "Yoga studio": "yoga studios, gyms, etc.",
  "Auto repair": "auto shops, mechanics, etc.",
  "Pet grooming": "pet groomers, vet clinics, etc.",
  "Photography": "photographers, studios, etc.",
  "Retail": "retail shops, boutiques, etc.",
  "Accountant": "accountants, tax firms, etc.",
  "Law firm": "law firms, legal offices, etc.",
  "Real estate": "real estate agencies, brokerages, etc.",
  "Contractor": "contractors, remodeling companies, etc.",
  "Plumber": "plumbers, contractors, etc.",
  "Electrician": "electricians, contractors, etc.",
  "HVAC": "HVAC companies, contractors, etc.",
  "Cleaning": "cleaning services, janitorial companies, etc.",
  "Landscaping": "landscapers, lawn care companies, etc.",
}

function applyNicheReplace(text: string, businessType: string): string {
  if (!text.includes("NICHE")) return text
  const mapped = NICHE_MAP[businessType]
  if (mapped) return text.replace(/NICHE/g, mapped)
  if (businessType) {
    const lower = businessType.toLowerCase()
    return text.replace(/NICHE/g, `${lower}s, ${lower} businesses, etc.`)
  }
  return text.replace(/NICHE/g, "local businesses")
}

// PLATFORM auto-replace: swap platform references in templates
const PLATFORM_NAMES: Record<Platform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
}

function applyPlatformReplace(text: string, platform: Platform): string {
  let result = text.replace(/PLATFORM/g, PLATFORM_NAMES[platform])
  if (platform !== "instagram") {
    result = result.replace(/\b(your |the |their )?Instagram\b/gi, (match, prefix) => {
      return (prefix || "") + PLATFORM_NAMES[platform]
    })
  }
  if (platform !== "facebook") {
    result = result.replace(/\b(your |the |their )?Facebook\b/gi, (match, prefix) => {
      return (prefix || "") + PLATFORM_NAMES[platform]
    })
  }
  if (platform !== "linkedin") {
    result = result.replace(/\b(your |the |their )?LinkedIn\b/gi, (match, prefix) => {
      return (prefix || "") + PLATFORM_NAMES[platform]
    })
  }
  return result
}

function applyAllReplacements(text: string, businessType: string, plat: Platform): string {
  return applyPlatformReplace(applyNicheReplace(text, businessType), plat)
}

// Head + Body template system
interface HeadTemplate {
  id: string
  label: string
  emoji: string
  text: string
}

const HEADS: HeadTemplate[] = [
  { id: "h1", label: "Casual Hey", emoji: "👋", text: "Hey, how's it going?" },
  { id: "h2", label: "Compliment", emoji: "🔥", text: "Hey! Love what you guys are doing with your PLATFORM." },
  { id: "h3", label: "Student Intro", emoji: "🎓", text: "Hi, Im Dylan, a Baruch College student." },
  { id: "h4", label: "Team Intro", emoji: "👥", text: "Hey! Im Dylan, a college student at Baruch. My classmates and I are building marketing campaigns for local businesses." },
  { id: "h5", label: "Quick Question", emoji: "💬", text: "Hey! Quick question for you." },
  { id: "h6", label: "Direct", emoji: "🎯", text: "Hey, just wanted to reach out real quick." },
]

function getProfileUrl(url: string, platform: Platform): string {
  if (!url) return "#"
  if (url.startsWith("http")) return url
  if (platform === "instagram") return `https://instagram.com/${url}`
  if (platform === "facebook") return `https://facebook.com/${url}`
  if (platform === "linkedin") return `https://linkedin.com/in/${url}`
  return url
}

// Fallback templates when Supabase tables don't exist yet
const FALLBACK_TEMPLATES: TemplateItem[] = [
  { id: "f1", template_group: "partnership", platform: "instagram", label: "Partnership", emoji: "🤝", body: "Hey, how's it going? I love what you guys are doing with your Instagram. I just thought of something that might help you guys out. I wanted to see if you guys were open to a simple partnership. I'm using a system right now and it's booking around 30 to 40 appointments a month using just direct outreach. So there's no ads. I just wanted to test it out for your business. So obviously there's no upfront cost, no long pitch. I just want to see if we can potentially work together long term. So if you're open to it, let me know and let me know when you're free this week and we can chat for a few minutes.", sort_order: 1 },
  { id: "f2", template_group: "solo_student", platform: "instagram", label: "Portfolio Pitch", emoji: "📸", body: "Hi, Im Dylan, a Baruch College student. Love what you guys are doing with your instagram! I am trying to build my portfolio by running marketing campaigns at no risk for businesses. I believe I would be a great addition to the company. Feel free to reach out if you are available sometime this week to talk.", sort_order: 2 },
  { id: "f3", template_group: "solo_student", platform: "instagram", label: "NICHE Pitch", emoji: "💬", body: "Hello, Im Dylan, a student at Baruch College just wanted to see if you were open to hiring. I'm working with some other NICHE (spas, accountants, etc.) and Im getting a few dozen appointments for them. I'm not selling anything just trying to work with you. Would you be open to chatting?", sort_order: 3 },
  { id: "f4", template_group: "group_project", platform: "instagram", label: "Team Portfolio", emoji: "👥", body: "Hey! Im Dylan, a college student at Baruch. My classmates and I are building marketing campaigns for local businesses in the Metropolitan area to grow our portfolios. No ads or cost to you, just hard work on our end. Would love to work with you if you're interested in hearing more!", sort_order: 4 },
]

const GROUP_LABELS: Record<string, string> = {
  solo_student: "Solo Student",
  group_project: "Group Project",
  partnership: "Partnership",
  custom: "Custom",
}

export default function ManualModePage() {
  const [platform, setPlatform] = useState<Platform>("instagram")
  const [offset, setOffset] = useState(0)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [lastCopiedTemplate, setLastCopiedTemplate] = useState<TemplateItem | null>(null)
  const [acting, setActing] = useState(false)
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [respondedOpen, setRespondedOpen] = useState(false)
  const [respondedNote, setRespondedNote] = useState("")
  const [dailyLimits, setDailyLimits] = useState<DailyLimits>({ instagram: 40, facebook: 30, linkedin: 20, email: 50, sms: 20 })
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [searchRespondedLead, setSearchRespondedLead] = useState<any>(null)
  const [showStats, setShowStats] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [selectedHead, setSelectedHead] = useState<HeadTemplate | null>(null)
  const [showComposer, setShowComposer] = useState(false)

  // Outreach power-ups state
  const [showPainPoints, setShowPainPoints] = useState(false)
  const [painPoints, setPainPoints] = useState<any[]>([])
  const [loadingPain, setLoadingPain] = useState(false)
  const [showOpeners, setShowOpeners] = useState(false)
  const [openers, setOpeners] = useState<any[]>([])
  const [loadingOpeners, setLoadingOpeners] = useState(false)
  const [showAudit, setShowAudit] = useState(false)
  const [auditInsights, setAuditInsights] = useState<any[]>([])
  const [loadingAudit, setLoadingAudit] = useState(false)
  const [copiedOpener, setCopiedOpener] = useState<string | null>(null)

  // Fetch data
  const { data: queueData, isLoading, mutate } = useSWR(
    `manual-queue-v2-${platform}-${offset}`,
    () => dashboardApi("manual_queue_leads_v2", { platform, offset })
  )

  const { data: templates } = useSWR(
    `templates-${platform}`,
    () => dashboardApi("get_templates", { platform })
  )

  const { data: settingsData } = useSWR("outreach_settings", () => dashboardApi("get_outreach_settings", {}))

  const { data: sendCounts, mutate: mutateCounts } = useSWR("daily_send_counts", () => dashboardApi("get_daily_send_counts", {}))

  const { data: templateStats } = useSWR(
    showStats ? `template-stats-${platform}` : null,
    () => dashboardApi("get_template_stats", { platform })
  )

  // Search for leads to mark responded
  const searchLeads = useCallback(async (q: string) => {
    if (q.length < 2) { setSearchResults([]); return }
    setSearching(true)
    try {
      const results = await dashboardApi("search_leads_quick", { query: q })
      setSearchResults(results || [])
    } catch { setSearchResults([]) }
    finally { setSearching(false) }
  }, [])

  useEffect(() => {
    if (settingsData?.daily_limits) setDailyLimits(settingsData.daily_limits)
  }, [settingsData])

  const lead = queueData?.lead
  const totalRemaining = queueData?.total_remaining || 0
  const todayCounts: Record<string, number> = sendCounts || { instagram: 0, facebook: 0, linkedin: 0, total: 0 }

  // Fetch sent history for current lead
  const { data: leadHistory } = useSWR(
    lead && showHistory ? `lead-history-${lead.lead_id}` : null,
    () => dashboardApi("get_manual_sends", { lead_id: lead?.lead_id })
  )

  const templateList: TemplateItem[] = (templates && templates.length > 0) ? templates : FALLBACK_TEMPLATES.filter(t => t.platform === platform)

  // Group templates
  const groupedTemplates: Record<string, TemplateItem[]> = {}
  for (const t of templateList) {
    const g = t.template_group || "custom"
    if (!groupedTemplates[g]) groupedTemplates[g] = []
    groupedTemplates[g].push(t)
  }

  const urlField = PLATFORM_CONFIG[platform].urlField
  const profileUrl = lead ? getProfileUrl(lead[urlField] || "", platform) : "#"
  const username = lead ? extractUsername(lead[urlField] || "", platform) : ""

  const copyToClipboard = useCallback(async (text: string, id: string, template?: TemplateItem) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement("textarea")
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand("copy")
      document.body.removeChild(ta)
    }
    setCopiedId(id)
    if (template) setLastCopiedTemplate(template)
    setTimeout(() => setCopiedId(null), 1500)
  }, [])

  const markLead = useCallback(
    async (status: "contacted" | "not_found" | "skipped") => {
      if (!lead || acting) return
      setActing(true)
      try {
        await dashboardApi("manual_mark_lead", { lead_id: lead.lead_id, status })

        if (status === "contacted" && lastCopiedTemplate) {
          try {
            const res = await fetch("/api/automation/send", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                platform,
                lead_id: lead.lead_id,
                message: lastCopiedTemplate.body,
                template_id: lastCopiedTemplate.id?.startsWith("f") ? undefined : lastCopiedTemplate.id,
              }),
            })
            const result = await res.json()
            if (result.success) {
              toast.success(`✅ Message queued for ${PLATFORM_CONFIG[platform].label}`, {
                description: `Sends today: ${result.sends_today}/${result.daily_limit}`,
              })
            } else {
              toast.error(`Send failed: ${result.error}`)
            }
          } catch {
            try {
              await dashboardApi("log_manual_send", {
                lead_id: lead.lead_id,
                template_id: lastCopiedTemplate.id?.startsWith("f") ? null : lastCopiedTemplate.id,
                platform,
                message_text: lastCopiedTemplate.body,
              })
            } catch { /* graceful */ }
          }
        }

        setOffset(0)
        setLastCopiedTemplate(null)
        mutate()
        mutateCounts()
      } finally {
        setActing(false)
      }
    },
    [lead, acting, lastCopiedTemplate, platform, mutate, mutateCounts]
  )

  const markResponded = useCallback(async () => {
    const targetLead = searchRespondedLead || lead
    if (!targetLead || acting) return
    setActing(true)
    try {
      await dashboardApi("update_lead", {
        lead_id: targetLead.lead_id,
        status: "responded",
        sequence_id: "",
        notes: respondedNote ? `[Responded] ${respondedNote}` : "",
      })
      setRespondedOpen(false)
      setRespondedNote("")
      setSearchRespondedLead(null)
      setOffset(0)
      mutate()
      mutateCounts()
      toast.success(`${targetLead.name} marked as responded!`)
    } finally {
      setActing(false)
    }
  }, [lead, searchRespondedLead, acting, respondedNote, mutate, mutateCounts])

  const skip = useCallback(() => setOffset((o) => o + 1), [])

  const saveLimits = useCallback(async () => {
    try {
      await dashboardApi("update_outreach_settings", { daily_limits: dailyLimits })
      toast.success("Limits saved!")
      setSettingsOpen(false)
    } catch {
      toast.error("Failed to save limits")
    }
  }, [dailyLimits])

  // Niche mapper for outreach tools
  const getNicheKey = useCallback((bizType: string) => {
    const bt = (bizType || "").toLowerCase()
    const map: [string, string][] = [
      ["restaurant", "restaurants"], ["cafe", "restaurants"], ["pizza", "restaurants"], ["bakery", "restaurants"],
      ["contractor", "contractors"], ["remodel", "contractors"], ["construction", "contractors"],
      ["dentist", "dentists"], ["dental", "dentists"],
      ["barber", "barbers"],
      ["gym", "gyms"], ["fitness", "gyms"], ["crossfit", "gyms"], ["yoga", "gyms"],
      ["pet", "pet_groomers"], ["groom", "pet_groomers"],
      ["auto", "auto_shops"], ["mechanic", "auto_shops"],
      ["nail", "nail_salons"],
      ["photo", "photographers"],
      ["retail", "retail"], ["boutique", "retail"], ["shop", "retail"],
      ["salon", "salons"], ["hair", "salons"], ["beauty", "salons"],
      ["chiro", "chiropractors"],
      ["med spa", "med_spas"], ["medspa", "med_spas"], ["aesthet", "med_spas"],
      ["law", "lawyers"], ["attorney", "lawyers"],
      ["real estate", "real_estate"], ["realtor", "real_estate"],
      ["clean", "cleaning"], ["maid", "cleaning"],
      ["hvac", "hvac_plumbers"], ["plumb", "hvac_plumbers"],
      ["daycare", "daycares"], ["childcare", "daycares"],
    ]
    for (const [k, v] of map) { if (bt.includes(k)) return v }
    return "restaurants"
  }, [])

  const fetchPainPoints = useCallback(async () => {
    if (!lead) return
    setLoadingPain(true)
    try {
      const niche = getNicheKey(lead.business_type || "")
      const res = await fetch(`/api/outreach-tools?action=pain_points&niche=${niche}`)
      const json = await res.json()
      setPainPoints((json.data || []).slice(0, 3))
    } catch { setPainPoints([]) }
    finally { setLoadingPain(false) }
  }, [lead, getNicheKey])

  const fetchOpeners = useCallback(async () => {
    if (!lead) return
    setLoadingOpeners(true)
    try {
      const res = await fetch(`/api/outreach-tools?action=generate_opener&lead_id=${lead.lead_id}`)
      const json = await res.json()
      setOpeners(json.data || [])
    } catch { setOpeners([]) }
    finally { setLoadingOpeners(false) }
  }, [lead])

  const fetchAudit = useCallback(async () => {
    if (!lead) return
    setLoadingAudit(true)
    try {
      const niche = getNicheKey(lead.business_type || "")
      const res = await fetch(`/api/outreach-tools?action=micro_audits&niche=${niche}`)
      const json = await res.json()
      const all = json.data || []
      const picked: any[] = []
      const types = ["website", "social", "reviews", "general"]
      for (const t of types) {
        const ofType = all.filter((a: any) => a.audit_type === t)
        if (ofType.length > 0) picked.push(ofType[Math.floor(Math.random() * ofType.length)])
        if (picked.length >= 3) break
      }
      setAuditInsights(picked)
    } catch { setAuditInsights([]) }
    finally { setLoadingAudit(false) }
  }, [lead, getNicheKey])

  const copyOpener = useCallback(async (text: string, id: string) => {
    let filled = text
    if (lead) {
      const firstName = lead.name?.split(" ")[0] || "there"
      filled = filled.replaceAll("{{name}}", firstName)
        .replaceAll("{{business_name}}", lead.name || "your business")
        .replaceAll("{{business_type}}", lead.business_type || "business")
        .replaceAll("{{city}}", lead.city || "your area")
    }
    try {
      await navigator.clipboard.writeText(filled)
    } catch {
      const ta = document.createElement("textarea")
      ta.value = filled
      document.body.appendChild(ta)
      ta.select()
      document.execCommand("copy")
      document.body.removeChild(ta)
    }
    setCopiedOpener(id)
    setTimeout(() => setCopiedOpener(null), 1500)
  }, [lead])

  // Reset outreach tools when lead changes
  useEffect(() => {
    setShowPainPoints(false)
    setShowOpeners(false)
    setShowAudit(false)
    setPainPoints([])
    setOpeners([])
    setAuditInsights([])
  }, [lead?.lead_id])

  const PlatformIcon = PLATFORM_CONFIG[platform].icon

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="min-h-screen pb-32 px-3 pt-14 md:pt-6 max-w-lg mx-auto"
    >
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <div className="rounded-xl p-1.5 bg-orange-500/20">
              <Send className="h-4 w-4 text-orange-400" />
            </div>
            Manual Mode
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Copy → Paste → Send
          </p>
        </div>
        <button onClick={() => setSettingsOpen(true)} className="p-2 rounded-xl hover:bg-muted/50 transition-colors">
          <Settings className="h-5 w-5 text-muted-foreground" />
        </button>
      </motion.div>

      {/* Platform Tabs */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }} className="flex gap-1 mb-4 bg-muted/30 backdrop-blur-sm rounded-xl p-1">
        {(["instagram", "facebook", "linkedin"] as Platform[]).map((p) => {
          const Icon = PLATFORM_CONFIG[p].icon
          const count = todayCounts[p] || 0
          const limit = dailyLimits[p] || 0
          const isActive = platform === p
          return (
            <button
              key={p}
              onClick={() => { setPlatform(p); setOffset(0) }}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-medium transition-all",
                isActive ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className={cn("h-4 w-4", isActive && PLATFORM_CONFIG[p].color)} />
              <span className="hidden xs:inline">{PLATFORM_CONFIG[p].label}</span>
              <span className={cn(
                "text-[10px] font-mono px-1.5 py-0.5 rounded-full",
                count >= limit ? "bg-red-500/20 text-red-400" : "bg-secondary text-muted-foreground"
              )}>
                {count}/{limit}
              </span>
            </button>
          )
        })}
      </motion.div>

      {/* Search + Quick Responded */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.15 }} className="mb-3 relative">
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search lead to mark responded..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); searchLeads(e.target.value) }}
              className="pl-9 h-9 text-sm rounded-xl"
            />
          </div>
          <button onClick={() => setShowStats(!showStats)} className={cn("p-2 rounded-xl transition-colors", showStats ? "bg-orange-500/20 text-orange-400" : "hover:bg-muted/50 text-muted-foreground")}>
            <BarChart3 className="h-4 w-4" />
          </button>
        </div>
        {searchResults.length > 0 && searchQuery.length >= 2 && (
          <div className="absolute z-50 top-11 left-0 right-0 max-h-60 overflow-y-auto rounded-2xl bg-card/80 backdrop-blur-xl border border-border/50 shadow-lg">
            <div className="p-1">
              {searchResults.map((r: any) => (
                <button
                  key={r.lead_id}
                  className="w-full flex items-center gap-2 p-2 rounded-xl hover:bg-muted/30 text-left transition-colors"
                  onClick={() => {
                    setSearchRespondedLead(r)
                    setRespondedOpen(true)
                    setSearchQuery("")
                    setSearchResults([])
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{r.name}</p>
                    <p className="text-xs text-muted-foreground">{r.business_type} • {r.city}</p>
                  </div>
                  <div className="flex gap-1">
                    {r.instagram_url && <Instagram className="h-3 w-3 text-pink-400" />}
                    {r.facebook_url && <Facebook className="h-3 w-3 text-blue-400" />}
                    {r.linkedin_url && <Linkedin className="h-3 w-3 text-sky-400" />}
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0 border-border/50">{r.status}</Badge>
                </button>
              ))}
            </div>
          </div>
        )}
      </motion.div>

      {/* A/B Stats */}
      <AnimatePresence>
        {showStats && templateStats && templateStats.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4 overflow-hidden"
          >
            <div className="rounded-2xl bg-card/60 backdrop-blur-xl border border-orange-500/20 p-3 shadow-lg">
              <h3 className="text-xs font-semibold text-muted-foreground mb-2">📊 TEMPLATE PERFORMANCE</h3>
              <div className="space-y-1.5">
                {templateList.filter(t => templateStats.some((s: any) => s.template_id === t.id)).map(t => {
                  const stat = templateStats.find((s: any) => s.template_id === t.id)
                  if (!stat || stat.sends === 0) return null
                  return (
                    <div key={t.id} className="flex items-center gap-2 text-xs">
                      <span className="w-4">{t.emoji}</span>
                      <span className="flex-1 truncate">{t.label}</span>
                      <span className="text-muted-foreground font-mono">{stat.sends} sent</span>
                      <span className={cn("font-mono font-bold", stat.response_rate >= 10 ? "text-green-400" : stat.response_rate >= 5 ? "text-yellow-400" : "text-muted-foreground")}>
                        {stat.response_rate}%
                      </span>
                    </div>
                  )
                })}
                {templateStats.every((s: any) => s.sends === 0) && (
                  <p className="text-xs text-muted-foreground">No sends tracked yet. Stats will appear after you start sending!</p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Progress bar */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="mb-4">
        <div className="flex justify-between text-xs text-muted-foreground mb-1">
          <span>{totalRemaining} in queue</span>
          <span>#{offset + 1}</span>
        </div>
        <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, ((todayCounts[platform] || 0) / Math.max(1, dailyLimits[platform])) * 100)}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="h-full bg-gradient-to-r from-orange-500 to-pink-500 rounded-full"
          />
        </div>
      </motion.div>

      {isLoading ? (
        <div className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 p-6 shadow-lg animate-pulse">
          <div className="space-y-4">
            <div className="h-6 bg-muted/20 rounded w-3/4" />
            <div className="h-4 bg-muted/20 rounded w-1/2" />
            <div className="h-10 bg-muted/20 rounded" />
          </div>
        </div>
      ) : !lead ? (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 p-8 shadow-lg text-center">
          <div className="text-4xl mb-3">🎉</div>
          <h2 className="text-lg font-bold mb-1">Queue Empty!</h2>
          <p className="text-muted-foreground text-sm">
            No more {PLATFORM_CONFIG[platform].label} leads to contact.
            {(todayCounts[platform] || 0) > 0 && (
              <><br /><span className="text-green-400 font-medium">You sent {todayCounts[platform]} messages today!</span></>
            )}
          </p>
        </motion.div>
      ) : (
        <>
          {/* Lead Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mb-4 rounded-2xl bg-card/60 backdrop-blur-xl border border-orange-500/20 p-4 shadow-lg"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold truncate">{lead.name}</h2>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-0.5">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">
                    {[lead.city, lead.state].filter(Boolean).join(", ") || "—"}
                  </span>
                </div>
              </div>
              {lead.total_score && (
                <Badge variant="outline" className={cn("shrink-0 ml-2 border-border/50", Number(lead.total_score) >= 70 ? "border-green-500/50 text-green-400" : Number(lead.total_score) >= 40 ? "border-yellow-500/50 text-yellow-400" : "border-muted")}>
                  <Star className="h-3 w-3 mr-1" />
                  {lead.total_score}
                </Badge>
              )}
            </div>

            {lead.business_type && (
              <Badge variant="secondary" className="mb-2 text-xs">{lead.business_type}</Badge>
            )}

            {/* Platform readiness indicators */}
            <div className="flex gap-1.5 mb-3 flex-wrap">
              <span className={cn("text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1",
                lead.instagram_url ? (platform === "instagram" ? "bg-pink-500/20 text-pink-400" : "bg-green-500/10 text-green-400") : "bg-muted/30 text-muted-foreground/40")}>
                {lead.instagram_url ? "✅" : "—"} <Instagram className="h-3 w-3" /> IG
              </span>
              <span className={cn("text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1",
                lead.facebook_url ? (platform === "facebook" ? "bg-blue-500/20 text-blue-400" : "bg-green-500/10 text-green-400") : "bg-muted/30 text-muted-foreground/40")}>
                {lead.facebook_url ? "✅" : "—"} <Facebook className="h-3 w-3" /> FB
              </span>
              <span className={cn("text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1",
                lead.linkedin_url
                  ? (lead.linkedin_url.includes("/company/") ? "bg-yellow-500/10 text-yellow-400" : (platform === "linkedin" ? "bg-sky-500/20 text-sky-400" : "bg-green-500/10 text-green-400"))
                  : "bg-muted/30 text-muted-foreground/40")}>
                {lead.linkedin_url ? (lead.linkedin_url.includes("/company/") ? "⚠️" : "✅") : "—"} <Linkedin className="h-3 w-3" /> LI
              </span>
              <span className={cn("text-[10px] px-2 py-0.5 rounded-full",
                lead.phone ? "bg-green-500/10 text-green-400" : "bg-muted/30 text-muted-foreground/40")}>
                {lead.phone ? "✅" : "—"} 📞
              </span>
              <span className={cn("text-[10px] px-2 py-0.5 rounded-full",
                lead.email ? "bg-green-500/10 text-green-400" : "bg-muted/30 text-muted-foreground/40")}>
                {lead.email ? "✅" : "—"} 📧
              </span>
            </div>

            {/* Username + Copy */}
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-muted/30 backdrop-blur-sm rounded-xl px-4 py-3 flex items-center gap-2">
                <PlatformIcon className={cn("h-5 w-5 shrink-0", PLATFORM_CONFIG[platform].color)} />
                <span className="font-mono font-bold text-base truncate">
                  {platform === "instagram" ? `@${username}` : username}
                </span>
              </div>
              <Button
                size="lg"
                className={cn(
                  "shrink-0 h-12 px-4 rounded-xl font-bold transition-colors",
                  copiedId === "username" ? "bg-green-600 hover:bg-green-600" : "bg-pink-600 hover:bg-pink-700"
                )}
                onClick={() => copyToClipboard(platform === "instagram" ? `@${username}` : username, "username")}
              >
                {copiedId === "username" ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
              </Button>
            </div>

            {/* Lead Intel - scraped data for personalization */}
            {lead._raw_scrape_data && (() => {
              try {
                const scrape = typeof lead._raw_scrape_data === 'string' ? JSON.parse(lead._raw_scrape_data) : lead._raw_scrape_data
                const hasData = scrape.ig_followers || scrape.ig_bio || scrape.ig_business_category || scrape.ig_last_caption
                if (!hasData) return null
                return (
                  <div className="mt-2 mb-1 p-2 rounded-xl bg-muted/20 backdrop-blur-sm space-y-1">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Lead Intel</p>
                    {scrape.ig_followers > 0 && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground">Followers:</span>
                        <span className="font-mono font-bold">{Number(scrape.ig_followers).toLocaleString()}</span>
                        {scrape.ig_posts_count > 0 && <span className="text-muted-foreground">• {scrape.ig_posts_count} posts</span>}
                        {scrape.ig_is_verified && <span className="text-blue-400">✓ verified</span>}
                      </div>
                    )}
                    {scrape.ig_business_category && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground">Category:</span>
                        <span>{scrape.ig_business_category}</span>
                      </div>
                    )}
                    {scrape.ig_bio && (
                      <div className="text-xs">
                        <span className="text-muted-foreground">Bio: </span>
                        <span className="text-muted-foreground/80 italic">{String(scrape.ig_bio).slice(0, 120)}{String(scrape.ig_bio).length > 120 ? '...' : ''}</span>
                      </div>
                    )}
                    {scrape.ig_last_caption && (
                      <div className="text-xs">
                        <span className="text-muted-foreground">Last post: </span>
                        <span className="text-muted-foreground/80 italic">{String(scrape.ig_last_caption).slice(0, 100)}{String(scrape.ig_last_caption).length > 100 ? '...' : ''}</span>
                      </div>
                    )}
                    {scrape.ig_external_url && (
                      <div className="text-xs">
                        <span className="text-muted-foreground">Link: </span>
                        <a href={scrape.ig_external_url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">{String(scrape.ig_external_url).slice(0, 40)}</a>
                      </div>
                    )}
                    {(scrape.fb_followers > 0 || scrape.fb_rating > 0) && (
                      <div className="flex items-center gap-2 text-xs">
                        <Facebook className="h-3 w-3 text-blue-400" />
                        {scrape.fb_followers > 0 && <span>{Number(scrape.fb_followers).toLocaleString()} followers</span>}
                        {scrape.fb_rating > 0 && <span>⭐ {scrape.fb_rating}</span>}
                      </div>
                    )}
                  </div>
                )
              } catch { return null }
            })()}

            {/* Open profile link */}
            <a
              href={profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn("flex items-center justify-center gap-2 mt-2 text-sm hover:opacity-80 transition-colors py-1.5", PLATFORM_CONFIG[platform].color)}
            >
              Open in {PLATFORM_CONFIG[platform].label} <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </motion.div>

          {/* Sent History Toggle */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.25 }} className="mb-3">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all border",
                showHistory ? "bg-violet-500/10 border-violet-500/30 text-violet-400" : "bg-muted/20 border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <MessageCircle className="h-4 w-4" />
              <span className="flex-1 text-left">Sent History</span>
              {showHistory ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            <AnimatePresence>
              {showHistory && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-2 space-y-2 overflow-hidden"
                >
                  {!leadHistory || leadHistory.length === 0 ? (
                    <p className="text-xs text-muted-foreground px-3 py-2">No messages sent to this lead yet.</p>
                  ) : (
                    leadHistory.map((send: any) => (
                      <div key={send.id} className="rounded-xl bg-card/60 backdrop-blur-xl border border-border/50 p-3 shadow-sm">
                        <div className="flex items-center gap-2 mb-1.5">
                          <Badge variant="outline" className="text-[10px] border-border/50">
                            {send.platform === "instagram" ? "📸 IG" : send.platform === "facebook" ? "📘 FB" : send.platform === "linkedin" ? "💼 LI" : send.platform === "email" ? "📧 Email" : send.platform === "sms" ? "📱 SMS" : send.platform}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(send.sent_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })} at {new Date(send.sent_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground/80 leading-relaxed line-clamp-3">{send.message_text}</p>
                      </div>
                    ))
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* ═══ OUTREACH TOOLS ═══ */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.3 }} className="mb-3 space-y-2">
            {/* Generate Openers */}
            <div>
              <button
                onClick={() => { setShowOpeners(!showOpeners); if (!showOpeners && openers.length === 0) fetchOpeners() }}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all border",
                  showOpeners ? "bg-green-500/10 border-green-500/30 text-green-400" : "bg-muted/20 border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <Sparkles className="h-4 w-4" />
                <span className="flex-1 text-left">Generate Openers</span>
                {showOpeners ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              <AnimatePresence>
                {showOpeners && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-2 space-y-2 overflow-hidden"
                  >
                    {loadingOpeners ? (
                      <p className="text-xs text-muted-foreground px-3 py-2 animate-pulse">Generating personalized openers...</p>
                    ) : openers.length === 0 ? (
                      <p className="text-xs text-muted-foreground px-3 py-2">No openers generated. Try again.</p>
                    ) : openers.map((op: any) => (
                      <div key={op.id} className="rounded-xl bg-card/60 backdrop-blur-xl border border-green-500/10 p-3 shadow-sm">
                        <div className="flex items-center gap-2 mb-1.5">
                          <Badge variant="outline" className="text-[10px] capitalize border-border/50">{op.style}</Badge>
                          {op.platform && <Badge variant="secondary" className="text-[10px]">{op.platform}</Badge>}
                        </div>
                        <p className="text-sm leading-relaxed mb-2">{op.filled_text}</p>
                        <Button
                          size="sm"
                          variant="outline"
                          className={cn("w-full h-9 text-xs font-semibold rounded-xl", copiedOpener === op.id ? "bg-green-600 border-green-600 text-foreground" : "border-green-500/30 text-green-400 hover:bg-green-500/10")}
                          onClick={() => copyOpener(op.filled_text, op.id)}
                        >
                          {copiedOpener === op.id ? <><Check className="h-3 w-3 mr-1" /> Copied!</> : <><Copy className="h-3 w-3 mr-1" /> Copy</>}
                        </Button>
                      </div>
                    ))}
                    <Button size="sm" variant="ghost" className="w-full text-xs text-muted-foreground rounded-xl" onClick={fetchOpeners} disabled={loadingOpeners}>
                      🔄 Regenerate
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

          </motion.div>

          {/* Message Templates */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.35 }} className="mb-4">
            <div className="flex items-center justify-between mb-2 px-1">
              <h3 className="text-sm font-semibold text-muted-foreground">
                MESSAGE TEMPLATES
              </h3>
              <Link href="/templates" className="text-xs text-violet-400 hover:text-violet-300 font-medium flex items-center gap-1">
                <FileText className="h-3 w-3" /> Edit Templates
              </Link>
            </div>

            {/* Hook Picker */}
            <div className="mb-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 px-1">🧩 Hook Style</p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setSelectedHead(null)}
                  className={cn(
                    "px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border",
                    !selectedHead ? "bg-orange-500/20 border-orange-500/40 text-orange-400" : "bg-muted/20 border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  None
                </button>
                {HEADS.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => setSelectedHead(selectedHead?.id === h.id ? null : h)}
                    className={cn(
                      "px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border",
                      selectedHead?.id === h.id ? "bg-orange-500/20 border-orange-500/40 text-orange-400" : "bg-muted/20 border-transparent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {h.emoji} {h.label}
                  </button>
                ))}
              </div>
              {selectedHead && (
                <p className="text-xs text-orange-400/70 mt-1.5 px-1 italic">&ldquo;{applyAllReplacements(selectedHead.text, lead?.business_type || "", platform)}&rdquo;</p>
              )}
            </div>
            <div className="space-y-3">
              {Object.entries(groupedTemplates).map(([group, items]) => (
                <div key={group}>
                  <button
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setExpandedGroup(expandedGroup === group ? null : group)}
                  >
                    {expandedGroup === group ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    {GROUP_LABELS[group] || group} ({items.length})
                  </button>
                  <AnimatePresence>
                    {(expandedGroup === group || Object.keys(groupedTemplates).length === 1) && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-2 overflow-hidden"
                      >
                        {items.map((t) => {
                          const isExpanded = expandedTemplate === t.id
                          const isCopied = copiedId === `msg-${t.id}`
                          return (
                            <div key={t.id} className={cn("rounded-xl bg-card/60 backdrop-blur-xl border border-border/50 transition-all shadow-sm", isExpanded && "border-orange-500/30 shadow-md")}>
                              <button className="w-full flex items-center gap-3 p-3 text-left" onClick={() => setExpandedTemplate(isExpanded ? null : t.id)}>
                                <span className="text-lg">{t.emoji}</span>
                                <span className="flex-1 text-sm font-medium">{t.label}</span>
                                {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                              </button>
                              <AnimatePresence>
                                {isExpanded && (
                                  <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: "auto" }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="px-3 pb-3 overflow-hidden"
                                  >
                                    {(() => {
                                      const bodyText = applyAllReplacements(t.body, lead?.business_type || "", platform)
                                      const headText = selectedHead ? applyAllReplacements(selectedHead.text, lead?.business_type || "", platform) : ""
                                      const fullText = selectedHead ? `${headText} ${bodyText}` : bodyText
                                      return (
                                        <>
                                          {selectedHead && (
                                            <p className="text-xs text-orange-400/70 mb-1 font-medium">🧩 + Hook: &ldquo;{headText}&rdquo;</p>
                                          )}
                                          <p className="text-sm text-muted-foreground leading-relaxed mb-2 whitespace-pre-wrap">{bodyText}</p>
                                          {(() => {
                                            const charLimit = platform === "linkedin" ? 300 : 1000
                                            const platformLabel = platform === "linkedin" ? "LinkedIn" : "Instagram/FB"
                                            const isOver = fullText.length > charLimit
                                            return (
                                              <p className={cn("text-xs font-mono mb-2", isOver ? "text-red-400" : "text-muted-foreground")}>
                                                {fullText.length}/{charLimit} chars ({platformLabel})
                                                {isOver && " ⚠️ over limit!"}
                                              </p>
                                            )
                                          })()}
                                          <Button
                                            className={cn(
                                              "w-full h-12 rounded-xl font-bold text-base transition-colors",
                                              isCopied ? "bg-green-600 hover:bg-green-600" : selectedHead ? "bg-gradient-to-r from-orange-600 to-pink-600 hover:from-orange-700 hover:to-pink-700" : "bg-orange-600 hover:bg-orange-700"
                                            )}
                                            onClick={() => copyToClipboard(fullText, `msg-${t.id}`, {...t, body: fullText})}
                                          >
                                            {isCopied ? (<><Check className="h-5 w-5 mr-2" /> Copied!</>) : (<><Copy className="h-5 w-5 mr-2" /> {selectedHead ? "Copy Combined" : "Copy Message"}</>)}
                                          </Button>
                                        </>
                                      )
                                    })()}
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          )
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          </motion.div>
        </>
      )}

      {/* Action Buttons - Fixed at bottom */}
      {lead && (
        <div className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-xl border-t border-border/50 p-3 pb-safe z-50 md:pb-3">
          <div className="max-w-lg mx-auto flex gap-2">
            <Button
              variant="outline"
              className="flex-1 h-14 rounded-xl text-sm font-semibold border-red-500/30 text-red-400 hover:bg-red-500/10"
              onClick={() => markLead("not_found")}
              disabled={acting}
            >
              <XCircle className="h-4 w-4 mr-1" />
              Not Found
            </Button>
            <Button
              variant="outline"
              className="flex-1 h-14 rounded-xl text-sm font-semibold border-green-500/30 text-green-400 hover:bg-green-500/10"
              onClick={() => setRespondedOpen(true)}
              disabled={acting}
            >
              <MessageCircle className="h-4 w-4 mr-1" />
              Responded
            </Button>
            <Button
              variant="outline"
              className="flex-1 h-14 rounded-xl text-sm font-semibold border-border/50"
              onClick={skip}
              disabled={acting}
            >
              <SkipForward className="h-4 w-4 mr-1" />
              Skip
            </Button>
            <Button
              className="flex-[1.5] h-14 rounded-xl text-sm font-bold bg-green-600 hover:bg-green-700"
              onClick={() => markLead("contacted")}
              disabled={acting}
            >
              <Check className="h-4 w-4 mr-1" />
              Sent ✅
            </Button>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Daily Limits</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {(["instagram", "facebook", "linkedin"] as Platform[]).map((p) => {
              const Icon = PLATFORM_CONFIG[p].icon
              return (
                <div key={p} className="flex items-center gap-3">
                  <Icon className={cn("h-5 w-5", PLATFORM_CONFIG[p].color)} />
                  <span className="flex-1 text-sm font-medium">{PLATFORM_CONFIG[p].label}</span>
                  <Input
                    type="number"
                    value={dailyLimits[p]}
                    onChange={(e) => setDailyLimits({ ...dailyLimits, [p]: Number(e.target.value) })}
                    className="w-20 text-center rounded-xl"
                  />
                </div>
              )
            })}
            <Button onClick={saveLimits} className="w-full rounded-xl">Save Limits</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Responded Modal */}
      <Dialog open={respondedOpen} onOpenChange={setRespondedOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Mark as Responded</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This will remove <span className="font-semibold text-foreground">{(searchRespondedLead || lead)?.name}</span> from all sequences and mark them as responded.
            </p>
            <Textarea
              placeholder="Quick note (optional)..."
              value={respondedNote}
              onChange={(e) => setRespondedNote(e.target.value)}
              rows={3}
              className="rounded-xl"
            />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setRespondedOpen(false)}>Cancel</Button>
              <Button className="flex-1 bg-green-600 hover:bg-green-700 rounded-xl" onClick={markResponded} disabled={acting}>
                <MessageCircle className="h-4 w-4 mr-2" />
                Confirm Responded
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
