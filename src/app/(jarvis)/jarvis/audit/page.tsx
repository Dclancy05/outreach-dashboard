"use client"

/**
 * /jarvis/audit — every change made by any agent or user.
 *
 * Reads /api/jarvis/audit-log (service-role, no browser RLS exposure). Two
 * facet pickers (action, resource) populated from the last 7 days. Click any
 * row to expand its JSON payload. Auto-refresh every 30s.
 */

import { useEffect, useMemo, useState } from "react"
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import { ChevronDown, ChevronRight, FileText, RefreshCw, Search } from "lucide-react"
import { enterJarvis } from "@/components/jarvis/motion/presets"
import { cn } from "@/lib/utils"

type AuditRow = {
  id: number
  user_id: string | null
  action: string | null
  resource: string | null
  payload: any
  ip: string | null
  ua: string | null
  ts: string
}

type Facet = { name: string; count: number }

type ApiResponse = {
  rows: AuditRow[]
  facets: { actions: Facet[]; resources: Facet[] }
  error?: string
}

function fmtTs(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  if (sameDay) {
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
  }
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })
}

function actionTone(action: string | null): "create" | "update" | "delete" | "auth" | "default" {
  if (!action) return "default"
  if (/create|insert|add|new/.test(action)) return "create"
  if (/update|patch|modify|edit/.test(action)) return "update"
  if (/delete|remove|drop/.test(action)) return "delete"
  if (/auth|login|logout|pin/.test(action)) return "auth"
  return "default"
}

const TONE_CLASS: Record<string, string> = {
  create: "text-mem-status-working bg-mem-status-working/10 border-mem-status-working/30",
  update: "text-mem-status-needs bg-mem-status-needs/10 border-mem-status-needs/30",
  delete: "text-mem-status-stuck bg-mem-status-stuck/10 border-mem-status-stuck/30",
  auth: "text-mem-status-thinking bg-mem-status-thinking/10 border-mem-status-thinking/30",
  default: "text-mem-text-secondary bg-mem-surface-3 border-mem-border",
}

