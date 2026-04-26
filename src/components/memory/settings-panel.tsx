"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import { Label } from "@/components/ui/label"
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select"
import { Copy, RotateCcw, Download, Upload, Trash2, Sparkles, Plug, FolderSync } from "lucide-react"
import { toast } from "sonner"
import {
  getSettings, updateSettings, rotateMcpKey,
  type MemorySettings, type Persona, type Memory,
} from "@/lib/api/memory"

export function SettingsPanel({
  personas,
  memories,
  businessId,
}: {
  personas: Persona[]
  memories: Memory[]
  businessId: string | null
}) {
  const [settings, setSettings] = useState<MemorySettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    setLoading(true)
    getSettings(businessId)
      .then(setSettings)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false))
  }, [businessId])

  async function patch(p: Partial<MemorySettings>) {
    if (!settings) return
    setSaving(true)
    setSettings({ ...settings, ...p })
    try {
      const updated = await updateSettings(p, businessId)
      setSettings(updated)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed")
    } finally { setSaving(false) }
  }

  async function handleRotateKey() {
    if (!confirm("Rotate the MCP API key? Any existing Claude Code config will need to be updated.")) return
    try {
      const updated = await rotateMcpKey(businessId)
      setSettings(updated)
      toast.success("Key rotated — update your MCP config")
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed") }
  }

  async function handleExport() {
    const r = await fetch("/api/memories/export", { method: "POST" })
    if (!r.ok) { toast.error("Export failed"); return }
    const blob = await r.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `memory-pack-${new Date().toISOString().slice(0,10)}.zip`
    a.click()
    URL.revokeObjectURL(url)
    toast.success("Exported")
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    try {
      const text = await file.text()
      let payload: { memories?: Partial<Memory>[]; personas?: Partial<Persona>[] }
      if (file.name.endsWith(".json")) {
        payload = JSON.parse(text)
      } else {
        // Markdown import: split on "---"
        const blocks = text.split(/^---$/m).map((s) => s.trim()).filter(Boolean)
        payload = { memories: blocks.map((b) => ({ title: b.split("\n")[0].slice(0, 100), body: b, type: "user" as const })) }
      }
      const r = await fetch("/api/memories/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || "Import failed")
      toast.success(`Imported ${data.imported || 0} items`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed")
    } finally { setImporting(false); e.target.value = "" }
  }

  async function handleHealthScan() {
    const r = await fetch("/api/memories/health-scan", { method: "POST" })
    const data = await r.json()
    if (!r.ok) { toast.error(data.error || "Scan failed"); return }
    toast.success(`Scan complete — ${data.issues_found || 0} issues, see Memory list for flags`)
  }

  if (loading || !settings) {
    return <div className="py-12 text-center text-sm text-muted-foreground">Loading settings…</div>
  }

  const totalTokensApprox = memories.reduce((sum, m) => sum + Math.ceil(((m.title?.length || 0) + (m.body?.length || 0)) / 4), 0)
  const mcpUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/api/mcp/memory`

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Token budget */}
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-400" />
          <h3 className="font-semibold">Token budget</h3>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          Max tokens injected into each conversation. Lower = leaner context, higher = more memory.
        </p>
        <div className="mb-2 flex items-center justify-between">
          <Label className="text-xs">Budget</Label>
          <span className="font-mono text-sm text-amber-300">{settings.token_budget.toLocaleString()}</span>
        </div>
        <Slider
          value={[settings.token_budget]}
          min={500} max={8000} step={250}
          onValueChange={(v) => patch({ token_budget: v[0] })}
        />
        <div className="mt-3 text-[11px] text-muted-foreground">
          You currently have {memories.length} memories totaling ~{totalTokensApprox.toLocaleString()} tokens. Pinned memories are injected first; lower-priority memories get pruned to fit.
        </div>
      </Card>

      {/* Default persona */}
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-base">🎭</span>
          <h3 className="font-semibold">Default persona</h3>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          Used when a chat doesn't specify a persona. Switch anytime.
        </p>
        <Select
          value={settings.default_persona_id || "__none__"}
          onValueChange={(v) => patch({ default_persona_id: v === "__none__" ? null : v })}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">None — only global memories</SelectItem>
            {personas.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.emoji} {p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="mt-3 flex items-center justify-between rounded-md border bg-card/50 p-3">
          <div>
            <Label className="text-xs">Auto-suggest memories</Label>
            <p className="text-[11px] text-muted-foreground">After each chat, AI proposes new memories from the transcript</p>
          </div>
          <Switch checked={settings.auto_suggest} onCheckedChange={(v) => patch({ auto_suggest: v })} />
        </div>
      </Card>

      {/* MCP injection */}
      <Card className="p-5 md:col-span-2">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Plug className="h-4 w-4 text-violet-400" />
            <h3 className="font-semibold">MCP server — Claude Code injection</h3>
          </div>
          <Switch checked={settings.mcp_enabled} onCheckedChange={(v) => patch({ mcp_enabled: v })} />
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Add this server to <code className="rounded bg-muted px-1">~/.claude/mcp.json</code> and Claude Code will be able to recall and add memories live during every chat.
        </p>
        <div className="mb-3 grid gap-2">
          <Label className="text-xs">URL</Label>
          <div className="flex items-center gap-2">
            <Input value={mcpUrl} readOnly className="font-mono text-xs" />
            <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(mcpUrl); toast.success("Copied") }}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <div className="mb-3 grid gap-2">
          <Label className="text-xs">API key</Label>
          <div className="flex items-center gap-2">
            <Input value={settings.mcp_api_key} readOnly type="password" className="font-mono text-xs" />
            <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(settings.mcp_api_key); toast.success("Key copied") }}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleRotateKey}>
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <details className="rounded-md border bg-card/40 p-3 text-xs">
          <summary className="cursor-pointer font-medium">📋 mcp.json snippet</summary>
          <pre className="mt-2 overflow-x-auto rounded bg-card/60 p-3 text-[11px]">
{`{
  "mcpServers": {
    "outreach-memory": {
      "command": "npx",
      "args": ["-y", "@outreach/memory-mcp"],
      "env": {
        "OUTREACH_MEMORY_URL": "${mcpUrl}",
        "OUTREACH_MEMORY_KEY": "${settings.mcp_api_key.slice(0, 8)}..."
      }
    }
  }
}`}
          </pre>
        </details>
      </Card>

      {/* Local sync */}
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2">
          <FolderSync className="h-4 w-4 text-sky-400" />
          <h3 className="font-semibold">Local sync</h3>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Mirror memories to local <code className="rounded bg-muted px-1">.md</code> files so Claude Code's built-in memory loader picks them up automatically.
        </p>
        <div className="mb-3 flex items-center justify-between">
          <Label className="text-xs">Enabled</Label>
          <Switch checked={settings.local_sync_enabled} onCheckedChange={(v) => patch({ local_sync_enabled: v })} />
        </div>
        <Label className="text-xs">Path</Label>
        <Input
          value={settings.local_sync_path}
          onChange={(e) => setSettings({ ...settings, local_sync_path: e.target.value })}
          onBlur={() => patch({ local_sync_path: settings.local_sync_path })}
          className="font-mono text-xs"
        />
        <p className="mt-2 text-[11px] text-muted-foreground">Run the sync daemon locally — see <code>mcp-servers/outreach-memory/sync-daemon.js</code></p>
      </Card>

      {/* Import / Export / Health */}
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-base">📦</span>
          <h3 className="font-semibold">Import · Export · Maintenance</h3>
        </div>
        <div className="space-y-2">
          <Button variant="outline" size="sm" className="w-full justify-start" onClick={handleExport} disabled={saving}>
            <Download className="mr-2 h-3.5 w-3.5" /> Export memory pack (.zip)
          </Button>
          <label className="flex cursor-pointer items-center justify-start rounded-md border bg-secondary/40 px-3 py-2 text-sm hover:bg-secondary">
            <Upload className="mr-2 h-3.5 w-3.5" /> {importing ? "Importing…" : "Import .json or .md bundle"}
            <input type="file" accept=".json,.md,.zip" onChange={handleImport} className="hidden" />
          </label>
          <Button variant="outline" size="sm" className="w-full justify-start" onClick={handleHealthScan}>
            <Sparkles className="mr-2 h-3.5 w-3.5 text-amber-400" /> Run AI health scan
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start text-red-400 hover:text-red-300"
            onClick={async () => {
              if (!confirm("Archive every memory not edited in 90 days? They can be restored later.")) return
              const r = await fetch("/api/memories", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "bulk_archive", older_than_days: 90 }),
              })
              if (r.ok) toast.success("Old memories archived")
              else toast.error("Failed")
            }}
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" /> Archive memories older than 90 days
          </Button>
        </div>
      </Card>
    </div>
  )
}
