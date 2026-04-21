"use client"

import { useState, useEffect, useCallback, Suspense, lazy, useMemo, useRef } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { createClient } from "@supabase/supabase-js"
import {
  Zap, Send, Play, Pause, Square, Settings, Target, Clock, Users, MessageCircle,
  Activity, RefreshCw, AlertTriangle, CheckCircle, XCircle, Search, ChevronRight, ChevronDown,
  Instagram, Facebook, Linkedin, BarChart3, Loader2, CalendarDays, Rocket, StopCircle, Bell,
  Mail, Phone, Eye, EyeOff, Monitor, Plus, Trash2, Copy, Power, GripVertical, X,
  TrendingUp, Sparkles, Timer, ArrowRight, RotateCcw, Keyboard,
} from "lucide-react"

const LeadsPage = lazy(() => import("@/app/(dashboard)/leads/page"))
const OutreachCalendar = lazy(() => import("@/components/outreach/outreach-calendar"))

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://yfufocegjhxxffqtkvkr.supabase.co",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlmdWZvY2Vnamh4eGZmcXRrdmtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkyOTIyODYsImV4cCI6MjA4NDg2ODI4Nn0.uqgHS-X8K-0vM37BJPTzc6a0cFUreON3P6zgmp2HSjA"
)

const container = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } }
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.5 } } }

interface AutomationStatus {
  id: string; platform: string; status: string; last_send_at: string; last_error: string; error_count: number;
}

interface SendLog {
  id: string; campaign_id: string; account_id: string; lead_id: string; platform: string;
  message_text: string; sent_at: string; status: string; error_message: string; created_at: string;
}

interface SafetySettings {
  min_delay_seconds: number; max_delay_seconds: number; pause_after_n_sends: number;
  pause_duration_minutes: number; active_hours_start: string; active_hours_end: string;
  min_typing_delay_ms: number; max_typing_delay_ms: number;
  random_scroll_enabled: boolean; random_profile_view_enabled: boolean;
  max_sessions_per_day: number; cooldown_after_error_minutes: number;
  jitter_enabled: boolean;
  mouse_speed: string; random_page_visit: boolean;
  profile_view_duration_min: number; profile_view_duration_max: number;
  like_before_dm_pct: number; session_max_duration: number;
}

interface Account {
  account_id: string; platform: string; username: string; daily_limit: string; sends_today: string; status: string;
}

interface Lead {
  lead_id: string; name: string; business_type: string; instagram_url: string; facebook_url: string; linkedin_url: string; email: string; phone: string; status: string; tags: string;
}

interface Sequence {
  sequence_id: string; sequence_name: string; steps: Record<string, { platform?: string; action?: string; template_group?: string; day_offset?: number; message?: string; messages?: string[]; subject?: string | null }>; is_active?: boolean; created_at?: string;
}

interface CampaignStats {
  campaignId: string; campaignName: string; totalQueued: number; totalSent: number; totalFailed: number; totalSkipped: number; leadsCount: number; platformsUsed: string[];
}

const platformIcons: Record<string, typeof Instagram> = { instagram: Instagram, facebook: Facebook, linkedin: Linkedin }
const statusDot: Record<string, string> = { sent: "bg-emerald-500", failed: "bg-red-500", pending: "bg-amber-500", error: "bg-red-500" }

const PLATFORM_COLORS: Record<string, string> = {
  instagram: "#E4405F", facebook: "#1877F2", linkedin: "#0A66C2", email: "#FFB800", sms: "#10B981", phone: "#10B981",
}

const PLATFORM_ICONS_MAP: Record<string, typeof Instagram> = {
  instagram: Instagram, facebook: Facebook, linkedin: Linkedin, email: Mail, sms: Phone, phone: Phone,
}

interface BuilderStep {
  id: string; platform: string; action: string; label: string; day_offset: number;
  messages: string[]; subject: string | null; hasMessage: boolean; hasSubject: boolean;
}

const ACTION_BLOCKS = [
  { id: "ig_dm", platform: "instagram", action: "message", label: "IG DM", hasMessage: true, hasSubject: false, category: "DM" },
  { id: "fb_msg", platform: "facebook", action: "message", label: "FB Message", hasMessage: true, hasSubject: false, category: "DM" },
  { id: "li_msg", platform: "linkedin", action: "message", label: "LI Message", hasMessage: true, hasSubject: false, category: "DM" },
  { id: "li_connect", platform: "linkedin", action: "connect", label: "LI Connect", hasMessage: true, hasSubject: false, category: "Connect" },
  { id: "ig_follow", platform: "instagram", action: "follow", label: "IG Follow", hasMessage: false, hasSubject: false, category: "Connect" },
  { id: "email", platform: "email", action: "message", label: "Email", hasMessage: true, hasSubject: true, category: "Email" },
  { id: "sms", platform: "sms", action: "message", label: "SMS", hasMessage: true, hasSubject: false, category: "Email" },
]

const VARIABLE_CHIPS = ["{{name}}", "{{niche}}", "{{business}}"]

function PlatformBadge({ platform, small }: { platform: string; small?: boolean }) {
  const icons: Record<string, React.ReactNode> = {
    instagram: <Instagram className={small ? "h-3 w-3" : "h-3.5 w-3.5"} />,
    facebook: <Facebook className={small ? "h-3 w-3" : "h-3.5 w-3.5"} />,
    linkedin: <Linkedin className={small ? "h-3 w-3" : "h-3.5 w-3.5"} />,
    email: <Mail className={small ? "h-3 w-3" : "h-3.5 w-3.5"} />,
    phone: <Phone className={small ? "h-3 w-3" : "h-3.5 w-3.5"} />,
    sms: <Phone className={small ? "h-3 w-3" : "h-3.5 w-3.5"} />,
  }
  return (
    <span className={cn("inline-flex items-center justify-center rounded-md", small ? "h-5 w-5" : "h-6 w-6", "bg-muted/40 text-muted-foreground")} title={platform}>
      {icons[platform] || <MessageCircle className={small ? "h-3 w-3" : "h-3.5 w-3.5"} />}
    </span>
  )
}

