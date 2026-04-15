"use client"

import { useState, useCallback } from "react"
import useSWR from "swr"
import { dashboardApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Shield,
  Plus,
  Pencil,
  Trash2,
  Copy,
  Eye,
  EyeOff,
  Users,
  Upload,
  Instagram,
  Facebook,
  Linkedin,
  Filter,
} from "lucide-react"
import { PageInstructions } from "@/components/page-instructions"
import { SetupBanner } from "@/components/setup-banner"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { EmptyState } from "@/components/empty-state"
import { toast } from "sonner"
import { exportToCSV } from "@/lib/csv-export"
import { Download, Search } from "lucide-react"

interface OutreachAccount {
  id: number
  account_id: string
  username: string
  password: string
  email: string
  email_password: string
  platform: string
  identity_group: number | null
  proxy_host: string
  proxy_port: string
  proxy_username: string
  proxy_password: string
  status: string
  daily_limit: number
  sends_today: number
  warmup_start_date: string
  warmup_day: number
  last_used_at: string
  created_at: string
  notes: string
}

const platformIcons: Record<string, React.ReactNode> = {
  instagram: <Instagram className="h-4 w-4 text-pink-400" />,
  facebook: <Facebook className="h-4 w-4 text-blue-400" />,
  linkedin: <Linkedin className="h-4 w-4 text-sky-400" />,
}

const platformBadgeClass: Record<string, string> = {
  instagram: "bg-pink-500/10 text-pink-400 border-pink-500/20",
  facebook: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  linkedin: "bg-sky-500/10 text-sky-400 border-sky-500/20",
}

interface VASession {
  session_id: string
  va_name: string
  pin: string
  is_active: boolean
  created_at: string
}

