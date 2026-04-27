"use client"

/**
 * Settings → Integrations & API Keys
 *
 * One row per integration key. Each row has:
 *   - masked display ("sk-...XYZ4") that we render until the user clicks
 *     the eye icon, at which point they can paste a new value
 *   - Save button with spinner
 *   - Test button that pings the integration's lightweight endpoint
 *   - status badge (set / not set / read-only)
 *
 * Reads/writes via /api/system-settings/keys (see route for storage shape).
 * The raw secret is never returned by the API — masked-only — so the only
 * way the user can "see" their saved key is by retyping it. That's intentional.
 */

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Eye,
  EyeOff,
  KeyRound,
  Save,
  RefreshCw,
  Check,
  X,
  CheckCircle,
  AlertCircle,
  Lock,
  ExternalLink,
} from "lucide-react"
import { toast } from "sonner"

type KeyMeta = {
  masked: string
  is_set: boolean
  read_only: boolean
  updated_at: string | null
}

type KeysResponse = {
  keys: Record<string, KeyMeta>
}

const KEY_ORDER = [
  "INSTANTLY_API_KEY",
  "GHL_API_KEY",
  "GHL_SUBACCOUNT_ID",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "APIFY_TOKEN",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
  "VPS_URL",
  "CRON_SECRET",
] as const

const KEY_META: Record<
  string,
  { label: string; help: string; href?: string; placeholder?: string }
> = {
  INSTANTLY_API_KEY: {
    label: "Instantly API Key",
    help: "Powers the email sender. Find it in Instantly → Settings → Integrations.",
    href: "https://app.instantly.ai/app/settings/integrations",
    placeholder: "Paste your Instantly API key",
  },
  GHL_API_KEY: {
    label: "GoHighLevel / LeadConnector API Key",
    help: "Used to send SMS via your GHL subaccount.",
    href: "https://help.gohighlevel.com/support/solutions/articles/48000982605",
    placeholder: "Bearer token from GHL → Settings → API Key",
  },
  GHL_SUBACCOUNT_ID: {
    label: "GHL Subaccount (Location) ID",
    help: "The location id under your agency that owns the SMS number.",
    placeholder: "e.g. abc123XYZsubaccountId",
  },
  OPENAI_API_KEY: {
    label: "OpenAI API Key",
    help: "Used by AI message generation.",
    href: "https://platform.openai.com/api-keys",
    placeholder: "sk-...",
  },
  ANTHROPIC_API_KEY: {
    label: "Anthropic API Key",
    help: "Used by Claude-powered writers and the in-app agent.",
    href: "https://console.anthropic.com/settings/keys",
    placeholder: "sk-ant-...",
  },
  APIFY_TOKEN: {
    label: "Apify Token",
    help: "Powers Social Scout scraping.",
    href: "https://console.apify.com/account/integrations",
    placeholder: "apify_api_...",
  },
  TELEGRAM_BOT_TOKEN: {
    label: "Telegram Bot Token",
    help: "Bot token for Dead Man's Switch alerts. Create one with @BotFather.",
    placeholder: "123456:ABC-DEF...",
  },
  TELEGRAM_CHAT_ID: {
    label: "Telegram Chat ID",
    help: "Numeric chat id where alerts get sent. Get it from @userinfobot.",
    placeholder: "e.g. 123456789",
  },
  VPS_URL: {
    label: "Production VPS URL",
    help: "Where the dashboard talks to the VNC + Chrome service.",
    placeholder: "https://srv1197943.taild42583.ts.net:10000",
  },
  CRON_SECRET: {
    label: "Cron Secret",
    help: "Bearer token Vercel cron jobs send. Rotate via Vercel env only.",
  },
}

