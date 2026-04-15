"use client"

import { useState } from "react"
import useSWR from "swr"
import { dashboardApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ConfirmDialog } from "@/components/confirm-dialog"
import {
  Sparkles, Search, Play, ChevronDown, ChevronUp,
  Check, X, Users, GitBranch, Layers, AlertTriangle,
  MessageSquare, Flag, Trash2, CheckCheck, Pencil, RefreshCw, Loader2
} from "lucide-react"
import { PageInstructions } from "@/components/page-instructions"
import { toast } from "sonner"
import type { Lead, Sequence, Approach, Message } from "@/types"

const statusColors: Record<string, "success" | "info" | "warning" | "destructive" | "secondary"> = {
  pending_approval: "warning", approved: "success", sent: "info", flagged: "destructive", failed: "destructive",
}

export default function GeneratePage() {
  const [tab, setTab] = useState<"generate" | "messages">("generate")

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-neon-purple" /> Generate & Messages
            <PageInstructions title="Generate" storageKey="instructions-generate" steps={[
              "Step 1: Select the leads you want to generate messages for.",
              "Step 2: Pick a sequence (defines the outreach steps and timing).",
              "Step 3: Pick an approach (tone and style of messaging).",
              "Step 4: Hit 'Generate' to create personalized AI messages.",
              "Switch to the 'Messages' tab to review generated messages.",
              "Approve, edit, or flag messages before they go to the queue.",
            ]} />
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Generate personalized messages and manage approvals.</p>
        </div>
      </div>

      {/* How-to Card */}
      <Card className="border-purple-500/20 bg-purple-500/5">
        <CardContent className="p-4">
          <p className="text-sm font-semibold mb-2">📝 How to Generate Messages</p>
          <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Select your leads below</li>
            <li>Pick a sequence (defines the outreach steps)</li>
            <li>Pick an approach (Job Seeker = student angle, Direct Reactivation = leads with offer)</li>
            <li>Hit Generate — messages are created using smart templates</li>
            <li>Switch to Messages tab to review, edit, and approve</li>
            <li>Need custom messages? Ask your AI assistant to craft them for specific leads!</li>
          </ol>
        </CardContent>
      </Card>
      <div className="flex gap-1 bg-secondary/50 p-1 rounded-lg w-fit">
        <button className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-1.5 ${tab === "generate" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`} onClick={() => setTab("generate")}>
          <Sparkles className="h-3.5 w-3.5" /> Generate
        </button>
        <button className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-1.5 ${tab === "messages" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`} onClick={() => setTab("messages")}>
          <MessageSquare className="h-3.5 w-3.5" /> Messages
        </button>
      </div>
      {tab === "generate" && <GenerateTab />}
      {tab === "messages" && <MessagesTab />}
    </div>
  )
}

