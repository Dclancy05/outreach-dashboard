"use client"

import { useState, useMemo, useCallback } from "react"
import { useBusinessId } from "@/lib/use-business"
import useSWR from "swr"
import { dashboardApi, dashboardApiFull } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { TagDisplay } from "@/components/tag-input"
import { TagInput } from "@/components/tag-input"
import { LeadDetailPopup } from "@/components/lead-detail-popup"
import { Users, Search, FileUp, Filter, Trash2, Pause, RotateCcw, Plus, ArrowUpDown, ArrowUp, ArrowDown, Tag, FolderOpen, X, ChevronLeft, ChevronsLeft, ChevronsRight, Download, Zap, AlertTriangle, Star } from "lucide-react"
import { toast } from "sonner"
import { exportToCSV } from "@/lib/csv-export"
import { PageInstructions } from "@/components/page-instructions"
import { SetupBanner } from "@/components/setup-banner"
import type { Lead, SmartList } from "@/types"

const statusColors: Record<string, "success" | "info" | "warning" | "purple" | "secondary"> = {
  new: "info",
  messages_ready: "purple",
  in_sequence: "success",
  completed: "secondary",
  paused: "warning",
  responded: "success",
}

const LIST_COLORS = ["purple", "blue", "green", "pink", "orange", "cyan", "yellow"]

type SortField = "name" | "business_type" | "city" | "status" | "total_score" | "ranking_tier"
type SortDir = "asc" | "desc"

const PAGE_SIZE = 50