export function IntegrationsTab() {
  const [keys, setKeys] = useState<Record<string, KeyMeta>>({})
  const [loading, setLoading] = useState(true)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [reveal, setReveal] = useState<Record<string, boolean>>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [testingKey, setTestingKey] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<
    Record<string, { ok: boolean; message: string } | undefined>
  >({})

  async function load() {
    setLoading(true)
    try {
      const res = await fetch("/api/system-settings/keys", { cache: "no-store" })
      if (!res.ok) throw new Error(`Failed: ${res.status}`)
      const data = (await res.json()) as KeysResponse
      setKeys(data.keys || {})
    } catch (e: any) {
      toast.error(`Couldn't load keys: ${e?.message || "error"}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function saveKey(key: string) {
    const value = drafts[key] ?? ""
    setSavingKey(key)
    try {
      const res = await fetch("/api/system-settings/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || j.error) throw new Error(j.error || `Failed: ${res.status}`)
      toast.success(`${KEY_META[key]?.label || key} saved`)
      // Clear the draft so the input snaps back to masked, and refresh metadata
      setDrafts((p) => ({ ...p, [key]: "" }))
      setReveal((p) => ({ ...p, [key]: false }))
      await load()
    } catch (e: any) {
      toast.error(`Save failed: ${e?.message || "error"}`)
    } finally {
      setSavingKey(null)
    }
  }

  async function testKey(key: string) {
    setTestingKey(key)
    setTestResults((p) => ({ ...p, [key]: undefined }))
    try {
      const res = await fetch("/api/system-settings/keys/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      })
      const j = await res.json().catch(() => ({}))
      const ok = Boolean(j?.ok)
      const message = ok
        ? j?.detail || "OK"
        : j?.error || (res.ok ? "test failed" : `${res.status}`)
      setTestResults((p) => ({ ...p, [key]: { ok, message } }))
      if (ok) toast.success(`${KEY_META[key]?.label || key}: ${message}`)
      else toast.error(`${KEY_META[key]?.label || key}: ${message}`)
    } catch (e: any) {
      setTestResults((p) => ({
        ...p,
        [key]: { ok: false, message: e?.message || "test failed" },
      }))
      toast.error(`Test failed: ${e?.message || "error"}`)
    } finally {
      setTestingKey(null)
    }
  }

  if (loading) {
    return (
      <div className="text-center text-muted-foreground py-12">
        Loading integration keys…
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-amber-400" />
            Integrations &amp; API Keys
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Add keys for the services this dashboard talks to. Saved keys are
            shown masked — to change one, paste a new value and Save. Use Test
            to confirm the key actually works.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          {KEY_ORDER.map((key) => {
            const meta = KEY_META[key]
            const k = keys[key] || {
              masked: "",
              is_set: false,
              read_only: false,
              updated_at: null,
            }
            const draft = drafts[key] ?? ""
            const isRevealed = reveal[key]
            const isSaving = savingKey === key
            const isTesting = testingKey === key
            const result = testResults[key]

            return (
              <div
                key={key}
                className="border border-border/50 rounded-lg p-3 space-y-2 bg-card/40"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <Label className="text-sm font-medium">{meta.label}</Label>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {meta.help}
                      {meta.href && (
                        <>
                          {" "}
                          <a
                            href={meta.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:underline inline-flex items-center gap-0.5"
                          >
                            Open <ExternalLink className="h-3 w-3" />
                          </a>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    {k.read_only ? (
                      <Badge variant="outline" className="gap-1">
                        <Lock className="h-3 w-3" /> Read only
                      </Badge>
                    ) : k.is_set ? (
                      <Badge variant="success" className="gap-1">
                        <CheckCircle className="h-3 w-3" /> Set
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1">
                        <AlertCircle className="h-3 w-3" /> Not set
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={isRevealed ? "text" : "password"}
                      value={draft}
                      onChange={(e) =>
                        setDrafts((p) => ({ ...p, [key]: e.target.value }))
                      }
                      placeholder={
                        k.is_set
                          ? `Saved: ${k.masked}`
                          : meta.placeholder || "Paste value…"
                      }
                      disabled={k.read_only}
                      className="pr-9 font-mono text-sm"
                    />
                    {!k.read_only && (
                      <button
                        type="button"
                        onClick={() =>
                          setReveal((p) => ({ ...p, [key]: !isRevealed }))
                        }
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label={isRevealed ? "Hide" : "Show"}
                      >
                        {isRevealed ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    )}
                  </div>

                  <Button
                    size="sm"
                    variant="neon"
                    disabled={k.read_only || isSaving || !draft.trim()}
                    onClick={() => saveKey(key)}
                    className="gap-1.5"
                  >
                    {isSaving ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    Save
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!k.is_set || isTesting || k.read_only}
                    onClick={() => testKey(key)}
                    className="gap-1.5"
                  >
                    {isTesting ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : result?.ok ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                    ) : result && !result.ok ? (
                      <X className="h-3.5 w-3.5 text-rose-400" />
                    ) : null}
                    Test
                  </Button>
                </div>

                {result && (
                  <p
                    className={`text-[11px] ${
                      result.ok ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {result.message}
                  </p>
                )}

                {k.read_only && (
                  <p className="text-[11px] text-muted-foreground">
                    Rotate via Vercel env vars only.
                  </p>
                )}
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}
