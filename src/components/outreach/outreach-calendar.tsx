"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  ChevronLeft, ChevronRight, CalendarDays, X, Instagram, Facebook, Linkedin,
  Mail, MessageCircle, Send, Clock, CheckCircle, XCircle, AlertTriangle,
  Eye, Filter, LayoutGrid, Rows3,
} from "lucide-react"
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import { toast } from "sonner"

// ── Types ──
interface CalendarEvent {
  id: string; date: string; lead_name: string; business_type?: string;
  platform: string; action: string; status: string; message_preview?: string;
  sequence_name?: string; step_number?: number; type: string;
}

// ── Platform config ──
const PLATFORMS: Record<string, { icon: typeof Instagram; color: string; bg: string; label: string }> = {
  instagram: { icon: Instagram, color: "text-pink-400", bg: "bg-gradient-to-r from-pink-500 to-purple-500", label: "Instagram" },
  facebook: { icon: Facebook, color: "text-blue-500", bg: "bg-blue-600", label: "Facebook" },
  linkedin: { icon: Linkedin, color: "text-sky-400", bg: "bg-sky-500", label: "LinkedIn" },
  email: { icon: Mail, color: "text-green-400", bg: "bg-green-500", label: "Email" },
  sms: { icon: MessageCircle, color: "text-yellow-400", bg: "bg-yellow-500", label: "SMS" },
}

const STATUS_CONFIG: Record<string, { color: string; icon: typeof CheckCircle; label: string }> = {
  sent: { color: "text-green-400", icon: CheckCircle, label: "Sent" },
  failed: { color: "text-red-400", icon: XCircle, label: "Failed" },
  pending: { color: "text-gray-400", icon: Clock, label: "Scheduled" },
  scheduled: { color: "text-gray-400", icon: Clock, label: "Scheduled" },
  overdue: { color: "text-amber-400", icon: AlertTriangle, label: "Overdue" },
  skipped: { color: "text-yellow-400", icon: Eye, label: "Skipped" },
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}

function getFirstDayOfWeek(year: number, month: number) {
  return new Date(year, month - 1, 1).getDay()
}

// Builds a stable droppable id like "2026-04-21" from calendar year/month/day.
function dayKey(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

// True if the given calendar day (in the currently-viewed month/year) is in the past.
function isPastDay(year: number, month: number, day: number) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const cell = new Date(year, month - 1, day)
  cell.setHours(0, 0, 0, 0)
  return cell.getTime() < today.getTime()
}

// Preserves the event's original time-of-day when moving it to a different day.
function composeNewDate(original: string, year: number, month: number, day: number) {
  const src = new Date(original)
  const next = new Date(year, month - 1, day, src.getHours(), src.getMinutes(), src.getSeconds(), src.getMilliseconds())
  return next.toISOString()
}

function getTimeOfDay(dateStr: string) {
  const h = new Date(dateStr).getHours()
  if (h < 12) return "morning"
  if (h < 17) return "afternoon"
  return "evening"
}

const TIME_LABELS: Record<string, { label: string; icon: string }> = {
  morning: { label: "Morning", icon: "🌅" },
  afternoon: { label: "Afternoon", icon: "☀️" },
  evening: { label: "Evening", icon: "🌙" },
}

interface Campaign {
  campaign_id: string; campaign_name: string; status: string; created_at: string; total_messages: number; platforms: string[];
}

// ── Drag-to-reschedule internals ──

// Draggable wrapper around a scheduled event pill. Only reschedulable event
// types (currently `queued`) are actually draggable — others render inert.
function DraggableEventPill({
  event,
  draggable,
  children,
}: {
  event: CalendarEvent
  draggable: boolean
  children: React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: event.id,
    disabled: !draggable,
    data: { event },
  })

  return (
    <div
      ref={setNodeRef}
      {...(draggable ? listeners : {})}
      {...(draggable ? attributes : {})}
      className={cn(
        draggable && "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-40",
      )}
      // Stop day-cell click when starting a drag on an event
      onClick={e => { if (draggable) e.stopPropagation() }}
    >
      {children}
    </div>
  )
}

// Droppable wrapper around a day cell. Disabled (no drop target) for past days.
function DroppableDayCell({
  id,
  disabled,
  children,
}: {
  id: string
  disabled: boolean
  children: (args: { isOver: boolean; canDrop: boolean }) => React.ReactNode
}) {
  const { isOver, setNodeRef } = useDroppable({ id, disabled })
  return (
    <div ref={setNodeRef} className="relative">
      {children({ isOver, canDrop: !disabled })}
    </div>
  )
}