export default function LeadsPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [tagFilter, setTagFilter] = useState<string>("all")
  const [activeList, setActiveList] = useState<string>("all")
  const [sortField, setSortField] = useState<SortField | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>("asc")

  const businessId = useBusinessId()

  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null)
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value)
    if (searchTimeout) clearTimeout(searchTimeout)
    const timeout = setTimeout(() => {
      setDebouncedSearch(value)
      setPage(1)
    }, 300)
    setSearchTimeout(timeout)
  }, [searchTimeout])

  const leadsKey = useMemo(() => JSON.stringify({
    action: "get_leads", page, pageSize: PAGE_SIZE,
    search: debouncedSearch, statusFilter, tagFilter, smartList: activeList,
    sortField: sortField || "", sortDir, business_id: businessId,
  }), [page, debouncedSearch, statusFilter, tagFilter, activeList, sortField, sortDir, businessId])

  const { data: leadsResponse, isLoading, mutate } = useSWR(leadsKey, () =>
    dashboardApiFull("get_leads", {
      page, pageSize: PAGE_SIZE,
      search: debouncedSearch, statusFilter, tagFilter,
      smartList: activeList, sortField: sortField || "", sortDir,
      business_id: businessId || undefined,
    })
  )

  const leads: Lead[] = leadsResponse?.data || []
  const totalCount: number = leadsResponse?.count || 0
  const totalPages: number = leadsResponse?.totalPages || 1

  const { data: smartListsData, mutate: mutateLists } = useSWR<SmartList[]>(businessId ? `get_smart_lists-${businessId}` : "get_smart_lists", () => dashboardApi("get_smart_lists", { business_id: businessId || undefined }))
  const { data: filterData, mutate: mutateFilters } = useSWR(businessId ? `get_lead_filters-${businessId}` : "get_lead_filters", () => dashboardApi("get_lead_filters", { business_id: businessId || undefined }), { revalidateOnFocus: false })

  // Duplicate detection
  const { data: dupeData, mutate: mutateDupes } = useSWR("duplicates", async () => {
    const res = await fetch("/api/duplicates")
    return res.json()
  }, { revalidateOnFocus: false })

  const [importData, setImportData] = useState("")
  const [importFormat, setImportFormat] = useState<"json" | "csv">("json")
  const [importOpen, setImportOpen] = useState(false)
  const [showMapping, setShowMapping] = useState(false)
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([])
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({})

  const MAPPING_TARGETS = [
    { value: "skip", label: "(Skip)" },
    { value: "name", label: "Business Name" },
    { value: "instagram_url", label: "Instagram URL" },
    { value: "facebook_url", label: "Facebook URL" },
    { value: "linkedin_url", label: "LinkedIn URL" },
    { value: "email", label: "Email" },
    { value: "phone", label: "Phone" },
    { value: "city", label: "City" },
    { value: "state", label: "State" },
    { value: "website", label: "Website" },
    { value: "business_type", label: "Industry" },
    { value: "notes", label: "Notes" },
  ]
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [detailLead, setDetailLead] = useState<Lead | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [createListOpen, setCreateListOpen] = useState(false)
  const [newListName, setNewListName] = useState("")
  const [newListDesc, setNewListDesc] = useState("")
  const [newListEmoji, setNewListEmoji] = useState("📋")
  const [newListFilters, setNewListFilters] = useState<Record<string, string>>({})
  const [newListFilterMode, setNewListFilterMode] = useState(false)
  const [moveListOpen, setMoveListOpen] = useState(false)
  const [addTagOpen, setAddTagOpen] = useState(false)
  const [bulkTags, setBulkTags] = useState<string[]>([])
  const [importError, setImportError] = useState<string | null>(null)
  const [importSuccess, setImportSuccess] = useState<string | null>(null)
  const [scoringLoading, setScoringLoading] = useState(false)
  const [removeTagOpen, setRemoveTagOpen] = useState(false)
  const [removeTags, setRemoveTags] = useState<string[]>([])
  const [selectAllMatching, setSelectAllMatching] = useState(false)

  const smartLists = smartListsData || []
  const allTags: string[] = filterData?.tags || []
  const statuses = useMemo(() => {
    const serverStatuses: string[] = filterData?.statuses || []
    return ["all", ...serverStatuses]
  }, [filterData])

  function handleSort(field: SortField) {
    if (sortField === field) setSortDir(sortDir === "asc" ? "desc" : "asc")
    else { setSortField(field); setSortDir("asc") }
    setPage(1)
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 opacity-30" />
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
  }

  function handleStatusFilter(s: string) { setStatusFilter(s); setPage(1); setSelected(new Set()) }
  function handleTagFilter(t: string) { setTagFilter(t); setPage(1); setSelected(new Set()) }
  function handleListFilter(listId: string) { setActiveList(listId); setPage(1); setSelected(new Set()) }

  async function handleImport() {
    setActionLoading("import"); setImportError(null); setImportSuccess(null)
    try {
      const result = await dashboardApi("import_leads", { leads_data: importData, format: importFormat })
      const msg = result?.message || "Leads imported!"
      setImportSuccess(msg)
      toast.success(msg)
      setImportData("")
      setTimeout(() => { setImportOpen(false); setImportSuccess(null); mutate() }, 2000)
    } catch (e) { const err = e instanceof Error ? e.message : String(e); setImportError(err); toast.error("Import failed", { description: err }) }
    finally { setActionLoading(null) }
  }

  function autoMapColumns(headers: string[]): Record<string, string> {
    const map: Record<string, string> = {}
    const guesses: Record<string, string[]> = {
      name: ["name", "business_name", "company", "business"],
      instagram_url: ["instagram", "ig", "instagram_url", "company_instagram"],
      facebook_url: ["facebook", "fb", "facebook_url", "company_facebook"],
      linkedin_url: ["linkedin", "li", "linkedin_url", "company_linkedin"],
      email: ["email", "email_1", "e-mail"],
      phone: ["phone", "telephone", "phone_number"],
      city: ["city", "town", "location"],
      state: ["state", "province", "region"],
      website: ["website", "site", "url", "web"],
      business_type: ["type", "category", "industry", "business_type"],
      notes: ["notes", "note", "comments"],
    }
    for (const header of headers) {
      const lower = header.toLowerCase().replace(/[^a-z0-9_]/g, "_")
      let matched = false
      for (const [field, aliases] of Object.entries(guesses)) {
        if (aliases.includes(lower)) { map[header] = field; matched = true; break }
      }
      if (!matched) map[header] = "skip"
    }
    return map
  }

  function parseCSVRow(text: string): string[] {
    const result: string[] = []
    let current = ""
    let inQuotes = false
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { current += '"'; i++ }
          else inQuotes = false
        } else current += ch
      } else {
        if (ch === '"') inQuotes = true
        else if (ch === ',') { result.push(current.trim()); current = "" }
        else current += ch
      }
    }
    result.push(current.trim())
    return result
  }

  function parseCSVFull(text: string): string[][] {
    const rows: string[][] = []
    let current = ""
    let inQuotes = false
    const lines: string[] = []
    // Split by newlines respecting quotes
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]
      if (ch === '"') inQuotes = !inQuotes
      if (!inQuotes && (ch === '\n' || (ch === '\r' && text[i + 1] === '\n'))) {
        if (ch === '\r') i++
        if (current.trim()) lines.push(current)
        current = ""
      } else if (ch !== '\r') {
        current += ch
      }
    }
    if (current.trim()) lines.push(current)
    for (const line of lines) {
      rows.push(parseCSVRow(line))
    }
    return rows
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      setImportData(text)
      if (file.name.endsWith(".csv")) {
        setImportFormat("csv")
        const allRows = parseCSVFull(text)
        if (allRows.length >= 2) {
          const headers = allRows[0].map((h) => h.replace(/^"|"$/g, "").trim())
          const rows = allRows.slice(1).map((values) => {
            const obj: Record<string, string> = {}
            headers.forEach((h, i) => { obj[h] = (values[i] || "").replace(/^"|"$/g, "").trim() })
            return obj
          })
          setCsvHeaders(headers); setCsvRows(rows)
          setColumnMapping(autoMapColumns(headers)); setShowMapping(true)
        }
      } else setImportFormat("json")
    }
    reader.readAsText(file)
  }

  async function handleMappedImport() {
    setActionLoading("import"); setImportError(null); setImportSuccess(null)
    try {
      const result = await dashboardApi("import_leads_mapped", { rows: csvRows, mapping: columnMapping })
      const msg = result?.message || `Imported ${result?.imported || 0} leads!`
      setImportSuccess(msg); toast.success(msg)
      setShowMapping(false); setCsvHeaders([]); setCsvRows([]); setImportData("")
      mutate()
      setTimeout(() => { setImportOpen(false); setImportSuccess(null) }, 2000)
    } catch (e) { const err = e instanceof Error ? e.message : String(e); setImportError(err); toast.error("Import failed", { description: err }) }
    finally { setActionLoading(null) }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })
  }
  function toggleSelectAll() {
    if (selected.size === leads.length) setSelected(new Set())
    else setSelected(new Set(leads.map((l) => l.lead_id)))
  }

  async function handleDeleteSelected() {
    if (selected.size === 0) return; setActionLoading("delete")
    try { await dashboardApi("delete_leads", { lead_ids: [...selected] }); toast.success(`${selected.size} lead(s) deleted`); setSelected(new Set()); mutate(); mutateFilters() }
    catch (e) { console.error(e); toast.error("Failed to delete leads") } finally { setActionLoading(null); setConfirmDelete(false) }
  }

  async function handleStatusChange(status: string) {
    if (selected.size === 0) return; setActionLoading("status")
    try { await dashboardApi("bulk_update_leads", { lead_ids: [...selected], status }); toast.success(`${selected.size} lead(s) updated to ${status}`); setSelected(new Set()); mutate(); mutateFilters() }
    catch (e) { console.error(e); toast.error("Failed to update leads") } finally { setActionLoading(null) }
  }

  async function handleMoveToList(listId: string) {
    if (selected.size === 0) return; setActionLoading("move")
    try { await dashboardApi("assign_smart_list", { lead_ids: [...selected], list_id: listId }); toast.success("Leads moved to list"); setSelected(new Set()); setMoveListOpen(false); mutate() }
    catch (e) { console.error(e); toast.error("Failed to move leads") } finally { setActionLoading(null) }
  }

  async function handleBulkAddTags() {
    if (selected.size === 0 || bulkTags.length === 0) return; setActionLoading("tags")
    try { await dashboardApi("bulk_add_tags", { lead_ids: [...selected], tags: bulkTags }); toast.success("Tags added"); setSelected(new Set()); setAddTagOpen(false); setBulkTags([]); mutate(); mutateFilters() }
    catch (e) { console.error(e); toast.error("Failed to add tags") } finally { setActionLoading(null) }
  }

  async function handleScoreLeads() {
    setScoringLoading(true)
    try {
      const ids = selected.size > 0 ? [...selected] : undefined
      await fetch("/api/lead-scoring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ids ? { lead_ids: ids } : { score_all: true }),
      })
      toast.success("Lead scoring complete"); mutate(); mutateFilters()
    } catch (e) { console.error(e); toast.error("Scoring failed") }
    finally { setScoringLoading(false) }
  }

  async function handleBulkRemoveTags() {
    if (selected.size === 0 || removeTags.length === 0) return; setActionLoading("tags")
    try { await dashboardApi("bulk_remove_tags", { lead_ids: [...selected], tags: removeTags }); toast.success("Tags removed"); setSelected(new Set()); setRemoveTagOpen(false); setRemoveTags([]); mutate(); mutateFilters() }
    catch (e) { console.error(e); toast.error("Failed to remove tags") } finally { setActionLoading(null) }
  }

  function handleSelectAllMatching() {
    setSelectAllMatching(true)
    // Select all on current page
    setSelected(new Set(leads.map((l) => l.lead_id)))
  }

  async function handleCreateList() {
    if (!newListName) return
    const filters: Record<string, string> = {}
    if (newListFilterMode) {
      Object.entries(newListFilters).forEach(([k, v]) => { if (v) filters[k] = v })
    }
    try {
      await dashboardApi("create_smart_list", {
        name: newListName,
        emoji: newListEmoji,
        description: newListDesc,
        filters,
        color: LIST_COLORS[smartLists.length % LIST_COLORS.length],
      })
      setCreateListOpen(false)
      setNewListName("")
      setNewListDesc("")
      setNewListEmoji("📋")
      setNewListFilters({})
      setNewListFilterMode(false)
      toast.success("Smart list created"); mutateLists()
    } catch (e) { console.error(e); toast.error("Failed to create list") }
  }

  function openLeadDetail(lead: Lead) { setDetailLead(lead); setDetailOpen(true) }

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6 text-neon-blue" /> Leads
            <PageInstructions title="Leads" storageKey="instructions-leads" steps={[
              "This is your lead database — all your leads live here.",
              "Use the search bar to find leads by name, business, or location.",
              "Filter by status, tags, or smart lists using the filter buttons.",
              "Click any lead to see their full profile and outreach history.",
              "Tag leads to organize them into groups for targeted outreach.",
              "Use bulk actions to update status or tags on multiple leads at once.",
            ]} />
          </h1>
          <p className="text-muted-foreground text-sm mt-1">{totalCount.toLocaleString()} total leads</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" className="gap-1" onClick={handleScoreLeads} disabled={scoringLoading}>
            <Zap className="h-3.5 w-3.5" /> {scoringLoading ? "Scoring..." : selected.size > 0 ? `Score ${selected.size}` : "Score All"}
          </Button>
          <Button variant="outline" size="sm" className="gap-1" onClick={() => {
            if (leads.length) exportToCSV(leads as unknown as Record<string, unknown>[], "leads")
          }}>
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
          <Dialog open={importOpen} onOpenChange={setImportOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1"><FileUp className="h-3.5 w-3.5" /> Import</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Import Leads</DialogTitle>
                <DialogDescription>Upload CSV or paste JSON data.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex gap-2">
                  <Button variant={importFormat === "json" ? "default" : "ghost"} size="sm" onClick={() => setImportFormat("json")}>JSON</Button>
                  <Button variant={importFormat === "csv" ? "default" : "ghost"} size="sm" onClick={() => setImportFormat("csv")}>CSV</Button>
                  <div className="flex-1" />
                  <label className="inline-flex items-center gap-1.5 cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                    <FileUp className="h-3.5 w-3.5" /> Upload
                    <input type="file" accept=".json,.csv" className="hidden" onChange={handleFileUpload} />
                  </label>
                </div>
                <Textarea placeholder="Paste data here..." value={importData} onChange={(e) => setImportData(e.target.value)} rows={8} />
                {importError && <div className="p-3 rounded-md bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{importError}</div>}
                {importSuccess && <div className="p-3 rounded-md bg-green-500/10 border border-green-500/30 text-green-400 text-sm">{importSuccess}</div>}
                {showMapping && csvHeaders.length > 0 && (
                  <div className="border rounded-lg p-4 space-y-3 bg-secondary/30">
                    <p className="text-sm font-medium">Map Columns</p>
                    <div className="space-y-2 max-h-[250px] overflow-y-auto">
                      {csvHeaders.map((header) => (
                        <div key={header} className="flex items-center gap-3">
                          <span className="text-sm w-40 truncate font-mono">{header}</span>
                          <span className="text-muted-foreground">→</span>
                          <select className="flex h-8 flex-1 rounded-md border border-input bg-transparent px-2 text-sm" value={columnMapping[header] || "skip"} onChange={(e) => setColumnMapping({ ...columnMapping, [header]: e.target.value })}>
                            {MAPPING_TARGETS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                    <Button variant="neon" className="w-full" onClick={handleMappedImport} disabled={actionLoading !== null}>
                      {actionLoading === "import" ? "Importing..." : `Import ${csvRows.length} Leads`}
                    </Button>
                  </div>
                )}
                {!showMapping && (
                  <Button variant="neon" className="w-full" onClick={handleImport} disabled={!importData || actionLoading !== null}>
                    {actionLoading === "import" ? "Importing..." : "Import Leads"}
                  </Button>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Setup Banner */}
      {totalCount === 0 && !isLoading && (
        <SetupBanner
          storageKey="leads"
          title="Get started with Leads"
          persistent
          steps={[
            { id: "import", label: "Import your first leads via CSV or JSON", complete: false, href: "#", linkLabel: "Import" },
          ]}
        />
      )}
      {totalCount > 0 && !leads.some(l => l.status === "messages_ready" || l.status === "in_sequence") && (
        <SetupBanner
          storageKey="leads-next"
          title="Next step"
          steps={[
            { id: "campaign", label: "Go to Campaigns to generate messages for your leads", complete: false, href: "/campaigns", linkLabel: "Go to Campaigns" },
          ]}
        />
      )}

      {/* Duplicate Banner */}
      {dupeData?.count > 0 && (
        <div className="flex items-center gap-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
          <AlertTriangle className="h-4 w-4 text-yellow-400 flex-shrink-0" />
          <span className="text-sm text-yellow-300 flex-1">
            <strong>{dupeData.count}</strong> duplicate group{dupeData.count > 1 ? "s" : ""} found
          </span>
          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="text-yellow-400 border-yellow-500/30">Review</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[70vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Duplicate Leads</DialogTitle>
                <DialogDescription>Review and merge or delete duplicate leads.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                {(dupeData?.duplicates || []).map((group: { match_type: string; match_value: string; leads: { lead_id: string; name: string; city: string; status: string }[] }, i: number) => (
                  <div key={i} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">{group.match_type}</Badge>
                      <span className="text-xs text-muted-foreground truncate">{group.match_value}</span>
                    </div>
                    {group.leads.map((l) => (
                      <div key={l.lead_id} className="flex items-center gap-2 text-sm pl-2">
                        <span className="flex-1 truncate">{l.name}</span>
                        <span className="text-xs text-muted-foreground">{l.city}</span>
                        <Badge variant="secondary" className="text-[10px]">{l.status}</Badge>
                      </div>
                    ))}
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" variant="outline" className="text-xs" onClick={async () => {
                        await fetch("/api/duplicates", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ action: "merge", keep_id: group.leads[0].lead_id, lead_ids: group.leads.map(l => l.lead_id) }),
                        })
                        mutateDupes(); mutate()
                      }}>Keep First & Merge</Button>
                      <Button size="sm" variant="ghost" className="text-xs text-red-400" onClick={async () => {
                        await fetch("/api/duplicates", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ action: "delete", lead_ids: group.leads.slice(1).map(l => l.lead_id) }),
                        })
                        mutateDupes(); mutate()
                      }}>Delete Dupes</Button>
                    </div>
                  </div>
                ))}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {/* Smart List Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        <button className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap flex items-center gap-1.5 ${activeList === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"}`} onClick={() => handleListFilter("all")}>
          All Leads <span className="text-[10px] opacity-70">{totalCount.toLocaleString()}</span>
        </button>
        {smartLists.map((sl) => (
          <button key={sl.list_id} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap flex items-center gap-1.5 ${activeList === sl.list_id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"}`} onClick={() => handleListFilter(sl.list_id)}>
            {sl.emoji ? <span>{sl.emoji}</span> : <FolderOpen className="h-3 w-3" />} {sl.name}
          </button>
        ))}
        <Dialog open={createListOpen} onOpenChange={setCreateListOpen}>
          <DialogTrigger asChild>
            <button className="px-2 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/50"><Plus className="h-4 w-4" /></button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Smart List</DialogTitle><DialogDescription>Create a filter-based smart list or manual group.</DialogDescription></DialogHeader>
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input placeholder="Emoji" value={newListEmoji} onChange={(e) => setNewListEmoji(e.target.value)} className="w-16 text-center" maxLength={4} />
                <Input placeholder="List name" value={newListName} onChange={(e) => setNewListName(e.target.value)} className="flex-1" />
              </div>
              <Textarea placeholder="Description (optional)" value={newListDesc} onChange={(e) => setNewListDesc(e.target.value)} rows={2} />
              <div className="flex items-center gap-2">
                <Button variant={newListFilterMode ? "default" : "outline"} size="sm" className="text-xs" onClick={() => setNewListFilterMode(!newListFilterMode)}>
                  <Filter className="h-3 w-3 mr-1" /> {newListFilterMode ? "Filter Mode ON" : "Add Filters"}
                </Button>
              </div>
              {newListFilterMode && (
                <div className="space-y-2 p-3 rounded-lg border bg-secondary/20">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground">Status</label>
                      <select className="w-full h-8 rounded-md border bg-transparent px-2 text-sm" value={newListFilters.status || ""} onChange={(e) => setNewListFilters({ ...newListFilters, status: e.target.value })}>
                        <option value="">Any</option>
                        <option value="new">New</option>
                        <option value="in_sequence">In Sequence</option>
                        <option value="responded">Responded</option>
                        <option value="completed">Completed</option>
                        <option value="paused">Paused</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Tier</label>
                      <select className="w-full h-8 rounded-md border bg-transparent px-2 text-sm" value={newListFilters.ranking_tier || ""} onChange={(e) => setNewListFilters({ ...newListFilters, ranking_tier: e.target.value })}>
                        <option value="">Any</option>
                        <option value="A">A (Hot)</option>
                        <option value="B">B</option>
                        <option value="C">C</option>
                        <option value="D">D</option>
                        <option value="X">X (Skip)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Tags contain</label>
                      <Input className="h-8 text-sm" placeholder="e.g. enterprise" value={newListFilters.tags_contains || ""} onChange={(e) => setNewListFilters({ ...newListFilters, tags_contains: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">City</label>
                      <Input className="h-8 text-sm" placeholder="e.g. Miami" value={newListFilters.city || ""} onChange={(e) => setNewListFilters({ ...newListFilters, city: e.target.value })} />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs text-muted-foreground">Business Type</label>
                      <Input className="h-8 text-sm" placeholder="e.g. restaurant" value={newListFilters.business_type || ""} onChange={(e) => setNewListFilters({ ...newListFilters, business_type: e.target.value })} />
                    </div>
                  </div>
                </div>
              )}
              <Button variant="neon" className="w-full" onClick={handleCreateList} disabled={!newListName}>Create List</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search leads..." value={search} onChange={(e) => handleSearchChange(e.target.value)} className="pl-9" />
        </div>
        <div className="flex gap-1 overflow-x-auto">
          <Filter className="h-4 w-4 text-muted-foreground self-center mr-1" />
          {statuses.map((s) => (
            <Button key={s} variant={statusFilter === s ? "default" : "ghost"} size="sm" className="text-xs capitalize" onClick={() => handleStatusFilter(s)}>{s}</Button>
          ))}
        </div>
        {allTags.length > 0 && (
          <div className="flex gap-1 items-center overflow-x-auto">
            <Tag className="h-3.5 w-3.5 text-muted-foreground" />
            <Button variant={tagFilter === "all" ? "default" : "ghost"} size="sm" className="text-xs" onClick={() => handleTagFilter("all")}>All Tags</Button>
            {allTags.slice(0, 8).map((t) => (
              <Button key={t} variant={tagFilter === t ? "default" : "ghost"} size="sm" className="text-xs" onClick={() => handleTagFilter(t)}>{t}</Button>
            ))}
          </div>
        )}
      </div>

      {/* Selection Actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 p-3 bg-secondary/50 rounded-lg border flex-wrap">
          <span className="text-sm font-medium">{selected.size} selected</span>
          {!selectAllMatching && totalCount > leads.length && selected.size === leads.length && (
            <Button size="sm" variant="link" className="text-xs text-blue-400" onClick={handleSelectAllMatching}>
              Select all {totalCount} matching
            </Button>
          )}
          <div className="flex-1" />
          <Button size="sm" variant="ghost" className="gap-1 text-yellow-400" onClick={() => handleStatusChange("paused")} disabled={actionLoading !== null}><Pause className="h-3 w-3" /> Pause</Button>
          <Button size="sm" variant="ghost" className="gap-1 text-green-400" onClick={() => handleStatusChange("new")} disabled={actionLoading !== null}><RotateCcw className="h-3 w-3" /> Reset</Button>
          {smartLists.length > 0 && (
            <div className="relative">
              <Button size="sm" variant="ghost" className="gap-1 text-blue-400" onClick={() => setMoveListOpen(!moveListOpen)}><FolderOpen className="h-3 w-3" /> Move</Button>
              {moveListOpen && (
                <div className="absolute top-full right-0 mt-1 bg-card border rounded-lg shadow-lg z-10 min-w-[160px]">
                  <button className="w-full px-3 py-2 text-left text-sm hover:bg-secondary/50 text-muted-foreground" onClick={() => handleMoveToList("")}>None</button>
                  {smartLists.map((sl) => <button key={sl.list_id} className="w-full px-3 py-2 text-left text-sm hover:bg-secondary/50" onClick={() => handleMoveToList(sl.list_id)}>{sl.name}</button>)}
                </div>
              )}
            </div>
          )}
          <div className="relative">
            <Button size="sm" variant="ghost" className="gap-1 text-purple-400" onClick={() => setAddTagOpen(!addTagOpen)}><Tag className="h-3 w-3" /> Tag</Button>
            {addTagOpen && (
              <div className="absolute top-full right-0 mt-1 bg-card border rounded-lg shadow-lg z-10 p-3 min-w-[200px]">
                <TagInput tags={bulkTags} onChange={setBulkTags} placeholder="Type tags..." />
                <div className="flex gap-2 mt-2">
                  <Button size="sm" variant="neon" className="flex-1" onClick={handleBulkAddTags} disabled={bulkTags.length === 0}>Apply</Button>
                  <Button size="sm" variant="ghost" onClick={() => { setAddTagOpen(false); setBulkTags([]) }}><X className="h-3 w-3" /></Button>
                </div>
              </div>
            )}
          </div>
          <div className="relative">
            <Button size="sm" variant="ghost" className="gap-1 text-orange-400" onClick={() => setRemoveTagOpen(!removeTagOpen)}><Tag className="h-3 w-3" /> Untag</Button>
            {removeTagOpen && (
              <div className="absolute top-full right-0 mt-1 bg-card border rounded-lg shadow-lg z-10 p-3 min-w-[200px]">
                <TagInput tags={removeTags} onChange={setRemoveTags} placeholder="Tags to remove..." />
                <div className="flex gap-2 mt-2">
                  <Button size="sm" variant="default" className="flex-1" onClick={handleBulkRemoveTags} disabled={removeTags.length === 0}>Remove</Button>
                  <Button size="sm" variant="ghost" onClick={() => { setRemoveTagOpen(false); setRemoveTags([]) }}><X className="h-3 w-3" /></Button>
                </div>
              </div>
            )}
          </div>
          <Button size="sm" variant="ghost" className="gap-1 text-red-400" onClick={() => setConfirmDelete(true)} disabled={actionLoading !== null}><Trash2 className="h-3 w-3" /> Delete</Button>
        </div>
      )}

      {/* Leads Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-secondary/50">
                  <th className="p-3 w-10"><input type="checkbox" className="rounded" checked={leads.length > 0 && selected.size === leads.length} onChange={toggleSelectAll} /></th>
                  <th className="text-left p-3 font-medium text-muted-foreground cursor-pointer hover:text-foreground" onClick={() => handleSort("name")}><span className="flex items-center gap-1">Business <SortIcon field="name" /></span></th>
                  <th className="text-left p-3 font-medium text-muted-foreground cursor-pointer hover:text-foreground hidden md:table-cell" onClick={() => handleSort("city")}><span className="flex items-center gap-1">Location <SortIcon field="city" /></span></th>
                  <th className="text-left p-3 font-medium text-muted-foreground hidden lg:table-cell">Tags</th>
                  <th className="text-left p-3 font-medium text-muted-foreground cursor-pointer hover:text-foreground hidden lg:table-cell" onClick={() => handleSort("total_score")}><span className="flex items-center gap-1">Score <SortIcon field="total_score" /></span></th>
                  <th className="text-left p-3 font-medium text-muted-foreground cursor-pointer hover:text-foreground hidden lg:table-cell" onClick={() => handleSort("ranking_tier")}><span className="flex items-center gap-1">Tier <SortIcon field="ranking_tier" /></span></th>
                  <th className="text-left p-3 font-medium text-muted-foreground cursor-pointer hover:text-foreground" onClick={() => handleSort("status")}><span className="flex items-center gap-1">Status <SortIcon field="status" /></span></th>
                  <th className="text-left p-3 font-medium text-muted-foreground hidden md:table-cell">Step</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Loading...</td></tr>
                ) : leads.length === 0 ? (
                  <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">{totalCount === 0 ? "No leads yet. Import some to get started." : "No leads match your filters."}</td></tr>
                ) : leads.map((lead, idx) => {
                  const leadTags = lead.tags ? lead.tags.split(",").map((t) => t.trim()).filter(Boolean) : []
                  return (
                    <tr key={`${lead.lead_id}_${idx}`} className={`border-b hover:bg-secondary/30 transition-colors cursor-pointer ${selected.has(lead.lead_id) ? "bg-primary/5" : ""}`} onClick={() => openLeadDetail(lead)}>
                      <td className="p-3" onClick={(e) => e.stopPropagation()}><input type="checkbox" className="rounded" checked={selected.has(lead.lead_id)} onChange={() => toggleSelect(lead.lead_id)} /></td>
                      <td className="p-3 font-medium">{lead.name}</td>
                      <td className="p-3 text-muted-foreground hidden md:table-cell">{lead.city}{lead.state ? `, ${lead.state}` : ""}</td>
                      <td className="p-3 hidden lg:table-cell"><TagDisplay tags={leadTags} /></td>
                      <td className="p-3 hidden lg:table-cell">
                        {lead.total_score ? (
                          <span className={`font-mono text-sm ${Number(lead.total_score) >= 60 ? "text-green-400" : Number(lead.total_score) >= 40 ? "text-yellow-400" : "text-muted-foreground"}`}>{lead.total_score}</span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="p-3 hidden lg:table-cell">
                        {lead.ranking_tier ? (
                          <Badge variant={lead.ranking_tier === "A" ? "success" : lead.ranking_tier === "B" ? "info" : lead.ranking_tier === "X" ? "warning" : "secondary"} className="text-[10px]">{lead.ranking_tier}</Badge>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="p-3"><Badge variant={statusColors[lead.status] || "secondary"} className="capitalize">{lead.status?.replace(/_/g, " ")}</Badge></td>
                      <td className="p-3 text-muted-foreground hidden md:table-cell">{lead.current_step || "—"}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <div className="text-xs text-muted-foreground">
                {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, totalCount)} of {totalCount.toLocaleString()}
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => { setPage(1); setSelected(new Set()) }} disabled={page === 1}><ChevronsLeft className="h-4 w-4" /></Button>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => { setPage(page - 1); setSelected(new Set()) }} disabled={page === 1}><ChevronLeft className="h-4 w-4" /></Button>
                {(() => {
                  const pages: number[] = []; const start = Math.max(1, page - 2); const end = Math.min(totalPages, page + 2)
                  for (let i = start; i <= end; i++) pages.push(i)
                  return pages.map((p) => <Button key={p} variant={p === page ? "default" : "ghost"} size="sm" className="h-8 w-8 p-0 text-xs" onClick={() => { setPage(p); setSelected(new Set()) }}>{p}</Button>)
                })()}
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => { setPage(page + 1); setSelected(new Set()) }} disabled={page === totalPages}><ChevronLeft className="h-4 w-4 rotate-180" /></Button>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => { setPage(totalPages); setSelected(new Set()) }} disabled={page === totalPages}><ChevronsLeft className="h-4 w-4 rotate-180" /></Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <LeadDetailPopup lead={detailLead} open={detailOpen} onOpenChange={setDetailOpen} smartLists={smartLists} onUpdate={() => { mutate(); setDetailOpen(false) }} />
      <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} title="Delete Leads" description={`Delete ${selected.size} lead(s)? This cannot be undone.`} onConfirm={handleDeleteSelected} />
    </div>
  )
}
