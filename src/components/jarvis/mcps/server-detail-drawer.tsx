"use client"

// Right-side drawer for a single MCP server.
//
// Implementation choice: shadcn doesn't ship a Sheet primitive in this repo, so
// we compose Radix Dialog + Tailwind to get a side-anchored sheet. The Radix
// Overlay still handles outside-click + esc + focus trap.
//
// Width: 480px on desktop. Below md it goes full-screen (inset-0) so we don't
// shove a 480px panel onto a 375px viewport.
//
// Tabs: Overview · Tools · Activity · Settings — each tab uses the locked
// tabSwap motion preset for the body crossfade (W3A motion vocabulary).
//
// Tools tab is intentionally a `<div data-slot="tool-playground" />` slot so
// W4.A.B3 can drop its <ToolPlayground /> in later without re-touching this file.

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  RotateCw,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { McpHealthBadge } from "./mcp-health-badge"
import { ActivityLogTable } from "./activity-log-table"
import { tabSwap, tabSwapTransition } from "@/components/jarvis/motion/presets"
import type { McpServer, UpdateMcpServerBody } from "@/lib/mcp/types"

type TabKey = "overview" | "tools" | "activity" | "settings"

interface ServerDetailDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  server: McpServer | null
  onUpdate: (id: string, body: UpdateMcpServerBody) => Promise<void> | void
  onRotateToken: (id: string) => Promise<void> | void
}

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "tools", label: "Tools" },
  { key: "activity", label: "Activity" },
  { key: "settings", label: "Settings" },
]

