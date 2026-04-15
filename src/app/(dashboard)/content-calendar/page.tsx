"use client"

import { useState, useMemo, useCallback } from "react"
import useSWR from "swr"
import { dashboardApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Wand2,
  Plus,
  Image,
  Film,
  LayoutGrid,
  MessageCircle,
  Loader2,
  Pencil,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { PageInstructions } from "@/components/page-instructions"
import type { ContentCalendarItem, ContentPersona } from "@/types"

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-500/20 text-gray-400",
  scheduled: "bg-blue-500/20 text-blue-400",
  posted: "bg-green-500/20 text-green-400",
  failed: "bg-red-500/20 text-red-400",
}

const TYPE_ICONS: Record<string, typeof Image> = {
  image: Image,
  reel: Film,
  carousel: LayoutGrid,
  story: MessageCircle,
}

function getWeekDates(offset: number) {
  const now = new Date()
  const dayOfWeek = now.getDay()
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const monday = new Date(now)
  monday.setDate(now.getDate() + mondayOffset + offset * 7)
  monday.setHours(0, 0, 0, 0)

  const dates: Date[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    dates.push(d)
  }
  return dates
}

function formatDate(d: Date) {
  return d.toISOString().split("T")[0]
}

type ViewMode = "week" | "month"

function getMonthDates(offset: number) {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + offset
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)

  // Pad to start on Monday
  const startDow = firstDay.getDay()
  const padStart = startDow === 0 ? 6 : startDow - 1
  const start = new Date(firstDay)
  start.setDate(start.getDate() - padStart)

  const dates: Date[] = []
  const current = new Date(start)
  // Always show 42 days (6 weeks) for consistent grid
  for (let i = 0; i < 42; i++) {
    dates.push(new Date(current))
    current.setDate(current.getDate() + 1)
  }
  return { dates, month: firstDay.getMonth(), year: firstDay.getFullYear() }
}

