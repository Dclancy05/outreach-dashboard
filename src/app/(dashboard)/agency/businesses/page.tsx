"use client"

import { useState } from "react"
import useSWR from "swr"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { PageInstructions } from "@/components/page-instructions"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Store,
  Plus,
  Edit,
  Archive,
  ArchiveRestore,
  Trash2,
  Users,
  Send,
  ArrowRight,
  Eye,
  EyeOff,
} from "lucide-react"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/confirm-dialog"

const fetcher = (url: string) => fetch(url).then((r) => r.json())
const COLORS = ["#8B5CF6", "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#EC4899", "#06B6D4", "#F97316"]
const ICONS = ["🏪", "💈", "🍕", "🏋️", "🏥", "🎨", "📸", "🏠", "🚗", "💻", "📱", "🎯"]

interface Business {
  id: string; name: string; description: string; service_type: string
  color: string; icon: string; status: string; leads_count: number
  accounts_count: number; messages_sent: number
}

export default function BusinessesPage() {
  const { data, mutate } = useSWR("/api/businesses", fetcher)
  const allBusinesses: Business[] = data?.data || []

  const [showArchived, setShowArchived] = useState(false)
  const [editing, setEditing] = useState<Business | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: "", description: "", service_type: "", color: COLORS[0], icon: "🏪" })
  const [confirmDeleteBizId, setConfirmDeleteBizId] = useState<string | null>(null)

  const businesses = showArchived ? allBusinesses : allBusinesses.filter(b => b.status !== "archived")
  const archivedCount = allBusinesses.filter(b => b.status === "archived").length

  const selectAndGo = (biz: Business) => {
    localStorage.setItem("selected_business", JSON.stringify(biz))
    window.location.href = "/leads"
  }

  const handleSave = async (isNew: boolean) => {
    const body = isNew
      ? { action: "create", ...form }
      : { action: "update", id: editing!.id, ...form }
    await fetch("/api/businesses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    mutate()
    setShowCreate(false)
    setEditing(null)
  }

  const handleArchive = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await fetch("/api/businesses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "archive", id }),
    })
    mutate()
  }

  const handleUnarchive = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await fetch("/api/businesses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", id, status: "active" }),
    })
    mutate()
  }

  const handleDelete = async (id: string) => {
    try {
      await fetch("/api/businesses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      })
      toast.success("Business deleted")
      mutate()
    } catch { toast.error("Failed to delete business") }
    finally { setConfirmDeleteBizId(null) }
  }

  const openEdit = (biz: Business, e: React.MouseEvent) => {
    e.stopPropagation()
    setForm({ name: biz.name, description: biz.description, service_type: biz.service_type, color: biz.color, icon: biz.icon })
    setEditing(biz)
  }

  const openCreate = () => {
    setForm({ name: "", description: "", service_type: "", color: COLORS[0], icon: "🏪" })
    setShowCreate(true)
  }

  const formDialog = (isNew: boolean) => (
    <Dialog open={isNew ? showCreate : !!editing} onOpenChange={() => { setShowCreate(false); setEditing(null) }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isNew ? "Create" : "Edit"} Business</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Name</label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="text-sm font-medium">Service Type</label>
            <Input value={form.service_type} onChange={(e) => setForm({ ...form, service_type: e.target.value })} />
          </div>
          <div>
            <label className="text-sm font-medium">Description</label>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Icon</label>
            <div className="flex flex-wrap gap-2">
              {ICONS.map((icon) => (
                <button key={icon} onClick={() => setForm({ ...form, icon })}
                  className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg border transition-all ${form.icon === icon ? "border-primary bg-primary/10" : "border-border"}`}
                >{icon}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Color</label>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button key={c} onClick={() => setForm({ ...form, color: c })}
                  className={`w-8 h-8 rounded-full border-2 transition-all ${form.color === c ? "border-white scale-110" : "border-transparent"}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <Button onClick={() => handleSave(isNew)} disabled={!form.name} className="w-full">
            {isNew ? "Create" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          🏪 Businesses
          <PageInstructions title="Business Management" storageKey="instructions-businesses"
            steps={["Click any business card to enter it and manage outreach.", "Use Edit to update details, Archive to hide, or Delete to remove.", "Each business gets its own leads, accounts, and outreach."]} />
        </h1>
        <div className="flex gap-2">
          {archivedCount > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setShowArchived(!showArchived)} className="gap-2 text-muted-foreground">
              {showArchived ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {showArchived ? "Hide" : "Show"} {archivedCount} archived
            </Button>
          )}
          <Button onClick={openCreate} className="gap-2"><Plus className="h-4 w-4" /> New Business</Button>
        </div>
      </div>

      {businesses.length === 0 ? (
        <Card className="p-12 text-center">
          <Store className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No businesses yet</h3>
          <p className="text-muted-foreground mb-4">Create your first business to start managing outreach</p>
          <Button onClick={openCreate} className="gap-2"><Plus className="h-4 w-4" /> Create Business</Button>
        </Card>
      ) : (
        <div className="grid gap-4">
          {businesses.map((biz) => (
            <Card key={biz.id}
              className={`cursor-pointer hover:border-primary/50 transition-all group ${biz.status === "archived" ? "opacity-50" : ""}`}
              onClick={() => selectAndGo(biz)}
            >
              <CardContent className="p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg flex items-center justify-center text-2xl flex-shrink-0"
                  style={{ backgroundColor: (biz.color || "#8B5CF6") + "20" }}>{biz.icon || "🏪"}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold group-hover:text-primary transition-colors">{biz.name}</h3>
                    <Badge variant={biz.status === "active" ? "default" : "secondary"}>{biz.status}</Badge>
                  </div>
                  {biz.service_type && <p className="text-sm text-muted-foreground">{biz.service_type}</p>}
                  {biz.description && <p className="text-sm text-muted-foreground line-clamp-1">{biz.description}</p>}
                  <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                    <span><Users className="h-3 w-3 inline mr-1" />{biz.leads_count} leads</span>
                    <span><Send className="h-3 w-3 inline mr-1" />{biz.messages_sent} sent</span>
                  </div>
                </div>
                <div className="flex gap-2 items-center">
                  <Button variant="outline" size="sm" onClick={(e) => openEdit(biz, e)}><Edit className="h-4 w-4" /></Button>
                  {biz.status === "archived" ? (
                    <Button variant="outline" size="sm" onClick={(e) => handleUnarchive(biz.id, e)}><ArchiveRestore className="h-4 w-4" /></Button>
                  ) : (
                    <Button variant="outline" size="sm" onClick={(e) => handleArchive(biz.id, e)}><Archive className="h-4 w-4" /></Button>
                  )}
                  <Button variant="outline" size="sm" className="text-red-500 hover:text-red-400" onClick={(e) => { e.stopPropagation(); setConfirmDeleteBizId(biz.id) }}><Trash2 className="h-4 w-4" /></Button>
                  <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors ml-2" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {formDialog(true)}
      {formDialog(false)}
      <ConfirmDialog open={!!confirmDeleteBizId} onOpenChange={(open) => { if (!open) setConfirmDeleteBizId(null) }} title="Delete Business" description="Delete this business permanently? This cannot be undone." onConfirm={() => confirmDeleteBizId && handleDelete(confirmDeleteBizId)} />
    </div>
  )
}
