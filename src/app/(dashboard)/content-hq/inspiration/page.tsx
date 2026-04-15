"use client"

import { useState } from "react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
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
import { Plus, ExternalLink, Calendar, Tag, User, X } from "lucide-react"
import { cn } from "@/lib/utils"

interface Inspiration {
  id: string
  url: string
  platform: string
  thumbnail?: string
  tags: string[]
  mood: string
  hook_type: string
  persona_match?: string
  ai_analysis?: string
  created_at: string
}

const moods = ["All", "Motivational", "Funny", "Educational", "Controversial", "Aesthetic", "Raw"]
const platformFilters = ["All", "Instagram", "TikTok", "YouTube", "Twitter", "Other"]

const moodColors: Record<string, string> = {
  Motivational: "bg-emerald-500/20 text-emerald-400",
  Funny: "bg-yellow-500/20 text-yellow-400",
  Educational: "bg-blue-500/20 text-blue-400",
  Controversial: "bg-red-500/20 text-red-400",
  Aesthetic: "bg-purple-500/20 text-purple-400",
  Raw: "bg-orange-500/20 text-orange-400",
}

const gradients = [
  "from-rose-600/30 to-pink-600/30",
  "from-blue-600/30 to-cyan-600/30",
  "from-violet-600/30 to-purple-600/30",
  "from-amber-600/30 to-yellow-600/30",
  "from-emerald-600/30 to-teal-600/30",
  "from-fuchsia-600/30 to-pink-600/30",
]

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export default function InspirationPage() {
  const [linkInput, setLinkInput] = useState("")
  const [platformFilter, setPlatformFilter] = useState("All")
  const [moodFilter, setMoodFilter] = useState("All")
  const [selectedItem, setSelectedItem] = useState<Inspiration | null>(null)

  const { data, isLoading } = useSWR<{ data?: Inspiration[] }>(
    `/api/content/inspiration?platform=${platformFilter}&mood=${moodFilter}`,
    fetcher
  )

  const items = Array.isArray(data) ? data : data?.data || []

  const handleAdd = async () => {
    if (!linkInput.trim()) return
    // Placeholder - would POST to API
    setLinkInput("")
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold">💡 Inspiration Board</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {isLoading ? "Loading..." : `${items.length} saved inspirations`}
        </p>
      </div>

      {/* Add Input */}
      <div className="flex gap-2">
        <Input
          placeholder="Paste any link — IG Reel, TikTok, YouTube, anything..."
          value={linkInput}
          onChange={(e) => setLinkInput(e.target.value)}
          className="text-xs h-10 bg-zinc-900 border-zinc-800 flex-1"
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <Button size="sm" className="h-10 px-4 text-xs" onClick={handleAdd}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Add
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={platformFilter} onValueChange={setPlatformFilter}>
          <SelectTrigger className="w-28 h-7 text-[10px] bg-zinc-900 border-zinc-800">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {platformFilters.map((p) => (
              <SelectItem key={p} value={p}>{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1">
          {moods.map((m) => (
            <button
              key={m}
              onClick={() => setMoodFilter(m)}
              className={cn(
                "px-2 py-1 rounded-md text-[10px] font-medium transition-all",
                moodFilter === m
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-lg bg-zinc-800 animate-pulse h-52" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="text-4xl mb-3">💡</div>
          <h3 className="text-sm font-medium text-zinc-300">Your inspiration board is empty</h3>
          <p className="text-xs text-zinc-500 mt-1 max-w-xs">
            Paste links to content that inspires you — we&apos;ll analyze it and help you create similar content
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {items.map((item, i) => (
            <div
              key={item.id}
              onClick={() => setSelectedItem(item)}
              className="rounded-lg border border-zinc-800 bg-zinc-900/50 overflow-hidden hover:border-zinc-700 transition-all cursor-pointer group"
            >
              <div className={cn("h-32 bg-gradient-to-br flex items-center justify-center", gradients[i % gradients.length])}>
                <ExternalLink className="h-5 w-5 text-white/40 group-hover:text-white/70 transition-all" />
              </div>
              <div className="p-2.5 space-y-1.5">
                <div className="flex items-center gap-1 flex-wrap">
                  <Badge variant="secondary" className="text-[10px]">{item.platform}</Badge>
                  {item.mood && (
                    <Badge className={cn("text-[10px] border-0", moodColors[item.mood] || "bg-zinc-800 text-zinc-400")}>
                      {item.mood}
                    </Badge>
                  )}
                </div>
                {item.tags.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap">
                    {item.tags.slice(0, 3).map((tag: string) => (
                      <span key={tag} className="text-[10px] text-zinc-500">#{tag}</span>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-zinc-600">{item.hook_type}</span>
                  {item.persona_match && (
                    <span className="text-[10px] text-zinc-500 flex items-center gap-0.5">
                      <User className="h-2.5 w-2.5" />{item.persona_match}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 text-[10px] text-zinc-600">
                  <Calendar className="h-2.5 w-2.5" />
                  {new Date(item.created_at).toLocaleDateString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              💡 Inspiration Detail
            </DialogTitle>
          </DialogHeader>
          {selectedItem && (
            <div className="space-y-3">
              <div className="rounded-lg bg-zinc-950 p-3">
                <p className="text-xs text-zinc-400 mb-1">URL</p>
                <a href={selectedItem.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline break-all">
                  {selectedItem.url}
                </a>
              </div>
              {selectedItem.ai_analysis && (
                <div className="rounded-lg bg-zinc-950 p-3">
                  <p className="text-xs text-zinc-400 mb-1">AI Analysis</p>
                  <p className="text-xs text-zinc-300">{selectedItem.ai_analysis}</p>
                </div>
              )}
              <div className="flex items-center gap-1 flex-wrap">
                {selectedItem.tags.map((tag: string) => (
                  <Badge key={tag} variant="secondary" className="text-[10px]">
                    <Tag className="h-2 w-2 mr-0.5" />{tag}
                  </Badge>
                ))}
              </div>
              <Select>
                <SelectTrigger className="h-7 text-xs bg-zinc-950 border-zinc-800">
                  <SelectValue placeholder="Assign to persona..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="data-nerd">🧠 The Data Nerd</SelectItem>
                  <SelectItem value="hustler">🔥 The Street Hustler</SelectItem>
                  <SelectItem value="ai-wizard">🤖 The AI Wizard</SelectItem>
                  <SelectItem value="meme-lord">😂 The Meme Lord</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