export default function ContentCalendarPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("week")
  const [weekOffset, setWeekOffset] = useState(0)
  const [monthOffset, setMonthOffset] = useState(0)
  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset])
  const monthData = useMemo(() => getMonthDates(monthOffset), [monthOffset])

  const fromDate = viewMode === "week" ? formatDate(weekDates[0]) : formatDate(monthData.dates[0])
  const toDate = viewMode === "week" ? formatDate(weekDates[6]) + "T23:59:59" : formatDate(monthData.dates[41]) + "T23:59:59"

  const { data: content, isLoading, mutate } = useSWR<ContentCalendarItem[]>(
    `content_calendar_${fromDate}_${toDate}`,
    () => dashboardApi("get_content_calendar", { from_date: fromDate, to_date: toDate })
  )
  const { data: personas } = useSWR<ContentPersona[]>("get_content_personas", () => dashboardApi("get_content_personas"))
  const { data: accounts } = useSWR("get_outreach_accounts_cal", () => dashboardApi("get_outreach_accounts"))

  const [generating, setGenerating] = useState(false)
  const [selectedItem, setSelectedItem] = useState<ContentCalendarItem | null>(null)
  const [editForm, setEditForm] = useState({ title: "", caption: "", hashtags: "", content_type: "image", scheduled_for: "" })
  const [confirmDeleteContentId, setConfirmDeleteContentId] = useState<string | null>(null)

  const personaMap = useMemo(() => {
    const map: Record<string, ContentPersona> = {}
    personas?.forEach(p => { map[p.persona_id] = p })
    return map
  }, [personas])

  // Group content by date
  const contentByDate = useMemo(() => {
    const map: Record<string, ContentCalendarItem[]> = {}
    content?.forEach(item => {
      if (item.scheduled_for) {
        const date = item.scheduled_for.split("T")[0]
        if (!map[date]) map[date] = []
        map[date].push(item)
      }
    })
    return map
  }, [content])

  const handleGenerateWeek = useCallback(async () => {
    if (!personas?.length) return alert("Create at least one persona first")
    setGenerating(true)
    try {
      // For each persona, generate content
      for (const persona of personas) {
        const res = await fetch("/api/generate-content", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            persona,
            week_start: fromDate,
            existing_content: contentByDate,
          }),
        })
        const result = await res.json()
        if (result.content && Array.isArray(result.content)) {
          const items = result.content.map((c: Record<string, unknown>) => ({
            persona_id: persona.persona_id,
            title: c.title || "",
            caption: c.caption || "",
            hashtags: c.hashtags || persona.hashtag_groups,
            content_type: c.content_type || "image",
            ai_prompt: c.ai_prompt || "",
            post_status: "draft",
            media_status: "pending",
            scheduled_for: (() => {
              const d = new Date(weekDates[0])
              d.setDate(d.getDate() + (Number(c.day_offset) || 0))
              const time = String(c.scheduled_time || "10:00")
              d.setHours(parseInt(time.split(":")[0]) || 10, parseInt(time.split(":")[1]) || 0)
              return d.toISOString()
            })(),
          }))
          await dashboardApi("bulk_create_content", { items })
        }
      }
      mutate()
    } catch (e) {
      alert("Error generating content: " + (e instanceof Error ? e.message : String(e)))
    } finally {
      setGenerating(false)
    }
  }, [personas, fromDate, contentByDate, weekDates, mutate])

  const openEdit = (item: ContentCalendarItem) => {
    setEditForm({
      title: item.title,
      caption: item.caption,
      hashtags: item.hashtags,
      content_type: item.content_type,
      scheduled_for: item.scheduled_for?.slice(0, 16) || "",
    })
    setSelectedItem(item)
  }

  const handleSaveEdit = useCallback(async () => {
    if (!selectedItem) return
    await dashboardApi("update_content_item", {
      content_id: selectedItem.content_id,
      ...editForm,
    })
    setSelectedItem(null)
    mutate()
  }, [selectedItem, editForm, mutate])

  const handleDelete = useCallback(async (id: string) => {
    try {
      await dashboardApi("delete_content_item", { content_id: id })
      toast.success("Content deleted")
      mutate()
    } catch { toast.error("Failed to delete content") }
    finally { setConfirmDeleteContentId(null) }
  }, [mutate])

  const weekLabel = `${weekDates[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} — ${weekDates[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarDays className="h-6 w-6 text-cyan-400" />
            Content Calendar
            <PageInstructions title="Content Calendar" storageKey="instructions-content-calendar" steps={[
              "Your weekly content schedule across all accounts.",
              "Hit 'Generate Week' to auto-plan content for the week.",
              "Review each piece of content — edit captions, change times.",
              "Approve content before it can be published.",
              "Color-coded by account so you can see the full picture at a glance.",
            ]} />
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Plan and schedule content across all accounts.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* View Mode Toggle */}
          <div className="flex gap-0.5 p-0.5 rounded-md bg-secondary/50">
            <button
              onClick={() => setViewMode("week")}
              className={`px-3 py-1 text-xs rounded font-medium transition-colors ${viewMode === "week" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >Week</button>
            <button
              onClick={() => setViewMode("month")}
              className={`px-3 py-1 text-xs rounded font-medium transition-colors ${viewMode === "month" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >Month</button>
          </div>

          {viewMode === "week" ? (
            <>
              <Button variant="outline" size="icon" onClick={() => setWeekOffset(w => w - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium min-w-[180px] text-center">{weekLabel}</span>
              <Button variant="outline" size="icon" onClick={() => setWeekOffset(w => w + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="outline" onClick={() => setWeekOffset(0)} className="text-xs">Today</Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="icon" onClick={() => setMonthOffset(m => m - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium min-w-[140px] text-center">
                {new Date(monthData.year, monthData.month).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
              </span>
              <Button variant="outline" size="icon" onClick={() => setMonthOffset(m => m + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="outline" onClick={() => setMonthOffset(0)} className="text-xs">Today</Button>
            </>
          )}
          <Button onClick={handleGenerateWeek} disabled={generating} className="gap-2">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            Generate Week
          </Button>
        </div>
      </div>

      {/* Calendar Grid */}
      {viewMode === "month" && (
        <div>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {DAYS.map(d => <div key={d} className="text-xs font-medium text-muted-foreground text-center py-1">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {monthData.dates.map((date) => {
              const dateStr = formatDate(date)
              const items = contentByDate[dateStr] || []
              const isToday = dateStr === formatDate(new Date())
              const isCurrentMonth = date.getMonth() === monthData.month

              return (
                <div key={dateStr} className={`min-h-[80px] rounded border p-1 ${
                  isToday ? "border-primary/50 bg-primary/5" : "border-border/30"
                } ${!isCurrentMonth ? "opacity-40" : ""}`}>
                  <div className={`text-[10px] font-medium mb-0.5 ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                    {date.getDate()}
                  </div>
                  <div className="space-y-0.5">
                    {items.slice(0, 3).map(item => {
                      const statusColor = item.post_status === "posted" ? "bg-green-500" : item.post_status === "scheduled" ? "bg-blue-500" : "bg-gray-500"
                      return (
                        <div
                          key={item.content_id}
                          className="flex items-center gap-0.5 cursor-pointer hover:opacity-80"
                          onClick={() => openEdit(item)}
                        >
                          <div className={`w-1.5 h-1.5 rounded-full ${statusColor} shrink-0`} />
                          <span className="text-[9px] truncate">{item.title || "Untitled"}</span>
                        </div>
                      )
                    })}
                    {items.length > 3 && (
                      <div className="text-[9px] text-muted-foreground">+{items.length - 3} more</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {viewMode === "week" && <div className="grid grid-cols-7 gap-2">
        {weekDates.map((date, i) => {
          const dateStr = formatDate(date)
          const items = contentByDate[dateStr] || []
          const isToday = dateStr === formatDate(new Date())

          return (
            <div key={dateStr} className={`min-h-[200px] rounded-lg border p-2 ${isToday ? "border-primary/50 bg-primary/5" : "border-border/50"}`}>
              <div className="text-xs font-medium text-muted-foreground mb-2 flex justify-between">
                <span>{DAYS[i]}</span>
                <span className={isToday ? "text-primary font-bold" : ""}>{date.getDate()}</span>
              </div>

              <div className="space-y-1.5">
                {items.map(item => {
                  const TypeIcon = TYPE_ICONS[item.content_type] || Image
                  const persona = item.persona_id ? personaMap[item.persona_id] : null

                  return (
                    <div
                      key={item.content_id}
                      className="group rounded-md border bg-card p-1.5 cursor-pointer hover:border-primary/40 transition-colors text-xs"
                      onClick={() => openEdit(item)}
                    >
                      <div className="flex items-center gap-1 mb-0.5">
                        <TypeIcon className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="font-medium truncate">{item.title || "Untitled"}</span>
                      </div>
                      {item.scheduled_for && (
                        <div className="text-muted-foreground text-[10px]">
                          {new Date(item.scheduled_for).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                        </div>
                      )}
                      <div className="flex gap-1 mt-1">
                        <Badge className={`text-[9px] px-1 py-0 ${STATUS_COLORS[item.post_status] || STATUS_COLORS.draft}`}>
                          {item.post_status}
                        </Badge>
                        {persona && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0">{persona.name.split(" ")[0]}</Badge>
                        )}
                      </div>
                    </div>
                  )
                })}

                {items.length === 0 && (
                  <div className="text-[10px] text-muted-foreground/40 text-center py-4">No content</div>
                )}
              </div>
            </div>
          )
        })}
      </div>}

      {/* Stats Bar */}
      <div className="flex gap-4 text-sm text-muted-foreground">
        <span>Total: {content?.length || 0}</span>
        <span>Drafts: {content?.filter(c => c.post_status === "draft").length || 0}</span>
        <span>Scheduled: {content?.filter(c => c.post_status === "scheduled").length || 0}</span>
        <span>Posted: {content?.filter(c => c.post_status === "posted").length || 0}</span>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!selectedItem} onOpenChange={() => setSelectedItem(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Content</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Title</Label>
              <Input value={editForm.title} onChange={e => setEditForm({ ...editForm, title: e.target.value })} />
            </div>
            <div>
              <Label>Caption</Label>
              <textarea
                className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[100px]"
                value={editForm.caption}
                onChange={e => setEditForm({ ...editForm, caption: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Content Type</Label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={editForm.content_type}
                  onChange={e => setEditForm({ ...editForm, content_type: e.target.value })}
                >
                  <option value="image">Image</option>
                  <option value="reel">Reel</option>
                  <option value="carousel">Carousel</option>
                  <option value="story">Story</option>
                </select>
              </div>
              <div>
                <Label>Scheduled For</Label>
                <Input
                  type="datetime-local"
                  value={editForm.scheduled_for}
                  onChange={e => setEditForm({ ...editForm, scheduled_for: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Hashtags</Label>
              <Input value={editForm.hashtags} onChange={e => setEditForm({ ...editForm, hashtags: e.target.value })} />
            </div>
            {selectedItem?.ai_prompt && (
              <div>
                <Label className="text-muted-foreground">AI Prompt</Label>
                <p className="text-xs text-muted-foreground bg-secondary/50 rounded p-2">{selectedItem.ai_prompt}</p>
              </div>
            )}
            <div className="flex justify-between">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setConfirmDeleteContentId(selectedItem!.content_id)}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setSelectedItem(null)}>Cancel</Button>
                <Button onClick={handleSaveEdit}>Save</Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={!!confirmDeleteContentId} onOpenChange={(open) => { if (!open) setConfirmDeleteContentId(null) }} title="Delete Content" description="Delete this content item? This cannot be undone." onConfirm={() => confirmDeleteContentId && handleDelete(confirmDeleteContentId)} />
    </div>
  )
}