function extractUsername(url: string): string {
  if (!url) return ""
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`)
    const parts = u.pathname.split("/").filter(Boolean)
    return parts[parts.length - 1] || u.hostname
  } catch {
    return url.replace(/^@/, "")
  }
}

function getPlatformUrl(lead: Lead, platform: string): string {
  switch (platform) {
    case "instagram": return lead.instagram_url || ""
    case "facebook": return lead.facebook_url || ""
    case "linkedin": return lead.linkedin_url || ""
    case "email": return lead.email || ""
    case "phone": case "sms": return lead.phone || ""
    default: return ""
  }
}

/* ─── SEQUENCE BUILDER DIALOG ─── */
function SequenceBuilderDialog({ open, onOpenChange, editSequence, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; editSequence?: Sequence | null; onSaved: (seq: Sequence) => void;
}) {
  const [name, setName] = useState("")
  const [steps, setSteps] = useState<BuilderStep[]>([])
  const [saving, setSaving] = useState(false)
  const [dragIdx, setDragIdx] = useState<number | null>(null)

  useEffect(() => {
    if (!open) return
    if (editSequence) {
      setName(editSequence.sequence_name)
      const loaded: BuilderStep[] = Object.entries(editSequence.steps || {})
        .sort(([a], [b]) => parseInt(a) - parseInt(b))
        .map(([, s]) => {
          const block = ACTION_BLOCKS.find(b => b.platform === s.platform && b.action === s.action)
          return {
            id: crypto.randomUUID(), platform: s.platform || "instagram", action: s.action || "message",
            label: block?.label || `${s.platform} ${s.action}`, day_offset: s.day_offset || 0,
            messages: s.messages || (s.message ? [s.message] : [""]), subject: s.subject || null,
            hasMessage: block?.hasMessage ?? true, hasSubject: block?.hasSubject ?? false,
          }
        })
      setSteps(loaded)
    } else {
      setName(""); setSteps([])
    }
  }, [open, editSequence])

  const addStep = (block: typeof ACTION_BLOCKS[0]) => {
    setSteps(prev => [...prev, {
      id: crypto.randomUUID(), platform: block.platform, action: block.action, label: block.label,
      day_offset: prev.length === 0 ? 0 : 2, messages: [""], subject: block.hasSubject ? "" : null,
      hasMessage: block.hasMessage, hasSubject: block.hasSubject,
    }])
  }

  const updateStep = (id: string, updates: Partial<BuilderStep>) => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s))
  }

  const deleteStep = (id: string) => setSteps(prev => prev.filter(s => s.id !== id))

  const moveStep = (from: number, to: number) => {
    if (to < 0 || to >= steps.length) return
    const arr = [...steps]
    const [moved] = arr.splice(from, 1)
    arr.splice(to, 0, moved)
    setSteps(arr)
  }

  const saveSequence = async () => {
    if (!name.trim()) { toast.error("Give your sequence a name"); return }
    if (steps.length === 0) { toast.error("Add at least one step"); return }
    setSaving(true)
    try {
      const id = editSequence?.sequence_id || crypto.randomUUID()
      const stepsJson: Record<string, unknown> = {}
      steps.forEach((step, i) => {
        stepsJson[String(i + 1)] = {
          platform: step.platform, action: step.action, day_offset: step.day_offset,
          messages: step.messages.filter(m => m.trim()), subject: step.subject || null,
          template_group: "default",
        }
      })
      const { error } = await supabase.from("sequences").upsert({
        sequence_id: id, sequence_name: name, steps: stepsJson, is_active: true,
      })
      if (error) throw error
      toast.success(editSequence ? "Sequence updated!" : "Sequence created!")
      onSaved({ sequence_id: id, sequence_name: name, steps: stepsJson as Sequence["steps"], is_active: true })
      onOpenChange(false)
    } catch (e) {
      toast.error(`Save failed: ${e instanceof Error ? e.message : "Unknown"}`)
    }
    setSaving(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl border-border/50 bg-card/95 backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <div className="rounded-xl p-2 bg-violet-500/20"><Sparkles className="h-5 w-5 text-violet-400" /></div>
            {editSequence ? "Edit Sequence" : "Create New Sequence"}
          </DialogTitle>
          <DialogDescription>Build a multi-step outreach sequence with drag-and-drop ordering.</DialogDescription>
        </DialogHeader>

        {/* Sequence Name */}
        <div className="mt-2">
          <Label>Sequence Name</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Multi-Touch DM Flow" className="rounded-xl mt-1 text-lg font-semibold" />
        </div>

        {/* Action block palette */}
        <div className="mt-4">
          <Label className="text-xs text-muted-foreground uppercase tracking-wider">Add Step</Label>
          <div className="flex flex-wrap gap-2 mt-2">
            {ACTION_BLOCKS.map(block => {
              const Icon = PLATFORM_ICONS_MAP[block.platform] || MessageCircle
              const color = PLATFORM_COLORS[block.platform] || "#888"
              return (
                <motion.button key={block.id} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                  onClick={() => addStep(block)}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border/50 bg-card/60 hover:border-violet-500/50 transition-all text-sm"
                >
                  <span style={{ color }}><Icon className="h-4 w-4" /></span>
                  <span className="font-medium">{block.label}</span>
                </motion.button>
              )
            })}
          </div>
        </div>

        {/* Steps timeline */}
        <div className="mt-4 space-y-3">
          <AnimatePresence mode="popLayout">
            {steps.map((step, i) => {
              const Icon = PLATFORM_ICONS_MAP[step.platform] || MessageCircle
              const color = PLATFORM_COLORS[step.platform] || "#888"
              return (
                <motion.div key={step.id}
                  layout initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                  className="rounded-2xl bg-muted/10 border border-border/50 overflow-hidden"
                  style={{ borderLeftWidth: 3, borderLeftColor: color }}
                >
                  <div className="p-4 space-y-3">
                    {/* Header */}
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col gap-0.5">
                        <button onClick={() => moveStep(i, i - 1)} disabled={i === 0}
                          className="text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors">
                          <ChevronDown className="h-3.5 w-3.5 rotate-180" />
                        </button>
                        <button onClick={() => moveStep(i, i + 1)} disabled={i === steps.length - 1}
                          className="text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors">
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <Badge variant="outline" className="rounded-full text-xs font-bold px-2" style={{ borderColor: color, color }}>
                        {i + 1}
                      </Badge>
                      <span style={{ color }}><Icon className="h-4 w-4" /></span>
                      <span className="font-semibold text-sm flex-1">{step.label}</span>
                      <button onClick={() => deleteStep(step.id)} className="text-muted-foreground hover:text-red-400 transition-colors p-1 rounded-lg hover:bg-red-500/10">
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Day offset */}
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Wait</span>
                      <Input type="number" min={0} value={step.day_offset}
                        onChange={e => updateStep(step.id, { day_offset: parseInt(e.target.value) || 0 })}
                        className="w-16 h-8 rounded-lg text-center text-sm bg-muted/30" />
                      <span className="text-muted-foreground">days</span>
                    </div>

                    {/* Subject */}
                    {step.hasSubject && (
                      <Input placeholder="Email subject line..." value={step.subject || ""}
                        onChange={e => updateStep(step.id, { subject: e.target.value })} className="rounded-xl bg-muted/30" />
                    )}

                    {/* Message */}
                    {step.hasMessage && (
                      <div className="space-y-2">
                        <Textarea placeholder="Write your message... Use {{name}}, {{niche}} for variables"
                          value={step.messages[0] || ""}
                          onChange={e => { const m = [...step.messages]; m[0] = e.target.value; updateStep(step.id, { messages: m }) }}
                          className="rounded-xl bg-muted/30 border-border/30 min-h-[80px] resize-none" />
                        <div className="flex gap-1.5 flex-wrap">
                          {VARIABLE_CHIPS.map(v => (
                            <button key={v} onClick={() => {
                              const m = [...step.messages]; m[0] = (m[0] || "") + v; updateStep(step.id, { messages: m })
                            }} className="text-xs px-2 py-1 rounded-lg bg-violet-500/10 text-violet-400 border border-violet-500/20 hover:bg-violet-500/20 transition-colors">
                              {v}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>

          {steps.length === 0 && (
            <div className="rounded-2xl border-2 border-dashed border-border/50 p-8 text-center text-muted-foreground">
              <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="font-medium">No steps yet</p>
              <p className="text-sm mt-1">Click an action block above to add your first step</p>
            </div>
          )}
        </div>

        {/* Visual Timeline Preview */}
        {steps.length > 0 && (
          <div className="mt-4 p-3 rounded-xl bg-muted/10 border border-border/30">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Timeline Preview</p>
            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              {steps.map((step, i) => {
                const Icon = PLATFORM_ICONS_MAP[step.platform] || MessageCircle
                const color = PLATFORM_COLORS[step.platform] || "#888"
                return (
                  <div key={step.id} className="flex items-center">
                    <div className="flex flex-col items-center gap-1 px-2">
                      <div className="rounded-full p-1.5 border-2" style={{ borderColor: color, backgroundColor: `${color}15` }}>
                        <Icon className="h-3.5 w-3.5" style={{ color }} />
                      </div>
                      <span className="text-[10px] text-muted-foreground font-medium">Day {step.day_offset}</span>
                    </div>
                    {i < steps.length - 1 && (
                      <div className="h-0.5 w-6 bg-border/50 -mt-3" />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Save */}
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="rounded-xl bg-violet-600 hover:bg-violet-700 gap-1.5" onClick={saveSequence} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {editSequence ? "Update Sequence" : "Create Sequence"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ─── SAFETY SETTINGS POPOVER ─── */
function SafetySettingsDialog({ open, onOpenChange, settings, setSettings, saveSettings, autoStatuses, togglePlatform }: {
  open: boolean; onOpenChange: (v: boolean) => void; settings: SafetySettings;
  setSettings: React.Dispatch<React.SetStateAction<SafetySettings>>; saveSettings: () => void;
  autoStatuses: AutomationStatus[]; togglePlatform: (p: string, a: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl rounded-2xl border-border/50 bg-card/95 backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-blue-400" /> Safety Settings
          </DialogTitle>
          <DialogDescription>Configure delays, batch pauses, and active hours for safe sending.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Delay Between DMs</Label>
              <p className="text-xs text-muted-foreground mb-2">{Math.round(settings.min_delay_seconds / 60)}-{Math.round(settings.max_delay_seconds / 60)} minutes</p>
              <Slider value={[settings.min_delay_seconds, settings.max_delay_seconds]} min={60} max={1800} step={30}
                onValueChange={([min, max]) => setSettings(s => ({ ...s, min_delay_seconds: min, max_delay_seconds: max }))} />
            </div>
            <div>
              <Label>Batch Pause</Label>
              <p className="text-xs text-muted-foreground mb-2">Every {settings.pause_after_n_sends} sends, pause {settings.pause_duration_minutes} min</p>
              <div className="grid grid-cols-2 gap-2">
                <Input type="number" value={settings.pause_after_n_sends} onChange={e => setSettings(s => ({ ...s, pause_after_n_sends: parseInt(e.target.value) || 10 }))} className="rounded-xl" />
                <Input type="number" value={settings.pause_duration_minutes} onChange={e => setSettings(s => ({ ...s, pause_duration_minutes: parseInt(e.target.value) || 15 }))} className="rounded-xl" />
              </div>
            </div>
            <div>
              <Label>Active Hours (EST)</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input type="time" value={settings.active_hours_start} onChange={e => setSettings(s => ({ ...s, active_hours_start: e.target.value }))} className="rounded-xl" />
                <Input type="time" value={settings.active_hours_end} onChange={e => setSettings(s => ({ ...s, active_hours_end: e.target.value }))} className="rounded-xl" />
              </div>
            </div>
          </div>
          {/* Platform controls */}
          <div className="space-y-2">
            <Label>Platform Controls</Label>
            <div className="grid gap-2 sm:grid-cols-3">
              {autoStatuses.map(s => {
                const Icon = platformIcons[s.platform] || Activity
                return (
                  <div key={s.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/20 border border-border/30">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      <span className="text-sm font-medium capitalize">{s.platform}</span>
                      <Badge className={cn("text-[10px]", s.status === "running" ? "bg-emerald-500/20 text-emerald-400" : s.status === "error" ? "bg-red-500/20 text-red-400" : "bg-muted/50 text-muted-foreground")}>{s.status}</Badge>
                    </div>
                    <div className="flex gap-1">
                      {s.status === "running" ? (
                        <Button size="sm" variant="ghost" className="h-7 rounded-lg" onClick={() => togglePlatform(s.platform, "pause")}><Pause className="h-3 w-3" /></Button>
                      ) : (
                        <Button size="sm" variant="ghost" className="h-7 rounded-lg" onClick={() => togglePlatform(s.platform, "resume")}><Play className="h-3 w-3" /></Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          <Button onClick={() => { saveSettings(); onOpenChange(false) }} className="gap-1.5 rounded-xl"><CheckCircle className="h-4 w-4" /> Save Settings</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ─── QUICK CAMPAIGN DIALOG ─── */
function QuickCampaignDialog({ open, onOpenChange, accounts, sequences, settings }: {
  open: boolean; onOpenChange: (v: boolean) => void; accounts: Account[]; sequences: Sequence[]; settings: SafetySettings;
}) {
  const [qcName, setQcName] = useState("")
  const [qcAccounts, setQcAccounts] = useState<string[]>([])
  const [qcFilter, setQcFilter] = useState("")
  const [qcSequence, setQcSequence] = useState("")
  const [launching, setLaunching] = useState(false)

  const launch = async () => {
    if (!qcSequence || qcAccounts.length === 0 || !qcFilter.trim()) {
      toast.error("Fill in all fields"); return
    }
    setLaunching(true)
    try {
      const { data: leads } = await supabase.from("leads")
        .select("lead_id, name, business_type, instagram_url, facebook_url, linkedin_url, email, phone, status, tags")
        .or(`tags.ilike.%${qcFilter}%,business_type.ilike.%${qcFilter}%,name.ilike.%${qcFilter}%`)
        .eq("status", "new").limit(2000)

      if (!leads || leads.length === 0) { toast.error("No matching leads found"); setLaunching(false); return }

      const seq = sequences.find(s => s.sequence_id === qcSequence)
      if (!seq) { toast.error("Sequence not found"); setLaunching(false); return }

      const campaignId = `camp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const { data: templates } = await supabase.from("message_templates").select("*").eq("is_active", true)
      const templateMap: Record<string, string> = {}
      for (const t of templates || []) { templateMap[`${t.template_group}:${t.platform}`] = t.text }

      const entries: Array<Record<string, unknown>> = []
      for (const lead of leads as Lead[]) {
        for (const [stepNum, step] of Object.entries(seq.steps)) {
          const platform = step.platform || ""
          const url = getPlatformUrl(lead, platform)
          if (!url) continue
          let msg = step.message || step.messages?.[0] || templateMap[`${step.template_group || "default"}:${platform}`] || `Hey {{name}}! Would love to connect about your {{niche}} business.`
          msg = msg.replace(/\{\{name\}\}/gi, lead.name || "there").replace(/\{\{niche\}\}/gi, lead.business_type || "business")
          const scheduled = new Date()
          scheduled.setDate(scheduled.getDate() + (step.day_offset || 0))
          const [h, m] = settings.active_hours_start.split(":").map(Number)
          scheduled.setHours(h || 9, m || 0, 0, 0)
          entries.push({
            campaign_id: campaignId, lead_id: lead.lead_id, lead_name: lead.name || lead.lead_id,
            platform, username_or_url: extractUsername(url), message_text: msg,
            sequence_step: parseInt(stepNum), status: "queued", scheduled_for: scheduled.toISOString(),
          })
        }
      }

      if (entries.length === 0) { toast.error("No messages to queue"); setLaunching(false); return }
      const BATCH = 500
      for (let i = 0; i < entries.length; i += BATCH) {
        const { error } = await supabase.from("send_queue").insert(entries.slice(i, i + BATCH))
        if (error) throw new Error(error.message)
      }
      toast.success(`🚀 Quick Campaign launched! ${entries.length} messages queued for ${leads.length} leads`)
      onOpenChange(false)
    } catch (e) {
      toast.error(`Failed: ${e instanceof Error ? e.message : "Unknown"}`)
    }
    setLaunching(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-2xl border-border/50 bg-card/95 backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Rocket className="h-5 w-5 text-violet-400" /> Quick Campaign</DialogTitle>
          <DialogDescription>Launch a campaign in seconds — just pick a niche, accounts, and sequence.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <Label>Niche / Tag Filter</Label>
            <Input value={qcFilter} onChange={e => setQcFilter(e.target.value)} placeholder="e.g. restaurants, NYC" className="rounded-xl" />
          </div>
          <div>
            <Label>Accounts</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {accounts.filter(a => a.status === "active").map(a => {
                const sel = qcAccounts.includes(a.account_id)
                return (
                  <button key={a.account_id} onClick={() => setQcAccounts(prev => sel ? prev.filter(x => x !== a.account_id) : [...prev, a.account_id])}
                    className={cn("px-3 py-1.5 rounded-xl border text-sm transition-all", sel ? "border-violet-500 bg-violet-500/10" : "border-border/50")}>
                    @{a.username || a.account_id}
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <Label>Sequence</Label>
            <Select value={qcSequence} onValueChange={setQcSequence}>
              <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select sequence" /></SelectTrigger>
              <SelectContent>
                {sequences.map(s => <SelectItem key={s.sequence_id} value={s.sequence_id}>{s.sequence_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button className="w-full rounded-xl bg-violet-600 hover:bg-violet-700 gap-1.5" onClick={launch} disabled={launching}>
            {launching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
            {launching ? "Launching..." : "Launch Quick Campaign"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ═══════════════════════════════════════════════════════════════════════
   MAIN OUTREACH PAGE
   ═══════════════════════════════════════════════════════════════════════ */
export default function OutreachPage() {
  const router = useRouter()
  const [tab, setTab] = useState("campaign")
  const [autoStatuses, setAutoStatuses] = useState<AutomationStatus[]>([])
  const [sendLogs, setSendLogs] = useState<SendLog[]>([])
  const [settings, setSettings] = useState<SafetySettings>({ min_delay_seconds: 300, max_delay_seconds: 480, pause_after_n_sends: 10, pause_duration_minutes: 15, active_hours_start: "09:00", active_hours_end: "21:00", min_typing_delay_ms: 50, max_typing_delay_ms: 150, random_scroll_enabled: true, random_profile_view_enabled: true, max_sessions_per_day: 3, cooldown_after_error_minutes: 30, jitter_enabled: true, mouse_speed: "natural", random_page_visit: false, profile_view_duration_min: 3, profile_view_duration_max: 8, like_before_dm_pct: 0, session_max_duration: 120 })
  const [accounts, setAccounts] = useState<Account[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [sequences, setSequences] = useState<Sequence[]>([])
  const [loading, setLoading] = useState(true)

  // Campaign builder state
  const [campaignName, setCampaignName] = useState("")
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([])
  const [selectedLeadFilter, setSelectedLeadFilter] = useState("")
  const [selectedLeadStatus, setSelectedLeadStatus] = useState("new")
  const [selectedSequence, setSelectedSequence] = useState("")
  const [campaignStep, setCampaignStep] = useState(1)
  const [matchingLeadCount, setMatchingLeadCount] = useState<number | null>(null)
  const [matchingLeads, setMatchingLeads] = useState<Lead[]>([])
  const [loadingLeadCount, setLoadingLeadCount] = useState(false)

  // Launch state
  const [launching, setLaunching] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [activeCampaign, setActiveCampaign] = useState<CampaignStats | null>(null)
  const [pollingCampaign, setPollingCampaign] = useState(false)

  // Live feed
  const [feedPolling, setFeedPolling] = useState(false)
  const [showVnc, setShowVnc] = useState(false)
  const [activeVncTab, setActiveVncTab] = useState("default")
  const [proxyGroups, setProxyGroups] = useState<Array<{ id: string; ip: string; location_city: string }>>([])

  // Platform coverage
  const [coverageExpanded, setCoverageExpanded] = useState(false)

  // Dialogs
  const [showSequenceBuilder, setShowSequenceBuilder] = useState(false)
  const [editingSequence, setEditingSequence] = useState<Sequence | null>(null)
  const [showSafetyDialog, setShowSafetyDialog] = useState(false)
  const [showQuickCampaign, setShowQuickCampaign] = useState(false)

  // Sequences tab
  const [expandedSequenceId, setExpandedSequenceId] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [statusRes, settingsRes, accountsRes, logsRes, seqRes, proxyRes] = await Promise.all([
        fetch("/api/automation/status").then(r => r.json()),
        fetch("/api/automation/settings").then(r => r.json()),
        fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "get_accounts" }) }).then(r => r.json()),
        fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "get_outreach_log", limit: 50 }) }).then(r => r.json()),
        fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "get_sequences" }) }).then(r => r.json()),
        fetch("/api/proxy-groups").then(r => r.json()).catch(() => ({ data: [] })),
      ])
      setAutoStatuses(statusRes.data || [])
      if (settingsRes.data) setSettings(s => ({ ...s, ...settingsRes.data }))
      setAccounts(accountsRes.data || [])
      setSendLogs(logsRes.data || [])
      setSequences(seqRes.data || [])
      setProxyGroups(proxyRes.data || [])
    } catch (e) { console.error(e) }
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Fetch matching leads when filter changes
  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoadingLeadCount(true)
      try {
        let query = supabase.from("leads").select("lead_id, name, business_type, instagram_url, facebook_url, linkedin_url, email, phone, status, tags", { count: "exact" })
        if (selectedLeadFilter) {
          query = query.or(`tags.ilike.%${selectedLeadFilter}%,business_type.ilike.%${selectedLeadFilter}%,name.ilike.%${selectedLeadFilter}%`)
        }
        if (selectedLeadStatus && selectedLeadStatus !== "all") {
          query = query.eq("status", selectedLeadStatus === "in_sequence" ? "in_sequence" : "new")
        }
        query = query.limit(2000)
        const { data, count, error } = await query
        if (!error) {
          setMatchingLeadCount(count || 0)
          setMatchingLeads((data || []) as Lead[])
        }
      } catch { /* ignore */ }
      setLoadingLeadCount(false)
    }, 500)
    return () => clearTimeout(timer)
  }, [selectedLeadFilter, selectedLeadStatus])

  // Live feed polling
  useEffect(() => {
    if (tab !== "feed" || !feedPolling) return
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "get_outreach_log", limit: 50 }) })
        const data = await res.json()
        setSendLogs(data.data || [])
      } catch {}
    }, 5000)
    return () => clearInterval(interval)
  }, [tab, feedPolling])

  // Poll active campaign stats
  useEffect(() => {
    if (!activeCampaign || !pollingCampaign) return
    const interval = setInterval(async () => {
      try {
        const { data, error } = await supabase
          .from("send_queue")
          .select("status")
          .eq("campaign_id", activeCampaign.campaignId)
        if (!error && data) {
          const queued = data.filter(d => d.status === "queued").length
          const sent = data.filter(d => d.status === "sent").length
          const failed = data.filter(d => d.status === "failed").length
          const skipped = data.filter(d => d.status === "skipped_company_page").length
          setActiveCampaign(prev => prev ? { ...prev, totalQueued: queued, totalSent: sent, totalFailed: failed, totalSkipped: skipped } : prev)
        }
      } catch {}
    }, 8000)
    return () => clearInterval(interval)
  }, [activeCampaign, pollingCampaign])

  // Compute platform coverage
  const selectedSeq = sequences.find(s => s.sequence_id === selectedSequence)
  const seqSteps = selectedSeq?.steps || {}
  const seqPlatforms = useMemo(() => {
    const platforms = new Set<string>()
    for (const step of Object.values(seqSteps)) {
      if (step.platform) platforms.add(step.platform)
    }
    return [...platforms]
  }, [seqSteps])

  const coverageAnalysis = useMemo(() => {
    if (!selectedSeq || matchingLeads.length === 0) return null
    let fullCoverage = 0
    const missingLeads: { lead: Lead; missing: string[] }[] = []
    const extraPlatforms = new Set<string>()
    const missingByPlatform: Record<string, number> = {}

    for (const lead of matchingLeads) {
      const missing: string[] = []
      for (const p of seqPlatforms) {
        if (!getPlatformUrl(lead, p)) {
          missing.push(p)
          missingByPlatform[p] = (missingByPlatform[p] || 0) + 1
        }
      }
      if (missing.length === 0) fullCoverage++
      else missingLeads.push({ lead, missing })

      const allP = ["instagram", "facebook", "linkedin", "email", "phone"]
      for (const p of allP) {
        if (!seqPlatforms.includes(p) && getPlatformUrl(lead, p)) extraPlatforms.add(p)
      }
    }
    return { fullCoverage, missingLeads, extraPlatforms: [...extraPlatforms], missingByPlatform }
  }, [selectedSeq, matchingLeads, seqPlatforms])

  async function togglePlatform(platform: string, action: string) {
    await fetch("/api/automation/status", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform, action }),
    })
    toast.success(`${platform} ${action}d`)
    fetchAll()
  }

  async function saveSettings() {
    await fetch("/api/automation/settings", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    })
    toast.success("Safety settings saved")
  }

  // ── LAUNCH CAMPAIGN ──────────────────────────────────────────────
  async function launchCampaign() {
    setLaunching(true)
    try {
      const campaignId = `camp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const name = campaignName || `Campaign ${new Date().toLocaleDateString()}`

      try {
        await supabase.from("campaigns").insert({
          id: campaignId, name, business_id: "default", status: "active",
          accounts: selectedAccounts, lead_ids: matchingLeads.map(l => l.lead_id),
          lead_count: matchingLeads.length, sequence_id: selectedSequence,
          total_scheduled: 0, started_at: new Date().toISOString(),
        })
      } catch {}

      for (const platform of seqPlatforms) {
        try {
          await supabase.from("campaign_safety_settings").insert({
            campaign_id: campaignId, platform,
            delay_between_dms_min: settings.min_delay_seconds,
            delay_between_dms_max: settings.max_delay_seconds,
            batch_pause_after: settings.pause_after_n_sends,
            batch_pause_duration: settings.pause_duration_minutes,
            active_hours_start: settings.active_hours_start,
            active_hours_end: settings.active_hours_end,
            typing_speed_min: settings.min_typing_delay_ms,
            typing_speed_max: settings.max_typing_delay_ms,
            mouse_speed: settings.mouse_speed,
            random_scroll: settings.random_scroll_enabled,
            random_page_visit: settings.random_page_visit,
            profile_view_before_dm: settings.random_profile_view_enabled,
            profile_view_duration_min: settings.profile_view_duration_min,
            profile_view_duration_max: settings.profile_view_duration_max,
            like_before_dm_pct: settings.like_before_dm_pct,
            session_max_duration: settings.session_max_duration,
          })
        } catch {}
      }

      const { data: templates } = await supabase.from("message_templates").select("*").eq("is_active", true)
      const templateMap: Record<string, string> = {}
      for (const t of templates || []) {
        const key = `${t.template_group}:${t.platform}`
        if (!templateMap[key]) templateMap[key] = t.text
      }

      const queueEntries: Array<Record<string, unknown>> = []
      let skippedCount = 0

      for (const lead of matchingLeads) {
        for (const [stepNum, step] of Object.entries(seqSteps)) {
          const platform = step.platform || ""
          const url = getPlatformUrl(lead, platform)
          if (!url) { skippedCount++; continue }

          let messageText = step.message || step.messages?.[0] || ""
          if (!messageText) {
            const tplKey = `${step.template_group || "default"}:${platform}`
            messageText = templateMap[tplKey] || templateMap[`default:${platform}`] || `Hey {{name}}! Would love to connect about your {{niche}} business.`
          }
          messageText = messageText
            .replace(/\{\{name\}\}/gi, lead.name || "there")
            .replace(/\{\{niche\}\}/gi, lead.business_type || "business")
            .replace(/NICHE/g, lead.business_type || "business")

          const dayOffset = step.day_offset || 0
          const scheduled = new Date()
          scheduled.setDate(scheduled.getDate() + dayOffset)
          const [startH, startM] = settings.active_hours_start.split(":").map(Number)
          scheduled.setHours(startH || 9, startM || 0, 0, 0)

          queueEntries.push({
            campaign_id: campaignId, lead_id: lead.lead_id, lead_name: lead.name || lead.lead_id,
            platform, username_or_url: extractUsername(url), message_text: messageText,
            sequence_step: parseInt(stepNum), status: "queued", scheduled_for: scheduled.toISOString(),
          })
        }
      }

      if (queueEntries.length === 0) {
        toast.error("No messages to queue — leads may be missing required platform URLs")
        setLaunching(false); return
      }

      const BATCH = 500
      for (let i = 0; i < queueEntries.length; i += BATCH) {
        const batch = queueEntries.slice(i, i + BATCH)
        const { error } = await supabase.from("send_queue").insert(batch)
        if (error) throw new Error(error.message)
      }

      toast.success(`🚀 Campaign launched! ${queueEntries.length} messages queued across ${seqPlatforms.length} platforms`)

      setActiveCampaign({
        campaignId, campaignName: name, totalQueued: queueEntries.length, totalSent: 0, totalFailed: 0,
        totalSkipped: skippedCount, leadsCount: matchingLeads.length, platformsUsed: seqPlatforms,
      })
      setPollingCampaign(true)
      setCampaignStep(6)
    } catch (e) {
      toast.error(`Launch failed: ${e instanceof Error ? e.message : "Unknown error"}`)
    }
    setLaunching(false)
  }

  async function stopCampaign() {
    if (!activeCampaign) return
    const { error } = await supabase.from("send_queue").update({ status: "cancelled" }).eq("campaign_id", activeCampaign.campaignId).eq("status", "queued")
    if (error) { toast.error("Failed to stop campaign") }
    else {
      toast.success("Campaign stopped — remaining queued messages cancelled")
      setPollingCampaign(false)
      setActiveCampaign(prev => prev ? { ...prev, totalQueued: 0 } : null)
    }
  }

  // Sequence helpers
  async function duplicateSequence(seq: Sequence) {
    const newId = crypto.randomUUID()
    const { error } = await supabase.from("sequences").insert({
      sequence_id: newId, sequence_name: `${seq.sequence_name} (Copy)`, steps: seq.steps, is_active: true,
    })
    if (error) { toast.error("Duplicate failed"); return }
    toast.success("Sequence duplicated!")
    fetchAll()
  }

  async function deleteSequence(id: string) {
    const { error } = await supabase.from("sequences").delete().eq("sequence_id", id)
    if (error) { toast.error("Delete failed"); return }
    toast.success("Sequence deleted")
    setSequences(prev => prev.filter(s => s.sequence_id !== id))
  }

  async function toggleSequenceActive(seq: Sequence) {
    const currentlyActive = seq.is_active !== false
    const { error } = await supabase.from("sequences").update({ is_active: !currentlyActive }).eq("sequence_id", seq.sequence_id)
    if (error) { toast.error("Toggle failed"); return }
    setSequences(prev => prev.map(s => s.sequence_id === seq.sequence_id ? { ...s, is_active: !currentlyActive } : s))
    toast.success(currentlyActive ? "Sequence deactivated" : "Sequence activated")
  }

  const todaySent = sendLogs.filter(l => l.status === "sent" && l.sent_at?.startsWith(new Date().toISOString().split("T")[0])).length
  const todayFailed = sendLogs.filter(l => l.status === "failed" && l.created_at?.startsWith(new Date().toISOString().split("T")[0])).length

  // Live feed stats
  const todayLogs = useMemo(() => {
    const today = new Date().toISOString().split("T")[0]
    return sendLogs.filter(l => (l.sent_at || l.created_at)?.startsWith(today))
  }, [sendLogs])

  const feedStats = useMemo(() => {
    const sent = todayLogs.filter(l => l.status === "sent").length
    const total = todayLogs.length
    const byPlatform: Record<string, number> = {}
    todayLogs.filter(l => l.status === "sent").forEach(l => { byPlatform[l.platform] = (byPlatform[l.platform] || 0) + 1 })
    return { sent, total, successRate: total > 0 ? Math.round((sent / total) * 100) : 0, byPlatform }
  }, [todayLogs])

  // Estimated completion for preview
  const estimatedDays = useMemo(() => {
    if (!selectedSeq) return 0
    const maxOffset = Math.max(...Object.values(seqSteps).map(s => s.day_offset || 0), 0)
    return maxOffset + 1
  }, [selectedSeq, seqSteps])

  // Estimated daily send rate
  const estimatedDailyRate = useMemo(() => {
    const activeAccounts = accounts.filter(a => selectedAccounts.includes(a.account_id))
    return activeAccounts.reduce((sum, a) => sum + parseInt(a.daily_limit || "40"), 0)
  }, [accounts, selectedAccounts])

  // Pre-launch stats
  const previewStats = useMemo(() => {
    if (!selectedSeq || matchingLeads.length === 0) return null
    let totalMessages = 0
    for (const lead of matchingLeads) {
      for (const step of Object.values(seqSteps)) {
        if (getPlatformUrl(lead, step.platform || "")) totalMessages++
      }
    }
    const completionDays = estimatedDailyRate > 0 ? Math.ceil(totalMessages / estimatedDailyRate) + estimatedDays : estimatedDays
    return { totalMessages, leadsCount: matchingLeads.length, platforms: seqPlatforms.length, completionDays }
  }, [selectedSeq, matchingLeads, seqSteps, seqPlatforms, estimatedDailyRate, estimatedDays])

  // Recommended sequence for campaign step 3
  const recommendedSequenceId = useMemo(() => {
    if (matchingLeads.length === 0 || sequences.length === 0) return null
    const leadPlatforms = new Set<string>()
    for (const lead of matchingLeads.slice(0, 100)) {
      if (lead.instagram_url) leadPlatforms.add("instagram")
      if (lead.facebook_url) leadPlatforms.add("facebook")
      if (lead.linkedin_url) leadPlatforms.add("linkedin")
      if (lead.email) leadPlatforms.add("email")
      if (lead.phone) leadPlatforms.add("phone")
    }
    let bestId = ""; let bestScore = -1
    for (const seq of sequences) {
      const sp = new Set(Object.values(seq.steps || {}).map(s => s.platform).filter(Boolean))
      let score = 0
      sp.forEach(p => { if (p && leadPlatforms.has(p)) score++ })
      if (score > bestScore) { bestScore = score; bestId = seq.sequence_id }
    }
    return bestId
  }, [matchingLeads, sequences])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === "n" && !e.metaKey && !e.ctrlKey) {
        setEditingSequence(null); setShowSequenceBuilder(true)
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-violet-500 border-t-transparent" />
      </div>
    )
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="space-y-5 pb-8">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
        className="flex items-center justify-between flex-wrap gap-3"
      >
        <div className="flex items-center gap-3">
          <div className="rounded-xl p-2.5 bg-violet-500/20">
            <Zap className="h-6 w-6 text-violet-400" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Outreach</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {todaySent} sent today · {todayFailed} failed
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setShowQuickCampaign(true)} variant="outline" size="sm" className="rounded-xl gap-1.5 border-violet-500/30 text-violet-400 hover:bg-violet-500/10">
            <Rocket className="h-4 w-4" /> Quick Campaign
          </Button>
          <button onClick={() => toast.info("Notifications coming soon")} className="p-2 rounded-xl hover:bg-muted/50 transition-all text-muted-foreground hover:text-foreground" title="Notifications">
            <Bell className="h-4 w-4" />
          </button>
          <button onClick={() => setShowSafetyDialog(true)} className="p-2 rounded-xl hover:bg-muted/50 transition-all text-muted-foreground hover:text-foreground" title="Safety Settings">
            <Settings className="h-4 w-4" />
          </button>
          {autoStatuses.map(s => {
            const Icon = platformIcons[s.platform] || Activity
            const color = s.status === "running" ? "text-emerald-400" : s.status === "paused" ? "text-amber-400" : s.status === "error" ? "text-red-400" : "text-muted-foreground"
            return (
              <div key={s.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-card/60 backdrop-blur-xl border border-border/50" title={`${s.platform}: ${s.status}`}>
                <Icon className={cn("h-4 w-4", color)} />
                <div className={cn("h-2 w-2 rounded-full", s.status === "running" ? "bg-emerald-500 animate-pulse" : s.status === "paused" ? "bg-amber-500" : s.status === "error" ? "bg-red-500" : "bg-muted-foreground")} />
              </div>
            )
          })}
          <Button onClick={fetchAll} variant="outline" size="sm" className="rounded-xl"><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </motion.div>

      {/* Keyboard hint */}
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground/50">
        <Keyboard className="h-3 w-3" /> Press <kbd className="px-1 py-0.5 rounded bg-muted/30 border border-border/30 text-muted-foreground font-mono">N</kbd> for new sequence
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex gap-1 p-1 rounded-xl bg-muted/30 backdrop-blur-sm overflow-x-auto">
          {[
            { value: "campaign", icon: Target, label: "Campaign" },
            { value: "leads", icon: Users, label: "Leads" },
            { value: "sequences", icon: Sparkles, label: "Sequences" },
            { value: "feed", icon: Activity, label: "Live View" },
            { value: "calendar", icon: CalendarDays, label: "Calendar" },
          ].map(t => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap",
                tab === t.value ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <t.icon className="h-4 w-4" /> {t.label}
            </button>
          ))}
        </div>

        {/* ═══ CAMPAIGN BUILDER ═══ */}
        <TabsContent value="campaign" className="space-y-4 mt-4">
          {/* Step indicators */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-1 overflow-x-auto pb-2">
            {["Accounts", "Leads", "Sequence", "Safety", "Preview", "Launch"].map((label, i) => (
              <button key={i} onClick={() => { if (i + 1 <= 5 || activeCampaign) setCampaignStep(i + 1) }} className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap", campaignStep === i + 1 ? "bg-violet-500/20 text-violet-400" : campaignStep > i + 1 ? "bg-emerald-500/10 text-emerald-400" : "bg-muted/30 text-muted-foreground")}>
                <span className={cn("h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold", campaignStep === i + 1 ? "bg-violet-500 text-primary-foreground" : campaignStep > i + 1 ? "bg-emerald-500 text-primary-foreground" : "bg-muted")}>
                  {campaignStep > i + 1 ? "✓" : i + 1}
                </span>
                {label}
              </button>
            ))}
          </motion.div>

          <AnimatePresence mode="wait">
          {/* Step 1: Select Accounts + Campaign Name */}
          {campaignStep === 1 && (
            <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 p-5 shadow-lg"
            >
              <h3 className="text-lg font-semibold mb-1">Campaign Setup</h3>
              <p className="text-sm text-muted-foreground mb-4">Name your campaign and pick sending accounts.</p>

              <div className="mb-4">
                <Label>Campaign Name</Label>
                <Input placeholder="e.g. NYC Restaurants April" value={campaignName} onChange={e => setCampaignName(e.target.value)} className="rounded-xl max-w-md" />
              </div>

              <Label className="mb-2 block">Sending Accounts</Label>
              <motion.div variants={container} initial="hidden" animate="show" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {accounts.filter(a => a.status === "active").map(a => {
                  const Icon = platformIcons[a.platform] || Users
                  const selected = selectedAccounts.includes(a.account_id)
                  const limit = parseInt(a.daily_limit || "40")
                  const sent = parseInt(a.sends_today || "0")
                  const available = Math.max(0, limit - sent)
                  return (
                    <motion.button key={a.account_id} variants={item} whileHover={{ scale: 1.02, y: -2 }}
                      onClick={() => setSelectedAccounts(prev => selected ? prev.filter(x => x !== a.account_id) : [...prev, a.account_id])}
                      className={cn("flex items-center gap-3 p-3 rounded-xl border text-left transition-all", selected ? "border-violet-500 bg-violet-500/10" : "border-border/50 hover:border-muted-foreground/30")}>
                      <Icon className={cn("h-5 w-5", platformIcons[a.platform] ? "" : "text-muted-foreground")} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">@{a.username || a.account_id}</p>
                        <p className="text-xs text-muted-foreground">{available} available / {limit} limit</p>
                      </div>
                      <div className={cn("h-5 w-5 rounded-full border-2 flex items-center justify-center", selected ? "border-violet-500 bg-violet-500" : "border-muted")}>
                        {selected && <CheckCircle className="h-3 w-3 text-primary-foreground" />}
                      </div>
                    </motion.button>
                  )
                })}
              </motion.div>
              <div className="mt-3 flex justify-center">
                <button onClick={() => router.push("/accounts")} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-dashed border-violet-500/30 text-sm text-violet-400 hover:bg-violet-500/10 transition-all">
                  <Plus className="h-4 w-4" /> Add More Accounts
                </button>
              </div>
              {accounts.filter(a => a.status === "active").length === 0 && (
                <p className="text-sm text-muted-foreground py-4 text-center">No active accounts. <button onClick={() => router.push("/accounts")} className="text-violet-400 underline hover:text-violet-300">Set up accounts in Accounts & Proxies</button></p>
              )}
              {selectedAccounts.length > 0 && (
                <div className="mt-3 p-2 rounded-xl bg-violet-500/5 border border-violet-500/20 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-violet-400" />
                  <span className="text-sm text-violet-400">Estimated daily capacity: <span className="font-bold">{estimatedDailyRate}</span> messages/day</span>
                </div>
              )}
              <div className="flex justify-end mt-4">
                <Button onClick={() => setCampaignStep(2)} disabled={selectedAccounts.length === 0} className="rounded-xl">
                  Next <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </motion.div>
          )}

          {/* Step 2: Select Leads — Smart Platform Filtration */}
          {campaignStep === 2 && (() => {
            const selectedPlatforms = [...new Set(accounts.filter(a => selectedAccounts.includes(a.account_id)).map(a => a.platform))]
            const leadsWithMissing = matchingLeads.filter(lead => {
              return selectedPlatforms.some(p => !getPlatformUrl(lead, p))
            })
            const leadsWithExtra = matchingLeads.filter(lead => {
              const leadPlatforms = ["instagram", "facebook", "linkedin", "email", "phone", "sms"].filter(p => getPlatformUrl(lead, p))
              return leadPlatforms.some(p => !selectedPlatforms.includes(p))
            })
            const validLeads = matchingLeads.filter(lead => selectedPlatforms.every(p => getPlatformUrl(lead, p)))
            const hasMissingError = leadsWithMissing.length > 0
            const hasExtraWarning = leadsWithExtra.length > 0 && !hasMissingError

            return (
            <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 p-5 shadow-lg"
            >
              <h3 className="text-lg font-semibold mb-1">Select Leads</h3>
              <p className="text-sm text-muted-foreground mb-2">Filter leads for this campaign. Selected platforms: {selectedPlatforms.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(", ")}</p>

              <div className="flex gap-1 mb-3 flex-wrap">
                {selectedPlatforms.map(p => (
                  <Badge key={p} variant="outline" className="text-xs capitalize">{p}</Badge>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Filter by tag/niche</Label>
                  <Input placeholder="e.g. restaurants, NYC" value={selectedLeadFilter} onChange={e => setSelectedLeadFilter(e.target.value)} className="rounded-xl" />
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={selectedLeadStatus} onValueChange={setSelectedLeadStatus}>
                    <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">New leads</SelectItem>
                      <SelectItem value="in_sequence">In sequence</SelectItem>
                      <SelectItem value="all">All</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2">
                {loadingLeadCount ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Counting...
                  </div>
                ) : (
                  <Badge variant="outline" className="text-sm px-3 py-1 rounded-xl">
                    <Users className="h-3.5 w-3.5 mr-1.5" />
                    Matching: <span className="font-bold ml-1">{matchingLeadCount ?? 0}</span> leads
                  </Badge>
                )}
              </div>

              {/* Platform filtration errors */}
              {hasMissingError && matchingLeads.length > 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 p-3 rounded-xl border border-red-500/30 bg-red-500/5">
                  <div className="flex items-center gap-2 mb-2">
                    <XCircle className="h-4 w-4 text-red-400" />
                    <span className="text-sm font-medium text-red-400">{leadsWithMissing.length} leads are missing required platforms</span>
                  </div>
                  <div className="space-y-1 max-h-24 overflow-y-auto">
                    {leadsWithMissing.slice(0, 5).map(lead => (
                      <div key={lead.lead_id} className="text-xs text-muted-foreground flex items-center gap-2">
                        <span className="truncate">{lead.name || lead.lead_id}</span>
                        <span className="text-red-400/70">missing: {selectedPlatforms.filter(p => !getPlatformUrl(lead, p)).join(", ")}</span>
                      </div>
                    ))}
                    {leadsWithMissing.length > 5 && <p className="text-xs text-muted-foreground">+{leadsWithMissing.length - 5} more</p>}
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" variant="destructive" className="rounded-xl text-xs" onClick={() => {
                      const validIds = new Set(validLeads.map(l => l.lead_id))
                      setMatchingLeads(matchingLeads.filter(l => validIds.has(l.lead_id)))
                      setMatchingLeadCount(validLeads.length)
                      toast.success(`Removed ${leadsWithMissing.length} leads with missing platforms`)
                    }}>
                      Remove {leadsWithMissing.length} leads & continue
                    </Button>
                    <Button size="sm" variant="outline" className="rounded-xl text-xs" onClick={() => setCampaignStep(1)}>
                      Go Back
                    </Button>
                  </div>
                </motion.div>
              )}

              {/* Extra platforms warning */}
              {hasExtraWarning && matchingLeads.length > 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 p-3 rounded-xl border border-amber-500/30 bg-amber-500/5">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-amber-400" />
                    <span className="text-sm font-medium text-amber-400">{leadsWithExtra.length} leads have additional platforms not in this campaign</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">These leads have platforms beyond your selected accounts. They&apos;ll only be contacted on the selected platforms.</p>
                  <div className="flex gap-2">
                    <Button size="sm" className="rounded-xl text-xs bg-amber-600 hover:bg-amber-500" onClick={() => toast.success("Proceeding with all leads")}>
                      Add Anyway
                    </Button>
                    <Button size="sm" variant="outline" className="rounded-xl text-xs" onClick={() => setCampaignStep(1)}>
                      Go Back
                    </Button>
                  </div>
                </motion.div>
              )}

              {matchingLeads.length > 0 && !hasMissingError && (
                <div className="mt-3 space-y-1 max-h-40 overflow-y-auto rounded-xl border border-border/30 p-2">
                  {matchingLeads.slice(0, 8).map(lead => (
                    <div key={lead.lead_id} className="flex items-center gap-2 py-1 px-2 rounded-lg hover:bg-muted/20">
                      <span className="text-sm truncate flex-1">{lead.name || lead.lead_id}</span>
                      <div className="flex gap-0.5">
                        {lead.instagram_url && <PlatformBadge platform="instagram" small />}
                        {lead.facebook_url && <PlatformBadge platform="facebook" small />}
                        {lead.linkedin_url && <PlatformBadge platform="linkedin" small />}
                        {lead.email && <PlatformBadge platform="email" small />}
                        {lead.phone && <PlatformBadge platform="phone" small />}
                      </div>
                    </div>
                  ))}
                  {matchingLeads.length > 8 && (
                    <p className="text-xs text-muted-foreground text-center py-1">+{matchingLeads.length - 8} more leads</p>
                  )}
                </div>
              )}

              <div className="flex justify-between mt-4">
                <Button variant="outline" onClick={() => setCampaignStep(1)} className="rounded-xl">Back</Button>
                <Button onClick={() => setCampaignStep(3)} disabled={matchingLeadCount === 0 || hasMissingError} className="rounded-xl">Next <ChevronRight className="h-4 w-4 ml-1" /></Button>
              </div>
            </motion.div>
            )
          })()}

          {/* Step 3: Select Sequence — Platform Matching */}
          {campaignStep === 3 && (() => {
            const campaignPlatforms = [...new Set(accounts.filter(a => selectedAccounts.includes(a.account_id)).map(a => a.platform))]
            return (
            <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 p-5 shadow-lg"
            >
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-lg font-semibold">Select Sequence</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Must match selected platforms: {campaignPlatforms.join(", ")}</p>
                </div>
                <Button variant="outline" size="sm" className="rounded-xl gap-1.5 border-violet-500/30 text-violet-400 hover:bg-violet-500/10"
                  onClick={() => { setEditingSequence(null); setShowSequenceBuilder(true) }}>
                  <Plus className="h-4 w-4" /> Create New Sequence
                </Button>
              </div>
              <div className="grid gap-2 mt-3">
                {sequences.map(s => {
                  const steps = s.steps || {}
                  const isSelected = selectedSequence === s.sequence_id
                  const isRecommended = s.sequence_id === recommendedSequenceId
                  const stepPlatforms = new Set(Object.values(steps).map(st => st.platform).filter(Boolean))
                  const stepPlatformArr = [...stepPlatforms]
                  const platformMatch = campaignPlatforms.length === stepPlatformArr.length && campaignPlatforms.every(p => stepPlatforms.has(p))
                  const hasExtra = stepPlatformArr.some(p => !campaignPlatforms.includes(p as string))
                  const hasMissing = campaignPlatforms.some(p => !stepPlatforms.has(p))
                  const incompatible = hasExtra || hasMissing

                  return (
                    <div key={s.sequence_id}>
                      <motion.button whileHover={{ scale: incompatible ? 1 : 1.01 }}
                        onClick={() => {
                          if (incompatible) {
                            const reasons: string[] = []
                            if (hasMissing) reasons.push(`missing: ${campaignPlatforms.filter(p => !stepPlatforms.has(p)).join(", ")}`)
                            if (hasExtra) reasons.push(`extra: ${stepPlatformArr.filter(p => !campaignPlatforms.includes(p as string)).join(", ")}`)
                            toast.error(`This sequence doesn't match your selected platforms. ${reasons.join("; ")}. Create a new sequence or adjust your accounts.`)
                            return
                          }
                          setSelectedSequence(s.sequence_id)
                        }}
                        className={cn("w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all",
                          incompatible ? "border-red-500/20 bg-red-500/5 opacity-60 cursor-not-allowed" :
                          isSelected ? "border-violet-500 bg-violet-500/10" : "border-border/50 hover:border-muted-foreground/30")}>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{s.sequence_name}</p>
                            {platformMatch && <Badge className="text-[10px] bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Match</Badge>}
                            {incompatible && <Badge className="text-[10px] bg-red-500/20 text-red-400 border-red-500/30">Incompatible</Badge>}
                            {isRecommended && !incompatible && (
                              <Badge className="text-[10px] bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Recommended</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-muted-foreground">{Object.keys(steps).length} steps</span>
                            <div className="flex gap-0.5">
                              {stepPlatformArr.map(p => p && <PlatformBadge key={p} platform={p} small />)}
                            </div>
                          </div>
                        </div>
                        <div className={cn("h-5 w-5 rounded-full border-2 flex items-center justify-center", isSelected ? "border-violet-500 bg-violet-500" : "border-muted")}>
                          {isSelected && <CheckCircle className="h-3 w-3 text-primary-foreground" />}
                        </div>
                      </motion.button>
                      {isSelected && Object.keys(steps).length > 0 && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="ml-4 mt-2 mb-1 space-y-1">
                          {Object.entries(steps).sort(([a], [b]) => parseInt(a) - parseInt(b)).map(([num, step]) => (
                            <div key={num} className="flex items-center gap-2 text-xs text-muted-foreground py-1 px-2 rounded-lg bg-muted/10">
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 rounded-md">Day {step.day_offset ?? num}</Badge>
                              <PlatformBadge platform={step.platform || ""} small />
                              <span className="capitalize">{step.platform} {step.action || "message"}</span>
                              {step.template_group && <span className="text-muted-foreground/60">· {step.template_group}</span>}
                            </div>
                          ))}
                        </motion.div>
                      )}
                    </div>
                  )
                })}
              </div>
              {sequences.length === 0 && (
                <div className="text-center py-8">
                  <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-40 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">No sequences yet.</p>
                  <Button variant="outline" size="sm" className="mt-2 rounded-xl gap-1.5"
                    onClick={() => { setEditingSequence(null); setShowSequenceBuilder(true) }}>
                    <Plus className="h-4 w-4" /> Create Your First Sequence
                  </Button>
                </div>
              )}

              {/* Platform Coverage Validation */}
              {selectedSequence && coverageAnalysis && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-4 space-y-2">
                  <div className="p-3 rounded-xl border border-border/30 bg-muted/10">
                    <div className="flex items-center gap-2 mb-1">
                      <CheckCircle className="h-4 w-4 text-emerald-400" />
                      <span className="text-sm font-medium">{coverageAnalysis.fullCoverage} leads have all platforms covered</span>
                    </div>
                    {coverageAnalysis.missingLeads.length > 0 && (
                      <div className="flex items-center gap-2 text-sm text-amber-400">
                        <AlertTriangle className="h-4 w-4" />
                        {coverageAnalysis.missingLeads.length} leads missing platforms — they&apos;ll skip those steps
                      </div>
                    )}
                  </div>

                  {Object.entries(coverageAnalysis.missingByPlatform).length > 0 && (
                    <div className="space-y-1">
                      {Object.entries(coverageAnalysis.missingByPlatform).map(([platform, count]) => (
                        <Badge key={platform} variant="outline" className="text-xs bg-amber-500/5 border-amber-500/30 text-amber-400 mr-1">
                          ⚠️ {count} leads don&apos;t have {platform}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {coverageAnalysis.missingLeads.length > 0 && (
                    <Collapsible open={coverageExpanded} onOpenChange={setCoverageExpanded}>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="text-xs gap-1 rounded-lg">
                          <ChevronDown className={cn("h-3 w-3 transition-transform", coverageExpanded && "rotate-180")} />
                          {coverageExpanded ? "Hide" : "Show"} missing details
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="max-h-32 overflow-y-auto space-y-1 mt-1">
                          {coverageAnalysis.missingLeads.slice(0, 20).map(({ lead, missing }) => (
                            <div key={lead.lead_id} className="flex items-center gap-2 text-xs py-1 px-2 rounded bg-muted/10">
                              <span className="truncate flex-1">{lead.name}</span>
                              <span className="text-red-400">missing: {missing.join(", ")}</span>
                            </div>
                          ))}
                          {coverageAnalysis.missingLeads.length > 20 && (
                            <p className="text-xs text-muted-foreground px-2">+{coverageAnalysis.missingLeads.length - 20} more</p>
                          )}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  )}

                  {coverageAnalysis.extraPlatforms.length > 0 && (
                    <div className="p-3 rounded-xl border border-blue-500/30 bg-blue-500/5">
                      <p className="text-sm text-blue-400">
                        💡 Many leads also have <span className="font-medium">{coverageAnalysis.extraPlatforms.join(", ")}</span> — want to add those to the sequence?
                      </p>
                    </div>
                  )}

                  {/* Campaign Intelligence */}
                  {previewStats && (
                    <div className="p-3 rounded-xl border border-violet-500/20 bg-violet-500/5 space-y-1">
                      <div className="flex items-center gap-2 text-sm text-violet-400">
                        <TrendingUp className="h-4 w-4" />
                        <span>~<strong>{estimatedDailyRate}</strong> messages/day · Campaign completes in ~<strong>{previewStats.completionDays}</strong> days</span>
                      </div>
                      {/* Mini timeline */}
                      <div className="flex items-center gap-1 mt-2">
                        {Array.from({ length: Math.min(previewStats.completionDays, 14) }).map((_, i) => (
                          <div key={i} className={cn("h-2 flex-1 rounded-full", i < estimatedDays ? "bg-violet-500" : "bg-violet-500/30")} title={`Day ${i + 1}`} />
                        ))}
                        {previewStats.completionDays > 14 && <span className="text-[10px] text-muted-foreground">+{previewStats.completionDays - 14}d</span>}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}

              <div className="flex justify-between mt-4">
                <Button variant="outline" onClick={() => setCampaignStep(2)} className="rounded-xl">Back</Button>
                <Button onClick={() => setCampaignStep(4)} disabled={!selectedSequence} className="rounded-xl">Next <ChevronRight className="h-4 w-4 ml-1" /></Button>
              </div>
            </motion.div>
            )
          })()}

          {/* Step 4: Enhanced Safety Settings */}
          {campaignStep === 4 && (
            <motion.div key="step4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 p-5 shadow-lg"
            >
              <h3 className="text-lg font-semibold mb-1">Safety Settings</h3>
              <p className="text-sm text-muted-foreground mb-3">These settings are saved per campaign and followed precisely on every scheduled day.</p>

              <div className="flex gap-2 mb-5">
                {([
                  { label: "Conservative", values: { min_delay_seconds: 600, max_delay_seconds: 900, pause_after_n_sends: 5, pause_duration_minutes: 25, min_typing_delay_ms: 100, max_typing_delay_ms: 300, random_scroll_enabled: true, random_profile_view_enabled: true, random_page_visit: true, profile_view_duration_min: 5, profile_view_duration_max: 12, like_before_dm_pct: 30, session_max_duration: 60, mouse_speed: "slow", max_sessions_per_day: 2, cooldown_after_error_minutes: 60, jitter_enabled: true } },
                  { label: "Standard", values: { min_delay_seconds: 300, max_delay_seconds: 480, pause_after_n_sends: 10, pause_duration_minutes: 15, min_typing_delay_ms: 50, max_typing_delay_ms: 150, random_scroll_enabled: true, random_profile_view_enabled: true, random_page_visit: false, profile_view_duration_min: 3, profile_view_duration_max: 8, like_before_dm_pct: 0, session_max_duration: 120, mouse_speed: "natural", max_sessions_per_day: 3, cooldown_after_error_minutes: 30, jitter_enabled: true } },
                  { label: "Aggressive", values: { min_delay_seconds: 120, max_delay_seconds: 240, pause_after_n_sends: 15, pause_duration_minutes: 10, min_typing_delay_ms: 30, max_typing_delay_ms: 80, random_scroll_enabled: false, random_profile_view_enabled: false, random_page_visit: false, profile_view_duration_min: 2, profile_view_duration_max: 4, like_before_dm_pct: 0, session_max_duration: 180, mouse_speed: "fast", max_sessions_per_day: 5, cooldown_after_error_minutes: 15, jitter_enabled: true } },
                ] as const).map(preset => (
                  <Button key={preset.label} variant="outline" size="sm" className="rounded-xl text-xs flex-1"
                    onClick={() => setSettings(s => ({ ...s, ...preset.values, active_hours_start: s.active_hours_start, active_hours_end: s.active_hours_end }))}>
                    {preset.label === "Conservative" ? "🐢" : preset.label === "Standard" ? "⚡" : "🔥"} {preset.label}
                  </Button>
                ))}
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <Label>Delay Between DMs</Label>
                  <p className="text-xs text-muted-foreground mb-2">{Math.round(settings.min_delay_seconds / 60)}-{Math.round(settings.max_delay_seconds / 60)} minutes</p>
                  <Slider value={[settings.min_delay_seconds, settings.max_delay_seconds]} min={60} max={1800} step={30}
                    onValueChange={([min, max]) => setSettings(s => ({ ...s, min_delay_seconds: min, max_delay_seconds: max }))} />
                </div>

                <div>
                  <Label>Typing Speed (ms per character)</Label>
                  <p className="text-xs text-muted-foreground mb-2">{settings.min_typing_delay_ms}-{settings.max_typing_delay_ms}ms per letter</p>
                  <Slider value={[settings.min_typing_delay_ms, settings.max_typing_delay_ms]} min={20} max={400} step={10}
                    onValueChange={([min, max]) => setSettings(s => ({ ...s, min_typing_delay_ms: min, max_typing_delay_ms: max }))} />
                </div>

                <div>
                  <Label>Batch Pause</Label>
                  <p className="text-xs text-muted-foreground mb-2">Every {settings.pause_after_n_sends} sends, pause {settings.pause_duration_minutes} min</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[10px] text-muted-foreground">After N sends</span>
                      <Input type="number" value={settings.pause_after_n_sends} onChange={e => setSettings(s => ({ ...s, pause_after_n_sends: parseInt(e.target.value) || 10 }))} className="rounded-xl" />
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground">Pause duration (min)</span>
                      <Input type="number" value={settings.pause_duration_minutes} onChange={e => setSettings(s => ({ ...s, pause_duration_minutes: parseInt(e.target.value) || 15 }))} className="rounded-xl" />
                    </div>
                  </div>
                </div>

                <div>
                  <Label>Active Hours</Label>
                  <p className="text-xs text-muted-foreground mb-2">Only send during these hours</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[10px] text-muted-foreground">Start</span>
                      <Input type="time" value={settings.active_hours_start} onChange={e => setSettings(s => ({ ...s, active_hours_start: e.target.value }))} className="rounded-xl" />
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground">End</span>
                      <Input type="time" value={settings.active_hours_end} onChange={e => setSettings(s => ({ ...s, active_hours_end: e.target.value }))} className="rounded-xl" />
                    </div>
                  </div>
                </div>

                <div>
                  <Label>Error Cooldown</Label>
                  <p className="text-xs text-muted-foreground mb-2">Pause {settings.cooldown_after_error_minutes} min after any error</p>
                  <Input type="number" value={settings.cooldown_after_error_minutes} onChange={e => setSettings(s => ({ ...s, cooldown_after_error_minutes: parseInt(e.target.value) || 30 }))} className="rounded-xl" />
                </div>

                <div>
                  <Label>Max Sessions Per Day</Label>
                  <p className="text-xs text-muted-foreground mb-2">Limit total automation sessions</p>
                  <Input type="number" value={settings.max_sessions_per_day} onChange={e => setSettings(s => ({ ...s, max_sessions_per_day: parseInt(e.target.value) || 3 }))} className="rounded-xl" />
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2 mt-5">
                <div>
                  <Label>Mouse Speed</Label>
                  <Select value={settings.mouse_speed} onValueChange={v => setSettings(s => ({ ...s, mouse_speed: v }))}>
                    <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="slow">Slow (cautious)</SelectItem>
                      <SelectItem value="natural">Natural (human-like)</SelectItem>
                      <SelectItem value="fast">Fast</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Session Max Duration</Label>
                  <p className="text-xs text-muted-foreground mb-2">{settings.session_max_duration} minutes max continuous time</p>
                  <Slider value={[settings.session_max_duration]} min={30} max={300} step={15}
                    onValueChange={([v]) => setSettings(s => ({ ...s, session_max_duration: v }))} />
                </div>
                <div>
                  <Label>Profile View Duration</Label>
                  <p className="text-xs text-muted-foreground mb-2">{settings.profile_view_duration_min}-{settings.profile_view_duration_max} seconds</p>
                  <Slider value={[settings.profile_view_duration_min, settings.profile_view_duration_max]} min={1} max={20} step={1}
                    onValueChange={([min, max]) => setSettings(s => ({ ...s, profile_view_duration_min: min, profile_view_duration_max: max }))} />
                </div>
                <div>
                  <Label>Like Before DM</Label>
                  <p className="text-xs text-muted-foreground mb-2">{settings.like_before_dm_pct}% chance to like a post before sending DM</p>
                  <Slider value={[settings.like_before_dm_pct]} min={0} max={100} step={5}
                    onValueChange={([v]) => setSettings(s => ({ ...s, like_before_dm_pct: v }))} />
                </div>
              </div>

              <div className="mt-5 space-y-3">
                <Label className="text-sm">Anti-Detection</Label>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="flex items-center justify-between p-3 rounded-xl bg-muted/20 border border-border/30">
                    <div>
                      <p className="text-sm font-medium">Random Scrolling</p>
                      <p className="text-[10px] text-muted-foreground">Scroll between actions</p>
                    </div>
                    <Switch checked={settings.random_scroll_enabled} onCheckedChange={v => setSettings(s => ({ ...s, random_scroll_enabled: v }))} />
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-muted/20 border border-border/30">
                    <div>
                      <p className="text-sm font-medium">Profile Viewing</p>
                      <p className="text-[10px] text-muted-foreground">View profiles before DM</p>
                    </div>
                    <Switch checked={settings.random_profile_view_enabled} onCheckedChange={v => setSettings(s => ({ ...s, random_profile_view_enabled: v }))} />
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-muted/20 border border-border/30">
                    <div>
                      <p className="text-sm font-medium">Random Page Visits</p>
                      <p className="text-[10px] text-muted-foreground">Browse between DMs</p>
                    </div>
                    <Switch checked={settings.random_page_visit} onCheckedChange={v => setSettings(s => ({ ...s, random_page_visit: v }))} />
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-muted/20 border border-border/30">
                    <div>
                      <p className="text-sm font-medium">Timing Jitter</p>
                      <p className="text-[10px] text-muted-foreground">Randomize all delays</p>
                    </div>
                    <Switch checked={settings.jitter_enabled} onCheckedChange={v => setSettings(s => ({ ...s, jitter_enabled: v }))} />
                  </div>
                </div>
              </div>

              <div className="flex justify-between mt-5">
                <Button variant="outline" onClick={() => setCampaignStep(3)} className="rounded-xl">Back</Button>
                <Button onClick={() => { saveSettings(); setCampaignStep(5) }} className="rounded-xl">Next <ChevronRight className="h-4 w-4 ml-1" /></Button>
              </div>
            </motion.div>
          )}

          {/* Step 5: Preview */}
          {campaignStep === 5 && (
            <motion.div key="step5" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 p-5 shadow-lg"
            >
              <h3 className="text-lg font-semibold mb-4">Campaign Preview</h3>
              <motion.div variants={container} initial="hidden" animate="show" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <motion.div variants={item} className="p-3 rounded-xl bg-muted/20 border border-border/30">
                  <p className="text-xs text-muted-foreground">Accounts</p>
                  <p className="text-lg font-bold">{selectedAccounts.length}</p>
                </motion.div>
                <motion.div variants={item} className="p-3 rounded-xl bg-muted/20 border border-border/30">
                  <p className="text-xs text-muted-foreground">Leads</p>
                  <p className="text-lg font-bold">{matchingLeads.length}</p>
                </motion.div>
                <motion.div variants={item} className="p-3 rounded-xl bg-muted/20 border border-border/30">
                  <p className="text-xs text-muted-foreground">Sequence</p>
                  <p className="text-sm font-medium truncate">{selectedSeq?.sequence_name || "—"}</p>
                </motion.div>
                <motion.div variants={item} className="p-3 rounded-xl bg-muted/20 border border-border/30">
                  <p className="text-xs text-muted-foreground">Delay</p>
                  <p className="text-sm font-medium">{Math.round(settings.min_delay_seconds / 60)}-{Math.round(settings.max_delay_seconds / 60)} min</p>
                </motion.div>
              </motion.div>

              {previewStats && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="p-3 rounded-xl bg-violet-500/5 border border-violet-500/20">
                    <p className="text-sm text-violet-400 font-medium">📨 Total Messages</p>
                    <p className="text-2xl font-bold">{previewStats.totalMessages}</p>
                    <p className="text-xs text-muted-foreground">{previewStats.leadsCount} leads × {Object.keys(seqSteps).length} steps across {previewStats.platforms} platforms</p>
                  </div>
                  <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                    <p className="text-sm text-emerald-400 font-medium">⏱️ Estimated Completion</p>
                    <p className="text-2xl font-bold">{previewStats.completionDays} day{previewStats.completionDays !== 1 ? "s" : ""}</p>
                    <p className="text-xs text-muted-foreground">~{estimatedDailyRate} msgs/day · {settings.active_hours_start} – {settings.active_hours_end}</p>
                  </div>
                </div>
              )}

              {campaignName && (
                <p className="mt-3 text-sm text-muted-foreground">Campaign: <span className="font-medium text-foreground">{campaignName}</span></p>
              )}

              <div className="flex justify-between mt-4">
                <Button variant="outline" onClick={() => setCampaignStep(4)} className="rounded-xl">Back</Button>
                <Button onClick={() => setShowConfirmDialog(true)} className="gap-1.5 rounded-xl bg-violet-600 hover:bg-violet-700" disabled={launching}>
                  {launching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                  {launching ? "Launching..." : "Launch Campaign"}
                </Button>
              </div>
            </motion.div>
          )}

          {/* Step 6: Post-Launch Active Campaign */}
          {campaignStep === 6 && activeCampaign && (
            <motion.div key="step6" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              className="rounded-2xl bg-card/60 backdrop-blur-xl border border-emerald-500/30 p-6 shadow-lg"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="rounded-xl p-2.5 bg-emerald-500/20">
                  <Rocket className="h-6 w-6 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Campaign Active! 🚀</h3>
                  <p className="text-sm text-muted-foreground">{activeCampaign.campaignName}</p>
                </div>
              </div>

              <motion.div variants={container} initial="hidden" animate="show" className="grid gap-3 sm:grid-cols-4 mb-4">
                <motion.div variants={item} className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-center">
                  <p className="text-xs text-muted-foreground">Queued</p>
                  <p className="text-2xl font-bold text-blue-400">{activeCampaign.totalQueued}</p>
                </motion.div>
                <motion.div variants={item} className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
                  <p className="text-xs text-muted-foreground">Sent</p>
                  <p className="text-2xl font-bold text-emerald-400">{activeCampaign.totalSent}</p>
                </motion.div>
                <motion.div variants={item} className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-center">
                  <p className="text-xs text-muted-foreground">Failed</p>
                  <p className="text-2xl font-bold text-red-400">{activeCampaign.totalFailed}</p>
                </motion.div>
                <motion.div variants={item} className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
                  <p className="text-xs text-muted-foreground">Skipped</p>
                  <p className="text-2xl font-bold text-amber-400">{activeCampaign.totalSkipped}</p>
                </motion.div>
              </motion.div>

              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Auto-refreshing every 8 seconds</span>
                <span>·</span>
                <span>{activeCampaign.leadsCount} leads · {activeCampaign.platformsUsed.join(", ")}</span>
              </div>

              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" className="rounded-xl gap-1.5" onClick={() => { setTab("feed"); setFeedPolling(true) }}>
                  <Activity className="h-4 w-4" /> View in Live Feed
                </Button>
                <Button variant="outline" className="rounded-xl gap-1.5 border-red-500/30 text-red-400 hover:bg-red-500/10" onClick={stopCampaign}>
                  <StopCircle className="h-4 w-4" /> Stop Campaign
                </Button>
              </div>
            </motion.div>
          )}
          </AnimatePresence>
        </TabsContent>

        {/* ═══ LEADS ═══ */}
        <TabsContent value="leads" className="mt-4">
          <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
            <LeadsPage />
          </Suspense>
        </TabsContent>

        {/* ═══ SEQUENCES TAB ═══ */}
        <TabsContent value="sequences" className="space-y-4 mt-4">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold">Sequences</h3>
                <p className="text-sm text-muted-foreground">{sequences.length} sequence{sequences.length !== 1 ? "s" : ""} created</p>
              </div>
              <Button className="rounded-xl gap-1.5 bg-violet-600 hover:bg-violet-700"
                onClick={() => { setEditingSequence(null); setShowSequenceBuilder(true) }}>
                <Plus className="h-4 w-4" /> Create New Sequence
              </Button>
            </div>

            {sequences.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-border/50 p-12 text-center">
                <Sparkles className="h-10 w-10 mx-auto mb-3 text-violet-400 opacity-60" />
                <p className="text-lg font-medium mb-1">No sequences yet</p>
                <p className="text-sm text-muted-foreground mb-4">Create your first multi-step outreach sequence to get started.</p>
                <Button className="rounded-xl gap-1.5 bg-violet-600 hover:bg-violet-700"
                  onClick={() => { setEditingSequence(null); setShowSequenceBuilder(true) }}>
                  <Plus className="h-4 w-4" /> Create Your First Sequence
                </Button>
              </div>
            ) : (
              <motion.div variants={container} initial="hidden" animate="show" className="space-y-3">
                {sequences.map(seq => {
                  const steps = seq.steps || {}
                  const stepCount = Object.keys(steps).length
                  const platforms = [...new Set(Object.values(steps).map(s => s.platform).filter(Boolean))]
                  const maxDay = Math.max(...Object.values(steps).map(s => s.day_offset || 0), 0)
                  const primaryPlatform = platforms[0] || "instagram"
                  const primaryColor = PLATFORM_COLORS[primaryPlatform] || "#888"
                  const isExpanded = expandedSequenceId === seq.sequence_id
                  const isActive = seq.is_active !== false

                  return (
                    <motion.div key={seq.sequence_id} variants={item} layout
                      className={cn("rounded-2xl bg-card/60 backdrop-blur-xl border overflow-hidden transition-all",
                        isActive ? "border-border/50" : "border-border/30 opacity-60")}
                      style={{ borderLeftWidth: 3, borderLeftColor: primaryColor }}
                    >
                      <div className="p-4">
                        {/* Card Header */}
                        <div className="flex items-center gap-3">
                          <button onClick={() => setExpandedSequenceId(isExpanded ? null : seq.sequence_id)}
                            className="text-muted-foreground hover:text-foreground transition-colors">
                            <ChevronRight className={cn("h-4 w-4 transition-transform", isExpanded && "rotate-90")} />
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold truncate">{seq.sequence_name}</p>
                              {!isActive && <Badge variant="outline" className="text-[10px] text-muted-foreground">Inactive</Badge>}
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                              <span>{stepCount} step{stepCount !== 1 ? "s" : ""}</span>
                              <span>·</span>
                              <span>{maxDay + 1} day span</span>
                              <span>·</span>
                              <div className="flex gap-0.5">
                                {platforms.map(p => p && <PlatformBadge key={p} platform={p} small />)}
                              </div>
                              {seq.created_at && (
                                <>
                                  <span>·</span>
                                  <span>Created {new Date(seq.created_at).toLocaleDateString()}</span>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-1">
                            <button onClick={() => toggleSequenceActive(seq)} title={isActive ? "Deactivate" : "Activate"}
                              className={cn("p-1.5 rounded-lg transition-colors", isActive ? "text-emerald-400 hover:bg-emerald-500/10" : "text-muted-foreground hover:bg-muted/50")}>
                              <Power className="h-4 w-4" />
                            </button>
                            <button onClick={() => { setEditingSequence(seq); setShowSequenceBuilder(true) }} title="Edit"
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
                              <Settings className="h-4 w-4" />
                            </button>
                            <button onClick={() => duplicateSequence(seq)} title="Duplicate"
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
                              <Copy className="h-4 w-4" />
                            </button>
                            <button onClick={() => deleteSequence(seq.sequence_id)} title="Delete"
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                        {/* Visual Timeline (always visible) */}
                        <div className="flex items-center gap-1 mt-3 overflow-x-auto pb-1">
                          {Object.entries(steps).sort(([a], [b]) => parseInt(a) - parseInt(b)).map(([num, step], i) => {
                            const Icon = PLATFORM_ICONS_MAP[step.platform || ""] || MessageCircle
                            const color = PLATFORM_COLORS[step.platform || ""] || "#888"
                            return (
                              <div key={num} className="flex items-center">
                                <div className="flex flex-col items-center gap-0.5 px-1.5">
                                  <div className="rounded-full p-1 border" style={{ borderColor: color, backgroundColor: `${color}10` }}>
                                    <Icon className="h-3 w-3" style={{ color }} />
                                  </div>
                                  <span className="text-[9px] text-muted-foreground">D{step.day_offset ?? num}</span>
                                </div>
                                {i < Object.keys(steps).length - 1 && (
                                  <div className="h-px w-4 bg-border/50" />
                                )}
                              </div>
                            )
                          })}
                        </div>

                        {/* Expanded steps detail */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                              className="mt-3 space-y-2 overflow-hidden"
                            >
                              {Object.entries(steps).sort(([a], [b]) => parseInt(a) - parseInt(b)).map(([num, step]) => {
                                const Icon = PLATFORM_ICONS_MAP[step.platform || ""] || MessageCircle
                                const color = PLATFORM_COLORS[step.platform || ""] || "#888"
                                return (
                                  <div key={num} className="flex items-start gap-3 p-3 rounded-xl bg-muted/10 border border-border/30">
                                    <Badge variant="outline" className="rounded-full text-[10px] font-bold px-2 mt-0.5" style={{ borderColor: color, color }}>
                                      {num}
                                    </Badge>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2">
                                        <Icon className="h-3.5 w-3.5" style={{ color }} />
                                        <span className="text-sm font-medium capitalize">{step.platform} {step.action || "message"}</span>
                                        <Badge variant="outline" className="text-[10px]">Day {step.day_offset ?? num}</Badge>
                                      </div>
                                      {step.message && (
                                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{step.message}</p>
                                      )}
                                      {step.messages?.[0] && (
                                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{step.messages[0]}</p>
                                      )}
                                    </div>
                                  </div>
                                )
                              })}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  )
                })}
              </motion.div>
            )}
          </motion.div>
        </TabsContent>

        {/* ═══ LIVE FEED ═══ */}
        <TabsContent value="feed" className="space-y-4 mt-4">
          {/* Stats Bar */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="grid gap-3 grid-cols-2 sm:grid-cols-4"
          >
            <div className="p-3 rounded-xl bg-card/60 border border-border/50">
              <p className="text-xs text-muted-foreground">Sent Today</p>
              <p className="text-xl font-bold text-emerald-400">{feedStats.sent}</p>
            </div>
            <div className="p-3 rounded-xl bg-card/60 border border-border/50">
              <p className="text-xs text-muted-foreground">Success Rate</p>
              <p className="text-xl font-bold">{feedStats.successRate}%</p>
            </div>
            <div className="p-3 rounded-xl bg-card/60 border border-border/50 col-span-2">
              <p className="text-xs text-muted-foreground mb-1.5">Platform Breakdown</p>
              <div className="flex items-center gap-3">
                {Object.entries(feedStats.byPlatform).map(([p, count]) => {
                  const Icon = PLATFORM_ICONS_MAP[p] || MessageCircle
                  const color = PLATFORM_COLORS[p] || "#888"
                  return (
                    <div key={p} className="flex items-center gap-1.5">
                      <Icon className="h-3.5 w-3.5" style={{ color }} />
                      <span className="text-sm font-medium">{count}</span>
                    </div>
                  )
                })}
                {Object.keys(feedStats.byPlatform).length === 0 && <span className="text-sm text-muted-foreground">No sends yet today</span>}
              </div>
            </div>
          </motion.div>

          {/* VNC Live View — Multi Proxy Group Tabs */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl overflow-hidden border border-border/50 bg-black"
          >
            <div className="flex items-center justify-between px-4 py-2 bg-card/80 border-b border-border/50">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <Monitor className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Chrome Live View</span>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="text-xs rounded-xl gap-1" onClick={() => setShowVnc(!showVnc)}>
                  {showVnc ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  {showVnc ? "Hide" : "Show"}
                </Button>
              </div>
            </div>
            {showVnc && (
              <div>
                <div className="flex items-center gap-1 px-3 py-2 bg-card/60 border-b border-border/30 overflow-x-auto">
                  <button onClick={() => setActiveVncTab("default")} className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap", activeVncTab === "default" ? "bg-violet-500/20 text-violet-400" : "text-muted-foreground hover:text-foreground")}>
                    Primary Display
                  </button>
                  {proxyGroups.map(pg => (
                    <button key={pg.id} onClick={() => setActiveVncTab(pg.id)} className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap", activeVncTab === pg.id ? "bg-violet-500/20 text-violet-400" : "text-muted-foreground hover:text-foreground")}>
                      {pg.location_city || pg.ip || pg.id}
                    </button>
                  ))}
                </div>
                <iframe
                  src={activeVncTab === "default"
                    ? "https://srv1197943.taild42583.ts.net:9443/vnc.html?autoconnect=true&resize=scale&password=RGNNa3RnMjAyNiE="
                    : `https://srv1197943.taild42583.ts.net:18790/novnc/vnc_lite.html?path=websockify/${activeVncTab}&autoconnect=true&resize=scale`
                  }
                  className="w-full h-[450px] border-0"
                  allow="clipboard-read; clipboard-write"
                />
              </div>
            )}
            {!showVnc && (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <p className="text-sm">Click Show to view live browser feeds</p>
              </div>
            )}
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <Switch checked={feedPolling} onCheckedChange={setFeedPolling} />
              <span className="text-sm text-muted-foreground">{feedPolling ? "Live updating" : "Paused"}</span>
              {feedPolling && <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />}
            </div>
            <div className="flex gap-2">
              {autoStatuses.map(s => (
                <div key={s.platform} className="flex items-center gap-1">
                  {s.status === "running" ? (
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1 rounded-xl" onClick={() => togglePlatform(s.platform, "pause")}>
                      <Pause className="h-3 w-3" /> Pause {s.platform}
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1 rounded-xl" onClick={() => togglePlatform(s.platform, "resume")}>
                      <Play className="h-3 w-3" /> Resume {s.platform}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </motion.div>

          {/* Error alerts */}
          <AnimatePresence>
            {autoStatuses.filter(s => s.status === "error").map(s => (
              <motion.div key={s.id} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                className="rounded-2xl border border-red-500/30 bg-red-500/5 backdrop-blur-xl py-3 px-4 flex items-center gap-3"
              >
                <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-400">{s.platform} automation stopped — {s.error_count} errors</p>
                  <p className="text-xs text-muted-foreground">{s.last_error}</p>
                </div>
                <Button size="sm" variant="outline" className="text-xs rounded-xl" onClick={() => togglePlatform(s.platform, "reset_errors")}>Reset</Button>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Send log */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
            className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 shadow-lg overflow-hidden"
          >
            <div className="space-y-0">
              {sendLogs.slice(0, 30).map((log, i) => {
                const Icon = platformIcons[log.platform] || MessageCircle
                return (
                  <motion.div key={log.id}
                    initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.02 }}
                    className="flex items-center gap-3 p-3 hover:bg-muted/20 transition-colors border-b border-border/30 last:border-b-0"
                  >
                    <div className={cn("h-2 w-2 rounded-full shrink-0", statusDot[log.status] || "bg-muted-foreground")} />
                    <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">
                        <span className="font-medium">{log.account_id}</span>
                        <span className="text-muted-foreground"> → </span>
                        <span>{log.lead_id}</span>
                      </p>
                      {log.error_message && <p className="text-xs text-red-400 truncate">{log.error_message}</p>}
                    </div>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {log.sent_at ? new Date(log.sent_at).toLocaleTimeString() : "pending"}
                    </span>
                    <Badge className={cn("text-[10px]", log.status === "sent" ? "bg-emerald-500/20 text-emerald-400" : log.status === "failed" ? "bg-red-500/20 text-red-400" : "bg-amber-500/20 text-amber-400")}>
                      {log.status}
                    </Badge>
                  </motion.div>
                )
              })}
              {sendLogs.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <Activity className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p>No sends yet. Start a campaign or use manual mode.</p>
                </div>
              )}
            </div>
          </motion.div>
        </TabsContent>

        {/* ═══ CALENDAR ═══ */}
        <TabsContent value="calendar" className="mt-4">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-full">
            <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
              <OutreachCalendar />
            </Suspense>
          </motion.div>
        </TabsContent>

      </Tabs>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="rounded-2xl border-border/50 bg-card/95 backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Rocket className="h-5 w-5 text-violet-400" />
              Ready to launch?
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 pt-2">
                <p>This will queue <span className="font-bold text-foreground">{previewStats?.totalMessages || 0} messages</span> across <span className="font-bold text-foreground">{seqPlatforms.length} platform{seqPlatforms.length !== 1 ? "s" : ""}</span> for <span className="font-bold text-foreground">{matchingLeads.length} leads</span>.</p>
                <p>Messages will start sending within the active hours window ({settings.active_hours_start} – {settings.active_hours_end}).</p>
                {campaignName && <p className="text-sm">Campaign: <span className="font-medium text-foreground">{campaignName}</span></p>}
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" className="rounded-xl" onClick={() => setShowConfirmDialog(false)}>Cancel</Button>
            <Button className="rounded-xl bg-violet-600 hover:bg-violet-700 gap-1.5" disabled={launching} onClick={() => { setShowConfirmDialog(false); launchCampaign() }}>
              {launching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
              Launch Campaign
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sequence Builder Dialog */}
      <SequenceBuilderDialog
        open={showSequenceBuilder}
        onOpenChange={setShowSequenceBuilder}
        editSequence={editingSequence}
        onSaved={(seq) => {
          setSequences(prev => {
            const idx = prev.findIndex(s => s.sequence_id === seq.sequence_id)
            if (idx >= 0) { const n = [...prev]; n[idx] = seq; return n }
            return [...prev, seq]
          })
          // Auto-select if in campaign step 3
          if (campaignStep === 3) setSelectedSequence(seq.sequence_id)
        }}
      />

      {/* Safety Settings Dialog */}
      <SafetySettingsDialog
        open={showSafetyDialog} onOpenChange={setShowSafetyDialog}
        settings={settings} setSettings={setSettings} saveSettings={saveSettings}
        autoStatuses={autoStatuses} togglePlatform={togglePlatform}
      />

      {/* Quick Campaign Dialog */}
      <QuickCampaignDialog
        open={showQuickCampaign} onOpenChange={setShowQuickCampaign}
        accounts={accounts} sequences={sequences} settings={settings}
      />
    </motion.div>
  )
}
