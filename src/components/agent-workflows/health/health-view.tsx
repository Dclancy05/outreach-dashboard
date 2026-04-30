"use client"

/**
 * Jarvis Health Panel.
 *
 * Renders /api/jarvis/status as a checklist with one-click "fix" buttons for
 * the things the dashboard can fix on its own (register webhook, seed
 * workflows, sweep stuck runs). Things requiring infra access (deploying the
 * VPS agent-runner, setting secrets) are flagged with a hint instead.
 *
 * Auto-refreshes after every action. Manual Refresh button + 30s polling
 * keep it live without spamming the backend.
 */
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import {
  CheckCircle2,
  XCircle,
  RefreshCw,
  Loader2,
  Webhook,
  Database,
  Server,
  KeyRound,
  Activity,
  AlertTriangle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface CheckResult {
  ok: boolean
  detail?: string
  meta?: Record<string, unknown>
}

interface StatusResponse {
  ok: boolean
  checked_at: string
  checks: {
    secrets: CheckResult
    webhook: CheckResult
    agent_runner: CheckResult
    workflows: CheckResult
    runs_24h: CheckResult
  }
}

type ActionKey = "register" | "seed" | "sweep" | null

export function HealthView() {
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<ActionKey>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/jarvis/status", { cache: "no-store" })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const j = (await res.json()) as StatusResponse
      setStatus(j)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
    const id = setInterval(fetchStatus, 30_000)
    return () => clearInterval(id)
  }, [fetchStatus])

  const runAction = useCallback(
    async (key: Exclude<ActionKey, null>, url: string, label: string) => {
      setBusy(key)
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok || body.ok === false) {
          throw new Error(body.error || body.detail || `HTTP ${res.status}`)
        }
        toast.success(`${label} — done`, {
          description:
            key === "seed"
              ? `${body.inserted} inserted, ${body.updated} updated`
              : key === "register"
              ? `Telegram now posts to ${body.registered_url}`
              : key === "sweep"
              ? `Examined ${body.examined}, swept ${body.swept}`
              : undefined,
        })
        await fetchStatus()
      } catch (err) {
        toast.error(`${label} failed`, {
          description: err instanceof Error ? err.message : String(err),
        })
      } finally {
        setBusy(null)
      }
    },
    [fetchStatus],
  )

  if (loading && !status) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-zinc-500">
        <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading Jarvis health…
      </div>
    )
  }

  if (error && !status) {
    return (
      <div className="p-6 text-sm">
        <div className="text-red-400 font-medium mb-1">Couldn&apos;t load Jarvis status</div>
        <div className="text-xs text-zinc-400 break-all">{error}</div>
        <Button size="sm" variant="ghost" className="mt-3" onClick={fetchStatus}>
          <RefreshCw className="w-3 h-3 mr-1" /> Retry
        </Button>
      </div>
    )
  }

  if (!status) return null

  const { checks } = status
  const allGreen = status.ok

  return (
    <div className="p-4 sm:p-6 overflow-y-auto h-full">
      <div className="max-w-3xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
              {allGreen ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              )}
              Jarvis Health
            </h2>
            <div className="text-xs text-zinc-500 mt-0.5">
              Last checked {new Date(status.checked_at).toLocaleTimeString()}
              {allGreen ? " — everything's green ✅" : " — some things need attention"}
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="text-zinc-400 hover:text-zinc-100"
            onClick={fetchStatus}
            disabled={busy !== null}
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Secrets */}
        <CheckRow
          icon={<KeyRound className="w-4 h-4" />}
          title="Required secrets"
          result={checks.secrets}
        >
          {!checks.secrets.ok && (
            <div className="text-xs text-zinc-500 mt-2">
              Add the missing secrets in the <a href="#api-keys" className="underline text-amber-300">Keys tab</a>, then refresh.
              {(() => {
                const missing = (checks.secrets.meta?.missing || []) as string[]
                return missing.length > 0 ? (
                  <ul className="mt-1 space-y-0.5 ml-4 list-disc text-zinc-400">
                    {missing.map((k) => (
                      <li key={k}><code className="bg-zinc-800/60 px-1 rounded">{k}</code></li>
                    ))}
                  </ul>
                ) : null
              })()}
            </div>
          )}
        </CheckRow>

        {/* Webhook */}
        <CheckRow
          icon={<Webhook className="w-4 h-4" />}
          title="Telegram webhook"
          result={checks.webhook}
        >
          <div className="flex flex-col gap-2 mt-2">
            {(() => {
              const meta = checks.webhook.meta as
                | { url?: string; pending_updates?: number; last_error_message?: string }
                | undefined
              return (
                <>
                  {meta?.url && (
                    <div className="text-[11px] text-zinc-500 break-all">
                      → <code className="bg-zinc-800/60 px-1 rounded">{meta.url}</code>
                    </div>
                  )}
                  {typeof meta?.pending_updates === "number" && meta.pending_updates > 0 && (
                    <div className="text-[11px] text-amber-400">
                      {meta.pending_updates} update(s) pending delivery — usually means the bot
                      received messages while the webhook was offline. They&apos;ll drain on next /start.
                    </div>
                  )}
                </>
              )
            })()}
            <div>
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null || !checks.secrets.ok}
                onClick={() =>
                  runAction("register", "/api/jarvis/register-webhook", "Register webhook")
                }
              >
                {busy === "register" ? (
                  <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Registering…</>
                ) : (
                  <>{checks.webhook.ok ? "Re-register" : "Register webhook"}</>
                )}
              </Button>
              {!checks.secrets.ok && (
                <span className="ml-2 text-[11px] text-zinc-500">
                  Add the required secrets first.
                </span>
              )}
            </div>
          </div>
        </CheckRow>

        {/* Agent runner */}
        <CheckRow
          icon={<Server className="w-4 h-4" />}
          title="VPS agent-runner"
          result={checks.agent_runner}
        >
          {!checks.agent_runner.ok && (
            <div className="text-xs text-zinc-500 mt-2 space-y-1">
              <div>This needs SSH access to fix — Jarvis can&apos;t restart it from the dashboard.</div>
              <div className="text-zinc-400">
                On the VPS:{" "}
                <code className="bg-zinc-800/60 px-1 rounded">systemctl status agent-runner</code>{" "}
                and{" "}
                <code className="bg-zinc-800/60 px-1 rounded">journalctl -u agent-runner -n 50</code>
              </div>
            </div>
          )}
        </CheckRow>

        {/* Workflows */}
        <CheckRow
          icon={<Database className="w-4 h-4" />}
          title="Seeded workflows"
          result={checks.workflows}
        >
          <div className="flex items-center gap-3 mt-2">
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() => runAction("seed", "/api/jarvis/seed-workflows", "Seed workflows")}
            >
              {busy === "seed" ? (
                <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Seeding…</>
              ) : (
                <>{checks.workflows.ok ? "Re-seed" : "Seed missing workflows"}</>
              )}
            </Button>
            {(() => {
              const expected = (checks.workflows.meta?.expected as number) ?? 0
              const present = (checks.workflows.meta?.present as number) ?? 0
              return (
                <span className="text-[11px] text-zinc-500">
                  {present} / {expected} present
                </span>
              )
            })()}
          </div>
        </CheckRow>

        {/* Runs */}
        <CheckRow
          icon={<Activity className="w-4 h-4" />}
          title="Runs (last 24h)"
          result={checks.runs_24h}
        >
          {(() => {
            const meta = checks.runs_24h.meta as
              | { total?: number; by_status?: Record<string, number>; stuck?: number }
              | undefined
            return (
              <div className="flex flex-col gap-2 mt-2">
                {meta?.by_status && Object.keys(meta.by_status).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(meta.by_status).map(([status, n]) => (
                      <Badge
                        key={status}
                        variant="secondary"
                        className="text-[10px] uppercase tracking-wider"
                      >
                        {status}: {n}
                      </Badge>
                    ))}
                  </div>
                )}
                {meta?.stuck != null && meta.stuck > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy !== null}
                    onClick={() => runAction("sweep", "/api/jarvis/sweep-stuck", "Sweep stuck runs")}
                  >
                    {busy === "sweep" ? (
                      <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Sweeping…</>
                    ) : (
                      <>Clean up {meta.stuck} stuck run{meta.stuck === 1 ? "" : "s"}</>
                    )}
                  </Button>
                )}
              </div>
            )
          })()}
        </CheckRow>

        {/* Help */}
        <Card className="p-4 bg-zinc-900/40 border-zinc-800/60">
          <div className="text-xs font-medium text-zinc-300 mb-2">
            Quick commands to test from your phone
          </div>
          <ul className="text-xs text-zinc-500 space-y-1">
            <li>• <code className="bg-zinc-800/60 px-1 rounded">/start</code> — friendly hello + command list</li>
            <li>• <code className="bg-zinc-800/60 px-1 rounded">/help</code> — full reference</li>
            <li>• Just text — Quick Ask (single Claude reply, ~10–30s)</li>
            <li>• <code className="bg-zinc-800/60 px-1 rounded">/build &lt;feature&gt;</code> · <code className="bg-zinc-800/60 px-1 rounded">/fix &lt;bug&gt;</code> · <code className="bg-zinc-800/60 px-1 rounded">/test &lt;path&gt;</code> · <code className="bg-zinc-800/60 px-1 rounded">/health</code></li>
          </ul>
        </Card>
      </div>
    </div>
  )
}

function CheckRow({
  icon,
  title,
  result,
  children,
}: {
  icon: React.ReactNode
  title: string
  result: CheckResult
  children?: React.ReactNode
}) {
  return (
    <Card className="p-4 bg-zinc-900/40 border-zinc-800/60">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 text-zinc-400 shrink-0">{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="font-medium text-zinc-200 text-sm">{title}</div>
            {result.ok ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <XCircle className="w-4 h-4 text-red-400" />
            )}
          </div>
          {result.detail && (
            <div className={`text-xs mt-1 ${result.ok ? "text-zinc-500" : "text-zinc-300"}`}>
              {result.detail}
            </div>
          )}
          {children}
        </div>
      </div>
    </Card>
  )
}
