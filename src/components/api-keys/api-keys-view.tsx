"use client"

import { useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  AlertCircle, CheckCircle, Copy, ExternalLink, KeyRound, Lock, Pencil, Plus, PlugZap,
  RefreshCw, Search, ShieldCheck, Sparkles, Trash2, XCircle, Zap,
} from "lucide-react"
import { toast } from "sonner"
import { findProviderBySlug, CATEGORY_ORDER, type Category } from "@/lib/secrets-catalog"
import { ApiKeyEditModal, type ApiKeyForEdit } from "./api-key-edit-modal"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type ApiKeyShape = {
  id: string
  name: string
  provider: string
  env_var: string
  masked: string
  expires_at: string | null
  last_used_at: string | null
  notes: string | null
  is_expired: boolean
  created_at: string
  updated_at: string
}

type ProbeResult = { ok: boolean; detail?: string; error?: string }

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json())

export function ApiKeysView() {
  const { data, error, isLoading, mutate } = useSWR<{ data: ApiKeyShape[] }>(
    "/api/api-keys",
    fetcher,
  )
  const rows = data?.data ?? []

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<ApiKeyForEdit | null>(null)
  const [seeding, setSeeding] = useState(false)
  const [filter, setFilter] = useState("")
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [testing, setTesting] = useState<Set<string>>(new Set())
  const [testAllRunning, setTestAllRunning] = useState(false)
  const [results, setResults] = useState<Record<string, ProbeResult>>({})

  // Auto-test on mount when rows load (gives instant connect/disconnect status).
  useEffect(() => {
    if (!isLoading && rows.length > 0 && Object.keys(results).length === 0) {
      void runTestAll(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, rows.length])

  const grouped = useMemo(() => {
    const q = filter.trim().toLowerCase()
    const matching = rows.filter((r) => {
      if (!q) return true
      return (
        r.name.toLowerCase().includes(q) ||
        r.env_var.toLowerCase().includes(q) ||
        r.provider.toLowerCase().includes(q) ||
        (r.notes ?? "").toLowerCase().includes(q)
      )
    })
    const map = new Map<Category | "Other", ApiKeyShape[]>()
    for (const cat of CATEGORY_ORDER) map.set(cat, [])
    for (const r of matching) {
      const cat = (findProviderBySlug(r.provider)?.category ?? "Other") as Category | "Other"
      const bucket = map.get(cat) ?? map.set(cat, []).get(cat)!
      bucket.push(r)
    }
    return Array.from(map.entries()).filter(([, items]) => items.length > 0)
  }, [rows, filter])

  const totals = useMemo(() => {
    let connected = 0, failed = 0, untested = 0, expired = 0
    for (const r of rows) {
      if (r.is_expired) { expired++; continue }
      const res = results[r.id]
      if (!res) untested++
      else if (res.ok) connected++
      else failed++
    }
    return { connected, failed, untested, expired }
  }, [rows, results])

  function openAdd() { setEditing(null); setModalOpen(true) }
  function openEdit(row: ApiKeyShape) {
    setEditing({
      id: row.id, name: row.name, provider: row.provider, env_var: row.env_var,
      notes: row.notes, expires_at: row.expires_at,
    })
    setModalOpen(true)
  }

  async function handleSeed() {
    setSeeding(true)
    try {
      const res = await fetch("/api/api-keys/seed", { method: "POST" })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || j.error) throw new Error(j.error || `seed failed: ${res.status}`)
      const inserted = Number(j.inserted) || 0
      const skipped = Number(j.skipped) || 0
      toast.success(inserted > 0 ? `Imported ${inserted} key${inserted === 1 ? "" : "s"}.` : `Nothing to import (${skipped} skipped).`)
      await mutate()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "seed failed")
    } finally { setSeeding(false) }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch("/api/api-keys", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || j.error) throw new Error(j.error || `delete failed: ${res.status}`)
      toast.success("Disconnected")
      setConfirmDelete(null)
      setResults((p) => { const n = { ...p }; delete n[id]; return n })
      await mutate()
    } catch (e) { toast.error(e instanceof Error ? e.message : "delete failed") }
  }

  async function reconnect(row: ApiKeyShape) {
    setTesting((p) => new Set(p).add(row.id))
    try {
      const res = await fetch("/api/api-keys/test", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id }),
      })
      const j = (await res.json()) as ProbeResult
      setResults((p) => ({ ...p, [row.id]: j }))
      if (j.ok) toast.success(`${row.name}: ${j.detail || "connected"}`)
      else toast.error(`${row.name}: ${j.error || "not connected"}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : "test failed"
      setResults((p) => ({ ...p, [row.id]: { ok: false, error: msg } }))
      toast.error(msg)
    } finally {
      setTesting((p) => { const n = new Set(p); n.delete(row.id); return n })
    }
  }

  async function runTestAll(silent = false) {
    setTestAllRunning(true)
    try {
      const res = await fetch("/api/api-keys/test-all", { method: "POST" })
      const j = await res.json()
      if (!res.ok || j.error) throw new Error(j.error || `test-all failed`)
      setResults(j.results || {})
      if (!silent) {
        const ok = Object.values(j.results as Record<string, ProbeResult>).filter((r) => r.ok).length
        const total = Object.keys(j.results || {}).length
        toast.success(`Tested all: ${ok}/${total} connected`)
      }
    } catch (e) {
      if (!silent) toast.error(e instanceof Error ? e.message : "test-all failed")
    } finally { setTestAllRunning(false) }
  }

  async function copyEnvVar(envVar: string) {
    try { await navigator.clipboard.writeText(envVar); toast.success(`Copied ${envVar}`) }
    catch { toast.error("Copy failed") }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-zinc-800/60 flex items-center justify-between gap-2 shrink-0 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <KeyRound className="h-4 w-4 text-amber-400" />
          <h2 className="text-sm font-semibold text-zinc-100">Keys</h2>
          <Badge variant="outline" className="text-[10px]">{rows.length}</Badge>
          {totals.connected > 0 && (
            <Badge variant="outline" className="text-[10px] gap-1 border-emerald-500/30 text-emerald-300">
              <CheckCircle className="h-3 w-3" /> {totals.connected} connected
            </Badge>
          )}
          {totals.failed > 0 && (
            <Badge variant="outline" className="text-[10px] gap-1 border-rose-500/30 text-rose-300">
              <XCircle className="h-3 w-3" /> {totals.failed} failing
            </Badge>
          )}
          {totals.expired > 0 && (
            <Badge variant="outline" className="text-[10px] gap-1 border-amber-500/30 text-amber-300">
              <AlertCircle className="h-3 w-3" /> {totals.expired} expired
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter keys…"
              className="h-8 pl-7 text-xs bg-zinc-900/50 w-44"
            />
          </div>
          <Button size="sm" variant="outline" onClick={() => runTestAll(false)} disabled={testAllRunning || rows.length === 0} className="gap-1.5">
            {testAllRunning ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
            Test all
          </Button>
          <Button size="sm" onClick={openAdd} className="gap-1.5">
            <Plus className="h-4 w-4" /> Add API key
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-5">
        <SystemKeysSection />

        {error && <div className="text-rose-400 text-sm">Couldn&apos;t load API keys: {String(error)}</div>}
        {isLoading && <div className="text-zinc-500 text-sm">Loading…</div>}

        {!isLoading && rows.length === 0 && (
          <div className="border border-dashed border-zinc-800 rounded-lg p-6 text-center space-y-3">
            <Sparkles className="h-6 w-6 mx-auto text-amber-400" />
            <div className="text-sm text-zinc-200">
              We can pull every key you already have set in your environment so you don&apos;t have to re-paste them.
            </div>
            <div className="flex justify-center gap-2">
              <Button onClick={handleSeed} disabled={seeding} className="gap-1.5">
                {seeding ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                Import existing keys
              </Button>
              <Button variant="outline" onClick={openAdd}>Add one manually</Button>
            </div>
            <p className="text-[11px] text-zinc-500">Import is safe to run more than once — it skips anything already added.</p>
          </div>
        )}

        {grouped.map(([cat, items]) => {
          // Within each category, group by provider slug — providers with >1 row
          // (e.g. Supabase has URL+Anon+Admin, Kling has Access+Secret) render
          // as one expandable card with internal tabs.
          const byProvider = new Map<string, ApiKeyShape[]>()
          for (const r of items) {
            const arr = byProvider.get(r.provider) ?? byProvider.set(r.provider, []).get(r.provider)!
            arr.push(r)
          }
          return (
          <section key={cat} className="space-y-2">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-zinc-500">
              <span>{cat}</span>
              <span className="text-zinc-700">·</span>
              <span>{items.length}</span>
              <div className="flex-1 h-px bg-zinc-800/60" />
            </div>
            {Array.from(byProvider.entries()).map(([slug, rs]) =>
              rs.length > 1 ? (
                <ProviderGroupCard
                  key={slug}
                  rows={rs}
                  results={results}
                  testing={testing}
                  onReconnect={reconnect}
                  onEdit={openEdit}
                  onAskDelete={(id) => setConfirmDelete(id)}
                  onCancelDelete={() => setConfirmDelete(null)}
                  onConfirmDelete={handleDelete}
                  confirmDeleteId={confirmDelete}
                  onCopyEnvVar={copyEnvVar}
                />
              ) : (
              <KeyRow
                key={rs[0].id}
                row={rs[0]}
                result={results[rs[0].id]}
                testing={testing.has(rs[0].id)}
                confirmDelete={confirmDelete === rs[0].id}
                onCopyEnvVar={() => copyEnvVar(rs[0].env_var)}
                onReconnect={() => reconnect(rs[0])}
                onEdit={() => openEdit(rs[0])}
                onAskDelete={() => setConfirmDelete(rs[0].id)}
                onCancelDelete={() => setConfirmDelete(null)}
                onConfirmDelete={() => handleDelete(rs[0].id)}
              />
              ),
            )}
          </section>
          )
        })}
      </div>

      <ApiKeyEditModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        initial={editing}
        onSaved={async (saved) => {
          await mutate()
          // The save endpoint runs a probe — fold the result into our local state so
          // the connect/disconnect badge updates within seconds.
          if (saved?.id && saved.probe) {
            setResults((p) => ({ ...p, [saved.id!]: saved.probe! }))
          }
        }}
      />
    </div>
  )
}

interface ProviderGroupCardProps {
  rows: ApiKeyShape[]
  results: Record<string, ProbeResult>
  testing: Set<string>
  confirmDeleteId: string | null
  onReconnect: (row: ApiKeyShape) => void
  onEdit: (row: ApiKeyShape) => void
  onAskDelete: (id: string) => void
  onCancelDelete: () => void
  onConfirmDelete: (id: string) => void
  onCopyEnvVar: (envVar: string) => void
}

/**
 * Multi-key provider card — folds 2+ rows that share a provider slug into
 * one outer card with internal mini-tabs (one tab per env_var). Used for
 * Supabase (URL/Anon/Admin), Kling (Access/Secret), GHL (Key/Location), etc.
 */
function ProviderGroupCard(p: ProviderGroupCardProps) {
  const [activeTab, setActiveTab] = useState(p.rows[0].env_var)
  const provider = findProviderBySlug(p.rows[0].provider)
  const active = p.rows.find((r) => r.env_var === activeTab) ?? p.rows[0]
  const activeResult = p.results[active.id]
  const activeStatus = deriveStatus(active, activeResult)

  // Summary status across all keys: connected if every key is connected.
  let okCount = 0, failCount = 0, untestedCount = 0
  for (const r of p.rows) {
    const res = p.results[r.id]
    if (!res) untestedCount++
    else if (res.ok) okCount++
    else failCount++
  }

  return (
    <div className="border border-zinc-800/60 rounded-lg bg-zinc-900/40 hover:bg-zinc-900/70 transition-colors overflow-hidden">
      <div className="flex items-start gap-3 p-3">
        <div className="text-2xl leading-none mt-0.5 shrink-0">{provider?.emoji ?? "🔑"}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-zinc-100 truncate">{provider?.label ?? p.rows[0].provider}</span>
            <Badge variant="outline" className="text-[10px]">{p.rows.length} keys</Badge>
            {okCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] border-emerald-500/30 text-emerald-300 bg-emerald-500/10">
                <CheckCircle className="h-3 w-3" /> {okCount}/{p.rows.length} connected
              </span>
            )}
            {failCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] border-rose-500/30 text-rose-300 bg-rose-500/10">
                <XCircle className="h-3 w-3" /> {failCount} failing
              </span>
            )}
            {untestedCount > 0 && okCount === 0 && failCount === 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] border-zinc-700 text-zinc-400 bg-zinc-900/40">
                <AlertCircle className="h-3 w-3" /> untested
              </span>
            )}
          </div>
          {provider?.help && (
            <p className="mt-1 text-[11px] text-zinc-400">{provider.help}</p>
          )}
          {provider?.href && (
            <a
              href={provider.href}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-0.5 text-[11px] text-amber-300/70 hover:text-amber-200"
            >
              where to get these <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>

      {/* Mini-tabs — one per env_var */}
      <div className="border-t border-zinc-800/60 px-3 pt-2 pb-1 flex flex-wrap gap-1 bg-zinc-950/40">
        {p.rows.map((r) => {
          const res = p.results[r.id]
          const isActive = r.env_var === activeTab
          const indicator = res ? (res.ok ? "🟢" : "🔴") : "⚪"
          return (
            <button
              key={r.env_var}
              onClick={() => setActiveTab(r.env_var)}
              className={cn(
                "text-[11px] font-mono px-2 py-1 rounded-t border-b-2 transition-colors",
                isActive
                  ? "border-amber-400 text-amber-200 bg-zinc-900"
                  : "border-transparent text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900/60",
              )}
              title={r.name}
            >
              {indicator} {tabShortLabel(r.env_var)}
            </button>
          )
        })}
      </div>

      {/* Active tab body */}
      <div className="p-3 border-t border-zinc-800/60">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-zinc-100 truncate">{active.name}</span>
              <StatusBadge status={activeStatus} testing={p.testing.has(active.id)} />
            </div>
            <div className="mt-1 flex items-center gap-3 flex-wrap text-[11px] text-zinc-500">
              <button
                onClick={() => p.onCopyEnvVar(active.env_var)}
                className="font-mono inline-flex items-center gap-1 hover:text-amber-300 transition-colors"
                title="Copy env var name"
              >
                {active.env_var}
                <Copy className="h-3 w-3 opacity-60" />
              </button>
              <span className="font-mono">{active.masked}</span>
              <span>used {relativeTime(active.last_used_at)}</span>
            </div>
            {active.notes && <p className="mt-1 text-[11px] text-zinc-400">{active.notes}</p>}
            {activeResult && !p.testing.has(active.id) && (
              <p className={cn("mt-1 text-[11px]", activeResult.ok ? "text-emerald-400" : "text-rose-400")}>
                {activeResult.ok ? activeResult.detail || "Connected" : activeResult.error || "Not connected"}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {p.confirmDeleteId === active.id ? (
              <>
                <Button size="sm" variant="destructive" onClick={() => p.onConfirmDelete(active.id)} className="h-7 px-2 text-xs">
                  Disconnect
                </Button>
                <Button size="sm" variant="ghost" onClick={p.onCancelDelete} className="h-7 px-2 text-xs">Cancel</Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="ghost" onClick={() => p.onReconnect(active)} disabled={p.testing.has(active.id)} className="h-7 px-2 gap-1 text-xs">
                  {p.testing.has(active.id) ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <PlugZap className="h-3.5 w-3.5" />}
                  {activeResult?.ok ? "Reconnect" : activeResult ? "Retry" : "Connect"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => p.onEdit(active)} className="h-7 px-2 gap-1 text-xs" title="Edit">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => p.onAskDelete(active.id)} className="h-7 px-2 text-zinc-500 hover:text-rose-400" title="Disconnect (delete row)">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Strip a common provider prefix to make the tab label compact: "SUPABASE_SERVICE_ROLE_KEY" → "service-role". */
function tabShortLabel(envVar: string): string {
  // Drop leading "NEXT_PUBLIC_", drop common provider prefixes, lowercase the rest.
  let s = envVar.replace(/^NEXT_PUBLIC_/, "")
  s = s.replace(/^(SUPABASE_|KLING_|GHL_|TELEGRAM_|BRAVE_|GOOGLE_|MICROSOFT_|META_|APIFY_|VNC_|MEMORY_VAULT_|CLAUDE_BRIDGE_|AGENT_RUNNER_|INNGEST_)/, "")
  return s.toLowerCase().replace(/_/g, "-") || envVar.toLowerCase()
}

interface KeyRowProps {
  row: ApiKeyShape
  result: ProbeResult | undefined
  testing: boolean
  confirmDelete: boolean
  onCopyEnvVar: () => void
  onReconnect: () => void
  onEdit: () => void
  onAskDelete: () => void
  onCancelDelete: () => void
  onConfirmDelete: () => void
}

function KeyRow(p: KeyRowProps) {
  const provider = findProviderBySlug(p.row.provider)
  const status = deriveStatus(p.row, p.result)
  const expiry = expirationLabel(p.row)
  return (
    <div className="border border-zinc-800/60 rounded-lg p-3 bg-zinc-900/40 hover:bg-zinc-900/70 transition-colors">
      <div className="flex items-start gap-3">
        <div className="text-2xl leading-none mt-0.5 shrink-0">{provider?.emoji ?? "🔑"}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-zinc-100 truncate">{p.row.name}</span>
            <StatusBadge status={status} testing={p.testing} />
            {expiry && <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px]", expiry.tone)}>{expiry.label}</span>}
          </div>
          <div className="mt-1 flex items-center gap-3 flex-wrap text-[11px] text-zinc-500">
            <button
              onClick={p.onCopyEnvVar}
              className="font-mono inline-flex items-center gap-1 hover:text-amber-300 transition-colors"
              title="Copy env var name"
            >
              {p.row.env_var}
              <Copy className="h-3 w-3 opacity-60" />
            </button>
            <span className="font-mono">{p.row.masked}</span>
            <span>used {relativeTime(p.row.last_used_at)}</span>
            {provider?.href && (
              <a
                href={provider.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 text-amber-300/70 hover:text-amber-200"
                title="Where to get this key"
              >
                where to get this <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          {p.row.notes && <p className="mt-1 text-[11px] text-zinc-400">{p.row.notes}</p>}
          {p.result && !p.testing && (
            <p className={cn("mt-1 text-[11px]", p.result.ok ? "text-emerald-400" : "text-rose-400")}>
              {p.result.ok ? p.result.detail || "Connected" : p.result.error || "Not connected"}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {p.confirmDelete ? (
            <>
              <Button size="sm" variant="destructive" onClick={p.onConfirmDelete} className="h-7 px-2 text-xs">
                Disconnect
              </Button>
              <Button size="sm" variant="ghost" onClick={p.onCancelDelete} className="h-7 px-2 text-xs">
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={p.onReconnect}
                disabled={p.testing}
                className="h-7 px-2 gap-1 text-xs"
                title="Live-test this key"
              >
                {p.testing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <PlugZap className="h-3.5 w-3.5" />}
                {p.result?.ok ? "Reconnect" : p.result ? "Retry" : "Connect"}
              </Button>
              <Button size="sm" variant="ghost" onClick={p.onEdit} className="h-7 px-2 gap-1 text-xs" title="Edit">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={p.onAskDelete}
                className="h-7 px-2 text-zinc-500 hover:text-rose-400"
                title="Disconnect (delete row)"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

type Status = "connected" | "failed" | "untested" | "expired" | "no-value"

function deriveStatus(row: ApiKeyShape, result: ProbeResult | undefined): Status {
  if (row.is_expired) return "expired"
  if (!row.masked) return "no-value"
  if (!result) return "untested"
  return result.ok ? "connected" : "failed"
}

function StatusBadge({ status, testing }: { status: Status; testing: boolean }) {
  if (testing) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] border-zinc-700 text-zinc-300 bg-zinc-800/50">
        <RefreshCw className="h-3 w-3 animate-spin" /> Testing…
      </span>
    )
  }
  const cfg: Record<Status, { label: string; tone: string; Icon: typeof CheckCircle }> = {
    connected: { label: "Connected", tone: "border-emerald-500/30 text-emerald-300 bg-emerald-500/10", Icon: CheckCircle },
    failed:    { label: "Not connected", tone: "border-rose-500/30 text-rose-300 bg-rose-500/10", Icon: XCircle },
    untested:  { label: "Untested", tone: "border-zinc-700 text-zinc-400 bg-zinc-900/40", Icon: AlertCircle },
    expired:   { label: "Expired", tone: "border-amber-500/30 text-amber-300 bg-amber-500/10", Icon: AlertCircle },
    "no-value": { label: "No value", tone: "border-zinc-700 text-zinc-500 bg-zinc-900/40", Icon: AlertCircle },
  }
  const c = cfg[status]
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px]", c.tone)}>
      <c.Icon className="h-3 w-3" /> {c.label}
    </span>
  )
}

function expirationLabel(row: ApiKeyShape): { label: string; tone: string } | null {
  if (!row.expires_at) return null
  if (row.is_expired) return null   // already shown via status badge
  const days = Math.max(0, Math.floor((new Date(row.expires_at).getTime() - Date.now()) / 86_400_000))
  const tone =
    days <= 7 ? "bg-rose-500/15 text-rose-300 border-rose-500/30"
    : days <= 30 ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
    : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
  return { label: `Expires in ${days}d`, tone }
}

interface SystemRow {
  env: string
  label: string
  emoji: string
  category: "System" | "AI / MCP" | "Storage"
  help: string
  href?: string
  set: boolean
  preview: string | null
}

/** Group key for the System & Bootstrap section — folds related env vars
 *  (e.g. all Supabase variants) onto one card with internal tabs. */
function systemGroupKey(env: string): { slug: string; label: string; emoji: string } {
  if (/^(NEXT_PUBLIC_)?SUPABASE/.test(env)) return { slug: "supabase", label: "Supabase", emoji: "🗄️" }
  if (env === "OUTREACH_MEMORY_MCP_KEY") return { slug: "memory_mcp", label: "Memory MCP", emoji: "🧠" }
  return { slug: "system_runtime", label: "System runtime", emoji: "⚙️" }
}

function SystemKeysSection() {
  const { data, isLoading } = useSWR<{ rows: SystemRow[] }>("/api/api-keys/system-status", fetcher)
  const rows = data?.rows ?? []
  if (isLoading || rows.length === 0) return null

  // Group by virtual provider so e.g. all 3 Supabase env vars become one card.
  const groups = new Map<string, { label: string; emoji: string; rows: SystemRow[] }>()
  for (const r of rows) {
    const k = systemGroupKey(r.env)
    const g = groups.get(k.slug) ?? groups.set(k.slug, { label: k.label, emoji: k.emoji, rows: [] }).get(k.slug)!
    g.rows.push(r)
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-zinc-500">
        <ShieldCheck className="h-3.5 w-3.5 text-amber-400/70" />
        <span>System & Bootstrap</span>
        <span className="text-zinc-700">·</span>
        <span>{rows.length}</span>
        <Badge variant="outline" className="text-[10px] gap-1 border-zinc-700 text-zinc-400 ml-1">
          <Lock className="h-2.5 w-2.5" /> managed in Vercel env
        </Badge>
        <div className="flex-1 h-px bg-zinc-800/60" />
      </div>
      <div className="space-y-2">
        {Array.from(groups.entries()).map(([slug, g]) => (
          g.rows.length > 1
            ? <SystemGroupCard key={slug} label={g.label} emoji={g.emoji} rows={g.rows} />
            : <SystemSingleRow key={slug} row={g.rows[0]} />
        ))}
      </div>
      <p className="text-[11px] text-zinc-500 px-1">
        These are loaded directly from Vercel environment variables and can&apos;t be changed from this UI — open Vercel → Project → Settings → Environment Variables to rotate one.
      </p>
    </section>
  )
}

function SystemSingleRow({ row }: { row: SystemRow }) {
  return (
    <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/30 flex items-start gap-3 p-3">
      <div className="text-xl leading-none mt-0.5 shrink-0">{row.emoji}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-zinc-100 truncate">{row.label}</span>
          <Badge variant="outline" className="text-[10px]">{row.category}</Badge>
          <SystemSetBadge set={row.set} />
        </div>
        <div className="mt-1 flex items-center gap-3 flex-wrap text-[11px] text-zinc-500">
          <span className="font-mono">{row.env}</span>
          {row.preview && <span className="font-mono">{row.preview}</span>}
        </div>
        <p className="mt-1 text-[11px] text-zinc-400">{row.help}</p>
      </div>
    </div>
  )
}

function SystemGroupCard({ label, emoji, rows }: { label: string; emoji: string; rows: SystemRow[] }) {
  const [activeEnv, setActiveEnv] = useState(rows[0].env)
  const active = rows.find((r) => r.env === activeEnv) ?? rows[0]
  const setCount = rows.filter((r) => r.set).length

  return (
    <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/30 overflow-hidden">
      <div className="flex items-start gap-3 p-3">
        <div className="text-xl leading-none mt-0.5 shrink-0">{emoji}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-zinc-100 truncate">{label}</span>
            <Badge variant="outline" className="text-[10px]">{rows.length} keys</Badge>
            {setCount === rows.length ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] border-emerald-500/30 text-emerald-300 bg-emerald-500/10">
                <CheckCircle className="h-3 w-3" /> all set
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] border-amber-500/30 text-amber-300 bg-amber-500/10">
                <AlertCircle className="h-3 w-3" /> {setCount}/{rows.length} set
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="border-t border-zinc-800/60 px-3 pt-2 pb-1 flex flex-wrap gap-1 bg-zinc-950/40">
        {rows.map((r) => {
          const isActive = r.env === activeEnv
          const indicator = r.set ? "🟢" : "🔴"
          return (
            <button
              key={r.env}
              onClick={() => setActiveEnv(r.env)}
              className={cn(
                "text-[11px] font-mono px-2 py-1 rounded-t border-b-2 transition-colors",
                isActive
                  ? "border-amber-400 text-amber-200 bg-zinc-900"
                  : "border-transparent text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900/60",
              )}
              title={r.label}
            >
              {indicator} {tabShortLabel(r.env)}
            </button>
          )
        })}
      </div>
      <div className="p-3 border-t border-zinc-800/60">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="text-sm font-medium text-zinc-100 truncate">{active.label}</span>
          <SystemSetBadge set={active.set} />
        </div>
        <div className="flex items-center gap-3 flex-wrap text-[11px] text-zinc-500">
          <span className="font-mono">{active.env}</span>
          {active.preview && <span className="font-mono">{active.preview}</span>}
        </div>
        <p className="mt-1 text-[11px] text-zinc-400">{active.help}</p>
      </div>
    </div>
  )
}

function SystemSetBadge({ set }: { set: boolean }) {
  return set ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] border-emerald-500/30 text-emerald-300 bg-emerald-500/10">
      <CheckCircle className="h-3 w-3" /> Set in env
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] border-rose-500/30 text-rose-300 bg-rose-500/10">
      <XCircle className="h-3 w-3" /> Missing
    </span>
  )
}

function relativeTime(iso: string | null): string {
  if (!iso) return "never"
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return "just now"
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`
  return `${Math.floor(ms / 86_400_000)}d ago`
}