export function ServerDetailDrawer({
  open,
  onOpenChange,
  server,
  onUpdate,
  onRotateToken,
}: ServerDetailDrawerProps) {
  const [tab, setTab] = React.useState<TabKey>("overview")
  const reduced = useReducedMotion()

  // Reset to overview when a new server is opened.
  React.useEffect(() => {
    if (server) setTab("overview")
  }, [server?.id])

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-black/60 backdrop-blur-sm",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0"
          )}
        />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-mem-border bg-mem-surface-1 shadow-2xl outline-none",
            "md:max-w-[480px]",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
            "data-[state=closed]:duration-200 data-[state=open]:duration-300"
          )}
          data-testid="mcps-detail-drawer"
        >
          {server ? (
            <>
              <DrawerHeader server={server} onClose={() => onOpenChange(false)} />
              <DrawerTabs activeTab={tab} onChange={setTab} />
              <div className="relative flex-1 overflow-y-auto">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={tab}
                    variants={reduced ? undefined : tabSwap}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    transition={tabSwapTransition}
                    className="px-5 py-4"
                  >
                    {tab === "overview" && <OverviewTab server={server} />}
                    {tab === "tools" && <ToolsTab serverId={server.id} />}
                    {tab === "activity" && (
                      <ActivityLogTable serverId={server.id} pageSize={20} />
                    )}
                    {tab === "settings" && (
                      <SettingsTab
                        server={server}
                        onUpdate={onUpdate}
                        onRotateToken={onRotateToken}
                      />
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-[13px] text-mem-text-muted">
              No server selected
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

/* -------------------------------------------------------------------------- */
/*                                   Header                                    */
/* -------------------------------------------------------------------------- */

function DrawerHeader({
  server,
  onClose,
}: {
  server: McpServer
  onClose: () => void
}) {
  return (
    <header className="flex items-start justify-between gap-3 border-b border-mem-border px-5 py-4">
      <div className="min-w-0">
        <DialogPrimitive.Title className="truncate text-[16px] font-semibold text-mem-text-primary">
          {server.name}
        </DialogPrimitive.Title>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <McpHealthBadge status={server.status} compact />
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-mem-text-muted">
            {server.provider} · {server.transport}
          </span>
          {server.is_builtin && (
            <Badge
              variant="outline"
              className="h-4 border-mem-border px-1.5 text-[10px] text-mem-text-muted"
            >
              Built-in
            </Badge>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="flex h-8 w-8 items-center justify-center rounded-md text-mem-text-secondary transition-colors hover:bg-white/[0.04] hover:text-mem-text-primary"
      >
        <X className="h-4 w-4" />
      </button>
    </header>
  )
}

/* -------------------------------------------------------------------------- */
/*                                    Tabs                                     */
/* -------------------------------------------------------------------------- */

function DrawerTabs({
  activeTab,
  onChange,
}: {
  activeTab: TabKey
  onChange: (k: TabKey) => void
}) {
  return (
    <div
      role="tablist"
      aria-label="Server detail sections"
      className="flex gap-1 border-b border-mem-border px-3 py-2"
    >
      {TABS.map((t) => {
        const active = t.key === activeTab
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.key)}
            data-testid={`drawer-tab-${t.key}`}
            className={cn(
              "rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors",
              active
                ? "bg-mem-surface-2 text-mem-text-primary"
                : "text-mem-text-secondary hover:bg-white/[0.03] hover:text-mem-text-primary"
            )}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*                                  Overview                                   */
/* -------------------------------------------------------------------------- */

function OverviewTab({ server }: { server: McpServer }) {
  const [copied, setCopied] = React.useState(false)
  const tools = server.capabilities?.tools ?? []

  const handleCopyEndpoint = () => {
    if (!server.endpoint_url) return
    navigator.clipboard?.writeText(server.endpoint_url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="space-y-5">
      <section>
        <h4 className="jarvis-section-label mb-2">Capabilities</h4>
        {tools.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {tools.map((tool) => (
              <li key={tool.name}>
                <Badge
                  variant="outline"
                  className="border-mem-border bg-mem-surface-2 font-mono text-[10px] text-mem-text-secondary"
                >
                  {tool.name}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12px] text-mem-text-muted">
            No tools registered yet.
          </p>
        )}
      </section>

      <section>
        <h4 className="jarvis-section-label mb-2">Endpoint</h4>
        {server.endpoint_url ? (
          <div className="flex items-center gap-2 rounded-md border border-mem-border bg-mem-surface-2 p-2">
            <code className="flex-1 truncate font-mono text-[11px] text-mem-text-primary">
              {server.endpoint_url}
            </code>
            <button
              type="button"
              onClick={handleCopyEndpoint}
              aria-label="Copy endpoint URL"
              className="flex h-7 w-7 items-center justify-center rounded text-mem-text-secondary transition-colors hover:bg-white/[0.04] hover:text-mem-text-primary"
            >
              {copied ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        ) : (
          <p className="text-[12px] text-mem-text-muted">No endpoint configured.</p>
        )}
      </section>

      <section>
        <h4 className="jarvis-section-label mb-2">Daily usage</h4>
        <UsageBar
          used={server.calls_today || 0}
          cap={server.daily_call_cap || 0}
        />
      </section>

      {server.last_error && (
        <section>
          <h4 className="jarvis-section-label mb-2">Last error</h4>
          <div className="flex gap-2 rounded-md border border-red-400/30 bg-red-400/5 p-3 text-[12px] text-red-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="break-words">{server.last_error}</p>
          </div>
        </section>
      )}
    </div>
  )
}

function UsageBar({ used, cap }: { used: number; cap: number }) {
  const safeCap = Math.max(cap, 1)
  const safeUsed = Math.min(used, safeCap)
  const pct = Math.round((safeUsed / safeCap) * 100)
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between font-mono text-[10px]">
        <span className="text-mem-text-muted">{used} / {cap} calls</span>
        <span className="text-mem-text-secondary">{pct}%</span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-mem-surface-2"
        role="progressbar"
        aria-valuenow={safeUsed}
        aria-valuemin={0}
        aria-valuemax={safeCap}
      >
        <div
          className={cn(
            "h-full rounded-full",
            pct >= 100 ? "bg-amber-400" : "bg-mem-accent/80"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*                                 Tools (B3 slot)                             */
/* -------------------------------------------------------------------------- */

function ToolsTab({ serverId }: { serverId: string }) {
  // SLOT for W4.A.B3 — keep the data attribute exactly as specced. B3 will
  // mount its <ToolPlayground serverId={...} /> here.
  return (
    <div
      data-slot="tool-playground"
      data-server-id={serverId}
      className="flex min-h-[240px] flex-col items-center justify-center rounded-md border border-dashed border-mem-border bg-mem-surface-1 p-6 text-center"
    >
      <p className="text-[13px] font-medium text-mem-text-primary">
        Tool playground loading…
      </p>
      <p className="mt-1 text-[12px] text-mem-text-secondary">
        Pick a tool, fill in args, see results inline.
      </p>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*                                  Settings                                   */
/* -------------------------------------------------------------------------- */

interface SettingsTabProps {
  server: McpServer
  onUpdate: (id: string, body: UpdateMcpServerBody) => Promise<void> | void
  onRotateToken: (id: string) => Promise<void> | void
}

function SettingsTab({ server, onUpdate, onRotateToken }: SettingsTabProps) {
  const [cap, setCap] = React.useState<string>(String(server.daily_call_cap || 0))
  const [enabled, setEnabled] = React.useState<boolean>(
    server.status !== "disconnected"
  )
  const [saving, setSaving] = React.useState(false)
  const [rotating, setRotating] = React.useState(false)
  const [savedAt, setSavedAt] = React.useState<number | null>(null)

  // Keep local form state in sync if the server prop changes (after refetch).
  React.useEffect(() => {
    setCap(String(server.daily_call_cap || 0))
    setEnabled(server.status !== "disconnected")
  }, [server.id, server.daily_call_cap, server.status])

  const handleSave = async () => {
    setSaving(true)
    try {
      const parsed = Number.parseInt(cap, 10)
      const body: UpdateMcpServerBody = {
        daily_call_cap: Number.isFinite(parsed) && parsed > 0 ? parsed : undefined,
        status: enabled ? "connected" : "disconnected",
      }
      await onUpdate(server.id, body)
      setSavedAt(Date.now())
    } finally {
      setSaving(false)
    }
  }

  const handleRotate = async () => {
    setRotating(true)
    try {
      await onRotateToken(server.id)
    } finally {
      setRotating(false)
    }
  }

  const lockedReason = server.is_builtin
    ? "Built-in servers can't be edited from the UI."
    : null

  return (
    <div className="space-y-5">
      {lockedReason && (
        <div className="rounded-md border border-mem-border bg-mem-surface-2 p-3 text-[12px] text-mem-text-secondary">
          {lockedReason}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="mcp-cap" className="text-[12px] text-mem-text-secondary">
          Daily call cap
        </Label>
        <Input
          id="mcp-cap"
          type="number"
          inputMode="numeric"
          min={1}
          value={cap}
          disabled={!!lockedReason}
          onChange={(e) => setCap(e.target.value)}
          className="bg-mem-surface-2"
        />
        <p className="font-mono text-[10px] text-mem-text-muted">
          Hard limit. Calls past this number are rejected with 429.
        </p>
      </div>

      <div className="flex items-center justify-between rounded-md border border-mem-border bg-mem-surface-2 p-3">
        <div>
          <p className="text-[13px] font-medium text-mem-text-primary">Enabled</p>
          <p className="text-[11px] text-mem-text-secondary">
            Pause this server without deleting it.
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={setEnabled}
          disabled={!!lockedReason}
          aria-label="Enable server"
        />
      </div>

      <div className="space-y-2">
        <p className="text-[12px] text-mem-text-secondary">Bearer token</p>
        <div className="flex items-center justify-between gap-3 rounded-md border border-mem-border bg-mem-surface-2 p-3">
          <div className="min-w-0">
            <p className="font-mono text-[11px] text-mem-text-primary">
              ••••••••{server.id.slice(-4)}
            </p>
            <p className="mt-0.5 font-mono text-[10px] text-mem-text-muted">
              Rotates the token and re-checks reachability.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRotate}
            disabled={rotating || !!lockedReason}
            className="h-8 gap-1.5 text-[12px]"
          >
            <RotateCw className={cn("h-3.5 w-3.5", rotating && "animate-spin")} />
            {rotating ? "Rotating…" : "Rotate"}
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 pt-2">
        <p className="font-mono text-[10px] text-mem-text-muted">
          {savedAt ? "Saved." : "Changes save when you click Save."}
        </p>
        <Button
          type="button"
          onClick={handleSave}
          disabled={saving || !!lockedReason}
          className="h-9 bg-mem-accent text-white hover:brightness-110"
          data-testid="drawer-settings-save"
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  )
}
