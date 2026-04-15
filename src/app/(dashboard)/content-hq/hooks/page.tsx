"use client"

import { useState } from "react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Search, Plus, Shuffle, Star, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"

interface Hook {
  id: string
  text: string
  category: string
  platform: string
  performance: number
  template: string
}

const categories = [
  "All", "Curiosity Gap", "Bold Claim", "Pattern Interrupt", "Story Opening",
  "Controversy", "Social Proof", "Shock Value", "Pop Culture",
]

const categoryColors: Record<string, string> = {
  "Curiosity Gap": "bg-blue-500/20 text-blue-400",
  "Bold Claim": "bg-red-500/20 text-red-400",
  "Pattern Interrupt": "bg-purple-500/20 text-purple-400",
  "Story Opening": "bg-emerald-500/20 text-emerald-400",
  "Controversy": "bg-orange-500/20 text-orange-400",
  "Social Proof": "bg-cyan-500/20 text-cyan-400",
  "Shock Value": "bg-pink-500/20 text-pink-400",
  "Pop Culture": "bg-yellow-500/20 text-yellow-400",
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function HighlightBlanks({ text }: { text: string }) {
  const parts = text.split(/(\[.*?\])/)
  return (
    <span>
      {parts.map((part, i) =>
        part.startsWith("[") && part.endsWith("]") ? (
          <span key={i} className="bg-yellow-500/30 text-yellow-300 rounded px-0.5">{part}</span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  )
}

function Stars({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn("h-3 w-3", i < count ? "text-amber-400 fill-amber-400" : "text-zinc-700")}
        />
      ))}
    </div>
  )
}

export default function HooksPage() {
  const [category, setCategory] = useState("All")
  const [search, setSearch] = useState("")
  const [addOpen, setAddOpen] = useState(false)
  const [newHook, setNewHook] = useState("")

  const { data, isLoading } = useSWR<{ data?: Hook[] }>(
    `/api/content/hooks?category=${category}&search=${search}`,
    fetcher
  )

  const hooks = Array.isArray(data) ? data : data?.data || []

  const randomHook = () => {
    if (hooks.length === 0) return
    const el = document.getElementById(`hook-${hooks[Math.floor(Math.random() * hooks.length)].id}`)
    el?.scrollIntoView({ behavior: "smooth", block: "center" })
    el?.classList.add("ring-2", "ring-amber-400/50")
    setTimeout(() => el?.classList.remove("ring-2", "ring-amber-400/50"), 2000)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">🎣 Hook Library</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isLoading ? "Loading..." : `${hooks.length} hooks`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="text-xs h-7" onClick={randomHook}>
            <Shuffle className="h-3 w-3 mr-1.5" /> Random Hook
          </Button>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="text-xs h-7">
                <Plus className="h-3 w-3 mr-1.5" /> Add Hook
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-zinc-900 border-zinc-800">
              <DialogHeader>
                <DialogTitle className="text-sm">Add New Hook</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <Input
                  placeholder="Paste a URL (IG, TikTok, YouTube)..."
                  className="text-xs bg-zinc-950 border-zinc-800"
                />
                <div className="text-center text-[10px] text-zinc-500">— or —</div>
                <Textarea
                  placeholder="Type your hook text..."
                  value={newHook}
                  onChange={(e) => setNewHook(e.target.value)}
                  className="text-xs bg-zinc-950 border-zinc-800 min-h-[80px]"
                />
                <Button size="sm" className="w-full text-xs" onClick={() => setAddOpen(false)}>
                  Save Hook
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-2">
        <div className="flex items-center gap-1 flex-wrap">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={cn(
                "px-2.5 py-1 rounded-md text-[10px] font-medium transition-all border",
                category === c
                  ? "bg-zinc-800 text-white border-zinc-700"
                  : "text-zinc-400 border-zinc-800 hover:text-zinc-200 hover:border-zinc-700"
              )}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
          <Input
            placeholder="Search hooks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 text-xs h-8 bg-zinc-900 border-zinc-800"
          />
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-lg bg-zinc-800 animate-pulse h-24" />
          ))}
        </div>
      ) : hooks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="text-4xl mb-3">🎣</div>
          <h3 className="text-sm font-medium text-zinc-300">No hooks yet</h3>
          <p className="text-xs text-zinc-500 mt-1 max-w-xs">
            Start building your hook library by adding hooks manually or importing from trending content
          </p>
          <Button size="sm" className="mt-4" onClick={() => setAddOpen(true)}>
            <Plus className="h-3 w-3 mr-1.5" /> Add Your First Hook
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {hooks.map((hook) => (
            <div
              key={hook.id}
              id={`hook-${hook.id}`}
              className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 hover:border-zinc-700 transition-all"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 space-y-2">
                  <p className="text-sm font-semibold text-zinc-100">{hook.text}</p>
                  <p className="text-[10px] text-zinc-500">
                    <HighlightBlanks text={hook.template} />
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={cn("text-[10px] border-0", categoryColors[hook.category] || "bg-zinc-800 text-zinc-400")}>
                      {hook.category}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">{hook.platform}</Badge>
                    <Stars count={hook.performance} />
                  </div>
                </div>
                <Button size="sm" variant="outline" className="text-[10px] h-6 shrink-0">
                  Use in Factory <ArrowRight className="h-2.5 w-2.5 ml-1" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
