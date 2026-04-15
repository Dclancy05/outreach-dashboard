"use client"

import { useState } from "react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Plus, Edit2, FileText, TrendingUp } from "lucide-react"
import { cn } from "@/lib/utils"

interface Persona {
  id: string
  name: string
  emoji: string
  description: string
  vibe: string
  voice_style: string
  color_primary: string
  color_secondary: string
  hook_preferences: string[]
  content_rules: string[]
  account_assignments: string[]
  pieces_created: number
  avg_engagement: number
}

const defaultPersonas: Persona[] = [
  { id: "1", name: "The Data Nerd", emoji: "🧠", description: "Numbers don't lie. Data-driven content that educates.", vibe: "Analytical, authoritative", voice_style: "Professional yet accessible", color_primary: "#3b82f6", color_secondary: "#1e40af", hook_preferences: ["Bold Claim", "Social Proof"], content_rules: ["Always cite sources", "Include statistics"], account_assignments: ["IG_01"], pieces_created: 24, avg_engagement: 4.2 },
  { id: "2", name: "The Street Hustler", emoji: "🔥", description: "Raw motivation and hustle culture content.", vibe: "Intense, motivational", voice_style: "Direct, no-BS", color_primary: "#ef4444", color_secondary: "#991b1b", hook_preferences: ["Controversy", "Bold Claim"], content_rules: ["Keep it real", "Short punchy sentences"], account_assignments: ["IG_02"], pieces_created: 31, avg_engagement: 5.1 },
  { id: "3", name: "The AI Wizard", emoji: "🤖", description: "Making AI accessible and exciting for everyone.", vibe: "Futuristic, helpful", voice_style: "Enthusiastic explainer", color_primary: "#8b5cf6", color_secondary: "#5b21b6", hook_preferences: ["Curiosity Gap", "Shock Value"], content_rules: ["Simplify complex topics", "Show don't tell"], account_assignments: ["IG_03", "TT_01"], pieces_created: 18, avg_engagement: 6.3 },
  { id: "4", name: "The Meme Lord", emoji: "😂", description: "Humor-first content that entertains and educates.", vibe: "Playful, irreverent", voice_style: "Gen-Z casual", color_primary: "#eab308", color_secondary: "#a16207", hook_preferences: ["Pattern Interrupt", "Pop Culture"], content_rules: ["If it's not funny, don't post", "Trend-jack everything"], account_assignments: ["TT_02"], pieces_created: 42, avg_engagement: 7.8 },
  { id: "5", name: "The Case Study Channel", emoji: "📊", description: "Deep-dive breakdowns of business success stories.", vibe: "Investigative, insightful", voice_style: "Documentary narrator", color_primary: "#06b6d4", color_secondary: "#0e7490", hook_preferences: ["Story Opening", "Curiosity Gap"], content_rules: ["Every post = a story", "Include before/after"], account_assignments: ["YT_01"], pieces_created: 12, avg_engagement: 8.1 },
  { id: "6", name: "The Luxury Brand", emoji: "💎", description: "Premium aesthetic content for high-end audiences.", vibe: "Elegant, aspirational", voice_style: "Refined, minimal words", color_primary: "#d946ef", color_secondary: "#a21caf", hook_preferences: ["Social Proof", "Shock Value"], content_rules: ["Quality over quantity", "Cinematic visuals only"], account_assignments: ["IG_01"], pieces_created: 8, avg_engagement: 9.2 },
]

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function PersonaModal({ persona, onClose }: { persona?: Persona | null; onClose: () => void }) {
  const [name, setName] = useState(persona?.name || "")
  const [emoji, setEmoji] = useState(persona?.emoji || "✨")
  const [description, setDescription] = useState(persona?.description || "")
  const [vibe, setVibe] = useState(persona?.vibe || "")
  const [voiceStyle, setVoiceStyle] = useState(persona?.voice_style || "")
  const [rules, setRules] = useState(persona?.content_rules.join("\n") || "")
  const [assignments, setAssignments] = useState(persona?.account_assignments.join(", ") || "")

  return (
    <div className="space-y-3 max-h-[70vh] overflow-y-auto">
      <div className="grid grid-cols-[60px_1fr] gap-2">
        <div>
          <Label className="text-[10px] text-zinc-400">Emoji</Label>
          <Input value={emoji} onChange={(e) => setEmoji(e.target.value)} className="text-center text-lg h-10 bg-zinc-950 border-zinc-800" />
        </div>
        <div>
          <Label className="text-[10px] text-zinc-400">Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Persona name" className="text-xs h-10 bg-zinc-950 border-zinc-800" />
        </div>
      </div>
      <div>
        <Label className="text-[10px] text-zinc-400">Description</Label>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this persona is about" className="text-xs bg-zinc-950 border-zinc-800" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px] text-zinc-400">Vibe</Label>
          <Input value={vibe} onChange={(e) => setVibe(e.target.value)} placeholder="e.g. Intense, motivational" className="text-xs bg-zinc-950 border-zinc-800" />
        </div>
        <div>
          <Label className="text-[10px] text-zinc-400">Voice Style</Label>
          <Input value={voiceStyle} onChange={(e) => setVoiceStyle(e.target.value)} placeholder="e.g. Professional yet fun" className="text-xs bg-zinc-950 border-zinc-800" />
        </div>
      </div>
      <div>
        <Label className="text-[10px] text-zinc-400">Content Rules (one per line)</Label>
        <Textarea value={rules} onChange={(e) => setRules(e.target.value)} className="text-xs bg-zinc-950 border-zinc-800 min-h-[60px]" />
      </div>
      <div>
        <Label className="text-[10px] text-zinc-400">Account Assignments (comma separated)</Label>
        <Input value={assignments} onChange={(e) => setAssignments(e.target.value)} placeholder="IG_01, TT_01" className="text-xs bg-zinc-950 border-zinc-800" />
      </div>
      <Button size="sm" className="w-full text-xs" onClick={onClose}>
        {persona ? "Save Changes" : "Create Persona"}
      </Button>
    </div>
  )
}

