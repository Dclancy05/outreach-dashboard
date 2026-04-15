"use client"

import { useState, useEffect } from "react"
import useSWR from "swr"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { dashboardApi } from "@/lib/api"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { TagInput } from "@/components/tag-input"
import { User, Mail, Phone, Globe, MapPin, MessageSquare, Activity, Save, ExternalLink, Plus, Clock } from "lucide-react"
import type { Lead, Message, LogEntry, SmartList } from "@/types"

interface LeadDetailPopupProps {
  lead: Lead | null
  open: boolean
  onOpenChange: (open: boolean) => void
  smartLists: SmartList[]
  onUpdate: () => void
}

const statusColors: Record<string, "success" | "info" | "warning" | "purple" | "secondary"> = {
  new: "info",
  messages_ready: "purple",
  in_sequence: "success",
  completed: "secondary",
  paused: "warning",
  responded: "success",
}

export function LeadDetailPopup({ lead, open, onOpenChange, smartLists, onUpdate }: LeadDetailPopupProps) {
  const [tab, setTab] = useState<"details" | "messages" | "activity" | "timeline">("details")
  const [notes, setNotes] = useState("")
  const [tags, setTags] = useState<string[]>([])
  const [selectedList, setSelectedList] = useState("")
  const [saving, setSaving] = useState(false)
  const [newNote, setNewNote] = useState("")
  const [addingNote, setAddingNote] = useState(false)

  const { data: messages } = useSWR<Message[]>(
    lead && tab === "messages" ? `lead_messages_${lead.lead_id}` : null,
    () => dashboardApi("get_lead_messages", { lead_id: lead!.lead_id })
  )

  const { data: logEntries } = useSWR<LogEntry[]>(
    lead && tab === "activity" ? `lead_log_${lead.lead_id}` : null,
    () => dashboardApi("get_lead_log", { lead_id: lead!.lead_id })
  )

  const { data: activityTimeline, mutate: mutateTimeline } = useSWR(
    lead && tab === "timeline" ? `lead_timeline_${lead.lead_id}` : null,
    () => dashboardApi("get_lead_activity", { lead_id: lead!.lead_id })
  )

  useEffect(() => {
    if (lead) {
      setNotes(lead.notes || "")
      setTags(lead.tags ? lead.tags.split(",").map((t) => t.trim()).filter(Boolean) : [])
      setSelectedList(lead.smart_list || "")
      setTab("details")
    }
  }, [lead])

  async function handleSave() {
    if (!lead) return
    setSaving(true)
    try {
      await dashboardApi("update_lead", {
        lead_id: lead.lead_id,
        notes,
        tags: tags.join(","),
        smart_list: selectedList,
      })
      onUpdate()
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  async function handleAddNote() {
    if (!lead || !newNote.trim()) return
    setAddingNote(true)
    try {
      await dashboardApi("add_lead_note", { lead_id: lead.lead_id, content: newNote })
      setNewNote("")
      mutateTimeline()
    } catch (e) { console.error(e) }
    finally { setAddingNote(false) }
  }

  if (!lead) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-neon-blue" />
            {lead.name}
            <Badge variant={statusColors[lead.status] || "secondary"} className="capitalize ml-2">
              {lead.status?.replace(/_/g, " ")}
            </Badge>
          </DialogTitle>
          <DialogDescription className="sr-only">Lead details and actions</DialogDescription>
        </DialogHeader>
        {/* Link to full detail page */}
        <Link
          href={`${typeof window !== "undefined" ? window.location.pathname.replace(/\/leads.*/, "") : ""}/leads/${lead.lead_id}`}
          className="text-xs text-purple-400 hover:underline flex items-center gap-1 -mt-2 mb-2"
          onClick={() => onOpenChange(false)}
        >
          <ExternalLink className="h-3 w-3" /> View full detail page
        </Link>

        {/* Tabs */}
        <div className="flex gap-1 bg-secondary/50 p-1 rounded-lg w-fit">
          {(["details", "messages", "activity", "timeline"] as const).map((t) => (
            <button
              key={t}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-all capitalize flex items-center gap-1.5 ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => setTab(t)}
            >
              {t === "messages" && <MessageSquare className="h-3 w-3" />}
              {t === "activity" && <Activity className="h-3 w-3" />}
              {t === "timeline" && <Clock className="h-3 w-3" />}
              {t}
            </button>
          ))}
        </div>

        {tab === "details" && (
          <div className="space-y-4">
            {/* Contact Info */}
            <div className="grid grid-cols-2 gap-3">
              <InfoRow icon={MapPin} label="Location" value={`${lead.city}${lead.state ? `, ${lead.state}` : ""}`} />
              <InfoRow icon={Mail} label="Email" value={lead.email} />
              <InfoRow icon={Phone} label="Phone" value={lead.phone} />
              <InfoRow icon={Globe} label="Website" value={lead.website} link />
            </div>

            {/* Scores */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 bg-secondary/30 rounded-lg text-center">
                <p className="text-2xl font-bold">{lead.total_score || "—"}</p>
                <p className="text-xs text-muted-foreground">Score</p>
              </div>
              <div className="p-3 bg-secondary/30 rounded-lg text-center">
                <Badge variant={lead.ranking_tier === "A" ? "success" : lead.ranking_tier === "B" ? "info" : "secondary"} className="text-lg px-3">
                  {lead.ranking_tier || "—"}
                </Badge>
                <p className="text-xs text-muted-foreground mt-1">Tier</p>
              </div>
              <div className="p-3 bg-secondary/30 rounded-lg text-center">
                <p className="text-2xl font-bold">{lead.current_step || "—"}</p>
                <p className="text-xs text-muted-foreground">Step</p>
              </div>
            </div>

            {/* Social Links */}
            <div className="flex gap-2">
              {lead.instagram_url && <SocialLink url={lead.instagram_url} label="IG" color="text-pink-400" />}
              {lead.facebook_url && <SocialLink url={lead.facebook_url} label="FB" color="text-blue-400" />}
              {lead.linkedin_url && <SocialLink url={lead.linkedin_url} label="LI" color="text-blue-300" />}
            </div>

            {/* Smart List */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Smart List</label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                value={selectedList}
                onChange={(e) => setSelectedList(e.target.value)}
              >
                <option value="">None</option>
                {smartLists.map((sl) => (
                  <option key={sl.list_id} value={sl.list_id}>{sl.name}</option>
                ))}
              </select>
            </div>

            {/* Tags */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Tags</label>
              <div className="border rounded-md p-2">
                <TagInput tags={tags} onChange={setTags} />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Notes</label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} placeholder="Add notes about this lead..." />
            </div>

            <Button variant="neon" className="w-full gap-2" onClick={handleSave} disabled={saving}>
              <Save className="h-3.5 w-3.5" />
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        )}

        {tab === "messages" && (
          <div className="space-y-3">
            {!messages ? (
              <p className="text-sm text-muted-foreground text-center py-4">Loading messages...</p>
            ) : messages.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No messages for this lead yet.</p>
            ) : (
              messages.map((msg) => (
                <div key={msg.message_id} className="border rounded-lg p-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">{msg.platform} | Step {msg.step_number}</Badge>
                    <Badge variant={msg.status === "approved" ? "success" : msg.status === "pending_approval" ? "warning" : "secondary"} className="text-[10px] capitalize">
                      {msg.status?.replace(/_/g, " ")}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground ml-auto">{msg.generated_at}</span>
                  </div>
                  {msg.subject && <p className="text-xs text-muted-foreground">Subject: {msg.subject}</p>}
                  <p className="text-sm whitespace-pre-wrap bg-secondary/30 rounded p-2">{msg.body}</p>
                </div>
              ))
            )}
          </div>
        )}

        {tab === "activity" && (
          <div className="space-y-2">
            {!logEntries ? (
              <p className="text-sm text-muted-foreground text-center py-4">Loading activity...</p>
            ) : logEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No activity for this lead yet.</p>
            ) : (
              logEntries.map((entry) => (
                <div key={entry.log_id} className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0">
                  <div className={`w-2 h-2 rounded-full ${entry.status === "success" ? "bg-green-400" : entry.status === "error" ? "bg-red-400" : "bg-yellow-400"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">{entry.platform}</Badge>
                      <span className="text-sm">{entry.action}</span>
                    </div>
                    {entry.error_note && <p className="text-xs text-red-400 truncate">{entry.error_note}</p>}
                  </div>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">{entry.sent_at}</span>
                </div>
              ))
            )}
          </div>
        )}
        {tab === "timeline" && (
          <div className="space-y-3">
            {/* Add Note */}
            <div className="flex gap-2">
              <Textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Add a note..."
                rows={2}
                className="flex-1"
              />
              <Button
                size="sm"
                variant="neon"
                onClick={handleAddNote}
                disabled={!newNote.trim() || addingNote}
                className="self-end"
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>

            {/* Timeline */}
            {!activityTimeline ? (
              <p className="text-sm text-muted-foreground text-center py-4">Loading timeline...</p>
            ) : activityTimeline.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No activity yet. Add a note to get started.</p>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {activityTimeline.map((entry: { id: number; activity_type: string; content: string; account_used: string; va_name: string; created_at: string }) => (
                  <div key={entry.id} className="flex gap-3 py-2 border-b border-border/50 last:border-0">
                    <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${
                      entry.activity_type === "note" ? "bg-blue-400" :
                      entry.activity_type === "message_sent" ? "bg-green-400" :
                      entry.activity_type === "status_change" ? "bg-yellow-400" :
                      entry.activity_type === "response" ? "bg-purple-400" :
                      "bg-gray-400"
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">{entry.activity_type}</Badge>
                        {entry.va_name && <span className="text-[10px] text-muted-foreground">by {entry.va_name}</span>}
                        {entry.account_used && <span className="text-[10px] text-muted-foreground">via {entry.account_used}</span>}
                      </div>
                      {entry.content && <p className="text-sm mt-1">{entry.content}</p>}
                      <span className="text-[10px] text-muted-foreground">{new Date(entry.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function InfoRow({ icon: Icon, label, value, link }: { icon: typeof Mail; label: string; value: string; link?: boolean }) {
  if (!value) return null
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <span className="text-muted-foreground">{label}:</span>
      {link ? (
        <a href={value.startsWith("http") ? value : `https://${value}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline truncate flex items-center gap-1">
          {value} <ExternalLink className="h-3 w-3" />
        </a>
      ) : (
        <span className="truncate">{value}</span>
      )}
    </div>
  )
}

function SocialLink({ url, label, color }: { url: string; label: string; color: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs border border-border hover:bg-secondary/50 ${color}`}>
      {label} <ExternalLink className="h-3 w-3" />
    </a>
  )
}
