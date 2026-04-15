"use client"

import { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  ArrowLeft,
  DollarSign,
  Filter,
  Lightbulb,
  Loader2,
  Plus,
  TrendingUp,
  X,
  ExternalLink,
  BarChart3,
  Edit2,
  Save,
} from "lucide-react"
import { toast } from "sonner"

// ─── Types ──────────────────────────────────────────────────────────

interface Stream {
  id: string
  name: string
  category: string
  platform: string | null
  description: string
  status: string
  listing_url: string | null
  total_revenue: number
  total_sales: number
  avg_sale_price: number | null
  notes: string | null
  created_at: string
  updated_at: string
}

interface Transaction {
  id: string
  stream_id: string
  amount: number
  description: string | null
  platform_fee: number
  net_amount: number
  transaction_date: string
  created_at: string
}

interface Stats {
  totalRevenue: number
  thisMonth: number
  activeStreams: number
  ideas: number
}

// ─── API Helper ─────────────────────────────────────────────────────

async function revenueApi(action: string, data?: Record<string, unknown>) {
  const res = await fetch("/api/revenue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...data }),
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error || "API error")
  return json.data
}

// ─── Status Helpers ─────────────────────────────────────────────────

const statusConfig: Record<string, { label: string; emoji: string; color: string }> = {
  active: { label: "Active", emoji: "🟢", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  paused: { label: "Paused", emoji: "🟡", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  idea: { label: "Idea", emoji: "💡", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
}

const categoryColors: Record<string, string> = {
  "lead-sales": "bg-violet-500/20 text-violet-400 border-violet-500/30",
  freelance: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  "digital-product": "bg-pink-500/20 text-pink-400 border-pink-500/30",
  service: "bg-orange-500/20 text-orange-400 border-orange-500/30",
}

const categories = ["lead-sales", "freelance", "digital-product", "service"]
const platforms = ["Fiverr", "Upwork", "Gumroad", "Direct", "Other"]
const statuses = ["active", "paused", "idea"]

// ─── Format Currency ────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n)
}

// ─── Animation Variants ─────────────────────────────────────────────

const container = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } }
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.5 } } }

// ─── Main Component ─────────────────────────────────────────────────

