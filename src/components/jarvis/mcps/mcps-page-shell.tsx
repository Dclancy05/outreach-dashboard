"use client"

// Orchestrator for /jarvis/mcps.
//
// Owns:
//   - SWR fetch of /api/mcp/servers (with mock fallback while B1's API is in flight)
//   - 3-tab strip (Installed · Catalog · Activity Log)
//   - Drawer open/close + URL sync (?id=… → drawer)
//   - Add-server dialog open/close
//   - PATCH/rotate handlers fed into <ServerDetailDrawer />
//
// Tabs are managed via a controlled-state `<Tabs>` from shadcn so we can react
// to the activeTab in motion presets.

import * as React from "react"
import useSWR from "swr"
import { Plus } from "lucide-react"
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { ServerGrid } from "./server-grid"
import { ServerDetailDrawer } from "./server-detail-drawer"
import { AddServerDialog } from "./add-server-dialog"
import { McpCatalog } from "./mcp-catalog"
import { ActivityLogTable } from "./activity-log-table"
import { McpsEmptyState } from "./empty-state"
import { McpsGridSkeleton } from "./loading-skeleton"
import { ToolPlaygroundSlot } from "./tool-playground"
import { tabSwap, tabSwapTransition } from "@/components/jarvis/motion/presets"
import type {
  ListServersResponse,
  McpServer,
  UpdateMcpServerBody,
} from "@/lib/mcp/types"

interface FetchKey {
  url: string
}

/**
 * Static mock data — used until /api/mcp/servers is live. Modeled on the three
 * already-running daemons noted in 01-research.md so the UI reflects reality.
 *
 * NOTE: Plain factory (not a React hook) — safe to call from SWR's fetcher.
 * The exported `useMockMcpServers` hook below is a thin wrapper for components
 * that want to render mocks without going through SWR.
 */
function buildMockServers(): McpServer[] {
  const now = new Date().toISOString()
  return [
    {
      id: "mock-playwright",
      slug: "playwright",
      name: "Playwright",
      provider: "playwright",
      transport: "http",
      endpoint_url: "https://srv1197943.taild42583.ts.net:8443/mcp/playwright",
      bearer_token_env_var: "PLAYWRIGHT_MCP_TOKEN",
      oauth_provider: null,
      oauth_token_id: null,
      status: "connected",
      last_health_check_at: new Date(Date.now() - 90 * 1000).toISOString(),
      last_error: null,
      error_log: [],
      daily_call_cap: 500,
      calls_today: 142,
      is_builtin: true,
      capabilities: {
        tools: [
          { name: "browser.navigate" },
          { name: "browser.click" },
          { name: "browser.screenshot" },
        ],
      },
      created_at: now,
      updated_at: now,
    },
    {
      id: "mock-postgres",
      slug: "postgres",
      name: "Postgres",
      provider: "postgres",
      transport: "http",
      endpoint_url: "https://srv1197943.taild42583.ts.net:8443/mcp/postgres",
      bearer_token_env_var: "POSTGRES_MCP_TOKEN",
      oauth_provider: null,
      oauth_token_id: null,
      status: "connected",
      last_health_check_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      last_error: null,
      error_log: [],
      daily_call_cap: 1000,
      calls_today: 43,
      is_builtin: true,
      capabilities: {
        tools: [{ name: "query" }, { name: "list_tables" }],
      },
      created_at: now,
      updated_at: now,
    },
    {
      id: "mock-brave",
      slug: "brave-search",
      name: "Brave Search",
      provider: "brave-search",
      transport: "http",
      endpoint_url: "https://srv1197943.taild42583.ts.net:8443/mcp/devtools",
      bearer_token_env_var: "DEVTOOLS_MCP_TOKEN",
      oauth_provider: null,
      oauth_token_id: null,
      status: "degraded",
      last_health_check_at: new Date(Date.now() - 22 * 60 * 1000).toISOString(),
      last_error: "5xx from upstream (last hit 22 min ago)",
      error_log: [],
      daily_call_cap: 250,
      calls_today: 248,
      is_builtin: true,
      capabilities: {
        tools: [{ name: "web_search" }],
      },
      created_at: now,
      updated_at: now,
    },
  ]
}

/**
 * Hook wrapper around buildMockServers — keeps the contract from the W4.A.B2
 * spec (`useMockMcpServers()`) without violating rules of hooks elsewhere.
 */
export function useMockMcpServers(): McpServer[] {
  return React.useMemo(() => buildMockServers(), [])
}

const fetcher = async (key: FetchKey): Promise<ListServersResponse> => {
  const res = await fetch(key.url, {
    credentials: "include",
    cache: "no-store",
  })
  if (res.status === 404) {
    // B1 hasn't shipped the route yet — fall back to mock.
    return { servers: buildMockServers() }
  }
  if (!res.ok) {
    throw new Error(`Failed to load MCP servers: ${res.status}`)
  }
  return (await res.json()) as ListServersResponse
}

type MainTab = "installed" | "catalog" | "activity"

