"use client"

import { useState, useMemo } from "react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ChevronLeft, ChevronRight, Clock } from "lucide-react"
import { cn } from "@/lib/utils"

interface CalendarItem {
  id: string
  title: string
  persona_emoji: string
  persona_name: string
  persona_color: string
  time: string
  status: "draft" | "generating" | "review" | "approved" | "scheduled" | "posted"
  date: string
}

const statusDot: Record<string, string> = {
  draft: "bg-zinc-400",
  generating: "bg-blue-400 animate-pulse",
  review: "bg-yellow-400",
  approved: "bg-green-400",
  scheduled: "bg-purple-400",
  posted: "bg-emerald-400",
}

const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

function getWeekDates(offset: number): Date[] {
  const now = new Date()
  const day = now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + offset * 7)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

function dateKey(d: Date): string {
  return d.toISOString().split("T")[0]
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export default function CalendarPage() {
  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset])
  const startDate = dateKey(weekDates[0])
  const endDate = dateKey(weekDates[6])

  const { data, isLoading } = useSWR<{ data?: CalendarItem[] }>(
    `/api/content/calendar?start=${startDate}&end=${endDate}`,
    fetcher
  )

  const items = Array.isArray(data) ? data : data?.data || []
  const today = dateKey(new Date())

  const itemsByDate = useMemo(() => {
    const map: Record<string, CalendarItem[]> = {}
    for (const item of items) {
      const d = item.date.split("T")[0]
      if (!map[d]) map[d] = []
      map[d].push(item)
    }
    return map
  }, [items])

  const scheduled = items.filter((i) => i.status === "scheduled").length
  const posted = items.filter((i) => i.status === "posted").length
  const needReview = items.filter((i) => i.status === "review").length

  const selectedItems = selectedDay ? itemsByDate[selectedDay] || [] : []

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">📅 Content Calendar</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-[10px] text-zinc-500"><span className="text-purple-400 font-medium">{scheduled}</span> scheduled</span>
            <span className="text-[10px] text-zinc-500"><span className="text-emerald-400 font-medium">{posted}</span> posted</span>
            <span className="text-[10px] text-zinc-500"><span className="text-yellow-400 font-medium">{needReview}</span> need review</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setWeekOffset((o) => o - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => setWeekOffset(0)}>
            Today
          </Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setWeekOffset((o) => o + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Week label */}
      <p className="text-xs text-zinc-400">
        {weekDates[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} — {weekDates[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
      </p>

      {/* Week Grid */}
      {isLoading ? (
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="rounded-lg bg-zinc-800 animate-pulse h-40" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-1.5">
          {weekDates.map((date, i) => {
            const key = dateKey(date)
            const dayItems = itemsByDate[key] || []
            const isToday = key === today

            return (
              <div
                key={key}
                onClick={() => setSelectedDay(key)}
                className={cn(
                  "rounded-lg border bg-zinc-900/50 p-2 min-h-[140px] cursor-pointer transition-all hover:border-zinc-600",
                  isToday ? "border-blue-500/50" : "border-zinc-800",
                  selectedDay === key && "ring-1 ring-zinc-600"
                )}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] text-zinc-500">{dayNames[i]}</span>
                  <span className={cn("text-xs font-medium", isToday ? "text-blue-400" : "text-zinc-400")}>
                    {date.getDate()}
                  </span>
                </div>

                <div className="space-y-1">
                  {dayItems.slice(0, 4).map((item) => (
                    <div
                      key={item.id}
                      className="rounded bg-zinc-800/80 px-1.5 py-1 flex items-center gap-1"
                      style={{ borderLeft: `2px solid ${item.persona_color || "#71717a"}` }}
                    >
                      <span className="text-[10px]">{item.persona_emoji}</span>
                      <span className="text-[10px] text-zinc-300 truncate flex-1">{item.title}</span>
                      <div className={cn("h-1.5 w-1.5 rounded-full shrink-0", statusDot[item.status])} />
                    </div>
                  ))}
                  {dayItems.length > 4 && (
                    <span className="text-[10px] text-zinc-600 pl-1">+{dayItems.length - 4} more</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="text-3xl mb-2">📅</div>
          <h3 className="text-sm font-medium text-zinc-300">Nothing scheduled yet</h3>
          <p className="text-xs text-zinc-500 mt-1">Create content in the Factory and schedule it to see it here</p>
        </div>
      )}

      {/* Day Detail Dialog */}
      <Dialog open={!!selectedDay && selectedItems.length > 0} onOpenChange={(open) => !open && setSelectedDay(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {selectedDay && new Date(selectedDay + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {selectedItems.map((item) => (
              <div key={item.id} className="rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 flex items-center gap-2">
                <span className="text-lg">{item.persona_emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-zinc-200 truncate">{item.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-zinc-500 flex items-center gap-0.5">
                      <Clock className="h-2.5 w-2.5" />{item.time}
                    </span>
                    <Badge className={cn("text-[10px] border-0", `bg-${item.status === "posted" ? "emerald" : item.status === "scheduled" ? "purple" : "zinc"}-500/20`)}>
                      {item.status}
                    </Badge>
                  </div>
                </div>
                <div className={cn("h-2 w-2 rounded-full shrink-0", statusDot[item.status])} />
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