export default function RevenuePage() {
  const [streams, setStreams] = useState<Stream[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Stream | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [showAddTx, setShowAddTx] = useState(false)
  const [editing, setEditing] = useState(false)

  // Filters
  const [filterStatus, setFilterStatus] = useState("all")
  const [filterCategory, setFilterCategory] = useState("all")
  const [filterPlatform, setFilterPlatform] = useState("all")

  // Form state
  const [form, setForm] = useState({ name: "", category: "lead-sales", platform: "", description: "", status: "idea" })
  const [txForm, setTxForm] = useState({ amount: "", description: "", platform_fee: "0", transaction_date: new Date().toISOString().split("T")[0] })
  const [editForm, setEditForm] = useState<Partial<Stream>>({})
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const [s, st] = await Promise.all([revenueApi("get_streams"), revenueApi("get_stats")])
      setStreams(s)
      setStats(st)
    } catch (e) {
      toast.error("Failed to load: " + (e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const openDetail = async (stream: Stream) => {
    setSelected(stream)
    setEditing(false)
    try {
      const txs = await revenueApi("get_transactions", { stream_id: stream.id })
      setTransactions(txs)
    } catch { setTransactions([]) }
  }

  const handleCreate = async () => {
    if (!form.name) return toast.error("Name is required")
    setSaving(true)
    try {
      await revenueApi("create_stream", form)
      toast.success("Stream created!")
      setShowAdd(false)
      setForm({ name: "", category: "lead-sales", platform: "", description: "", status: "idea" })
      load()
    } catch (e) { toast.error((e as Error).message) }
    finally { setSaving(false) }
  }

  const handleAddTx = async () => {
    if (!txForm.amount || !selected) return toast.error("Amount is required")
    setSaving(true)
    try {
      await revenueApi("add_transaction", {
        stream_id: selected.id,
        amount: parseFloat(txForm.amount),
        description: txForm.description,
        platform_fee: parseFloat(txForm.platform_fee || "0"),
        transaction_date: txForm.transaction_date,
      })
      toast.success("Transaction added!")
      setShowAddTx(false)
      setTxForm({ amount: "", description: "", platform_fee: "0", transaction_date: new Date().toISOString().split("T")[0] })
      const [s, st, txs] = await Promise.all([
        revenueApi("get_streams"),
        revenueApi("get_stats"),
        revenueApi("get_transactions", { stream_id: selected.id }),
      ])
      setStreams(s)
      setStats(st)
      setTransactions(txs)
      const updated = s.find((x: Stream) => x.id === selected.id)
      if (updated) setSelected(updated)
    } catch (e) { toast.error((e as Error).message) }
    finally { setSaving(false) }
  }

  const handleSaveEdit = async () => {
    if (!selected) return
    setSaving(true)
    try {
      const updated = await revenueApi("update_stream", { id: selected.id, ...editForm })
      toast.success("Updated!")
      setEditing(false)
      setSelected(updated)
      load()
    } catch (e) { toast.error((e as Error).message) }
    finally { setSaving(false) }
  }

  const filtered = streams.filter(s => {
    if (filterStatus !== "all" && s.status !== filterStatus) return false
    if (filterCategory !== "all" && s.category !== filterCategory) return false
    if (filterPlatform !== "all" && s.platform !== filterPlatform) return false
    return true
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
      </div>
    )
  }

  // ─── Detail View ──────────────────────────────────────────────────

  if (selected) {
    const sc = statusConfig[selected.status] || statusConfig.idea
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="space-y-6 max-w-4xl mx-auto pb-8"
      >
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setSelected(null)} className="rounded-xl hover:bg-muted/50">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <h1 className="text-2xl font-bold">{selected.name}</h1>
          <Badge className={sc.color}>{sc.emoji} {sc.label}</Badge>
          {selected.platform && <Badge variant="outline" className="border-border/50">{selected.platform}</Badge>}
        </motion.div>

        {/* Stats */}
        <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <motion.div variants={item} whileHover={{ scale: 1.02, y: -2 }} className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 p-5 shadow-lg shadow-emerald-500/20">
            <p className="text-xs text-muted-foreground font-medium">Total Revenue</p>
            <p className="text-2xl font-bold mt-1 tabular-nums text-emerald-400">{fmt(Number(selected.total_revenue))}</p>
          </motion.div>
          <motion.div variants={item} whileHover={{ scale: 1.02, y: -2 }} className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 p-5 shadow-lg shadow-blue-500/20">
            <p className="text-xs text-muted-foreground font-medium">Total Sales</p>
            <p className="text-2xl font-bold mt-1 tabular-nums">{selected.total_sales}</p>
          </motion.div>
          <motion.div variants={item} whileHover={{ scale: 1.02, y: -2 }} className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 p-5 shadow-lg shadow-purple-500/20">
            <p className="text-xs text-muted-foreground font-medium">Avg Sale</p>
            <p className="text-2xl font-bold mt-1 tabular-nums">{selected.avg_sale_price ? fmt(Number(selected.avg_sale_price)) : "—"}</p>
          </motion.div>
          <motion.div variants={item} whileHover={{ scale: 1.02, y: -2 }} className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 p-5 shadow-lg shadow-orange-500/20">
            <p className="text-xs text-muted-foreground font-medium">Category</p>
            <Badge className={`mt-2 ${categoryColors[selected.category] || "bg-muted text-muted-foreground"}`}>{selected.category}</Badge>
          </motion.div>
        </motion.div>

        {/* Edit / Details */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }} className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 shadow-lg overflow-hidden">
          <div className="flex items-center justify-between p-5 border-b border-border/30">
            <h3 className="text-base font-semibold">Details</h3>
            {!editing ? (
              <Button variant="ghost" size="sm" className="rounded-xl hover:bg-muted/50" onClick={() => { setEditing(true); setEditForm({ name: selected.name, description: selected.description, status: selected.status, category: selected.category, platform: selected.platform || "", listing_url: selected.listing_url || "", notes: selected.notes || "" }) }}>
                <Edit2 className="h-4 w-4 mr-1" /> Edit
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" className="rounded-xl" onClick={() => setEditing(false)}>Cancel</Button>
                <Button size="sm" className="rounded-xl" onClick={handleSaveEdit} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-1" /> Save</>}
                </Button>
              </div>
            )}
          </div>
          <div className="p-5 space-y-3">
            {editing ? (
              <>
                <Input value={editForm.name || ""} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} placeholder="Name" className="rounded-xl" />
                <Textarea value={editForm.description || ""} onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))} placeholder="Description" className="rounded-xl" />
                <div className="grid grid-cols-2 gap-3">
                  <select className="border border-border/50 rounded-xl px-3 py-2 text-sm bg-background" value={editForm.status} onChange={e => setEditForm(p => ({ ...p, status: e.target.value }))}>
                    {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <select className="border border-border/50 rounded-xl px-3 py-2 text-sm bg-background" value={editForm.category} onChange={e => setEditForm(p => ({ ...p, category: e.target.value }))}>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <Input value={editForm.listing_url || ""} onChange={e => setEditForm(p => ({ ...p, listing_url: e.target.value }))} placeholder="Listing URL" className="rounded-xl" />
                <Textarea value={editForm.notes || ""} onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))} placeholder="Notes" rows={3} className="rounded-xl" />
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">{selected.description || "No description"}</p>
                {selected.listing_url && (
                  <a href={selected.listing_url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-400 hover:underline flex items-center gap-1">
                    <ExternalLink className="h-3 w-3" /> View Listing
                  </a>
                )}
                {selected.notes && (
                  <div className="mt-3 p-3 bg-muted/30 rounded-xl">
                    <p className="text-xs font-medium mb-1 text-muted-foreground">Notes</p>
                    <p className="text-sm whitespace-pre-wrap">{selected.notes}</p>
                  </div>
                )}
              </>
            )}
          </div>
        </motion.div>

        {/* Transactions */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.3 }} className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 shadow-lg overflow-hidden">
          <div className="flex items-center justify-between p-5 border-b border-border/30">
            <h3 className="text-base font-semibold">Transactions</h3>
            <Button size="sm" className="rounded-xl" onClick={() => setShowAddTx(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add Transaction
            </Button>
          </div>
          <div className="p-5">
            {transactions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No transactions yet</p>
            ) : (
              <div className="space-y-2">
                {transactions.map(tx => (
                  <div key={tx.id} className="flex items-center justify-between p-3 border border-border/30 rounded-xl hover:bg-muted/20 transition-colors">
                    <div>
                      <p className="text-sm font-medium">{tx.description || "Sale"}</p>
                      <p className="text-xs text-muted-foreground">{new Date(tx.transaction_date).toLocaleDateString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-emerald-400">{fmt(Number(tx.net_amount))}</p>
                      {Number(tx.platform_fee) > 0 && (
                        <p className="text-xs text-muted-foreground">Fee: {fmt(Number(tx.platform_fee))}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>

        {/* Add Transaction Modal */}
        <AnimatePresence>
          {showAddTx && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
              onClick={() => setShowAddTx(false)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="w-full max-w-md rounded-2xl bg-card/80 backdrop-blur-xl border border-border/50 shadow-2xl overflow-hidden"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center justify-between p-5 border-b border-border/30">
                  <h3 className="text-base font-semibold">Add Transaction</h3>
                  <Button variant="ghost" size="sm" className="rounded-xl" onClick={() => setShowAddTx(false)}><X className="h-4 w-4" /></Button>
                </div>
                <div className="p-5 space-y-3">
                  <Input type="number" step="0.01" placeholder="Amount ($)" value={txForm.amount} onChange={e => setTxForm(p => ({ ...p, amount: e.target.value }))} className="rounded-xl" />
                  <Input placeholder="Description (optional)" value={txForm.description} onChange={e => setTxForm(p => ({ ...p, description: e.target.value }))} className="rounded-xl" />
                  <Input type="number" step="0.01" placeholder="Platform Fee ($)" value={txForm.platform_fee} onChange={e => setTxForm(p => ({ ...p, platform_fee: e.target.value }))} className="rounded-xl" />
                  <Input type="date" value={txForm.transaction_date} onChange={e => setTxForm(p => ({ ...p, transaction_date: e.target.value }))} className="rounded-xl" />
                  <Button className="w-full rounded-xl" onClick={handleAddTx} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add Transaction"}
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    )
  }

  // ─── Main Grid View ───────────────────────────────────────────────

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="space-y-6 pb-8"
    >
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">💰 Revenue Streams</h1>
          <p className="text-muted-foreground mt-1">Side hustles, products & services</p>
        </div>
        <Button onClick={() => setShowAdd(true)} className="rounded-xl px-4 py-2 font-medium">
          <Plus className="h-4 w-4 mr-1" /> Add Stream
        </Button>
      </motion.div>

      {/* Stats Bar */}
      {stats && (
        <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <motion.div variants={item} whileHover={{ scale: 1.02, y: -2 }} className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 p-5 shadow-lg shadow-emerald-500/20">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground font-medium">Total Revenue</p>
                <p className="text-3xl font-bold mt-1 tabular-nums text-emerald-400">{fmt(stats.totalRevenue)}</p>
              </div>
              <div className="rounded-xl p-2.5 bg-emerald-500/20">
                <DollarSign className="h-5 w-5 text-emerald-400" />
              </div>
            </div>
          </motion.div>
          <motion.div variants={item} whileHover={{ scale: 1.02, y: -2 }} className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 p-5 shadow-lg shadow-blue-500/20">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground font-medium">This Month</p>
                <p className="text-3xl font-bold mt-1 tabular-nums text-blue-400">{fmt(stats.thisMonth)}</p>
              </div>
              <div className="rounded-xl p-2.5 bg-blue-500/20">
                <TrendingUp className="h-5 w-5 text-blue-400" />
              </div>
            </div>
          </motion.div>
          <motion.div variants={item} whileHover={{ scale: 1.02, y: -2 }} className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 p-5 shadow-lg shadow-purple-500/20">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground font-medium">Active Streams</p>
                <p className="text-3xl font-bold mt-1 tabular-nums">{stats.activeStreams}</p>
              </div>
              <div className="rounded-xl p-2.5 bg-purple-500/20">
                <BarChart3 className="h-5 w-5 text-purple-400" />
              </div>
            </div>
          </motion.div>
          <motion.div variants={item} whileHover={{ scale: 1.02, y: -2 }} className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 p-5 shadow-lg shadow-amber-500/20">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground font-medium">Ideas Pipeline</p>
                <p className="text-3xl font-bold mt-1 tabular-nums">{stats.ideas}</p>
              </div>
              <div className="rounded-xl p-2.5 bg-amber-500/20">
                <Lightbulb className="h-5 w-5 text-amber-400" />
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Filters */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.3 }} className="flex flex-wrap gap-2 items-center">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <select className="border border-border/50 rounded-xl px-3 py-1.5 text-sm bg-background transition-colors hover:bg-muted/30" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">All Status</option>
          {statuses.map(s => <option key={s} value={s}>{statusConfig[s]?.emoji} {s}</option>)}
        </select>
        <select className="border border-border/50 rounded-xl px-3 py-1.5 text-sm bg-background transition-colors hover:bg-muted/30" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
          <option value="all">All Categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="border border-border/50 rounded-xl px-3 py-1.5 text-sm bg-background transition-colors hover:bg-muted/30" value={filterPlatform} onChange={e => setFilterPlatform(e.target.value)}>
          <option value="all">All Platforms</option>
          {platforms.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </motion.div>

      {/* Cards Grid */}
      <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(stream => {
          const sc = statusConfig[stream.status] || statusConfig.idea
          return (
            <motion.div
              key={stream.id}
              variants={item}
              whileHover={{ scale: 1.02, y: -2 }}
              className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 p-5 shadow-lg cursor-pointer hover:shadow-xl transition-shadow"
              onClick={() => openDetail(stream)}
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-base truncate">{stream.name}</h3>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge className={sc.color}>{sc.emoji} {sc.label}</Badge>
                      {stream.platform && <Badge variant="outline" className="text-xs border-border/50">{stream.platform}</Badge>}
                    </div>
                  </div>
                </div>

                <Badge className={categoryColors[stream.category] || "bg-muted text-muted-foreground"}>
                  {stream.category}
                </Badge>

                <p className="text-sm text-muted-foreground line-clamp-2">{stream.description}</p>

                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/30">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Revenue</p>
                    <p className="text-sm font-bold text-emerald-400">{fmt(Number(stream.total_revenue))}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Sales</p>
                    <p className="text-sm font-bold">{stream.total_sales}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Avg</p>
                    <p className="text-sm font-bold">{stream.avg_sale_price ? fmt(Number(stream.avg_sale_price)) : "—"}</p>
                  </div>
                </div>

                {stream.listing_url && (
                  <a
                    href={stream.listing_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-400 hover:underline flex items-center gap-1"
                    onClick={e => e.stopPropagation()}
                  >
                    <ExternalLink className="h-3 w-3" /> View Listing
                  </a>
                )}
              </div>
            </motion.div>
          )
        })}
      </motion.div>

      {filtered.length === 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-12 text-muted-foreground">
          <Lightbulb className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>No streams match your filters</p>
        </motion.div>
      )}

      {/* Add Stream Modal */}
      <AnimatePresence>
        {showAdd && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowAdd(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-md rounded-2xl bg-card/80 backdrop-blur-xl border border-border/50 shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-5 border-b border-border/30">
                <h3 className="text-base font-semibold">Add Revenue Stream</h3>
                <Button variant="ghost" size="sm" className="rounded-xl" onClick={() => setShowAdd(false)}><X className="h-4 w-4" /></Button>
              </div>
              <div className="p-5 space-y-3">
                <Input placeholder="Stream Name" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="rounded-xl" />
                <select className="w-full border border-border/50 rounded-xl px-3 py-2 text-sm bg-background" value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select className="w-full border border-border/50 rounded-xl px-3 py-2 text-sm bg-background" value={form.platform} onChange={e => setForm(p => ({ ...p, platform: e.target.value }))}>
                  <option value="">No Platform</option>
                  {platforms.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <Textarea placeholder="Description" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className="rounded-xl" />
                <select className="w-full border border-border/50 rounded-xl px-3 py-2 text-sm bg-background" value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
                  {statuses.map(s => <option key={s} value={s}>{statusConfig[s]?.emoji} {s}</option>)}
                </select>
                <Button className="w-full rounded-xl" onClick={handleCreate} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Stream"}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
