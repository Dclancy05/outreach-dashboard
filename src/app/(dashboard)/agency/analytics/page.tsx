"use client"

import { useState } from "react"
import useSWR from "swr"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { StatCard } from "@/components/dashboard/stat-card"
import { PageInstructions } from "@/components/page-instructions"
import { Users, Send, MessageSquare, TrendingUp, Calendar, DollarSign, Download } from "lucide-react"
import { exportToCSV } from "@/lib/csv-export"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, AreaChart, Area, PieChart, Pie, Cell, Legend,
} from "recharts"

const fetcher = (url: string) => fetch(url).then((r) => r.json())
const COLORS = ["#8B5CF6", "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#EC4899"]

const RANGE_PRESETS = [
  { label: "7d", days: 7 },
  { label: "14d", days: 14 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
]

function formatDate(d: Date) {
  return d.toISOString().split("T")[0]
}

export default function AnalyticsPage() {
  const [rangeDays, setRangeDays] = useState(30)
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")

  const dateFrom = customFrom || formatDate(new Date(Date.now() - rangeDays * 86400000))
  const dateTo = customTo || formatDate(new Date())

  const { data } = useSWR(`/api/analytics?from=${dateFrom}&to=${dateTo}`, fetcher)
  const { data: costsData } = useSWR("/api/costs?type=costs", fetcher)
  const { data: revData } = useSWR("/api/costs?type=revenue", fetcher)
  const analytics = data?.data || {}

  const funnel = analytics.funnel || {}
  const funnelData = [
    { name: "New Leads", value: funnel.new || 0, fill: "#3B82F6" },
    { name: "In Sequence", value: funnel.in_sequence || 0, fill: "#8B5CF6" },
    { name: "Responded", value: funnel.responded || 0, fill: "#10B981" },
    { name: "Booked", value: funnel.booked || 0, fill: "#F59E0B" },
    { name: "Closed", value: funnel.closed || 0, fill: "#EF4444" },
  ]

  const bizStats = analytics.business_stats || []
  const platformData = Object.entries(analytics.platform_breakdown || {}).map(([name, data]) => ({
    name,
    sent: (data as { sent: number }).sent || 0,
    responded: (data as { responded: number }).responded || 0,
  }))

  // DMs over time data
  const dmsOverTime: Array<{ date: string; sent: number; responses: number }> = analytics.dms_over_time || []

  // Calculate response rate over time
  const responseRateData = dmsOverTime.map((d) => ({
    date: d.date,
    rate: d.sent > 0 ? parseFloat(((d.responses / d.sent) * 100).toFixed(1)) : 0,
  }))

  // Cost metrics
  const totalCosts = (costsData?.data || []).reduce((s: number, c: { amount: number }) => s + Number(c.amount), 0)
  const totalRevenue = (revData?.data || []).reduce((s: number, r: { amount: number }) => s + Number(r.amount), 0)
  const totalSent = analytics.today_sends_total || analytics.total_sent || dmsOverTime.reduce((s, d) => s + d.sent, 0)
  const totalResponded = funnel.responded || 0
  const totalClosed = funnel.closed || 0

  const costPerDM = totalSent > 0 ? (totalCosts / totalSent) : 0
  const costPerResponse = totalResponded > 0 ? (totalCosts / totalResponded) : 0
  const costPerClient = totalClosed > 0 ? (totalCosts / totalClosed) : 0

  // Revenue tracking data
  const revenueByMonth: Record<string, number> = {}
  for (const r of (revData?.data || [])) {
    const m = r.date?.slice(0, 7) || "unknown"
    revenueByMonth[m] = (revenueByMonth[m] || 0) + Number(r.amount)
  }
  const revenueChartData = Object.entries(revenueByMonth).sort().slice(-6).map(([month, amount]) => ({ month, revenue: amount }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          📊 Analytics
          <PageInstructions title="Analytics" storageKey="instructions-analytics"
            steps={[
              "View your outreach funnel from leads to closed deals.",
              "Track DMs sent over time with response rates.",
              "Monitor cost efficiency: cost per DM, per response, per client.",
              "Compare performance across businesses and platforms.",
              "Use date range picker to analyze specific periods.",
            ]} />
        </h1>

        {/* Date Range Picker */}
        <div className="flex items-center gap-2 flex-wrap">
          {RANGE_PRESETS.map((p) => (
            <Button
              key={p.label}
              variant={rangeDays === p.days && !customFrom ? "default" : "ghost"}
              size="sm"
              className="text-xs h-7"
              onClick={() => { setRangeDays(p.days); setCustomFrom(""); setCustomTo("") }}
            >
              {p.label}
            </Button>
          ))}
          <div className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="date"
              value={customFrom || dateFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="h-7 w-32 text-xs"
            />
            <span className="text-xs text-muted-foreground">→</span>
            <Input
              type="date"
              value={customTo || dateTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="h-7 w-32 text-xs"
            />
          </div>
          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => {
            const exportData = funnelData.map(f => ({ stage: f.name, count: f.value }))
            if (exportData.length) exportToCSV(exportData as unknown as Record<string, unknown>[], "analytics")
          }}>
            <Download className="h-3 w-3" /> Export
          </Button>
        </div>
      </div>

      {/* Top Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Total Leads" value={analytics.total_leads || 0} icon={Users} color="blue" />
        <StatCard title="DMs Sent (Period)" value={totalSent} icon={Send} color="green" />
        <StatCard title="Responded" value={totalResponded} icon={MessageSquare} color="purple" />
        <StatCard title="Booked" value={funnel.booked || 0} icon={TrendingUp} color="yellow" />
      </div>

      {/* DMs Over Time Chart */}
      <Card className="p-4">
        <h3 className="font-semibold mb-4">📈 DMs Sent Over Time</h3>
        {dmsOverTime.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={dmsOverTime}>
              <defs>
                <linearGradient id="sentGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="respGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="date" stroke="#888" tick={{ fontSize: 11 }} />
              <YAxis stroke="#888" />
              <Tooltip contentStyle={{ backgroundColor: "#1a1a2e", border: "1px solid #333" }} />
              <Legend />
              <Area type="monotone" dataKey="sent" stroke="#8B5CF6" fill="url(#sentGrad)" name="DMs Sent" />
              <Area type="monotone" dataKey="responses" stroke="#10B981" fill="url(#respGrad)" name="Responses" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            No data for this period. DMs sent over time will appear here.
          </div>
        )}
      </Card>

      {/* Response Rate Over Time */}
      {responseRateData.length > 0 && (
        <Card className="p-4">
          <h3 className="font-semibold mb-4">📊 Response Rate Over Time</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={responseRateData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="date" stroke="#888" tick={{ fontSize: 11 }} />
              <YAxis stroke="#888" unit="%" />
              <Tooltip contentStyle={{ backgroundColor: "#1a1a2e", border: "1px solid #333" }} formatter={(v: unknown) => `${v}%`} />
              <Line type="monotone" dataKey="rate" stroke="#F59E0B" strokeWidth={2} dot={{ r: 3 }} name="Response Rate" />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Conversion Funnel */}
      <Card className="p-4">
        <h3 className="font-semibold mb-4">🔄 Conversion Funnel</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={funnelData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis type="number" stroke="#888" />
            <YAxis type="category" dataKey="name" stroke="#888" width={100} />
            <Tooltip contentStyle={{ backgroundColor: "#1a1a2e", border: "1px solid #333" }} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {funnelData.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Cost Efficiency Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="h-4 w-4 text-orange-400" />
            <h3 className="font-semibold text-sm">Cost per DM</h3>
          </div>
          <div className="text-3xl font-bold text-orange-400">${costPerDM.toFixed(2)}</div>
          <p className="text-xs text-muted-foreground mt-1">{totalSent} DMs / ${totalCosts.toFixed(0)} costs</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="h-4 w-4 text-yellow-400" />
            <h3 className="font-semibold text-sm">Cost per Response</h3>
          </div>
          <div className="text-3xl font-bold text-yellow-400">${costPerResponse.toFixed(2)}</div>
          <p className="text-xs text-muted-foreground mt-1">{totalResponded} responses / ${totalCosts.toFixed(0)} costs</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="h-4 w-4 text-green-400" />
            <h3 className="font-semibold text-sm">Cost per Client</h3>
          </div>
          <div className="text-3xl font-bold text-green-400">${costPerClient.toFixed(2)}</div>
          <p className="text-xs text-muted-foreground mt-1">{totalClosed} clients / ${totalCosts.toFixed(0)} costs</p>
        </Card>
      </div>

      {/* Revenue Tracking */}
      {revenueChartData.length > 0 && (
        <Card className="p-4">
          <h3 className="font-semibold mb-4">💰 Revenue Tracking</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={revenueChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="month" stroke="#888" />
              <YAxis stroke="#888" />
              <Tooltip contentStyle={{ backgroundColor: "#1a1a2e", border: "1px solid #333" }} formatter={(v: unknown) => `$${Number(v).toFixed(0)}`} />
              <Bar dataKey="revenue" fill="#10B981" name="Revenue" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Business Performance */}
        {bizStats.length > 0 && (
          <Card className="p-4">
            <h3 className="font-semibold mb-4">Business Performance</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={bizStats}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="name" stroke="#888" />
                <YAxis stroke="#888" />
                <Tooltip contentStyle={{ backgroundColor: "#1a1a2e", border: "1px solid #333" }} />
                <Bar dataKey="leads" fill="#3B82F6" name="Leads" />
                <Bar dataKey="responded" fill="#10B981" name="Responded" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}

        {/* Platform Breakdown */}
        {platformData.length > 0 && (
          <Card className="p-4">
            <h3 className="font-semibold mb-4">Platform Performance</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={platformData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="name" stroke="#888" />
                <YAxis stroke="#888" />
                <Tooltip contentStyle={{ backgroundColor: "#1a1a2e", border: "1px solid #333" }} />
                <Bar dataKey="sent" fill="#8B5CF6" name="Sent" />
                <Bar dataKey="responded" fill="#10B981" name="Responded" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}
      </div>

      {/* Per-business breakdown */}
      {bizStats.length > 0 && (
        <Card className="p-4">
          <h3 className="font-semibold mb-4">Business Breakdown</h3>
          <div className="grid gap-3">
            {bizStats.map((b: { id: string; name: string; color: string; leads: number; responded: number }) => (
              <div key={b.id} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: b.color || "#8B5CF6" }} />
                <span className="flex-1 font-medium">{b.name}</span>
                <span className="text-sm text-muted-foreground">{b.leads} leads</span>
                <span className="text-sm text-green-400">{b.responded} responded</span>
                <span className="text-sm text-muted-foreground">
                  {b.leads > 0 ? ((b.responded / b.leads) * 100).toFixed(1) : 0}% rate
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
