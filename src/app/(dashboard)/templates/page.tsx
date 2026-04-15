"use client"

import { useState, useEffect } from "react"
import useSWR from "swr"
import { dashboardApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  FileText,
  Plus,
  Pencil,
  Trash2,
  Copy,
  Check,
  Tag,
  BarChart3,
  Search,
} from "lucide-react"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/confirm-dialog"

const TEMPLATE_CATEGORIES = [
  "Initial DM",
  "Follow-up 1",
  "Follow-up 2",
  "Follow-up 3",
  "Response to Interested",
  "Response to Not Interested",
  "Response to Question",
  "Custom",
]

const VARIABLES = ["{{business_name}}", "{{owner_name}}", "{{city}}", "{{niche}}", "{{service}}"]

interface OutreachTemplate {
  template_id: string
  name: string
  category: string
  body: string
  variant: string // "A" | "B"
  sends: number
  responses: number
  response_rate: number
  business_id: string
  created_at: string
}

export default function TemplatesPage() {
  const [businessId, setBusinessId] = useState("")
  const [showCreate, setShowCreate] = useState(false)
  const [editTemplate, setEditTemplate] = useState<OutreachTemplate | null>(null)
  const [filterCategory, setFilterCategory] = useState("all")
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [confirmDeleteTpl, setConfirmDeleteTpl] = useState<string | null>(null)

  // Form state
  const [formName, setFormName] = useState("")
  const [formCategory, setFormCategory] = useState("Initial DM")
  const [formBody, setFormBody] = useState("")
  const [formVariant, setFormVariant] = useState("A")

  useEffect(() => {
    try {
      const stored = localStorage.getItem("selected_business")
      if (stored) setBusinessId(JSON.parse(stored).id || "")
    } catch {}
  }, [])

  const { data: templates, isLoading, mutate } = useSWR(
    businessId ? `outreach-templates-${businessId}` : "outreach-templates",
    () => dashboardApi("get_outreach_templates", { business_id: businessId || undefined })
  )

  const allTemplates: OutreachTemplate[] = templates || []
  const filtered = allTemplates.filter((t) => (filterCategory === "all" || t.category === filterCategory) && (!searchQuery || t.name?.toLowerCase().includes(searchQuery.toLowerCase()) || t.body?.toLowerCase().includes(searchQuery.toLowerCase())))

  const handleSave = async () => {
    try {
      if (editTemplate) {
        await dashboardApi("update_outreach_template", {
          template_id: editTemplate.template_id,
          updates: { name: formName, category: formCategory, body: formBody, variant: formVariant },
        })
      } else {
        await dashboardApi("create_outreach_template", {
          business_id: businessId,
          name: formName,
          category: formCategory,
          body: formBody,
          variant: formVariant,
        })
      }
      toast.success(editTemplate ? "Template updated" : "Template created")
      setShowCreate(false)
      setEditTemplate(null)
      resetForm()
      mutate()
    } catch (err) {
      console.error("Failed to save template:", err)
      toast.error("Failed to save template")
    }
  }

  const handleDelete = async (templateId: string) => {
    try {
      await dashboardApi("delete_outreach_template", { template_id: templateId })
      toast.success("Template deleted")
      mutate()
    } catch (err) {
      console.error("Failed to delete:", err)
      toast.error("Failed to delete template")
    } finally { setConfirmDeleteTpl(null) }
  }

  const handleCopy = (body: string, id: string) => {
    navigator.clipboard.writeText(body)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const resetForm = () => {
    setFormName("")
    setFormCategory("Initial DM")
    setFormBody("")
    setFormVariant("A")
  }

  const openEdit = (t: OutreachTemplate) => {
    setEditTemplate(t)
    setFormName(t.name)
    setFormCategory(t.category)
    setFormBody(t.body)
    setFormVariant(t.variant || "A")
    setShowCreate(true)
  }

  const openCreate = () => {
    setEditTemplate(null)
    resetForm()
    setShowCreate(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <FileText className="h-8 w-8 text-violet-400" />
        <div>
          <h1 className="text-2xl font-bold">Outreach Templates</h1>
          <p className="text-sm text-muted-foreground">Manage message templates with variables. Track which templates get the best response rates.</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search templates..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
        </div>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="rounded-md border bg-background px-3 py-2 text-sm"
        >
          <option value="all">All Categories</option>
          {TEMPLATE_CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <div className="flex-1" />
        <Badge variant="secondary">{allTemplates.length} templates</Badge>
        <Button size="sm" onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          New Template
        </Button>
      </div>

      {/* Variable reference */}
      <Card>
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground font-medium">Variables:</span>
          {VARIABLES.map((v) => (
            <Badge key={v} variant="outline" className="text-xs font-mono cursor-pointer hover:bg-secondary"
              onClick={() => navigator.clipboard.writeText(v)}
            >
              {v}
            </Badge>
          ))}
        </CardContent>
      </Card>

      {/* Templates Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="h-40 animate-pulse bg-secondary/20" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-lg font-medium">No templates yet</p>
            <p className="text-sm mt-1">Create your first outreach template to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((t) => (
            <Card key={t.template_id} className="hover:bg-secondary/5 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-medium">{t.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary" className="text-xs">{t.category}</Badge>
                      {t.variant && (
                        <Badge variant="outline" className="text-xs">Variant {t.variant}</Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0"
                      onClick={() => handleCopy(t.body, t.template_id)}>
                      {copiedId === t.template_id ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEdit(t)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-400" onClick={() => setConfirmDeleteTpl(t.template_id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-3 font-mono bg-secondary/20 rounded p-2 mt-2">
                  {t.body}
                </p>
                {(t.sends > 0 || t.responses > 0) && (
                  <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <BarChart3 className="h-3 w-3" />
                      {t.sends} sends
                    </span>
                    <span>{t.responses} responses</span>
                    <span className="text-green-400 font-medium">
                      {t.sends > 0 ? Math.round((t.responses / t.sends) * 100) : 0}% rate
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog open={!!confirmDeleteTpl} onOpenChange={(open) => { if (!open) setConfirmDeleteTpl(null) }} title="Delete Template" description="Delete this template? This cannot be undone." onConfirm={() => confirmDeleteTpl && handleDelete(confirmDeleteTpl)} />

      {/* Create/Edit Dialog */}
      <Dialog open={showCreate} onOpenChange={(open) => { if (!open) { setShowCreate(false); setEditTemplate(null) } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editTemplate ? "Edit Template" : "New Template"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="text-sm font-medium">Name</label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Friendly Initial DM" className="mt-1" />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-sm font-medium">Category</label>
                <select value={formCategory} onChange={(e) => setFormCategory(e.target.value)} className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm">
                  {TEMPLATE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="w-24">
                <label className="text-sm font-medium">Variant</label>
                <select value={formVariant} onChange={(e) => setFormVariant(e.target.value)} className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm">
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="C">C</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Message Body</label>
              <Textarea
                value={formBody}
                onChange={(e) => setFormBody(e.target.value)}
                placeholder="Hey {{business_name}}! I noticed..."
                rows={6}
                className="mt-1 font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Use variables: {VARIABLES.join(", ")}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setShowCreate(false); setEditTemplate(null) }}>Cancel</Button>
              <Button onClick={handleSave} disabled={!formName || !formBody}>
                {editTemplate ? "Update" : "Create"} Template
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
