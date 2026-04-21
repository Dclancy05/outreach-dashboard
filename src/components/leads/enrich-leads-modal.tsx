"use client"

import { useEffect, useMemo, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Loader2, Sparkles, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"

// Instagram enrichment fields — match what the scraper captures on an IG
// profile page. Stored on lead_enrichment_jobs.fields as text[].
export type EnrichableField =
  | "followers"
  | "following"
  | "posts"
  | "bio"
  | "profile_pic_url"
  | "external_url"
  | "is_verified"
  | "is_private"
  | "category"

interface FieldOption {
  id: EnrichableField
  label: string
  description: string
}

const FIELD_OPTIONS: FieldOption[] = [
  { id: "followers",       label: "Followers",       description: "Total follower count" },
  { id: "following",       label: "Following",       description: "Accounts they follow" },
  { id: "posts",           label: "Posts",           description: "Total posts published" },
  { id: "bio",             label: "Bio",             description: "Profile bio text" },
  { id: "profile_pic_url", label: "Profile Pic URL", description: "Direct link to profile image" },
  { id: "external_url",    label: "External URL",    description: "Website link on the profile" },
  { id: "is_verified",     label: "Is Verified",     description: "Blue checkmark status" },
  { id: "is_private",      label: "Is Private",      description: "Whether the account is private" },
  { id: "category",        label: "Category",        description: "Business / creator category" },
]

const DEFAULT_SELECTED: EnrichableField[] = ["followers", "bio", "external_url"]

type Scope = "selected" | "missing"

interface Automation {
  id: string
  name: string
  platform: string
  status: string
  tag: string | null
}

interface EnrichLeadsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  leadIds: string[]
  onComplete?: () => void
}

