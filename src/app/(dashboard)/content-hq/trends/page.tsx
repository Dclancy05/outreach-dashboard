"use client"

import { useState } from "react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Play, RefreshCw, Eye, TrendingUp, Instagram, Youtube } from "lucide-react"
import { cn } from "@/lib/utils"

interface Trend {
  id: string
  description: string
  platform: string
  format_type: string
  virality_score: number
  views: number
  hook_type: string
  source_url: string
  trending_sound: string
  engagement_rate: number
  status: string
  detected_at: string
}

const platforms = ["All", "Instagram", "TikTok", "YouTube"]
const sortOptions = [
  { value: "virality", label: "Virality Score" },
  { value: "views", label: "Views" },
  { value: "newest", label: "Newest" },
]

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function Skeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-lg bg-zinc-800 animate-pulse h-64" />
      ))}
    </div>
  )
}

function platformIcon(p: string) {
  if (p === "Instagram") return <Instagram className="h-3 w-3" />
  if (p === "YouTube") return <Youtube className="h-3 w-3" />
  return <span className="text-[10px]">♪</span>
}

function viralityColor(score: number) {
  if (score >= 80) return "text-red-400"
  if (score >= 60) return "text-orange-400"
  if (score >= 40) return "text-yellow-400"
  return "text-zinc-400"
}

const gradients = [
  "from-purple-600 to-blue-600",
  "from-pink-600 to-red-600",
  "from-cyan-600 to-teal-600",
  "from-amber-600 to-orange-600",
  "from-emerald-600 to-green-600",
  "from-violet-600 to-fuchsia-600",
]

export default function TrendsPage() {
  const [platform, setPlatform] = useState("All")
  const [sort, setSort] = useState("virality")
  const [format, setFormat] = useState("all")
  const [scanning, setScanning] = useState(false)

  const { data, isLoading, mutate } = useSWR<{ data?: Trend[] }>(
    `/api/content/trends?platform=${platform}&sort=${sort}&format=${format}`,
    fetcher
  )

  const trends = Array.isArray(data) ? data : data?.data || []

  const [scanResult, setScanResult] = useState<string | null>(null)

  const handleScan = async () => {
    setScanning(true)
    setScanResult(null)
    try {
      const res = await fetch("/api/content/trends/scan", { method: "POST" })
      const json = await res.json()
      if (json.success) {
        setScanResult(`✅ Found ${json.data?.trends_saved || 0} trends, ${json.data?.hooks_saved || 0} hooks`)
      } else {
        setScanResult(`⚠️ ${json.error || "Scan returned no results"}`)
      }
      await mutate()
    } catch (e: any) {
      setScanResult(`❌ ${e.message || "Scan failed"}`)
    }
    setScanning(false)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">🔥 Trend Radar</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isLoading ? "Loading..." : `${trends.length} trends detected`}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg bg-zinc-900 p-0.5 border border-zinc-800">
          {platforms.map((p) => (
            <button
              key={p}
              onClick={() => setPlatform(p)}
              className={cn(
                "px-2.5 py-1.5 rounded-md text-xs font-medium transition-all",
                platform === p
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              {p}
            </button>
          ))}
        </div>

        <Select value={format} onValueChange={setFormat}>
          <SelectTrigger className="w-32 h-8 text-xs bg-zinc-900 border-zinc-800">
            <SelectValue placeholder="Format" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Formats</SelectItem>
            <SelectItem value="reel">Reel</SelectItem>
            <SelectItem value="short">Short</SelectItem>
            <SelectItem value="carousel">Carousel</SelectItem>
            <SelectItem value="story">Story</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="w-36 h-8 text-xs bg-zinc-900 border-zinc-800">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            {sortOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Grid */}
      {isLoading ? (
        <Skeleton />
      ) : trends.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="text-4xl mb-3">🔍</div>
          <h3 className="text-sm font-medium text-zinc-300">No trends found yet</h3>
          <p className="text-xs text-zinc-500 mt-1 max-w-xs">
            Hit &quot;Scan Now&quot; to discover trending content across platforms
          </p>
          <Button size="sm" className="mt-4" onClick={handleScan} disabled={scanning}>
            <RefreshCw className={cn("h-3 w-3 mr-1.5", scanning && "animate-spin")} />
            Scan Now
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {trends.map((trend, i) => (
            <div
              key={trend.id}
              className="rounded-lg border border-zinc-800 bg-zinc-900/50 overflow-hidden hover:border-zinc-700 transition-all group"
            >
              {/* Thumbnail */}
              <div className={cn("relative h-36 bg-gradient-to-br flex items-center justify-center", gradients[i % gradients.length])}>
                {trend.source_url ? (
                  <a href={trend.source_url} target="_blank" rel="noopener noreferrer">
                    <Play className="h-8 w-8 text-white/60 group-hover:text-white/90 transition-all" />
                  </a>
                ) : (
                  <Play className="h-8 w-8 text-white/60 group-hover:text-white/90 transition-all" />
                )}
                <Badge className="absolute top-2 left-2 text-[10px] bg-black/50 border-0">
                  {trend.format_type || "reel"}
                </Badge>
                <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/50 rounded-full px-2 py-0.5">
                  {platformIcon(trend.platform)}
                </div>
              </div>

              {/* Info */}
              <div className="p-3 space-y-2">
                <p className="text-xs text-zinc-300 line-clamp-2 min-h-[2rem]">
                  {trend.description || "No description"}
                </p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" />
                    <span className={cn("text-sm font-bold", viralityColor(trend.virality_score))}>
                      {trend.virality_score}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-zinc-400">
                    <Eye className="h-3 w-3" />
                    <span className="text-[10px]">
                      {trend.views >= 1_000_000
                        ? `${(trend.views / 1_000_000).toFixed(1)}M`
                        : trend.views >= 1_000
                        ? `${(trend.views / 1_000).toFixed(0)}K`
                        : trend.views}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge variant="secondary" className="text-[10px]">{trend.hook_type || "unknown"}</Badge>
                  {trend.trending_sound && (
                    <Badge variant="outline" className="text-[10px]">♪ {trend.trending_sound.slice(0, 20)}</Badge>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Scan result banner */}
      {scanResult && (
        <div className="rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-xs text-zinc-300">
          {scanResult}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
        <span className="text-[10px] text-zinc-500">
          Last scanned: {trends.length > 0 ? new Date(trends[0].detected_at).toLocaleString() : "Never"}
        </span>
        <Button size="sm" variant="outline" className="text-xs h-7" onClick={handleScan} disabled={scanning}>
          <RefreshCw className={cn("h-3 w-3 mr-1.5", scanning && "animate-spin")} />
          {scanning ? "Scanning..." : "Scan Now"}
        </Button>
      </div>
    </div>
  )
}