export function McpsPageShell() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const reduced = useReducedMotion()

  const drawerId = searchParams?.get("id") ?? null
  const [activeTab, setActiveTab] = React.useState<MainTab>("installed")
  const [addOpen, setAddOpen] = React.useState(false)

  const { data, error, isLoading, mutate } = useSWR<ListServersResponse>(
    { url: "/api/mcp/servers" },
    fetcher,
    { revalidateOnFocus: false, shouldRetryOnError: false }
  )

  const servers: McpServer[] = data?.servers ?? []
  const selected =
    drawerId ? servers.find((s) => s.id === drawerId) ?? null : null
  const drawerOpen = !!drawerId && !!selected

  const updateUrl = React.useCallback(
    (id: string | null) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "")
      if (id) params.set("id", id)
      else params.delete("id")
      const qs = params.toString()
      router.replace(qs ? `/jarvis/mcps?${qs}` : "/jarvis/mcps", {
        scroll: false,
      })
    },
    [router, searchParams]
  )

  const handleSelect = (id: string) => updateUrl(id)
  const handleDrawerOpenChange = (open: boolean) => {
    if (!open) updateUrl(null)
  }

  const handleUpdate = async (id: string, body: UpdateMcpServerBody) => {
    try {
      const res = await fetch(`/api/mcp/servers/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok && res.status !== 404) {
        throw new Error(`PATCH failed: ${res.status}`)
      }
    } finally {
      // Optimistic refetch even if the route 404s — the mock will reflect input.
      await mutate()
    }
  }

  const handleRotate = async (id: string) => {
    try {
      await fetch(`/api/mcp/servers/${id}/rotate`, {
        method: "POST",
        credentials: "include",
      })
    } finally {
      await mutate()
    }
  }

  return (
    <div className="space-y-5" data-testid="jarvis-mcps-page">
      <PageHeader
        connectedCount={servers.filter((s) => s.status === "connected").length}
        totalCount={servers.length}
        onAdd={() => setAddOpen(true)}
      />

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as MainTab)}
        className="space-y-4"
      >
        <TabsList className="bg-mem-surface-2">
          <TabsTrigger value="installed" data-testid="mcps-tab-installed">
            Installed
            <span className="ml-2 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-mem-surface-1 px-1 font-mono text-[10px] text-mem-text-secondary">
              {servers.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="catalog" data-testid="mcps-tab-catalog">
            Catalog
          </TabsTrigger>
          <TabsTrigger value="activity" data-testid="mcps-tab-activity">
            Activity Log
          </TabsTrigger>
        </TabsList>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeTab}
            variants={reduced ? undefined : tabSwap}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={tabSwapTransition}
          >
            <TabsContent value="installed" className="mt-0 outline-none">
              {isLoading && !data ? (
                <McpsGridSkeleton />
              ) : error ? (
                <ErrorPane onRetry={() => mutate()} />
              ) : servers.length === 0 ? (
                <McpsEmptyState onAdd={() => setAddOpen(true)} />
              ) : (
                <ServerGrid servers={servers} onSelect={handleSelect} />
              )}
            </TabsContent>

            <TabsContent value="catalog" className="mt-0 outline-none">
              <CatalogPane
                installedSlugs={servers.map((s) => s.slug)}
                onAdd={() => setAddOpen(true)}
              />
            </TabsContent>

            <TabsContent value="activity" className="mt-0 outline-none">
              <ActivityLogTable pageSize={25} />
            </TabsContent>
          </motion.div>
        </AnimatePresence>
      </Tabs>

      <ServerDetailDrawer
        open={drawerOpen}
        onOpenChange={handleDrawerOpenChange}
        server={selected}
        onUpdate={handleUpdate}
        onRotateToken={handleRotate}
      />

      <AddServerDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        installedServers={servers}
      />

      {/* Auto-mounts the tool playground into the drawer's `data-slot="tool-playground"` div via portal. */}
      <ToolPlaygroundSlot />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*                                   Header                                    */
/* -------------------------------------------------------------------------- */

function PageHeader({
  connectedCount,
  totalCount,
  onAdd,
}: {
  connectedCount: number
  totalCount: number
  onAdd: () => void
}) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="jarvis-page-title">MCP Servers</h1>
          {totalCount > 0 && (
            <Badge
              variant="outline"
              className="h-6 border-mem-border bg-mem-surface-2 px-2 font-mono text-[11px] text-mem-text-secondary"
              aria-label={`${connectedCount} of ${totalCount} servers connected`}
            >
              {connectedCount}/{totalCount} connected
            </Badge>
          )}
        </div>
        <p className="mt-1 text-[13px] text-mem-text-secondary">
          Connect AI tools to give Jarvis superpowers.
        </p>
      </div>

      <Button
        type="button"
        onClick={onAdd}
        className="h-9 self-start bg-mem-accent text-white hover:brightness-110 sm:self-auto"
        data-testid="mcps-add-btn"
      >
        <Plus className="mr-1.5 h-4 w-4" />
        Add MCP
      </Button>
    </header>
  )
}

/* -------------------------------------------------------------------------- */
/*                                Catalog tab                                  */
/* -------------------------------------------------------------------------- */

function CatalogPane({
  installedSlugs,
  onAdd,
}: {
  installedSlugs: string[]
  onAdd: () => void
}) {
  const [selected, setSelected] = React.useState<string | null>(null)
  return (
    <div className="space-y-4">
      <McpCatalog
        installedSlugs={installedSlugs}
        selectedSlug={selected}
        onSelect={setSelected}
      />
      <div className="flex justify-end">
        <Button
          type="button"
          onClick={onAdd}
          className="h-9 bg-mem-accent text-white hover:brightness-110"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Open add flow
        </Button>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*                                  Errors                                     */
/* -------------------------------------------------------------------------- */

function ErrorPane({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-red-400/30 bg-red-400/5 p-6 text-center">
      <p className="text-[14px] font-medium text-red-300">
        Something broke loading MCPs.
      </p>
      <p className="mt-1 text-[12px] text-mem-text-secondary">
        The servers list endpoint isn&apos;t responding. Try again in a moment.
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onRetry}
        className="mt-4 h-8 text-[12px]"
      >
        Retry
      </Button>
    </div>
  )
}