export function EnrichLeadsModal({ open, onOpenChange, leadIds, onComplete }: EnrichLeadsModalProps) {
  const [selected, setSelected] = useState<Set<EnrichableField>>(() => new Set(DEFAULT_SELECTED))
  const [scope, setScope] = useState<Scope>(leadIds.length > 0 ? "selected" : "missing")
  const [automations, setAutomations] = useState<Automation[]>([])
  const [automationId, setAutomationId] = useState<string>("")
  const [loadingAutomations, setLoadingAutomations] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const leadCount = leadIds.length
  const allSelected = useMemo(() => selected.size === FIELD_OPTIONS.length, [selected])
  const noneSelected = selected.size === 0

  // Keep scope in sync with the current selection — if Dylan closes+reopens
  // the modal with no selection, default to "all missing".
  useEffect(() => {
    if (!open) return
    setScope(leadIds.length > 0 ? "selected" : "missing")
  }, [open, leadIds.length])

  // Load lead_enrichment-tagged automations when the modal opens.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoadingAutomations(true)
    fetch("/api/automations?tag=lead_enrichment")
      .then(r => r.json())
      .then(payload => {
        if (cancelled) return
        const list: Automation[] = payload?.data || []
        setAutomations(list)
        // Auto-pick the first active enrichment automation as the default.
        const firstActive = list.find(a => a.status === "active") || list[0]
        setAutomationId(firstActive?.id || "")
      })
      .catch(() => {
        if (!cancelled) setAutomations([])
      })
      .finally(() => {
        if (!cancelled) setLoadingAutomations(false)
      })
    return () => { cancelled = true }
  }, [open])

  function toggleField(field: EnrichableField) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(field)) next.delete(field)
      else next.add(field)
      return next
    })
  }

  function selectAll() { setSelected(new Set(FIELD_OPTIONS.map(f => f.id))) }
  function deselectAll() { setSelected(new Set()) }

  function handleOpenChange(next: boolean) {
    if (submitting) return
    onOpenChange(next)
  }

  async function handleSubmit() {
    if (noneSelected || submitting) return
    if (scope === "selected" && leadCount === 0) {
      toast.error("No leads selected. Pick leads first or switch scope to 'All leads missing these fields'.")
      return
    }

    setSubmitting(true)

    const fields = Array.from(selected)
    const payload: Record<string, unknown> = {
      scope,
      fields,
      automation_id: automationId || undefined,
    }
    if (scope === "selected") payload.lead_ids = leadIds

    try {
      const res = await fetch("/api/leads/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const body: { job_id?: string; error?: string } = await res.json().catch(() => ({}))

      if (!res.ok) {
        toast.error("Enrichment failed", { description: body?.error || `HTTP ${res.status}` })
        return
      }

      const scopeLabel = scope === "selected"
        ? `${leadCount} selected lead${leadCount === 1 ? "" : "s"}`
        : "all leads missing these fields"
      toast.success("Enrichment queued", { description: `Job ${body.job_id?.slice(0, 8) || ""} — ${scopeLabel}` })
      onComplete?.()
      onOpenChange(false)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error("Enrichment failed", { description: msg })
    } finally {
      setSubmitting(false)
    }
  }

  const submitLabel = scope === "selected"
    ? `Start enrichment (${leadCount})`
    : "Start enrichment (all missing)"

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-neon-blue" />
            Enrich Leads
          </DialogTitle>
          <DialogDescription>
            Pick which Instagram fields to fetch and which automation to run.
            Jobs queue immediately — the worker picks them up in the background.
          </DialogDescription>
        </DialogHeader>

        {/* Scope picker */}
        <div className="rounded-lg border border-border bg-secondary/20 p-1 flex gap-1 text-xs">
          <button
            type="button"
            onClick={() => setScope("selected")}
            disabled={submitting}
            className={`flex-1 px-3 py-2 rounded-md font-medium transition-colors ${
              scope === "selected"
                ? "bg-primary/20 text-primary"
                : "text-muted-foreground hover:text-foreground"
            } disabled:opacity-50`}
          >
            Selected leads ({leadCount})
          </button>
          <button
            type="button"
            onClick={() => setScope("missing")}
            disabled={submitting}
            className={`flex-1 px-3 py-2 rounded-md font-medium transition-colors ${
              scope === "missing"
                ? "bg-primary/20 text-primary"
                : "text-muted-foreground hover:text-foreground"
            } disabled:opacity-50`}
          >
            All leads missing these fields
          </button>
        </div>

        {/* Field checkboxes */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            {selected.size} of {FIELD_OPTIONS.length} field{FIELD_OPTIONS.length === 1 ? "" : "s"} selected
          </span>
          <div className="flex gap-3">
            <button
              type="button"
              className="text-neon-blue hover:underline disabled:opacity-40 disabled:no-underline"
              onClick={selectAll}
              disabled={submitting || allSelected}
            >Select all</button>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground hover:underline disabled:opacity-40 disabled:no-underline"
              onClick={deselectAll}
              disabled={submitting || noneSelected}
            >Deselect all</button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[280px] overflow-y-auto pr-1">
          {FIELD_OPTIONS.map(field => {
            const isChecked = selected.has(field.id)
            return (
              <label
                key={field.id}
                className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                  isChecked
                    ? "border-primary/60 bg-primary/5"
                    : "border-border hover:border-border/80 hover:bg-secondary/30"
                } ${submitting ? "opacity-60 cursor-not-allowed" : ""}`}
              >
                <Checkbox
                  checked={isChecked}
                  onCheckedChange={() => toggleField(field.id)}
                  disabled={submitting}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium leading-tight flex items-center gap-1.5">
                    {field.label}
                    {isChecked && <CheckCircle2 className="h-3 w-3 text-primary" />}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 leading-snug">
                    {field.description}
                  </div>
                </div>
              </label>
            )
          })}
        </div>

        {/* Automation dropdown */}
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Enrichment automation</label>
          <Select
            value={automationId || "none"}
            onValueChange={v => setAutomationId(v === "none" ? "" : v)}
            disabled={submitting || loadingAutomations}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={loadingAutomations ? "Loading..." : "Pick an automation"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Let worker pick (default)</SelectItem>
              {automations.map(a => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name} <span className="text-muted-foreground text-xs">· {a.platform} · {a.status}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!loadingAutomations && automations.length === 0 && (
            <p className="text-[11px] text-muted-foreground/70">
              No automations tagged <code className="px-1 rounded bg-muted/40">lead_enrichment</code> yet.
              Tag one on the Automations page to populate this list.
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="neon"
            onClick={handleSubmit}
            disabled={submitting || noneSelected || (scope === "selected" && leadCount === 0)}
            className="gap-1.5 min-w-[180px]"
          >
            {submitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Queueing...
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                {submitLabel}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default EnrichLeadsModal
