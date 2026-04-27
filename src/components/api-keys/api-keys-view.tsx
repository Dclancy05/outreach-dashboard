"use client"

import { useEffect, useState } from "react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  AlertCircle,
  CheckCircle,
  KeyRound,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Zap,
} from "lucide-react"
import { toast } from "sonner"
import { findProviderBySlug } from "@/lib/secrets-catalog"
import { ApiKeyEditModal, type ApiKeyForEdit } from "./api-key-edit-modal"

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

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json())

function expirationBadge(row: ApiKeyShape) {
  if (!row.expires_at) {
    return <Badge variant="outline" className="text-[10px]">Never expires</Badge>
  }
  if (row.is_expired) {
    return (
      <Badge variant="destructive" className="text-[10px] gap-1">
        <AlertCircle className="h-3 w-3" /> Expired
      </Badge>
    )
  }
  const days = Math.max(
    0,
    Math.floor((new Date(row.expires_at).getTime() - Date.now()) / 86_400_000)
  )
  const tone =
    days <= 7
      ? "bg-rose-500/15 text-rose-300 border-rose-500/30"
      : days <= 30
      ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
      : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] ${tone}`}
    >
      Expires in {days}d
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

export function ApiKeysView() {
  const { data, error, isLoading, mutate } = useSWR<{ data: ApiKeyShape[] }>(
    "/api/api-keys",
    fetcher
  )
  const rows = data?.data ?? []

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<ApiKeyForEdit | null>(null)
  const [seeding, setSeeding] = useState(false)
  const [seeded, setSeeded] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [testing, setTesting] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<
    Record<string, { ok: boolean; message: string }>
  >({})

  // If table is empty on first load, prompt to import.
  useEffect(() => {
    if (!isLoading && rows.length === 0 && !seeded) {
      // No-op; UI shows the import banner when rows is empty.
    }
  }, [isLoading, rows.length, seeded])

  function openAdd() {
    setEditing(null)
    setModalOpen(true)
  }

  function openEdit(row: ApiKeyShape) {
    setEditing({
      id: row.id,
      name: row.name,
      provider: row.provider,
      env_var: row.env_var,
      notes: row.notes,
      expires_at: row.expires_at,
    })
    setModalOpen(true)
  }

  async function handleSeed() {
    setSeeding(true)
    try {
      const res = await fetch("/api/api-keys/seed", { method: "POST" })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || j.error) {
        throw new Error(j.error || `seed failed: ${res.status}`)
      }
      const inserted = Number(j.inserted) || 0
      const skipped = Number(j.skipped) || 0
      toast.success(
        inserted > 0
          ? `Imported ${inserted} key${inserted === 1 ? "" : "s"}.`
          : `Nothing to import (${skipped} skipped).`
      )
      setSeeded(true)
      await mutate()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "seed failed"
      toast.error(msg)
    } finally {
      setSeeding(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || j.error) throw new Error(j.error || `delete failed: ${res.status}`)
      toast.success("Key deleted")
      setConfirmDelete(null)
      await mutate()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "delete failed"
      toast.error(msg)
    }
  }

  async function handleTest(id: string, label: string) {
    setTesting(id)
    setTestResults((p) => {
      const next = { ...p }
      delete next[id]
      return next
    })
    try {
      const res = await fetch("/api/api-keys/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })
      const j = await res.json().catch(() => ({}))
      const ok = Boolean(j?.ok)
      const message = ok
        ? j?.detail || "OK"
        : j?.error || (res.ok ? "test failed" : `${res.status}`)
      setTestResults((p) => ({ ...p, [id]: { ok, message } }))
      if (ok) toast.success(`${label}: ${message}`)
      else toast.error(`${label}: ${message}`)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "test failed"
      setTestResults((p) => ({ ...p, [id]: { ok: false, message: msg } }))
      toast.error(msg)
    } finally {
      setTesting(null)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-zinc-800/60 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-amber-400" />
          <h2 className="text-sm font-semibold text-zinc-100">API Keys</h2>
          <Badge variant="outline" className="text-[10px]">
            {rows.length}
          </Badge>
        </div>
        <Button size="sm" onClick={openAdd} className="gap-1.5">
          <Plus className="h-4 w-4" />
          Add API key
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-3">
        {error && (
          <div className="text-rose-400 text-sm">
            Couldn&apos;t load API keys: {String(error)}
          </div>
        )}

        {isLoading && (
          <div className="text-zinc-500 text-sm">Loading…</div>
        )}

        {!isLoading && rows.length === 0 && (
          <div className="border border-dashed border-zinc-800 rounded-lg p-6 text-center space-y-3">
            <Sparkles className="h-6 w-6 mx-auto text-amber-400" />
            <div className="text-sm text-zinc-200">
              We can pull every key you already have set in your environment so
              you don&apos;t have to re-paste them.
            </div>
            <div className="flex justify-center gap-2">
              <Button onClick={handleSeed} disabled={seeding} className="gap-1.5">
                {seeding ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                Import existing keys
              </Button>
              <Button variant="outline" onClick={openAdd}>
                Add one manually
              </Button>
            </div>
            <p className="text-[11px] text-zinc-500">
              Import is safe to run more than once — it skips anything already added.
            </p>
          </div>
        )}

        {rows.map((row) => {
          const provider = findProviderBySlug(row.provider)
          const result = testResults[row.id]
          return (
            <div
              key={row.id}
              className="border border-zinc-800/60 rounded-lg p-3 bg-zinc-900/40 hover:bg-zinc-900/70 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className="text-2xl leading-none mt-0.5">
                  {provider?.emoji ?? "🔑"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-zinc-100 truncate">
                      {row.name}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {provider?.label ?? row.provider}
                    </Badge>
                    {row.is_expired ? (
                      expirationBadge(row)
                    ) : row.masked ? (
                      <Badge variant="success" className="gap-1 text-[10px]">
                        <CheckCircle className="h-3 w-3" /> Set
                      </Badge>
                    ) : null}
                  </div>
                  <div className="mt-1 flex items-center gap-3 flex-wrap text-[11px] text-zinc-500">
                    <span className="font-mono">{row.env_var}</span>
                    <span className="font-mono">{row.masked}</span>
                    <span>used {relativeTime(row.last_used_at)}</span>
                    {expirationBadge(row)}
                  </div>
                  {row.notes && (
                    <p className="mt-1 text-[11px] text-zinc-400">{row.notes}</p>
                  )}
                  {result && (
                    <p
                      className={`mt-1 text-[11px] ${
                        result.ok ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {result.message}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {confirmDelete === row.id ? (
                    <>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDelete(row.id)}
                        className="h-7 px-2 text-xs"
                      >
                        Delete
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmDelete(null)}
                        className="h-7 px-2 text-xs"
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleTest(row.id, row.name)}
                        disabled={testing === row.id}
                        className="h-7 px-2 gap-1 text-xs"
                        title="Live-test this key"
                      >
                        {testing === row.id ? (
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Zap className="h-3.5 w-3.5" />
                        )}
                        Test
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openEdit(row)}
                        className="h-7 px-2 gap-1 text-xs"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmDelete(row.id)}
                        className="h-7 px-2 text-zinc-500 hover:text-rose-400"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <ApiKeyEditModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        initial={editing}
        onSaved={() => mutate()}
      />
    </div>
  )
}