export default function JarvisAuditPage() {
  const reduced = useReducedMotion() ?? false
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionFilter, setActionFilter] = useState("")
  const [resourceFilter, setResourceFilter] = useState("")
  const [search, setSearch] = useState("")
  const [expandedId, setExpandedId] = useState<number | null>(null)

  async function refresh() {
    try {
      const params = new URLSearchParams()
      params.set("limit", "200")
      if (actionFilter) params.set("action", actionFilter)
      if (resourceFilter) params.set("resource", resourceFilter)
      const res = await fetch(`/api/jarvis/audit-log?${params}`, { cache: "no-store" })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as ApiResponse
      setData(json)
      setError(null)
    } catch (e: any) {
      setError(e?.message || "fetch failed")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [actionFilter, resourceFilter])

  useEffect(() => {
    const id = setInterval(refresh, 30_000)
    return () => clearInterval(id)
  }, [actionFilter, resourceFilter])

  const filtered = useMemo(() => {
    if (!data?.rows) return []
    if (!search) return data.rows
    const needle = search.toLowerCase()
    return data.rows.filter((r) => {
      return (
        (r.action || "").toLowerCase().includes(needle) ||
        (r.resource || "").toLowerCase().includes(needle) ||
        (r.user_id || "").toLowerCase().includes(needle) ||
        JSON.stringify(r.payload || {})
          .toLowerCase()
          .includes(needle)
      )
    })
  }, [data, search])

  return (
    <motion.div {...enterJarvis} className="mx-auto w-full max-w-[1280px]">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-mem-text-muted">CHANGES</p>
          <h1 className="text-2xl font-medium text-mem-text-primary">Audit Log</h1>
          <p className="mt-1 text-sm text-mem-text-secondary">
            Every change made by an agent, cron, or user. Service-role only — no browser writes.
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded-md border border-mem-border bg-mem-surface-1 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-mem-text-secondary transition hover:bg-mem-surface-2 hover:text-mem-text-primary"
        >
          <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
          Refresh
        </button>
      </header>

      {error ? (
        <div className="mb-4 rounded-xl border border-mem-status-stuck/40 bg-mem-status-stuck/10 p-4 text-sm text-mem-text-primary">
          {error}
        </div>
      ) : null}

      {/* Filters */}
      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mem-text-muted" />
          <input
            type="text"
            placeholder="Search actions, payloads, users…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-mem-border bg-mem-surface-1 px-3 py-2 pl-9 text-sm text-mem-text-primary placeholder:text-mem-text-muted focus:border-mem-accent focus:outline-none"
          />
        </div>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="rounded-md border border-mem-border bg-mem-surface-1 px-3 py-2 text-sm text-mem-text-primary focus:border-mem-accent focus:outline-none"
        >
          <option value="">All actions {data ? `(${data.rows.length})` : ""}</option>
          {data?.facets.actions.map((f) => (
            <option key={f.name} value={f.name}>
              {f.name} ({f.count})
            </option>
          ))}
        </select>
        <select
          value={resourceFilter}
          onChange={(e) => setResourceFilter(e.target.value)}
          className="rounded-md border border-mem-border bg-mem-surface-1 px-3 py-2 text-sm text-mem-text-primary focus:border-mem-accent focus:outline-none"
        >
          <option value="">All resources</option>
          {data?.facets.resources.map((f) => (
            <option key={f.name} value={f.name}>
              {f.name} ({f.count})
            </option>
          ))}
        </select>
      </div>

      {/* Rows */}
      <div className="rounded-xl border border-mem-border bg-mem-surface-1 overflow-hidden">
        {filtered.length === 0 && !loading ? (
          <div className="p-10 text-center text-sm text-mem-text-muted">
            <FileText className="mx-auto mb-2 h-6 w-6 text-mem-text-muted" />
            No audit entries match these filters.
          </div>
        ) : null}
        <ul className="divide-y divide-mem-border">
          {filtered.map((row) => {
            const tone = actionTone(row.action)
            const expanded = expandedId === row.id
            return (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : row.id)}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-2.5 text-left transition",
                    expanded ? "bg-mem-surface-2" : "hover:bg-mem-surface-2",
                  )}
                  aria-expanded={expanded}
                >
                  {expanded ? (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-mem-text-muted" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-mem-text-muted" />
                  )}
                  <span
                    className={cn(
                      "shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider",
                      TONE_CLASS[tone],
                    )}
                  >
                    {row.action || "—"}
                  </span>
                  <span className="truncate text-sm text-mem-text-primary">
                    {row.resource || <span className="text-mem-text-muted">—</span>}
                  </span>
                  <span className="ml-auto shrink-0 font-mono text-[10px] text-mem-text-muted">
                    {row.user_id || "system"} · {fmtTs(row.ts)}
                  </span>
                </button>
                <AnimatePresence>
                  {expanded ? (
                    <motion.div
                      initial={reduced ? false : { height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
                      className="overflow-hidden border-t border-mem-border bg-mem-surface-2"
                    >
                      <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-3">
                        <div>
                          <p className="font-mono text-[10px] uppercase tracking-wider text-mem-text-muted">User</p>
                          <p className="font-mono text-xs text-mem-text-secondary">{row.user_id || "system"}</p>
                        </div>
                        <div>
                          <p className="font-mono text-[10px] uppercase tracking-wider text-mem-text-muted">IP</p>
                          <p className="font-mono text-xs text-mem-text-secondary">{row.ip || "—"}</p>
                        </div>
                        <div>
                          <p className="font-mono text-[10px] uppercase tracking-wider text-mem-text-muted">User Agent</p>
                          <p className="truncate font-mono text-xs text-mem-text-secondary" title={row.ua || ""}>
                            {row.ua || "—"}
                          </p>
                        </div>
                      </div>
                      <pre className="mx-4 mb-4 overflow-x-auto rounded-md border border-mem-border bg-mem-bg p-3 font-mono text-[11px] text-mem-text-secondary">
                        {JSON.stringify(row.payload, null, 2)}
                      </pre>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </li>
            )
          })}
        </ul>
      </div>

      <p className="mt-4 font-mono text-[10px] text-mem-text-muted">
        Audit rows come from the <span className="text-mem-text-secondary">audit_log</span> Supabase table. Service
        role only — never readable from a browser anon/auth role. Auto-refreshes every 30s.
      </p>
    </motion.div>
  )
}