function GenerateTab() {
  const { data: leads } = useSWR<Lead[]>("gen_leads", () => dashboardApi("get_leads"))
  const { data: sequences } = useSWR<Sequence[]>("gen_sequences", () => dashboardApi("get_sequences"))
  const { data: approaches } = useSWR<Approach[]>("gen_approaches", () => dashboardApi("get_approaches"))

  const [search, setSearch] = useState("")
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set())
  const [selectedSequence, setSelectedSequence] = useState("")
  const [selectedApproaches, setSelectedApproaches] = useState<Set<string>>(new Set())
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)
  const [showLeads, setShowLeads] = useState(true)

  const allLeads = leads || []
  const allSequences = sequences || []
  const activeApproaches = (approaches || []).filter((a) => a.status === "active")

  const eligibleLeads = allLeads.filter((l) => ["messages_ready", "new", "in_sequence"].includes(l.status))
  const filteredLeads = eligibleLeads.filter((l) => !search || l.name.toLowerCase().includes(search.toLowerCase()))

  function toggleLead(id: string) {
    const next = new Set(selectedLeads); if (next.has(id)) next.delete(id); else next.add(id); setSelectedLeads(next)
  }
  function selectAllVisible() { const next = new Set(selectedLeads); filteredLeads.forEach((l) => next.add(l.lead_id)); setSelectedLeads(next) }
  function toggleApproach(id: string) { setSelectedApproaches(new Set([id])) }

  const [scraping, setScraping] = useState(false)
  const [scrapeResult, setScrapeResult] = useState<{ success: boolean; message: string } | null>(null)

  async function handleScrape() {
    setScraping(true); setScrapeResult(null)
    try {
      const res = await fetch("/api/scrape-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_ids: Array.from(selectedLeads), platforms: ["instagram", "facebook"] }),
      })
      const data = await res.json()
      if (data.success) {
        setScrapeResult({ success: true, message: data.message || "Profiles scraped." })
      } else {
        setScrapeResult({ success: false, message: data.error || "Scrape failed." })
      }
    } catch (e) { setScrapeResult({ success: false, message: e instanceof Error ? e.message : "Failed." }) }
    finally { setScraping(false) }
  }

  async function handleGenerate() {
    setGenerating(true); setResult(null)
    try {
      const res = await dashboardApi("trigger_generate", { lead_ids: Array.from(selectedLeads), sequence_id: selectedSequence, approach_ids: Array.from(selectedApproaches) })
      setResult({ success: true, message: res?.message || (typeof res === "object" && res?.total_created ? `Generated ${res.total_created} messages!` : "Generation complete.") })
    } catch (e) { setResult({ success: false, message: e instanceof Error ? e.message : "Failed." }) }
    finally { setGenerating(false) }
  }

  const canGenerate = selectedLeads.size > 0 && selectedSequence && selectedApproaches.size > 0

  return (
    <>
      <Card>
        <CardHeader className="cursor-pointer" onClick={() => setShowLeads(!showLeads)}>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-neon-blue" /> 1. Select Leads
              {selectedLeads.size > 0 && <Badge variant="info" className="ml-2">{selectedLeads.size} selected</Badge>}
            </CardTitle>
            {showLeads ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </CardHeader>
        {showLeads && (
          <CardContent>
            <div className="flex gap-3 items-center mb-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
              <Button variant="ghost" size="sm" onClick={selectAllVisible}>Select All</Button>
              <Button variant="ghost" size="sm" onClick={() => setSelectedLeads(new Set())}>Clear</Button>
            </div>
            <div className="max-h-64 overflow-y-auto border rounded-lg">
              {filteredLeads.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground text-sm">No eligible leads.</div>
              ) : filteredLeads.map((lead) => (
                <div key={lead.lead_id} className={`flex items-center gap-3 p-3 border-b last:border-0 cursor-pointer transition-colors ${selectedLeads.has(lead.lead_id) ? "bg-primary/10" : "hover:bg-secondary/30"}`} onClick={() => toggleLead(lead.lead_id)}>
                  <div className={`w-5 h-5 rounded border flex items-center justify-center ${selectedLeads.has(lead.lead_id) ? "bg-primary border-primary" : "border-muted-foreground/30"}`}>
                    {selectedLeads.has(lead.lead_id) && <Check className="h-3 w-3 text-primary-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{lead.name}</p>
                    <p className="text-xs text-muted-foreground">{lead.business_type} | {lead.city}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><GitBranch className="h-4 w-4 text-neon-green" /> 2. Select Sequence</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {allSequences.map((seq) => {
              const isSelected = selectedSequence === seq.sequence_id
              const steps = typeof seq.steps === "string" ? JSON.parse(seq.steps) : seq.steps
              const stepCount = Object.keys(steps).filter((k) => steps[k]).length
              return (
                <div key={seq.sequence_id} className={`p-4 rounded-lg border cursor-pointer transition-all ${isSelected ? "border-green-500 bg-green-500/10" : "border-border hover:border-green-500/30"}`} onClick={() => setSelectedSequence(seq.sequence_id)}>
                  <div className="flex items-center gap-2">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${isSelected ? "border-green-500" : "border-muted-foreground/30"}`}>
                      {isSelected && <div className="w-2 h-2 rounded-full bg-green-500" />}
                    </div>
                    <p className="text-sm font-medium">{seq.sequence_name}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 ml-6">{stepCount} steps</p>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Layers className="h-4 w-4 text-neon-pink" /> 3. Select Approach</CardTitle></CardHeader>
        <CardContent>
          {activeApproaches.length === 0 ? <p className="text-sm text-muted-foreground">No approaches found.</p> : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {activeApproaches.map((approach) => {
                const isSelected = selectedApproaches.has(approach.approach_id)
                return (
                  <div key={approach.approach_id} className={`p-4 rounded-lg border cursor-pointer transition-all ${isSelected ? "border-purple-500 bg-purple-500/10" : "border-border hover:border-purple-500/30"}`} onClick={() => toggleApproach(approach.approach_id)}>
                    <div className="flex items-center gap-2">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${isSelected ? "border-purple-500" : "border-muted-foreground/30"}`}>
                        {isSelected && <div className="w-2 h-2 rounded-full bg-purple-500" />}
                      </div>
                      <p className="text-sm font-medium">{approach.name}</p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 ml-6">{approach.description}</p>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className={canGenerate ? "border-purple-500/30" : ""}>
        <CardContent className="p-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-sm font-medium">Summary</p>
              <p className="text-xs text-muted-foreground mt-1">{selectedLeads.size} leads · {selectedSequence ? "1 sequence" : "none"} · {selectedApproaches.size} approach</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="lg" className="gap-2" disabled={selectedLeads.size === 0 || scraping} onClick={handleScrape}>
                <Search className="h-4 w-4" /> {scraping ? "Scraping..." : "Scrape Profiles"}
              </Button>
              <Button variant="neon" size="lg" className="gap-2" disabled={!canGenerate || generating} onClick={handleGenerate}>
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} {generating ? "Generating..." : "Generate"}
              </Button>
            </div>
          </div>
          {scrapeResult && (
            <div className={`mt-4 p-3 rounded-lg text-sm ${scrapeResult.success ? "bg-blue-500/10 text-blue-400" : "bg-red-500/10 text-red-400"}`}>
              {scrapeResult.success ? <Check className="h-4 w-4 inline mr-1" /> : <AlertTriangle className="h-4 w-4 inline mr-1" />}
              {scrapeResult.message}
            </div>
          )}
          {result && (
            <div className={`mt-4 p-3 rounded-lg text-sm ${result.success ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
              {result.success ? <Check className="h-4 w-4 inline mr-1" /> : <AlertTriangle className="h-4 w-4 inline mr-1" />}
              {result.message}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}

function MessagesTab() {
  const { data, isLoading, mutate } = useSWR<Message[]>("get_messages", () => dashboardApi("get_messages"))
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState("all")
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editBody, setEditBody] = useState("")
  const [editSubject, setEditSubject] = useState("")
  const [bulkLoading, setBulkLoading] = useState(false)
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const messages = data || []
  const pending = messages.filter((m) => m.status === "pending_approval")
  const filtered = messages.filter((m) => {
    const matchSearch = !search || m.business_name.toLowerCase().includes(search.toLowerCase()) || m.body.toLowerCase().includes(search.toLowerCase())
    const matchFilter = filter === "all" || m.status === filter
    return matchSearch && matchFilter
  })

  async function handleApprove(id: string) { setLoadingId(id); try { await dashboardApi("approve_message", { message_id: id, new_status: "approved" }); toast.success("Message approved"); mutate() } catch { toast.error("Failed to approve") } finally { setLoadingId(null) } }
  async function handleFlag(id: string) { setLoadingId(id); try { await dashboardApi("approve_message", { message_id: id, new_status: "flagged" }); toast.success("Message flagged"); mutate() } catch { toast.error("Failed to flag") } finally { setLoadingId(null) } }
  async function handleRegenerate(id: string) { setRegeneratingId(id); try { await dashboardApi("regenerate_message", { message_id: id }); toast.success("Message regenerated"); mutate() } catch { toast.error("Failed to regenerate") } finally { setRegeneratingId(null) } }

  function toggleSelect(id: string) { setSelected((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n }) }
  async function handleBulkApprove() { setBulkLoading(true); try { await dashboardApi("bulk_approve_messages", { message_ids: [...selected], status: "approved" }); toast.success(`${selected.size} message(s) approved`); setSelected(new Set()); mutate() } catch { toast.error("Failed to approve") } finally { setBulkLoading(false) } }
  async function handleBulkDelete() { setBulkLoading(true); try { await dashboardApi("delete_messages", { message_ids: [...selected] }); toast.success(`${selected.size} message(s) deleted`); setSelected(new Set()); mutate() } catch { toast.error("Failed to delete") } finally { setBulkLoading(false); setConfirmBulkDelete(false) } }
  async function handleDeleteSingle(id: string) { try { await dashboardApi("delete_messages", { message_ids: [id] }); toast.success("Message deleted"); mutate() } catch { toast.error("Failed to delete") } finally { setConfirmDeleteId(null) } }

  function startEdit(msg: Message) { setEditingId(msg.message_id); setEditBody(msg.body); setEditSubject(msg.subject || "") }
  async function saveEdit() {
    if (!editingId) return; setLoadingId(editingId)
    try { await dashboardApi("update_message", { message_id: editingId, body: editBody, subject: editSubject, char_count: String(editBody.length) }); setEditingId(null); mutate() }
    catch {} finally { setLoadingId(null) }
  }

  return (
    <>
      <div className="text-sm text-muted-foreground">{messages.length} messages | {pending.length} pending</div>
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {["all", "pending_approval", "approved", "sent", "flagged"].map((s) => (
            <Button key={s} variant={filter === s ? "default" : "ghost"} size="sm" className="text-xs capitalize" onClick={() => setFilter(s)}>{s.replace(/_/g, " ")}</Button>
          ))}
        </div>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-2 p-3 bg-secondary/50 rounded-lg border">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <div className="flex-1" />
          <Button size="sm" variant="ghost" className="gap-1 text-green-400" onClick={handleBulkApprove} disabled={bulkLoading}><CheckCheck className="h-3 w-3" /> Approve</Button>
          <Button size="sm" variant="ghost" className="gap-1 text-red-400" onClick={() => setConfirmBulkDelete(true)} disabled={bulkLoading}><Trash2 className="h-3 w-3" /> Delete</Button>
        </div>
      )}

      {isLoading ? <div className="text-center text-muted-foreground py-8">Loading...</div> : filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">{messages.length === 0 ? "No messages yet." : "No matches."}</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((msg) => (
            <Card key={msg.message_id} className={`transition-all ${selected.has(msg.message_id) ? "border-primary/50" : msg.status === "pending_approval" ? "border-yellow-500/30" : ""}`}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-wrap">
                    <input type="checkbox" className="rounded" checked={selected.has(msg.message_id)} onChange={() => toggleSelect(msg.message_id)} />
                    <Badge variant={statusColors[msg.status] || "secondary"} className="capitalize text-[10px]">{msg.status.replace(/_/g, " ")}</Badge>
                    <Badge variant="outline" className="text-[10px]">{msg.platform} | Step {msg.step_number}</Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">{msg.char_count}ch</span>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => startEdit(msg)}><Pencil className="h-3 w-3" /></Button>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => handleRegenerate(msg.message_id)} disabled={regeneratingId === msg.message_id}>
                      {regeneratingId === msg.message_id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-400" onClick={() => setConfirmDeleteId(msg.message_id)}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                </div>
                <CardTitle className="text-sm mt-1">{msg.business_name}</CardTitle>
              </CardHeader>
              <CardContent>
                {editingId === msg.message_id ? (
                  <div className="space-y-2">
                    {msg.subject !== undefined && <Input value={editSubject} onChange={(e) => setEditSubject(e.target.value)} placeholder="Subject" className="text-xs" />}
                    <Textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={5} className="text-sm" />
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="flex-1 gap-1 text-green-400" onClick={saveEdit} disabled={loadingId === msg.message_id}><Check className="h-3 w-3" /> Save</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}><X className="h-3 w-3" /></Button>
                    </div>
                  </div>
                ) : (
                  <>
                    {msg.subject && <p className="text-xs text-muted-foreground mb-1">Subject: {msg.subject}</p>}
                    <p className="text-sm text-foreground/80 whitespace-pre-wrap bg-secondary/30 rounded-lg p-3 max-h-40 overflow-y-auto">{msg.body}</p>
                    {msg.status === "pending_approval" && (
                      <div className="flex gap-2 mt-3">
                        <Button size="sm" variant="outline" className="flex-1 gap-1 border-green-500/30 text-green-400" onClick={() => handleApprove(msg.message_id)} disabled={loadingId === msg.message_id}><Check className="h-3 w-3" /> Approve</Button>
                        <Button size="sm" variant="outline" className="flex-1 gap-1 border-red-500/30 text-red-400" onClick={() => handleFlag(msg.message_id)} disabled={loadingId === msg.message_id}><Flag className="h-3 w-3" /> Flag</Button>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog open={confirmBulkDelete} onOpenChange={setConfirmBulkDelete} title="Delete Messages" description={`Delete ${selected.size} message(s)?`} onConfirm={handleBulkDelete} />
      <ConfirmDialog open={!!confirmDeleteId} onOpenChange={(o) => { if (!o) setConfirmDeleteId(null) }} title="Delete Message" description="Delete this message?" onConfirm={() => confirmDeleteId && handleDeleteSingle(confirmDeleteId)} />
    </>
  )
}
