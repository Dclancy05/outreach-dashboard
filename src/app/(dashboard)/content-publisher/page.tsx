"use client"

import { useState, useCallback, useMemo } from "react"
import useSWR from "swr"
import { dashboardApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import {
  Upload,
  Send,
  Check,
  Clock,
  AlertCircle,
  Image,
  Film,
  LayoutGrid,
  MessageCircle,
  Loader2,
  History,
  ToggleLeft,
  ToggleRight,
  UserPlus,
  Users,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { PageInstructions } from "@/components/page-instructions"
import type { ContentCalendarItem, ContentPersona } from "@/types"

const TYPE_ICONS: Record<string, typeof Image> = {
  image: Image,
  reel: Film,
  carousel: LayoutGrid,
  story: MessageCircle,
}

const POST_STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-blue-500/20 text-blue-400",
  posted: "bg-green-500/20 text-green-400",
  failed: "bg-red-500/20 text-red-400",
}

export default function ContentPublisherPage() {
  const { data: scheduled, isLoading: loadingScheduled, mutate: mutateScheduled } = useSWR<ContentCalendarItem[]>(
    "publisher_scheduled",
    () => dashboardApi("get_content_calendar", { post_status: "scheduled" })
  )
  const { data: posted, isLoading: loadingPosted } = useSWR<ContentCalendarItem[]>(
    "publisher_posted",
    () => dashboardApi("get_content_calendar", { post_status: "posted" })
  )
  const { data: personas } = useSWR<ContentPersona[]>("get_content_personas_pub", () => dashboardApi("get_content_personas"))
  const { data: accounts } = useSWR("get_outreach_accounts_pub", () => dashboardApi("get_outreach_accounts"))
  const { data: stats } = useSWR("content_stats", () => dashboardApi("get_content_stats"))

  const [publishingIds, setPublishingIds] = useState<Set<string>>(new Set())
  const [autoPost, setAutoPost] = useState(false)
  const [tab, setTab] = useState<"ready" | "history" | "calendar">("ready")
  const [assigningItem, setAssigningItem] = useState<ContentCalendarItem | null>(null)
  const [selectedAccountId, setSelectedAccountId] = useState("")
  const [selectedVaId, setSelectedVaId] = useState("")
  const [calendarWeekOffset, setCalendarWeekOffset] = useState(0)

  const personaMap: Record<string, ContentPersona> = {}
  personas?.forEach(p => { personaMap[p.persona_id] = p })

  const accountMap: Record<string, { username: string; ig_access_token?: string; ig_user_id?: string }> = {}
  if (Array.isArray(accounts)) {
    accounts.forEach((a: Record<string, string>) => { accountMap[a.account_id] = a as never })
  }

  const handlePublish = useCallback(async (item: ContentCalendarItem) => {
    const account = item.account_id ? accountMap[item.account_id] : null
    if (!account) {
      alert("No account assigned to this content. Assign an account first.")
      return
    }

    setPublishingIds(prev => new Set([...prev, item.content_id]))
    try {
      const res = await fetch("/api/publish-instagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content_id: item.content_id,
          ig_user_id: (account as Record<string, string>).ig_user_id || "",
          ig_access_token: (account as Record<string, string>).ig_access_token || "",
          caption: `${item.caption}\n\n${item.hashtags}`,
          media_url: item.media_url,
          content_type: item.content_type,
        }),
      })
      const result = await res.json()

      if (result.setup_needed) {
        alert("Instagram API not configured for this account. Complete the VA Setup Guide first.")
      } else if (result.success) {
        await dashboardApi("update_content_item", {
          content_id: item.content_id,
          post_status: "posted",
          posted_at: new Date().toISOString(),
        })
        mutateScheduled()
      } else {
        await dashboardApi("update_content_item", {
          content_id: item.content_id,
          post_status: "failed",
        })
        alert(`Publishing failed: ${result.error}`)
        mutateScheduled()
      }
    } catch (e) {
      alert("Error: " + (e instanceof Error ? e.message : String(e)))
    } finally {
      setPublishingIds(prev => {
        const next = new Set(prev)
        next.delete(item.content_id)
        return next
      })
    }
  }, [accountMap, mutateScheduled])

  const handleAssignAccount = useCallback(async () => {
    if (!assigningItem || !selectedAccountId) return
    await dashboardApi("update_content_item", {
      content_id: assigningItem.content_id,
      account_id: selectedAccountId,
    })
    // Also create VA queue entry if VA is selected
    if (selectedVaId) {
      await dashboardApi("create_va_task", {
        content_id: assigningItem.content_id,
        account_id: selectedAccountId,
        va_id: selectedVaId,
        task_type: "post_content",
        status: "pending",
      }).catch(() => {}) // Ignore if va_tasks table doesn't exist yet
    }
    setAssigningItem(null)
    setSelectedAccountId("")
    setSelectedVaId("")
    mutateScheduled()
  }, [assigningItem, selectedAccountId, selectedVaId, mutateScheduled])

  const handleSendToVaQueue = useCallback(async (item: ContentCalendarItem) => {
    if (!item.account_id) {
      setAssigningItem(item)
      return
    }
    await dashboardApi("create_va_task", {
      content_id: item.content_id,
      account_id: item.account_id,
      task_type: "post_content",
      status: "pending",
    }).catch(() => alert("VA task table not configured. Run migration first."))
    mutateScheduled()
  }, [mutateScheduled])

  // Calendar data for publisher calendar view
  const calendarWeekDates = useMemo(() => {
    const now = new Date()
    const dayOfWeek = now.getDay()
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    const monday = new Date(now)
    monday.setDate(now.getDate() + mondayOffset + calendarWeekOffset * 7)
    monday.setHours(0, 0, 0, 0)
    const dates: Date[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday)
      d.setDate(monday.getDate() + i)
      dates.push(d)
    }
    return dates
  }, [calendarWeekOffset])

  const scheduledByDate = useMemo(() => {
    const map: Record<string, ContentCalendarItem[]> = {}
    scheduled?.forEach(item => {
      if (item.scheduled_for) {
        const date = item.scheduled_for.split("T")[0]
        if (!map[date]) map[date] = []
        map[date].push(item)
      }
    })
    return map
  }, [scheduled])

  const displayItems = tab === "ready" ? scheduled : posted

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Upload className="h-6 w-6 text-green-400" />
            Content Publisher
            <PageInstructions title="Content Publisher" storageKey="instructions-content-publisher" steps={[
              "Publish approved content to Instagram.",
              "Review content ready for publishing — check captions and media.",
              "Can auto-post on schedule when Meta API is connected.",
              "Requires Meta Developer App setup for automated posting.",
              "Manual posting: download the media and post directly from Instagram.",
            ]} />
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Publish approved content to Instagram.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setAutoPost(!autoPost)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {autoPost ? (
              <ToggleRight className="h-6 w-6 text-green-400" />
            ) : (
              <ToggleLeft className="h-6 w-6" />
            )}
            Auto-Post {autoPost ? "ON" : "OFF"}
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-400">{stats?.scheduled || 0}</div>
            <div className="text-xs text-muted-foreground">Scheduled</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-400">{stats?.posted || 0}</div>
            <div className="text-xs text-muted-foreground">Posted</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-yellow-400">{stats?.pending_media || 0}</div>
            <div className="text-xs text-muted-foreground">Pending Media</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{stats?.total || 0}</div>
            <div className="text-xs text-muted-foreground">Total Content</div>
          </CardContent>
        </Card>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-2 border-b pb-2">
        <button
          className={`px-4 py-1.5 text-sm font-medium rounded-t transition-colors ${tab === "ready" ? "text-primary border-b-2 border-primary" : "text-muted-foreground"}`}
          onClick={() => setTab("ready")}
        >
          <Clock className="h-3.5 w-3.5 inline mr-1" /> Ready to Post ({scheduled?.length || 0})
        </button>
        <button
          className={`px-4 py-1.5 text-sm font-medium rounded-t transition-colors ${tab === "calendar" ? "text-primary border-b-2 border-primary" : "text-muted-foreground"}`}
          onClick={() => setTab("calendar")}
        >
          <CalendarDays className="h-3.5 w-3.5 inline mr-1" /> Schedule View
        </button>
        <button
          className={`px-4 py-1.5 text-sm font-medium rounded-t transition-colors ${tab === "history" ? "text-primary border-b-2 border-primary" : "text-muted-foreground"}`}
          onClick={() => setTab("history")}
        >
          <History className="h-3.5 w-3.5 inline mr-1" /> Post History ({posted?.length || 0})
        </button>
      </div>

      {/* Calendar View */}
      {tab === "calendar" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setCalendarWeekOffset(w => w - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium min-w-[200px] text-center">
              {calendarWeekDates[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} — {calendarWeekDates[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </span>
            <Button variant="outline" size="icon" onClick={() => setCalendarWeekOffset(w => w + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCalendarWeekOffset(0)} className="text-xs">Today</Button>
          </div>
          <div className="grid grid-cols-7 gap-2">
            {calendarWeekDates.map((date, i) => {
              const dateStr = date.toISOString().split("T")[0]
              const items = scheduledByDate[dateStr] || []
              const isToday = dateStr === new Date().toISOString().split("T")[0]
              return (
                <div key={dateStr} className={`min-h-[160px] rounded-lg border p-2 ${isToday ? "border-primary/50 bg-primary/5" : "border-border/50"}`}>
                  <div className="text-xs font-medium text-muted-foreground mb-2 flex justify-between">
                    <span>{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][i]}</span>
                    <span className={isToday ? "text-primary font-bold" : ""}>{date.getDate()}</span>
                  </div>
                  <div className="space-y-1">
                    {items.map(item => {
                      const account = item.account_id ? accountMap[item.account_id] : null
                      return (
                        <div key={item.content_id} className="rounded bg-card border p-1.5 text-xs">
                          <div className="font-medium truncate">{item.title || "Untitled"}</div>
                          {item.scheduled_for && (
                            <div className="text-muted-foreground text-[10px]">
                              {new Date(item.scheduled_for).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                            </div>
                          )}
                          <div className="flex items-center gap-1 mt-1">
                            {account ? (
                              <Badge variant="outline" className="text-[9px] px-1 py-0">@{(account as Record<string, string>).username}</Badge>
                            ) : (
                              <button
                                className="text-[9px] text-yellow-400 hover:underline flex items-center gap-0.5"
                                onClick={() => setAssigningItem(item)}
                              >
                                <UserPlus className="h-2.5 w-2.5" /> Assign
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                    {items.length === 0 && <div className="text-[10px] text-muted-foreground/40 text-center py-6">—</div>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Content List */}
      {(tab === "ready" || tab === "history") && (loadingScheduled || loadingPosted) ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <Card key={i} className="animate-pulse"><CardContent className="p-4 h-20" /></Card>
          ))}
        </div>
      ) : !displayItems?.length ? (
        <Card className="border-dashed">
          <CardContent className="p-12 text-center">
            {tab === "ready" ? (
              <>
                <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No content ready to post</h3>
                <p className="text-muted-foreground">Approve content in the Creator page first.</p>
              </>
            ) : (
              <>
                <History className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No posts yet</h3>
                <p className="text-muted-foreground">Published posts will appear here.</p>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {displayItems.map(item => {
            const TypeIcon = TYPE_ICONS[item.content_type] || Image
            const persona = item.persona_id ? personaMap[item.persona_id] : null
            const isPublishing = publishingIds.has(item.content_id)
            const account = item.account_id ? accountMap[item.account_id] : null

            return (
              <Card key={item.content_id} className="hover:border-primary/20 transition-colors">
                <CardContent className="p-4 flex items-center gap-4">
                  {/* Thumbnail */}
                  <div className="w-16 h-16 rounded-lg bg-secondary/30 flex items-center justify-center shrink-0 overflow-hidden">
                    {item.media_url ? (
                      <img src={item.media_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <TypeIcon className="h-6 w-6 text-muted-foreground/40" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-sm truncate">{item.title || "Untitled"}</h3>
                      <Badge className={`text-[10px] ${POST_STATUS_COLORS[item.post_status] || ""}`}>
                        {item.post_status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{item.caption}</p>
                    <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                      {persona && <span>{persona.name}</span>}
                      {account && <span>@{(account as Record<string, string>).username}</span>}
                      {item.scheduled_for && (
                        <span>{new Date(item.scheduled_for).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                      )}
                      {item.posted_at && (
                        <span className="text-green-400">
                          Posted {new Date(item.posted_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  {tab === "ready" && (
                    <div className="flex gap-1.5 shrink-0">
                      {!item.account_id && (
                        <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => setAssigningItem(item)}>
                          <UserPlus className="h-3.5 w-3.5" /> Assign
                        </Button>
                      )}
                      <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => handleSendToVaQueue(item)}>
                        <Users className="h-3.5 w-3.5" /> VA Queue
                      </Button>
                      <Button
                        onClick={() => handlePublish(item)}
                        disabled={isPublishing || !item.media_url}
                        className="gap-1 shrink-0"
                        size="sm"
                      >
                        {isPublishing ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Send className="h-3.5 w-3.5" />
                        )}
                        Post
                      </Button>
                    </div>
                  )}
                  {tab === "history" && item.post_status === "posted" && (
                    <Check className="h-5 w-5 text-green-400 shrink-0" />
                  )}
                  {tab === "history" && item.post_status === "failed" && (
                    <AlertCircle className="h-5 w-5 text-red-400 shrink-0" />
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Account Assignment Dialog */}
      <Dialog open={!!assigningItem} onOpenChange={() => setAssigningItem(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Assign to Account</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Select which account should post: <strong>{assigningItem?.title || "this content"}</strong>
            </p>
            <div>
              <Label className="text-sm font-medium">Account</Label>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm mt-1"
                value={selectedAccountId}
                onChange={e => setSelectedAccountId(e.target.value)}
              >
                <option value="">Select account...</option>
                {Array.isArray(accounts) && accounts.map((a: Record<string, string>) => (
                  <option key={a.account_id} value={a.account_id}>@{a.username}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-sm font-medium">Assign to VA (optional)</Label>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm mt-1"
                value={selectedVaId}
                onChange={e => setSelectedVaId(e.target.value)}
              >
                <option value="">No VA — auto/manual post</option>
                <option value="va_default">Default VA</option>
              </select>
              <p className="text-xs text-muted-foreground mt-1">VA will see this in their posting queue</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAssigningItem(null)}>Cancel</Button>
              <Button onClick={handleAssignAccount} disabled={!selectedAccountId}>Assign</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