export default function PersonasPage() {
  const [editPersona, setEditPersona] = useState<Persona | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const { data, isLoading } = useSWR<{ data?: Persona[] }>("/api/content/personas", fetcher)
  const personas = Array.isArray(data) ? data : data?.data || defaultPersonas

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">🎭 Persona Studio</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{personas.length} personas</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="text-xs h-7">
              <Plus className="h-3 w-3 mr-1.5" /> Create Persona
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-zinc-900 border-zinc-800">
            <DialogHeader>
              <DialogTitle className="text-sm">Create New Persona</DialogTitle>
            </DialogHeader>
            <PersonaModal onClose={() => setCreateOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-lg bg-zinc-800 animate-pulse h-48" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {personas.map((persona) => (
            <div
              key={persona.id}
              className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 hover:border-zinc-700 transition-all"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{persona.emoji}</span>
                  <div>
                    <h3 className="text-sm font-bold text-zinc-100">{persona.name}</h3>
                    <p className="text-[10px] text-zinc-500">{persona.vibe}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ background: persona.color_primary }}
                  />
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ background: persona.color_secondary }}
                  />
                </div>
              </div>

              <p className="text-xs text-zinc-400 mb-3">{persona.description}</p>

              <div className="flex items-center gap-1 flex-wrap mb-3">
                {persona.account_assignments.map((a: string) => (
                  <Badge key={a} variant="secondary" className="text-[10px]">{a}</Badge>
                ))}
              </div>

              <div className="flex items-center gap-1 flex-wrap mb-3">
                {persona.hook_preferences.map((h: string) => (
                  <Badge key={h} className="text-[10px] bg-zinc-800 text-zinc-300 border-0">{h}</Badge>
                ))}
              </div>

              <div className="flex items-center gap-1 text-[10px] text-zinc-600 mb-2">
                {persona.content_rules.slice(0, 2).map((r: string) => (
                  <span key={r} className="truncate">• {r}</span>
                ))}
              </div>

              <div className="flex items-center justify-between border-t border-zinc-800 pt-2 mt-2">
                <div className="flex items-center gap-3 text-[10px] text-zinc-500">
                  <span className="flex items-center gap-0.5"><FileText className="h-2.5 w-2.5" />{persona.pieces_created} pieces</span>
                  <span className="flex items-center gap-0.5"><TrendingUp className="h-2.5 w-2.5" />{persona.avg_engagement}% eng</span>
                </div>

                <Dialog open={editPersona?.id === persona.id} onOpenChange={(open) => !open && setEditPersona(null)}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="ghost" className="text-[10px] h-6 px-2" onClick={() => setEditPersona(persona)}>
                      <Edit2 className="h-2.5 w-2.5 mr-1" /> Edit
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="bg-zinc-900 border-zinc-800">
                    <DialogHeader>
                      <DialogTitle className="text-sm">Edit {persona.emoji} {persona.name}</DialogTitle>
                    </DialogHeader>
                    <PersonaModal persona={persona} onClose={() => setEditPersona(null)} />
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
