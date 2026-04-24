"use client"

import { useState, useCallback } from "react"
import useSWR from "swr"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { PageInstructions } from "@/components/page-instructions"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Calendar,
  Search,
  ExternalLink,
  MapPin,
  Sparkles,
  Loader2,
} from "lucide-react"

interface EventItem {
  id: string
  name: string
  url: string
  location: string
  date: string | null
  source: string
  description: string
  elevator_pitch: string
  status: string
}

async function fetchEvents(): Promise<EventItem[]> {
  const res = await fetch("/api/events")
  if (!res.ok) return []
  const json = await res.json()
  return (json.data || []) as EventItem[]
}

const STATUS_COLORS: Record<string, string> = {
  interested: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  attending: "bg-green-500/10 text-green-400 border-green-500/20",
  attended: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  skipped: "bg-gray-500/10 text-gray-400 border-gray-500/20",
}

export default function EventsPage() {
  const { data: events = [], isLoading, mutate } = useSWR("dashboard-events", fetchEvents)
  const [scraping, setScraping] = useState(false)
  const [location, setLocation] = useState("NYC")
  const [eventType, setEventType] = useState("business networking")
  const [pitchDialog, setPitchDialog] = useState<{ name: string; pitch: string } | null>(null)
  const [generatingPitch, setGeneratingPitch] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState("all")

  const handleScrape = useCallback(async () => {
    setScraping(true)
    try {
      await fetch("/api/scrape-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location, type: eventType }),
      })
      mutate()
    } catch {
      // handled
    }
    setScraping(false)
  }, [location, eventType, mutate])

  const updateStatus = useCallback(async (id: string, status: string) => {
    await fetch("/api/events", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    })
    mutate()
  }, [mutate])

  const generatePitch = useCallback(async (event: EventItem) => {
    setGeneratingPitch(event.id)
    try {
      const res = await fetch("/api/generate-pitch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: `Generate a short, confident elevator pitch for attending this networking event: "${event.name}". Description: ${event.description}. The pitch should be for a social media marketing agency owner, 30 seconds max, casual but professional.`,
        }),
      })
      const data = await res.json()
      const pitch = data.pitch || data.data || "Could not generate pitch"
      await fetch("/api/events", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: event.id, elevator_pitch: pitch }),
      })
      setPitchDialog({ name: event.name, pitch })
      mutate()
    } catch {
      // handled
    }
    setGeneratingPitch(null)
  }, [mutate])

  const filtered = events.filter(
    (e) => statusFilter === "all" || e.status === statusFilter
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Networking Events</h1>
          <PageInstructions
            title="Events"
            storageKey="instructions-events-biz"
            steps={[
              "Search for networking events on Eventbrite and Meetup relevant to your business.",
              "Mark events as interested, attending, attended, or skipped to track your pipeline.",
              "Generate an AI elevator pitch tailored to each event.",
              "Use events to build relationships and find new clients for this business.",
            ]}
          />
        </div>
      </div>

      {/* Search Controls */}
      <Card>
        <CardContent className="p-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Location</label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="NYC, Brooklyn, etc." />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Event Type</label>
              <Input value={eventType} onChange={(e) => setEventType(e.target.value)} placeholder="business networking, marketing, etc." />
            </div>
            <div className="flex items-end">
              <Button onClick={handleScrape} disabled={scraping} className="w-full gap-2">
                {scraping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {scraping ? "Searching..." : "Find Events"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Filter:</span>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Events</SelectItem>
            <SelectItem value="interested">Interested</SelectItem>
            <SelectItem value="attending">Attending</SelectItem>
            <SelectItem value="attended">Attended</SelectItem>
            <SelectItem value="skipped">Skipped</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground ml-auto">{filtered.length} events</span>
      </div>

      {/* Events List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-40" />
            <p className="text-lg font-medium text-muted-foreground">No events found</p>
            <p className="text-sm text-muted-foreground mt-1">
              Search for networking events above to start building your pipeline
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((evt) => (
            <Card key={evt.id} className="hover:border-purple-500/30 transition-colors">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-semibold">{evt.name}</h3>
                      <Badge variant="outline" className="text-xs">{evt.source}</Badge>
                      <Badge variant="outline" className={`text-xs ${STATUS_COLORS[evt.status] || ""}`}>{evt.status}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">{evt.description}</p>
                    <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                      {evt.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> {evt.location}
                        </span>
                      )}
                      {evt.date && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" /> {new Date(evt.date).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5 shrink-0">
                    <Select value={evt.status} onValueChange={(v) => updateStatus(evt.id, v)}>
                      <SelectTrigger className="w-[120px] h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="interested">Interested</SelectItem>
                        <SelectItem value="attending">Attending</SelectItem>
                        <SelectItem value="attended">Attended</SelectItem>
                        <SelectItem value="skipped">Skipped</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => evt.elevator_pitch ? setPitchDialog({ name: evt.name, pitch: evt.elevator_pitch }) : generatePitch(evt)}
                      disabled={generatingPitch === evt.id}
                      className="gap-1 text-xs"
                    >
                      {generatingPitch === evt.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Sparkles className="h-3 w-3" />
                      )}
                      {evt.elevator_pitch ? "View Pitch" : "Gen Pitch"}
                    </Button>
                    {evt.url && (
                      <a href={evt.url} target="_blank" rel="noopener noreferrer">
                        <Button variant="ghost" size="sm" className="gap-1 text-xs w-full">
                          <ExternalLink className="h-3 w-3" /> View
                        </Button>
                      </a>
                    )}
                  </div>
                </div>

                {evt.elevator_pitch && (
                  <div className="mt-3 p-3 rounded-lg bg-purple-500/5 border border-purple-500/20">
                    <p className="text-sm">
                      <Sparkles className="h-3 w-3 inline text-purple-400 mr-1" />
                      <strong>Pitch:</strong> {evt.elevator_pitch}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pitch Dialog */}
      <Dialog open={!!pitchDialog} onOpenChange={() => setPitchDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-400" />
              Elevator Pitch
            </DialogTitle>
          </DialogHeader>
          {pitchDialog && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">For: <span className="text-foreground font-medium">{pitchDialog.name}</span></p>
              <div className="bg-secondary/50 rounded-lg p-4 text-sm whitespace-pre-wrap leading-relaxed">
                {pitchDialog.pitch}
              </div>
              <Button
                onClick={() => {
                  navigator.clipboard.writeText(pitchDialog.pitch)
                }}
                className="w-full"
              >
                Copy Pitch
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