const statusConfig: Record<string, { emoji: string; color: string; label: string }> = {
  active: { emoji: "🟢", color: "bg-green-500/10 text-green-400 border-green-500/20", label: "Active" },
  warming: { emoji: "🟡", color: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20", label: "Warming" },
  paused: { emoji: "🔴", color: "bg-red-500/10 text-red-400 border-red-500/20", label: "Paused" },
  logged_out: { emoji: "⚫", color: "bg-gray-500/10 text-gray-400 border-gray-500/20", label: "Logged Out" },
  banned: { emoji: "💀", color: "bg-red-500/10 text-red-600 border-red-500/20", label: "Banned" },
}

export default function AccountsManagePage() {
  const { data: accounts, mutate } = useSWR<OutreachAccount[]>("outreach_accounts", () => dashboardApi("get_outreach_accounts"))
  const { data: vaSessions, mutate: mutateVA } = useSWR<VASession[]>("va_sessions", () => dashboardApi("get_va_sessions"))

  const [editAccount, setEditAccount] = useState<Partial<OutreachAccount> | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({})
  const [bulkImport, setBulkImport] = useState(false)
  const [bulkText, setBulkText] = useState("")
  const [platformFilter, setPlatformFilter] = useState<string>("all")
  const [vaModal, setVaModal] = useState<Partial<VASession> | null>(null)
  const [vaIsNew, setVaIsNew] = useState(false)
  const [searchAcct, setSearchAcct] = useState("")
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [confirmDeleteVAId, setConfirmDeleteVAId] = useState<string | null>(null)

  const handleSave = useCallback(async () => {
    if (!editAccount) return
    try {
      if (isNew) {
        await dashboardApi("create_outreach_account", editAccount)
      } else {
        await dashboardApi("update_outreach_account", editAccount)
      }
      toast.success(isNew ? "Account added" : "Account updated")
      setEditAccount(null)
      mutate()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error saving")
    }
  }, [editAccount, isNew, mutate])

  const handleDelete = useCallback(async (id: string) => {
    try {
      await dashboardApi("delete_outreach_account", { account_id: id })
      toast.success("Account deleted")
      mutate()
    } catch (e) { toast.error("Failed to delete account") }
    finally { setConfirmDeleteId(null) }
  }, [mutate])

  const handleStatusChange = useCallback(async (id: string, status: string) => {
    await dashboardApi("update_outreach_account", { account_id: id, status })
    mutate()
  }, [mutate])

  const handleBulkImport = useCallback(async () => {
    const lines = bulkText.trim().split("\n").filter(Boolean)
    try {
      for (const line of lines) {
        const parts = line.split(",").map(s => s.trim())
        const [username, password, email, emailPass, proxy] = parts
        const [proxy_host, proxy_port, proxy_username, proxy_password] = (proxy || "").split(":")
        await dashboardApi("create_outreach_account", {
          username: username || "", password: password || "", email: email || "",
          email_password: emailPass || "", proxy_host: proxy_host || "",
          proxy_port: proxy_port || "", proxy_username: proxy_username || "",
          proxy_password: proxy_password || "",
        })
      }
      toast.success(`${lines.length} account(s) imported`)
    } catch (e) { toast.error("Bulk import failed") }
    setBulkImport(false); setBulkText(""); mutate()
  }, [bulkText, mutate])

  const handleSaveVA = useCallback(async () => {
    if (!vaModal) return
    try {
      if (vaIsNew) {
        await dashboardApi("create_va_session", vaModal)
      } else {
        await dashboardApi("update_va_session", vaModal)
      }
      toast.success(vaIsNew ? "VA added" : "VA updated")
      setVaModal(null)
      mutateVA()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error saving")
    }
  }, [vaModal, vaIsNew, mutateVA])

  const handleDeleteVA = useCallback(async (id: string) => {
    try {
      await dashboardApi("delete_va_session", { session_id: id })
      toast.success("VA deleted")
      mutateVA()
    } catch (e) { toast.error("Failed to delete VA") }
    finally { setConfirmDeleteVAId(null) }
  }, [mutateVA])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="h-7 w-7 text-neon-purple" />
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">Account Manager
              <PageInstructions title="IG Accounts" storageKey="instructions-accounts" steps={[
                "Manage your Instagram accounts used for outreach.",
                "Add accounts with their login credentials and proxy info.",
                "Each account has warmup mode that gradually increases daily send limits.",
                "Monitor each account's daily sends and warmup progress.",
                "Use bulk import to add multiple accounts at once via CSV.",
                "Manage VAs (Virtual Assistants) who send from these accounts.",
              ]} />
            </h1>
            <p className="text-sm text-muted-foreground">Manage IG accounts & VAs for outreach</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => {
            if (accounts?.length) exportToCSV(accounts.map(a => ({ username: a.username, platform: a.platform, email: a.email, status: a.status, daily_limit: a.daily_limit, sends_today: a.sends_today, warmup_day: a.warmup_day })) as unknown as Record<string, unknown>[], "accounts")
          }}>
            <Download className="h-4 w-4 mr-1" /> Export
          </Button>
          <Button variant="outline" size="sm" onClick={() => setBulkImport(true)}>
            <Upload className="h-4 w-4 mr-1" /> Bulk Import
          </Button>
          <Button size="sm" onClick={() => { setEditAccount({}); setIsNew(true) }}>
            <Plus className="h-4 w-4 mr-1" /> Add Account
          </Button>
        </div>
      </div>

      {/* Setup Banner for new accounts */}
      {(accounts || []).filter(a => a.status === "new" || a.status === "logged_out").length > 0 && (
        <SetupBanner
          storageKey="accounts-setup"
          title={`${(accounts || []).filter(a => a.status === "new" || a.status === "logged_out").length} accounts need setup`}
          steps={[
            { id: "setup", label: "These accounts need to be logged in and configured", complete: false, href: "/account-setup", linkLabel: "Go to Account Setup →" },
          ]}
        />
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {Object.entries(statusConfig).map(([status, cfg]) => {
          const count = (accounts || []).filter(a => a.status === status).length
          return (
            <Card key={status} className="border-border/50">
              <CardContent className="p-4 text-center">
                <div className="text-2xl">{cfg.emoji}</div>
                <div className="text-lg font-bold">{count}</div>
                <div className="text-xs text-muted-foreground">{cfg.label}</div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search accounts..." value={searchAcct} onChange={(e) => setSearchAcct(e.target.value)} className="pl-9" />
      </div>

      {/* Platform Filter */}
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        {["all", "instagram", "facebook", "linkedin"].map(p => (
          <button key={p} onClick={() => setPlatformFilter(p)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-all ${
              platformFilter === p ? "border-primary bg-primary/10 text-foreground" : "border-input text-muted-foreground hover:text-foreground"
            }`}>
            {p !== "all" && platformIcons[p]}
            {p === "all" ? "All" : p.charAt(0).toUpperCase() + p.slice(1)}
            <span className="text-xs opacity-60">
              ({p === "all" ? (accounts || []).length : (accounts || []).filter(a => a.platform === p).length})
            </span>
          </button>
        ))}
      </div>

      {/* Accounts Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Outreach Accounts</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {(accounts || []).filter(a => (platformFilter === "all" || a.platform === platformFilter) && (!searchAcct || a.username?.toLowerCase().includes(searchAcct.toLowerCase()) || a.email?.toLowerCase().includes(searchAcct.toLowerCase()))).map(acct => {
              const cfg = statusConfig[acct.status] || statusConfig.paused
              return (
                <div key={acct.account_id} className="flex items-center gap-4 p-3 rounded-lg bg-secondary/30 border border-border/30">
                  <div className="text-xl">{platformIcons[acct.platform] || cfg.emoji}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">@{acct.username}</span>
                      <Badge variant="outline" className={platformBadgeClass[acct.platform] || ""}>{acct.platform}</Badge>
                      <Badge variant="outline" className={cfg.color}>{cfg.label}</Badge>
                      {acct.identity_group && <Badge variant="outline" className="text-xs">Group {acct.identity_group}</Badge>}
                      <Badge variant="outline" className="text-xs">Day {acct.warmup_day}</Badge>
                      {acct.status === "warming" && (
                        <span className="text-xs text-muted-foreground">
                          Week {Math.min(Math.ceil((acct.warmup_day || 1) / 7), 4)}/4
                          ({acct.warmup_day <= 7 ? "5/day" : acct.warmup_day <= 14 ? "10/day" : acct.warmup_day <= 21 ? "20/day" : "30/day ✅"})
                        </span>
                      )}
                    </div>
                    {/* Warmup Progress Bar */}
                    {acct.status === "warming" && (
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-muted-foreground w-16">Warmup</span>
                        <div className="flex-1 bg-secondary rounded-full h-2 max-w-[200px]">
                          <div
                            className="h-2 rounded-full bg-gradient-to-r from-yellow-500 via-orange-500 to-green-500 transition-all"
                            style={{ width: `${Math.min(((acct.warmup_day || 1) / 28) * 100, 100)}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          {acct.warmup_day >= 28 ? "Ready! 🎉" : `${28 - (acct.warmup_day || 1)} days left`}
                        </span>
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground mt-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span>Sends: {acct.sends_today}/{acct.daily_limit}</span>
                        <span>· Proxy: {acct.proxy_host ? `${acct.proxy_host}:${acct.proxy_port}` : "None"}</span>
                        {acct.notes && <span>· {acct.notes}</span>}
                      </div>
                      {/* Health indicators */}
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-secondary rounded-full h-1.5 max-w-[120px]">
                          <div
                            className={`h-1.5 rounded-full transition-all ${
                              acct.sends_today >= acct.daily_limit ? "bg-red-500" :
                              acct.sends_today >= acct.daily_limit * 0.8 ? "bg-yellow-500" : "bg-green-500"
                            }`}
                            style={{ width: `${Math.min((acct.sends_today / Math.max(acct.daily_limit, 1)) * 100, 100)}%` }}
                          />
                        </div>
                        {acct.sends_today >= acct.daily_limit * 0.8 && acct.sends_today < acct.daily_limit && (
                          <span className="text-yellow-400 text-[10px]">⚠️ Near limit</span>
                        )}
                        {acct.sends_today >= acct.daily_limit && (
                          <span className="text-red-400 text-[10px]">🛑 At limit</span>
                        )}
                        {acct.status === "active" && acct.sends_today === 0 && (
                          <span className="text-blue-400 text-[10px]">💤 Not used today</span>
                        )}
                        {acct.last_used_at && (
                          <span className="text-[10px]">Last: {new Date(acct.last_used_at).toLocaleTimeString()}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {acct.status !== "active" && acct.status !== "banned" && (
                      <Button variant="ghost" size="sm" className="text-green-400 hover:text-green-300" onClick={() => handleStatusChange(acct.account_id, "active")}>🟢</Button>
                    )}
                    {acct.status === "active" && (
                      <Button variant="ghost" size="sm" className="text-yellow-400 hover:text-yellow-300" onClick={() => handleStatusChange(acct.account_id, "paused")}>⏸</Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => { setEditAccount(acct); setIsNew(false) }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" className="text-red-400" onClick={() => setConfirmDeleteId(acct.account_id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )
            })}
            {(!accounts || accounts.length === 0) && (
              <EmptyState icon={Shield} title="No accounts yet" description="Add your outreach accounts to start sending messages." actionLabel="Add an account" onAction={() => { setEditAccount({}); setIsNew(true) }} />
            )}
          </div>
        </CardContent>
      </Card>

      {/* VA Sessions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5 text-orange-400" /> VA Sessions
            </CardTitle>
            <Button size="sm" variant="outline" onClick={() => { setVaModal({}); setVaIsNew(true) }}>
              <Plus className="h-4 w-4 mr-1" /> Add VA
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {(vaSessions || []).map(va => (
              <div key={va.session_id} className="flex items-center gap-4 p-3 rounded-lg bg-secondary/30 border border-border/30">
                <div className="flex-1">
                  <span className="font-semibold">{va.va_name}</span>
                  <span className="text-xs text-muted-foreground ml-2">PIN: {va.pin}</span>
                  <Badge variant="outline" className={`ml-2 ${va.is_active ? "text-green-400" : "text-gray-400"}`}>
                    {va.is_active ? "Active" : "Disabled"}
                  </Badge>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => { setVaModal(va); setVaIsNew(false) }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="text-red-400" onClick={() => setConfirmDeleteVAId(va.session_id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            {(!vaSessions || vaSessions.length === 0) && (
              <p className="text-center text-muted-foreground py-4">No VAs yet. Add one to get started.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Edit Account Modal */}
      {editAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setEditAccount(null)}>
          <div className="bg-card border rounded-xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold">{isNew ? "Add Account" : "Edit Account"}</h2>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Username</Label>
                <Input value={editAccount.username || ""} onChange={e => setEditAccount({ ...editAccount, username: e.target.value })} placeholder="ig_username" />
              </div>
              <div>
                <Label>Password</Label>
                <Input type="password" value={editAccount.password || ""} onChange={e => setEditAccount({ ...editAccount, password: e.target.value })} placeholder="••••••" />
              </div>
              <div>
                <Label>Email</Label>
                <Input value={editAccount.email || ""} onChange={e => setEditAccount({ ...editAccount, email: e.target.value })} placeholder="email@example.com" />
              </div>
              <div>
                <Label>Email Password</Label>
                <Input type="password" value={editAccount.email_password || ""} onChange={e => setEditAccount({ ...editAccount, email_password: e.target.value })} placeholder="••••••" />
              </div>
            </div>

            <div className="border-t pt-3">
              <p className="text-sm font-medium mb-2 text-muted-foreground">Proxy Settings</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Host</Label>
                  <Input value={editAccount.proxy_host || ""} onChange={e => setEditAccount({ ...editAccount, proxy_host: e.target.value })} placeholder="us-proxy.example.com" />
                </div>
                <div>
                  <Label>Port</Label>
                  <Input value={editAccount.proxy_port || ""} onChange={e => setEditAccount({ ...editAccount, proxy_port: e.target.value })} placeholder="8080" />
                </div>
                <div>
                  <Label>Username</Label>
                  <Input value={editAccount.proxy_username || ""} onChange={e => setEditAccount({ ...editAccount, proxy_username: e.target.value })} placeholder="proxy_user" />
                </div>
                <div>
                  <Label>Password</Label>
                  <Input type="password" value={editAccount.proxy_password || ""} onChange={e => setEditAccount({ ...editAccount, proxy_password: e.target.value })} placeholder="••••••" />
                </div>
              </div>
            </div>

            <div>
              <Label>Notes</Label>
              <Input value={editAccount.notes || ""} onChange={e => setEditAccount({ ...editAccount, notes: e.target.value })} placeholder="Optional notes..." />
            </div>

            {!isNew && (
              <div>
                <Label>Status</Label>
                <div className="flex gap-2 mt-1">
                  {Object.entries(statusConfig).map(([s, cfg]) => (
                    <Button
                      key={s}
                      variant={editAccount.status === s ? "default" : "outline"}
                      size="sm"
                      onClick={() => setEditAccount({ ...editAccount, status: s })}
                    >
                      {cfg.emoji} {cfg.label}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setEditAccount(null)}>Cancel</Button>
              <Button onClick={handleSave}>{isNew ? "Add Account" : "Save Changes"}</Button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {bulkImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setBulkImport(false)}>
          <div className="bg-card border rounded-xl p-6 w-full max-w-lg mx-4 space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold">Bulk Import Accounts</h2>
            <p className="text-sm text-muted-foreground">One account per line. Format: <code>username,password,email,email_password,host:port:user:pass</code></p>
            <textarea
              className="w-full h-40 rounded-lg bg-secondary border p-3 text-sm font-mono"
              value={bulkText}
              onChange={e => setBulkText(e.target.value)}
              placeholder="ig_user1,pass123,email@gmail.com,emailpass,proxy.com:8080:user:pass"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setBulkImport(false)}>Cancel</Button>
              <Button onClick={handleBulkImport}>Import {bulkText.trim().split("\n").filter(Boolean).length} Accounts</Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog open={!!confirmDeleteId} onOpenChange={(open) => { if (!open) setConfirmDeleteId(null) }} title="Delete Account" description="Delete this outreach account? This cannot be undone." onConfirm={() => confirmDeleteId && handleDelete(confirmDeleteId)} />
      <ConfirmDialog open={!!confirmDeleteVAId} onOpenChange={(open) => { if (!open) setConfirmDeleteVAId(null) }} title="Delete VA" description="Delete this VA session? This cannot be undone." onConfirm={() => confirmDeleteVAId && handleDeleteVA(confirmDeleteVAId)} />

      {/* VA Modal */}
      {vaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setVaModal(null)}>
          <div className="bg-card border rounded-xl p-6 w-full max-w-sm mx-4 space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold">{vaIsNew ? "Add VA" : "Edit VA"}</h2>
            <div>
              <Label>Name</Label>
              <Input value={vaModal.va_name || ""} onChange={e => setVaModal({ ...vaModal, va_name: e.target.value })} placeholder="Maria" />
            </div>
            <div>
              <Label>PIN (4 digits)</Label>
              <Input value={vaModal.pin || ""} onChange={e => setVaModal({ ...vaModal, pin: e.target.value.replace(/\D/g, "").slice(0, 4) })} placeholder="1234" maxLength={4} />
            </div>
            {!vaIsNew && (
              <div className="flex items-center gap-2">
                <Label>Active</Label>
                <Button variant={vaModal.is_active ? "default" : "outline"} size="sm" onClick={() => setVaModal({ ...vaModal, is_active: !vaModal.is_active })}>
                  {vaModal.is_active ? "Active" : "Disabled"}
                </Button>
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setVaModal(null)}>Cancel</Button>
              <Button onClick={handleSaveVA}>{vaIsNew ? "Add VA" : "Save"}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