export default function OutreachCalendar() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [direction, setDirection] = useState(0)
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set(Object.keys(PLATFORMS)))
  const [viewMode, setViewMode] = useState<"month" | "week">("month")
  const [hoveredDay, setHoveredDay] = useState<number | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    try {
      const [eventsRes, campaignsRes] = await Promise.all([
        fetch(`/api/calendar/outreach?month=${month}&year=${year}`).then(r => r.json()),
        fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "get_campaigns" }) }).then(r => r.json()).catch(() => ({ data: [] })),
      ])
      setEvents(eventsRes.events || [])
      setCampaigns(campaignsRes.data || [])
    } catch { setEvents([]); setCampaigns([]) }
    setLoading(false)
  }, [month, year])

  useEffect(() => { fetchEvents() }, [fetchEvents])

  // ── Derived data ──
  const filteredEvents = useMemo(() => {
    let filtered = events.filter(e => activeFilters.has(e.platform))
    if (selectedCampaign) {
      filtered = filtered.filter(e => (e as CalendarEvent & { campaign_id?: string }).campaign_id === selectedCampaign)
    }
    return filtered
  }, [events, activeFilters, selectedCampaign])

  const eventsByDay = useMemo(() => {
    const map: Record<number, CalendarEvent[]> = {}
    filteredEvents.forEach(e => {
      const d = new Date(e.date).getDate()
      if (!map[d]) map[d] = []
      map[d].push(e)
    })
    return map
  }, [filteredEvents])

  const stats = useMemo(() => {
    const filtered = events.filter(e => activeFilters.has(e.platform))
    return {
      total: filtered.length,
      sent: filtered.filter(e => e.status === "sent").length,
      failed: filtered.filter(e => e.status === "failed").length,
      upcoming: filtered.filter(e => ["pending", "scheduled"].includes(e.status)).length,
    }
  }, [events, activeFilters])

  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = getFirstDayOfWeek(year, month)
  const isToday = (day: number) => day === now.getDate() && month === now.getMonth() + 1 && year === now.getFullYear()
  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear()

  function nav(dir: number) {
    setDirection(dir)
    setSelectedDay(null)
    let m = month + dir, y = year
    if (m > 12) { m = 1; y++ }
    if (m < 1) { m = 12; y-- }
    setMonth(m); setYear(y)
  }

  function goToday() {
    setDirection(0); setSelectedDay(null)
    setMonth(now.getMonth() + 1); setYear(now.getFullYear())
  }

  function toggleFilter(p: string) {
    setActiveFilters(prev => {
      const n = new Set(prev)
      n.has(p) ? n.delete(p) : n.add(p)
      return n
    })
  }

  // ── Day detail events grouped by time ──
  const dayEvents = selectedDay ? (eventsByDay[selectedDay] || []) : []
  const groupedByTime = useMemo(() => {
    const groups: Record<string, CalendarEvent[]> = { morning: [], afternoon: [], evening: [] }
    dayEvents.forEach(e => { groups[getTimeOfDay(e.date)].push(e) })
    return groups
  }, [dayEvents])

  // Calendar grid cells
  const cells: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const visibleCells = cells

  // Week view: 7-day strip anchored on the Monday of the current week.
  // We compute dates directly (not month-offset indices) so it can span
  // across month boundaries (e.g. week of Mar 30 – Apr 5).
  const weekDays = useMemo(() => {
    // Anchor on today if we're in the current month; otherwise anchor on
    // the first day of the displayed month.
    const anchor = isCurrentMonth
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate())
      : new Date(year, month - 1, 1)
    // JS day: 0=Sun..6=Sat. Week starts on Monday per spec.
    const offsetToMonday = (anchor.getDay() + 6) % 7
    const monday = new Date(anchor)
    monday.setDate(anchor.getDate() - offsetToMonday)
    monday.setHours(0, 0, 0, 0)
    const days: Date[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday)
      d.setDate(monday.getDate() + i)
      days.push(d)
    }
    return days
  }, [isCurrentMonth, year, month, now])

  // Events assigned to each (weekday, hour) bucket for the week view.
  // Uses all filteredEvents (not just the current month's) so cross-month
  // weeks render correctly.
  const weekEventsByCell = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {}
    if (viewMode !== "week") return map
    const weekStart = weekDays[0]
    const weekEnd = new Date(weekDays[6])
    weekEnd.setHours(23, 59, 59, 999)
    filteredEvents.forEach(e => {
      const d = new Date(e.date)
      if (d < weekStart || d > weekEnd) return
      const dayIdx = weekDays.findIndex(wd =>
        wd.getFullYear() === d.getFullYear() &&
        wd.getMonth() === d.getMonth() &&
        wd.getDate() === d.getDate()
      )
      if (dayIdx === -1) return
      const hour = d.getHours()
      const key = `${dayIdx}-${hour}`
      if (!map[key]) map[key] = []
      map[key].push(e)
    })
    return map
  }, [viewMode, filteredEvents, weekDays])

  const HOURS = useMemo(() => Array.from({ length: 24 }, (_, i) => i), [])

  // ── Drag-to-reschedule ──
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const activeDragEvent = useMemo(
    () => (activeDragId ? events.find(e => e.id === activeDragId) || null : null),
    [activeDragId, events],
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  const onDragStart = useCallback((e: DragStartEvent) => {
    setActiveDragId(String(e.active.id))
  }, [])

  const onDragCancel = useCallback(() => {
    setActiveDragId(null)
  }, [])

  const onDragEnd = useCallback(async (e: DragEndEvent) => {
    setActiveDragId(null)
    const { active, over } = e
    if (!over) return

    const eventId = String(active.id)
    const droppableId = String(over.id) // "YYYY-MM-DD"
    const [yStr, mStr, dStr] = droppableId.split("-")
    const dropYear = parseInt(yStr)
    const dropMonth = parseInt(mStr)
    const dropDay = parseInt(dStr)
    if (!dropYear || !dropMonth || !dropDay) return

    const current = events.find(ev => ev.id === eventId)
    if (!current) return

    // Only queued (send_queue) events are reschedulable
    if (current.type !== "queued") {
      toast.error("Only scheduled queued sends can be rescheduled")
      return
    }

    // No-op if dropped on same day
    const currentDate = new Date(current.date)
    if (
      currentDate.getFullYear() === dropYear &&
      currentDate.getMonth() + 1 === dropMonth &&
      currentDate.getDate() === dropDay
    ) {
      return
    }

    // Block past days
    if (isPastDay(dropYear, dropMonth, dropDay)) {
      toast.error("Cannot reschedule to past")
      return
    }

    const newIso = composeNewDate(current.date, dropYear, dropMonth, dropDay)

    // Optimistic update
    const previous = events
    setEvents(prev => prev.map(ev => (ev.id === eventId ? { ...ev, date: newIso } : ev)))

    try {
      const res = await fetch("/api/calendar/outreach/reschedule", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: eventId, new_date: newIso, event_type: current.type }),
      })
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throw new Error(payload.error || `HTTP ${res.status}`)
      }
      toast.success(`Rescheduled to ${MONTHS[dropMonth - 1]} ${dropDay}`)
    } catch (err) {
      setEvents(previous)
      const msg = err instanceof Error ? err.message : "Reschedule failed"
      toast.error(msg)
    }
  }, [events])

  return (
    <div className="space-y-4">
      {/* ── Stats Bar ── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl bg-card/60 backdrop-blur-xl border border-border/50"
      >
        <CalendarDays className="h-5 w-5 text-violet-400" />
        <span className="text-sm font-medium">
          <span className="text-foreground">{stats.total}</span> <span className="text-muted-foreground">this month</span>
        </span>
        <span className="text-muted-foreground">·</span>
        <span className="text-sm"><span className="text-green-400 font-medium">{stats.sent}</span> sent</span>
        <span className="text-muted-foreground">·</span>
        <span className="text-sm"><span className="text-red-400 font-medium">{stats.failed}</span> failed</span>
        <span className="text-muted-foreground">·</span>
        <span className="text-sm"><span className="text-gray-300 font-medium">{stats.upcoming}</span> upcoming</span>

        <div className="flex-1" />

        {/* View toggle */}
        <div className="flex items-center rounded-lg bg-secondary/50 p-0.5 gap-0.5">
          <button onClick={() => setViewMode("month")} className={cn("p-1.5 rounded-md transition-colors", viewMode === "month" ? "bg-violet-500/20 text-violet-400" : "text-muted-foreground hover:text-foreground")}>
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => setViewMode("week")} className={cn("p-1.5 rounded-md transition-colors", viewMode === "week" ? "bg-violet-500/20 text-violet-400" : "text-muted-foreground hover:text-foreground")}>
            <Rows3 className="h-3.5 w-3.5" />
          </button>
        </div>
      </motion.div>

      {/* ── Filters + Legend ── */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        {Object.entries(PLATFORMS).map(([key, p]) => {
          const Icon = p.icon
          const active = activeFilters.has(key)
          return (
            <button key={key} onClick={() => toggleFilter(key)}
              className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all border",
                active ? "border-border bg-muted/30 text-foreground" : "border-transparent bg-transparent text-muted-foreground/50 line-through"
              )}>
              <Icon className={cn("h-3 w-3", active ? p.color : "text-muted-foreground/30")} />
              {p.label}
            </button>
          )
        })}
        <div className="flex-1" />
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setSelectedDay(null)}>
          <Send className="h-3 w-3" /> Schedule Outreach
        </Button>
      </div>

      {/* ── Month Navigation ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => nav(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <AnimatePresence mode="wait">
            <motion.h2
              key={`${year}-${month}`}
              initial={{ opacity: 0, x: direction * 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction * -30 }}
              transition={{ duration: 0.2 }}
              className="text-lg font-bold min-w-[180px] text-center"
            >
              {MONTHS[month - 1]} {year}
            </motion.h2>
          </AnimatePresence>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => nav(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          {!isCurrentMonth && (
            <Button variant="outline" size="sm" className="h-7 text-xs ml-2" onClick={goToday}>Today</Button>
          )}
        </div>
      </div>

      {/* ── Calendar Grid ── */}
      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragCancel={onDragCancel}
        onDragEnd={onDragEnd}
      >
        <div className="rounded-xl border border-border/50 bg-card/40 backdrop-blur-xl overflow-hidden">
          {viewMode === "month" ? (
          <>
          {/* Weekday headers */}
          <div className="grid grid-cols-7 border-b border-border/50">
            {WEEKDAYS.map(d => (
              <div key={d} className="py-2 text-center text-xs font-medium text-muted-foreground">{d}</div>
            ))}
          </div>

          {/* Days */}
          <AnimatePresence mode="wait">
            <motion.div
              key={`${year}-${month}-${viewMode}`}
              initial={{ opacity: 0, x: direction * 60 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction * -60 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className={cn("grid grid-cols-7")}
            >
              {visibleCells.map((day, i) => {
                if (day === null) return <div key={`e-${i}`} className="min-h-[90px] border-b border-r border-border/30" />

                const dayEvts = eventsByDay[day] || []
                const density = Math.min(dayEvts.length / 8, 1)
                const platforms = [...new Set(dayEvts.map(e => e.platform))]
                const today = isToday(day)
                const hovered = hoveredDay === day
                const past = isPastDay(year, month, day)

                return (
                  <DroppableDayCell
                    key={day}
                    id={dayKey(year, month, day)}
                    disabled={past}
                  >
                    {({ isOver, canDrop }) => (
                      <motion.button
                        onClick={() => setSelectedDay(day)}
                        onMouseEnter={() => setHoveredDay(day)}
                        onMouseLeave={() => setHoveredDay(null)}
                        whileHover={{ scale: 1.02, zIndex: 10 }}
                        whileTap={{ scale: 0.98 }}
                        className={cn(
                          "relative min-h-[90px] w-full p-1.5 text-left border-b border-r border-border/30 transition-all duration-200 group hover:bg-violet-500/[0.08]",
                          today && "ring-1 ring-violet-500/60 ring-inset",
                          dayEvts.length > 0 && "cursor-pointer hover:bg-violet-500/[0.12]",
                          isOver && canDrop && "bg-violet-500/20 ring-2 ring-violet-400 ring-inset",
                          isOver && !canDrop && "bg-red-500/10 ring-2 ring-red-400/60 ring-inset cursor-not-allowed",
                          activeDragId && !canDrop && "opacity-60",
                        )}
                        style={dayEvts.length > 0 && !isOver ? { background: `rgba(139,92,246,${density * 0.08})` } : undefined}
                      >
                        {/* Day number */}
                        <span className={cn(
                          "inline-flex items-center justify-center h-6 w-6 rounded-full text-xs font-medium transition-colors",
                          today ? "bg-violet-500 text-primary-foreground shadow-lg shadow-violet-500/30" : "text-muted-foreground group-hover:text-violet-300"
                        )}>
                          {day}
                        </span>

                        {/* Platform dots */}
                        {platforms.length > 0 && (
                          <div className="flex flex-wrap gap-0.5 mt-1">
                            {platforms.slice(0, 5).map(p => {
                              const cfg = PLATFORMS[p]
                              return cfg ? (
                                <div key={p} className={cn("h-1.5 w-1.5 rounded-full", cfg.bg)} />
                              ) : null
                            })}
                          </div>
                        )}

                        {/* Event pills (max 3) */}
                        <div className="mt-1 space-y-0.5">
                          {dayEvts.slice(0, 3).map(e => {
                            const cfg = PLATFORMS[e.platform]
                            const reschedulable = e.type === "queued"
                            return (
                              <DraggableEventPill key={e.id} event={e} draggable={reschedulable}>
                                <div className="flex items-center gap-1 px-1 py-0.5 rounded bg-muted/50 group-hover:bg-muted/60 truncate transition-colors">
                                  {cfg && <cfg.icon className={cn("h-2.5 w-2.5 shrink-0", cfg.color)} />}
                                  <span className="text-[9px] text-muted-foreground group-hover:text-foreground/80 truncate transition-colors">{e.lead_name}</span>
                                </div>
                              </DraggableEventPill>
                            )
                          })}
                          {dayEvts.length > 3 && (
                            <span className="text-[9px] text-muted-foreground/60 pl-1">+{dayEvts.length - 3} more</span>
                          )}
                        </div>

                        {/* Today glow */}
                        {today && (
                          <div className="absolute inset-0 rounded-sm ring-2 ring-violet-500/20 pointer-events-none animate-pulse" />
                        )}

                        {/* Hover tooltip */}
                        {hovered && dayEvts.length > 0 && !selectedDay && !activeDragId && (
                          <motion.div
                            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                            className="absolute z-30 top-full mt-1 left-1/2 -translate-x-1/2 px-3 py-2 rounded-lg bg-popover border border-border shadow-xl text-xs whitespace-nowrap pointer-events-none"
                          >
                            <p className="font-medium text-foreground mb-0.5">{dayEvts.length} outreach item{dayEvts.length !== 1 ? "s" : ""}</p>
                            {Object.entries(PLATFORMS).map(([k, p]) => {
                              const count = dayEvts.filter(e => e.platform === k).length
                              return count > 0 ? (
                                <span key={k} className="flex items-center gap-1 text-muted-foreground">
                                  <p.icon className={cn("h-3 w-3", p.color)} /> {count} {p.label}
                                </span>
                              ) : null
                            })}
                          </motion.div>
                        )}
                      </motion.button>
                    )}
                  </DroppableDayCell>
                )
              })}
            </motion.div>
          </AnimatePresence>
          </>
          ) : (
            /* ── Week Agenda (7 cols × 24 hour rows) ── */
            <div className="flex flex-col">
              {/* Day header row */}
              <div className="grid grid-cols-[60px_repeat(7,minmax(0,1fr))] border-b border-border/50">
                <div className="py-2 text-center text-[10px] font-medium text-muted-foreground/60">GMT</div>
                {weekDays.map((d, i) => {
                  const isTodayCell = d.getFullYear() === now.getFullYear()
                    && d.getMonth() === now.getMonth()
                    && d.getDate() === now.getDate()
                  return (
                    <div key={i} className={cn(
                      "py-2 text-center text-xs font-medium",
                      isTodayCell ? "text-violet-400" : "text-muted-foreground"
                    )}>
                      <div>{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][i]}</div>
                      <div className={cn(
                        "text-[10px] mt-0.5",
                        isTodayCell ? "text-violet-400" : "text-muted-foreground/60"
                      )}>
                        {MONTHS[d.getMonth()].slice(0,3)} {d.getDate()}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Hour rows */}
              <div className="max-h-[60vh] overflow-y-auto">
                {HOURS.map(hour => {
                  const hourLabel = hour === 0
                    ? "12 AM"
                    : hour < 12
                      ? `${hour} AM`
                      : hour === 12
                        ? "12 PM"
                        : `${hour - 12} PM`
                  return (
                    <div key={hour} className="grid grid-cols-[60px_repeat(7,minmax(0,1fr))] border-b border-border/20 min-h-[48px]">
                      <div className="py-1 px-1 text-right text-[10px] text-muted-foreground/60 border-r border-border/20">
                        {hourLabel}
                      </div>
                      {weekDays.map((d, dayIdx) => {
                        const cellKey = `${dayIdx}-${hour}`
                        const cellEvents = weekEventsByCell[cellKey] || []
                        const past = (() => {
                          const cellDate = new Date(d)
                          cellDate.setHours(hour, 0, 0, 0)
                          return cellDate.getTime() < Date.now() - 60 * 60 * 1000 // allow in-progress hour
                        })()
                        const droppableId = dayKey(d.getFullYear(), d.getMonth() + 1, d.getDate())
                        return (
                          <DroppableDayCell
                            key={dayIdx}
                            id={droppableId}
                            disabled={past}
                          >
                            {({ isOver, canDrop }) => (
                              <div className={cn(
                                "relative border-r border-border/20 p-0.5 transition-colors",
                                isOver && canDrop && "bg-violet-500/20 ring-2 ring-violet-400 ring-inset",
                                isOver && !canDrop && "bg-red-500/10",
                                past && !isOver && "bg-muted/[0.03]",
                              )}>
                                {cellEvents.map(e => {
                                  const cfg = PLATFORMS[e.platform]
                                  const reschedulable = e.type === "queued"
                                  const statusCfg = STATUS_CONFIG[e.status] || STATUS_CONFIG.pending
                                  return (
                                    <DraggableEventPill key={e.id} event={e} draggable={reschedulable}>
                                      <div
                                        onClick={(evt) => { evt.stopPropagation(); setSelectedDay(d.getDate()); setMonth(d.getMonth() + 1); setYear(d.getFullYear()) }}
                                        className={cn(
                                          "flex items-center gap-1 px-1.5 py-1 rounded bg-muted/50 hover:bg-muted/70 mb-0.5 cursor-pointer transition-colors",
                                          e.status === "sent" && "bg-green-500/10 border border-green-500/20",
                                          e.status === "failed" && "bg-red-500/10 border border-red-500/20",
                                        )}
                                        title={`${e.lead_name} · ${e.action} · ${new Date(e.date).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`}
                                      >
                                        {cfg && <cfg.icon className={cn("h-2.5 w-2.5 shrink-0", cfg.color)} />}
                                        <span className={cn("text-[10px] truncate", statusCfg.color)}>
                                          {e.lead_name}
                                        </span>
                                      </div>
                                    </DraggableEventPill>
                                  )
                                })}
                              </div>
                            )}
                          </DroppableDayCell>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Drag overlay — follows cursor with a preview of the dragged pill */}
        <DragOverlay dropAnimation={null}>
          {activeDragEvent ? (
            (() => {
              const cfg = PLATFORMS[activeDragEvent.platform]
              return (
                <div className="flex items-center gap-1 px-2 py-1 rounded bg-violet-500/20 border border-violet-400/60 shadow-lg backdrop-blur-sm text-xs">
                  {cfg && <cfg.icon className={cn("h-3 w-3 shrink-0", cfg.color)} />}
                  <span className="text-foreground truncate max-w-[160px]">{activeDragEvent.lead_name}</span>
                </div>
              )
            })()
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* ── Empty state ── */}
      {!loading && events.length === 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16">
          <CalendarDays className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-muted-foreground">No outreach scheduled this month.</p>
          <p className="text-sm text-muted-foreground/60 mt-1">Set up a campaign to get started.</p>
        </motion.div>
      )}

      {/* ── Day Detail Overlay ── */}
      <AnimatePresence>
        {selectedDay !== null && (
          <>
            {/* Backdrop */}
            <motion.div
              ref={overlayRef}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setSelectedDay(null)}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            />

            {/* Detail panel */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className="fixed inset-x-4 top-[10%] bottom-[10%] sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-[520px] sm:max-h-[80vh] z-50 rounded-2xl border border-border bg-card/95 backdrop-blur-2xl shadow-2xl shadow-black/40 overflow-hidden flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
                <div>
                  <h3 className="text-lg font-bold">
                    {MONTHS[month - 1]} {selectedDay}, {year}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {dayEvents.length} outreach item{dayEvents.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => setSelectedDay(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Timeline */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                {dayEvents.length === 0 ? (
                  <div className="text-center py-12">
                    <CalendarDays className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
                    <p className="text-muted-foreground text-sm">Nothing scheduled for this day.</p>
                  </div>
                ) : (
                  (["morning", "afternoon", "evening"] as const).map(period => {
                    const items = groupedByTime[period]
                    if (items.length === 0) return null
                    return (
                      <motion.div
                        key={period}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: period === "morning" ? 0 : period === "afternoon" ? 0.05 : 0.1 }}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm">{TIME_LABELS[period].icon}</span>
                          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{TIME_LABELS[period].label}</span>
                          <div className="flex-1 h-px bg-muted/30" />
                        </div>
                        <div className="space-y-2 ml-1 pl-3 border-l border-white/[0.06]">
                          {items.map((e, idx) => {
                            const platCfg = PLATFORMS[e.platform] || PLATFORMS.instagram
                            const statusCfg = STATUS_CONFIG[e.status] || STATUS_CONFIG.pending
                            const StatusIcon = statusCfg.icon
                            const PlatIcon = platCfg.icon

                            return (
                              <motion.div
                                key={e.id}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: idx * 0.03 }}
                                className="relative p-3 rounded-xl bg-muted/30 border border-border/40 hover:bg-muted/50 transition-colors group"
                              >
                                {/* Dot on timeline */}
                                <div className={cn("absolute -left-[19px] top-4 h-2.5 w-2.5 rounded-full border-2 border-card", platCfg.bg)} />

                                <div className="flex items-start gap-3">
                                  <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0", platCfg.bg + "/20")}>
                                    <PlatIcon className={cn("h-4 w-4", platCfg.color)} />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-medium truncate">{e.lead_name}</span>
                                      {e.business_type && (
                                        <span className="text-[10px] text-muted-foreground/60 truncate">{e.business_type}</span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-border">
                                        {e.action.toUpperCase()}
                                      </Badge>
                                      {e.sequence_name && (
                                        <span className="text-[10px] text-muted-foreground">
                                          {e.sequence_name} · Step {e.step_number}
                                        </span>
                                      )}
                                    </div>
                                    {e.message_preview && (
                                      <p className="text-xs text-muted-foreground/70 mt-1 line-clamp-2">{e.message_preview}</p>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <StatusIcon className={cn("h-3.5 w-3.5", statusCfg.color)} />
                                    <span className={cn("text-[10px] font-medium", statusCfg.color)}>{statusCfg.label}</span>
                                  </div>
                                </div>

                                <div className="text-[10px] text-muted-foreground/40 mt-1.5 ml-11">
                                  {new Date(e.date).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                                </div>
                              </motion.div>
                            )
                          })}
                        </div>
                      </motion.div>
                    )
                  })
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Loading overlay */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-violet-500 border-t-transparent" />
        </div>
      )}

      {/* Campaign List — Bottom Section */}
      <div className="mt-6 rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 shadow-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border/30 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">All Campaigns</h3>
          {selectedCampaign && (
            <Button size="sm" variant="ghost" className="text-xs h-6 rounded-lg gap-1" onClick={() => setSelectedCampaign(null)}>
              <X className="h-3 w-3" /> Show All
            </Button>
          )}
        </div>
        <div className="divide-y divide-border/20">
          {campaigns.length > 0 ? campaigns.map(c => {
            const isActive = selectedCampaign === c.campaign_id
            const statusColor = c.status === "active" ? "bg-emerald-500" : c.status === "completed" ? "bg-blue-500" : c.status === "scheduled" ? "bg-amber-500" : "bg-muted-foreground"
            return (
              <button
                key={c.campaign_id}
                onClick={() => setSelectedCampaign(isActive ? null : c.campaign_id)}
                className={cn("w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all hover:bg-muted/20", isActive && "bg-violet-500/10 border-l-2 border-violet-500")}
              >
                <div className={cn("h-2 w-2 rounded-full shrink-0", statusColor)} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate text-foreground">{c.campaign_name || c.campaign_id}</p>
                  <p className="text-[10px] text-muted-foreground">{c.total_messages || 0} messages · {c.platforms?.join(", ") || "—"}</p>
                </div>
                <Badge variant="outline" className="text-[10px] capitalize shrink-0">{c.status || "unknown"}</Badge>
              </button>
            )
          }) : (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              No campaigns yet. Create one in the Campaign tab.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
