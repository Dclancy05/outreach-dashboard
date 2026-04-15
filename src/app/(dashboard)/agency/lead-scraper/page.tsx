"use client"

import { useState } from "react"
import useSWR from "swr"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { PageInstructions } from "@/components/page-instructions"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, Download, ExternalLink, Loader2, MapPin, Phone, Mail, Globe } from "lucide-react"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface ScrapedLead {
  name: string; url: string; description: string; address: string
  phone: string; email: string; ig_handle: string; website: string
  selected?: boolean
}

export default function LeadScraperPage() {
  const { data: bizData } = useSWR("/api/businesses", fetcher)
  const businesses = bizData?.data || []

  const [location, setLocation] = useState("")
  const [businessType, setBusinessType] = useState("")
  const [results, setResults] = useState<ScrapedLead[]>([])
  const [loading, setLoading] = useState(false)
  const [assignBiz, setAssignBiz] = useState("")
  const [importing, setImporting] = useState(false)

  const handleScrape = async () => {
    if (!location || !businessType) return
    setLoading(true)
    try {
      const res = await fetch("/api/scrape-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location, business_type: businessType }),
      })
      const data = await res.json()
      setResults((data.data || []).map((r: ScrapedLead) => ({ ...r, selected: false })))
    } catch { }
    setLoading(false)
  }

  const toggleAll = () => {
    const allSelected = results.every((r) => r.selected)
    setResults(results.map((r) => ({ ...r, selected: !allSelected })))
  }

  const toggleOne = (i: number) => {
    setResults(results.map((r, idx) => idx === i ? { ...r, selected: !r.selected } : r))
  }

  const handleImport = async () => {
    const selected = results.filter((r) => r.selected)
    if (!selected.length || !assignBiz) return
    setImporting(true)
    try {
      const leads = selected.map((r) => ({
        lead_id: `lead_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: r.name,
        website: r.website || r.url,
        phone: r.phone,
        email: r.email,
        instagram_url: r.ig_handle ? `https://instagram.com/${r.ig_handle}` : "",
        city: location,
        status: "new",
        business_id: assignBiz,
      }))
      await fetch("/api/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "import_leads", leads_data: JSON.stringify(leads), format: "json", business_id: assignBiz }),
      })
      setResults(results.map((r) => r.selected ? { ...r, selected: false } : r))
    } catch { }
    setImporting(false)
  }

  const selectedCount = results.filter((r) => r.selected).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          🔍 Lead Scraper
          <PageInstructions title="Lead Scraper" storageKey="instructions-lead-scraper"
            steps={["Enter a location (city, neighborhood, or zip) and business type.", "Click Search to find businesses using web search.", "Select leads and assign them to a business.", "Import selected leads into your leads database."]} />
        </h1>
      </div>

      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Location</label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Manhattan NYC, 10001, Brooklyn" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Business Type</label>
              <Input value={businessType} onChange={(e) => setBusinessType(e.target.value)} placeholder="e.g. restaurant, salon, gym" />
            </div>
            <div className="flex items-end">
              <Button onClick={handleScrape} disabled={loading || !location || !businessType} className="w-full gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {loading ? "Searching..." : "Search"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {results.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold">Results ({results.length})</h2>
              <Button variant="outline" size="sm" onClick={toggleAll}>
                {results.every((r) => r.selected) ? "Deselect All" : "Select All"}
              </Button>
            </div>
            <div className="flex items-center gap-3">
              <Select value={assignBiz} onValueChange={setAssignBiz}>
                <SelectTrigger className="w-48"><SelectValue placeholder="Assign to business" /></SelectTrigger>
                <SelectContent>
                  {businesses.map((b: { id: string; name: string; icon: string }) => (
                    <SelectItem key={b.id} value={b.id}>{b.icon} {b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={handleImport} disabled={!selectedCount || !assignBiz || importing} className="gap-2">
                <Download className="h-4 w-4" />
                {importing ? "Importing..." : `Import ${selectedCount} leads`}
              </Button>
            </div>
          </div>

          <div className="grid gap-3">
            {results.map((r, i) => (
              <Card key={i} className={`cursor-pointer transition-all ${r.selected ? "border-primary bg-primary/5" : ""}`} onClick={() => toggleOne(i)}>
                <CardContent className="p-4 flex items-start gap-3">
                  <input type="checkbox" checked={r.selected} onChange={() => toggleOne(i)} className="mt-1 rounded" onClick={(e) => e.stopPropagation()} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{r.name}</h3>
                      {r.url && (
                        <a href={r.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                          <ExternalLink className="h-3 w-3 text-muted-foreground hover:text-primary" />
                        </a>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">{r.description}</p>
                    <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                      {r.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {r.phone}</span>}
                      {r.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {r.email}</span>}
                      {r.website && <span className="flex items-center gap-1"><Globe className="h-3 w-3" /> {r.website.slice(0, 40)}</span>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {!loading && results.length === 0 && (
        <Card className="p-12 text-center">
          <Search className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">Enter a location and business type to start finding leads</p>
        </Card>
      )}
    </div>
  )
}
