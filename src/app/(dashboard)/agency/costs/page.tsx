"use client"

import { useState } from "react"
import useSWR from "swr"
import { dashboardApi } from "@/lib/api"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PageInstructions } from "@/components/page-instructions"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { DollarSign, Plus, Trash2, TrendingUp, TrendingDown, Target, AlertTriangle, Send, MessageSquare, Users } from "lucide-react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts"

const fetcher = (url: string) => fetch(url).then((r) => r.json())
const CATEGORIES = [
  { value: "apify", label: "🤖 Apify (Scraping)" },
  { value: "proxy", label: "🌐 Proxy" },
  { value: "va", label: "👤 VA" },
  { value: "account", label: "📱 Account" },
  { value: "tool", label: "🔧 Tool" },
  { value: "other", label: "📦 Other" },
]
const CATEGORY_COLORS: Record<string, string> = {
  apify: "#8B5CF6",
  proxy: "#3B82F6",
  va: "#10B981",
  account: "#F59E0B",
  tool: "#EC4899",
  other: "#6B7280",
}

export default function CostsPage() {
  const { data: costsData, mutate: mutateCosts } = useSWR("/api/costs?type=costs", fetcher)
  const { data: revData, mutate: mutateRev } = useSWR("/api/costs?type=revenue", fetcher)
  const { data: bizData } = useSWR("/api/businesses", fetcher)
  const { data: analyticsData } = useSWR("agency_analytics_for_costs", () => dashboardApi("get_agency_analytics"))

  const costs = costsData?.data || []
  const revenue = revData?.data || []
  const businesses = bizData?.data || []

  const [showAdd, setShowAdd] = useState(false)
  const [addType, setAddType] = useState<"costs" | "revenue">("costs")
  const [showBudget, setShowBudget] = useState(false)
  const [monthlyBudget, setMonthlyBudget] = useState(() => {
    try { return parseFloat(localStorage.getItem("monthly_budget") || "500") } catch { return 500 }
  })
  const [form, setForm] = useState({ category: "other", description: "", amount: "", date: new Date().toISOString().split("T")[0], recurring: false, client_name: "", business_id: "" })

  const totalCosts = costs.reduce((s: number, c: { amount: number }) => s + Number(c.amount), 0)
  const totalRevenue = revenue.reduce((s: number, r: { amount: number }) => s + Number(r.amount), 0)

  // Current month costs
  const currentMonth = new Date().toISOString().slice(0, 7)
  const monthCosts = costs.filter((c: { date: string }) => c.date?.startsWith(currentMonth)).reduce((s: number, c: { amount: number }) => s + Number(c.amount), 0)
  const budgetUsedPct = monthlyBudget > 0 ? (monthCosts / monthlyBudget) * 100 : 0

  // Cost per category breakdown
  const categoryTotals: Record<string, number> = {}
  for (const c of costs) {
    const cat = c.category || "other"
    categoryTotals[cat] = (categoryTotals[cat] || 0) + Number(c.amount)
  }
  const pieData = Object.entries(categoryTotals).map(([name, value]) => ({
    name: CATEGORIES.find((c) => c.value === name)?.label.replace(/^[^\s]+\s/, "") || name,
    value,
    fill: CATEGORY_COLORS[name] || "#6B7280",
  }))

  // Cost efficiency metrics
  const totalDMs = analyticsData?.dms_all_time || 0
  const totalResponses = analyticsData?.responses_all_time || 0
  const totalClients = analyticsData?.funnel?.closed || 0
  const costPerDM = totalDMs > 0 ? totalCosts / totalDMs : 0
  const costPerResponse = totalResponses > 0 ? totalCosts / totalResponses : 0
  const costPerClient = totalClients > 0 ? totalCosts / totalClients : 0

  const handleAdd = async () => {
    const body: Record<string, unknown> = { action: "create", type: addType, amount: parseFloat(form.amount), date: form.date }
    if (addType === "costs") {
      body.category = form.category
      body.description = form.description
      body.recurring = form.recurring
      body.business_id = form.business_id || null
    } else {
      body.client_name = form.client_name
      body.description = form.description
      body.business_id = form.business_id || null
    }
    await fetch("/api/costs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    mutateCosts(); mutateRev()
    setShowAdd(false)
    setForm({ category: "other", description: "", amount: "", date: new Date().toISOString().split("T")[0], recurring: false, client_name: "", business_id: "" })
  }

  const handleDelete = async (id: string, type: string) => {
    await fetch("/api/costs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", type, id }) })
    mutateCosts(); mutateRev()
  }

  const saveBudget = () => {
    localStorage.setItem("monthly_budget", monthlyBudget.toString())
    setShowBudget(false)
  }

  // Monthly P&L data
  const months: Record<string, { costs: number; revenue: number }> = {}
  for (const c of costs) {
    const m = c.date?.slice(0, 7) || "unknown"
    if (!months[m]) months[m] = { costs: 0, revenue: 0 }
    months[m].costs += Number(c.amount)
  }
  for (const r of revenue) {
    const m = r.date?.slice(0, 7) || "unknown"
    if (!months[m]) months[m] = { costs: 0, revenue: 0 }
    months[m].revenue += Number(r.amount)
  }
  const chartData = Object.entries(months).sort().slice(-6).map(([month, d]) => ({ month, costs: d.costs, revenue: d.revenue, profit: d.revenue - d.costs }))

  // Recurring costs total
  const recurringTotal = costs.filter((c: { recurring: boolean }) => c.recurring).reduce((s: number, c: { amount: number }) => s + Number(c.amount), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          💰 Costs & Revenue
          <PageInstructions title="Costs & Revenue" storageKey="instructions-costs"
            steps={[
              "Track all business costs by category: Apify, proxy, VA, accounts, tools.",
              "Set a monthly budget and monitor spending against it.",
              "View cost efficiency: cost per DM, per response, per client.",
              "Log revenue from clients and track monthly P&L.",
            ]} />
        </h1>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Total Costs</div>
          <div className="text-2xl font-bold text-red-400 flex items-center gap-1"><TrendingDown className="h-5 w-5" /> ${totalCosts.toFixed(2)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Total Revenue</div>
          <div className="text-2xl font-bold text-green-400 flex items-center gap-1"><TrendingUp className="h-5 w-5" /> ${totalRevenue.toFixed(2)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Net Profit</div>
          <div className={`text-2xl font-bold ${totalRevenue - totalCosts >= 0 ? "text-green-400" : "text-red-400"}`}>
            ${(totalRevenue - totalCosts).toFixed(2)}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Recurring Monthly</div>
          <div className="text-2xl font-bold text-orange-400">${recurringTotal.toFixed(2)}</div>
        </Card>
      </div>

      {/* Monthly Budget vs Actual */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold flex items-center gap-2">
            <Target className="h-4 w-4 text-violet-400" /> Monthly Budget
          </h3>
          <Button variant="ghost" size="sm" onClick={() => setShowBudget(true)} className="text-xs">
            Set Budget
          </Button>
        </div>
        <div className="flex items-center gap-4 mb-2">
          <span className="text-sm text-muted-foreground">${monthCosts.toFixed(0)} / ${monthlyBudget.toFixed(0)}</span>
          <span className={`text-xs font-bold ${budgetUsedPct > 90 ? "text-red-400" : budgetUsedPct > 70 ? "text-yellow-400" : "text-green-400"}`}>
            {budgetUsedPct.toFixed(0)}% used
          </span>
          {budgetUsedPct > 90 && (
            <span className="flex items-center gap-1 text-xs text-red-400">
              <AlertTriangle className="h-3 w-3" /> Over budget!
            </span>
          )}
        </div>
        <div className="h-4 bg-secondary rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${budgetUsedPct > 90 ? "bg-red-500" : budgetUsedPct > 70 ? "bg-yellow-500" : "bg-green-500"}`}
            style={{ width: `${Math.min(budgetUsedPct, 100)}%` }}
          />
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          ${Math.max(0, monthlyBudget - monthCosts).toFixed(0)} remaining for {new Date().toLocaleString("en", { month: "long" })}
        </div>
      </Card>

      {/* Cost Efficiency Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <Send className="h-4 w-4 text-blue-400" />
            <span className="text-sm text-muted-foreground">Cost per DM</span>
          </div>
          <div className="text-2xl font-bold">${costPerDM.toFixed(3)}</div>
          <p className="text-xs text-muted-foreground">{totalDMs.toLocaleString()} DMs sent</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <MessageSquare className="h-4 w-4 text-yellow-400" />
            <span className="text-sm text-muted-foreground">Cost per Response</span>
          </div>
          <div className="text-2xl font-bold">${costPerResponse.toFixed(2)}</div>
          <p className="text-xs text-muted-foreground">{totalResponses.toLocaleString()} responses</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <Users className="h-4 w-4 text-green-400" />
            <span className="text-sm text-muted-foreground">Cost per Client</span>
          </div>
          <div className="text-2xl font-bold">${costPerClient.toFixed(2)}</div>
          <p className="text-xs text-muted-foreground">{totalClients} clients closed</p>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Monthly P&L */}
        {chartData.length > 0 && (
          <Card className="p-4">
            <h3 className="font-semibold mb-4">Monthly P&L</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="month" stroke="#888" />
                <YAxis stroke="#888" />
                <Tooltip contentStyle={{ backgroundColor: "#1a1a2e", border: "1px solid #333" }} formatter={(v: unknown) => `$${Number(v).toFixed(0)}`} />
                <Bar dataKey="revenue" fill="#10B981" name="Revenue" />
                <Bar dataKey="costs" fill="#EF4444" name="Costs" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}

        {/* Cost Breakdown Pie */}
        {pieData.length > 0 && (
          <Card className="p-4">
            <h3 className="font-semibold mb-4">Cost Breakdown by Category</h3>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} dataKey="value" label={({ name, percent }: any) => `${name || ""} ${((percent || 0) * 100).toFixed(0)}%`}>
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: "#1a1a2e", border: "1px solid #333" }} formatter={(v: unknown) => `$${Number(v).toFixed(2)}`} />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        )}
      </div>

      {/* Costs & Revenue Tabs */}
      <Tabs defaultValue="costs">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="costs">Costs ({costs.length})</TabsTrigger>
            <TabsTrigger value="revenue">Revenue ({revenue.length})</TabsTrigger>
          </TabsList>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { setAddType("costs"); setShowAdd(true) }} className="gap-1">
              <Plus className="h-3 w-3" /> Add Cost
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setAddType("revenue"); setShowAdd(true) }} className="gap-1">
              <Plus className="h-3 w-3" /> Add Revenue
            </Button>
          </div>
        </div>

        <TabsContent value="costs" className="space-y-2 mt-4">
          {/* Group by category */}
          {CATEGORIES.map(({ value: cat, label }) => {
            const catCosts = costs.filter((c: { category: string }) => (c.category || "other") === cat)
            if (catCosts.length === 0) return null
            const catTotal = catCosts.reduce((s: number, c: { amount: number }) => s + Number(c.amount), 0)
            return (
              <div key={cat} className="space-y-1">
                <div className="flex items-center justify-between text-sm px-1 mt-3">
                  <span className="font-medium">{label}</span>
                  <span className="text-red-400 font-bold">${catTotal.toFixed(2)}</span>
                </div>
                {catCosts.map((c: { id: string; category: string; description: string; amount: number; date: string; recurring: boolean }) => (
                  <Card key={c.id}>
                    <CardContent className="p-3 flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[c.category] || "#6B7280" }} />
                      <span className="flex-1 text-sm">{c.description || "No description"}</span>
                      {c.recurring && <Badge variant="outline" className="text-[10px]">Recurring</Badge>}
                      <span className="text-xs text-muted-foreground">{c.date}</span>
                      <span className="font-bold text-red-400">${Number(c.amount).toFixed(2)}</span>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(c.id, "costs")}><Trash2 className="h-3 w-3" /></Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )
          })}
          {costs.length === 0 && <p className="text-center text-muted-foreground py-8">No costs recorded yet</p>}
        </TabsContent>

        <TabsContent value="revenue" className="space-y-2 mt-4">
          {revenue.map((r: { id: string; client_name: string; description: string; amount: number; date: string }) => (
            <Card key={r.id}>
              <CardContent className="p-3 flex items-center gap-3">
                <Badge variant="default">{r.client_name || "Client"}</Badge>
                <span className="flex-1 text-sm">{r.description || "No description"}</span>
                <span className="text-sm text-muted-foreground">{r.date}</span>
                <span className="font-bold text-green-400">${Number(r.amount).toFixed(2)}</span>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(r.id, "revenue")}><Trash2 className="h-3 w-3" /></Button>
              </CardContent>
            </Card>
          ))}
          {revenue.length === 0 && <p className="text-center text-muted-foreground py-8">No revenue recorded yet</p>}
        </TabsContent>
      </Tabs>

      {/* Add Cost/Revenue Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add {addType === "costs" ? "Cost" : "Revenue"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {addType === "costs" && (
              <div>
                <label className="text-sm font-medium">Category</label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {addType === "revenue" && (
              <div>
                <label className="text-sm font-medium">Client Name</label>
                <Input value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} />
              </div>
            )}
            <div>
              <label className="text-sm font-medium">Description</label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Amount ($)</label>
                <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Date</label>
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
            </div>
            {addType === "costs" && (
              <div className="flex items-center gap-2">
                <Switch checked={form.recurring} onCheckedChange={(v) => setForm({ ...form, recurring: v })} />
                <label className="text-sm">Recurring monthly</label>
              </div>
            )}
            <div>
              <label className="text-sm font-medium">Business (optional)</label>
              <Select value={form.business_id} onValueChange={(v) => setForm({ ...form, business_id: v })}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {businesses.map((b: { id: string; name: string }) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleAdd} disabled={!form.amount} className="w-full">Add {addType === "costs" ? "Cost" : "Revenue"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Budget Dialog */}
      <Dialog open={showBudget} onOpenChange={setShowBudget}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Set Monthly Budget</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Monthly Budget ($)</label>
              <Input type="number" value={monthlyBudget} onChange={(e) => setMonthlyBudget(parseFloat(e.target.value) || 0)} />
            </div>
            <Button onClick={saveBudget} className="w-full">Save Budget</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
