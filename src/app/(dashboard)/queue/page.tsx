"use client"

import { useState } from "react"
import useSWR from "swr"
import { dashboardApi } from "@/lib/api"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/empty-state"
import { SetupBanner } from "@/components/setup-banner"
import {
  ListChecks,
  RefreshCw,
  Users,
  Send,
  Image,
  Clock,
  ChevronDown,
  ChevronRight,
} from "lucide-react"

interface VAQueueStatus {
  va_id: string
  va_name: string
  queue_type: string
  current_step: string
  current_account_idx: number
  current_lead_idx: number
  dms_today: number
  content_today: number
}

interface DMLogEntry {
  id: number
  lead_id: string
  account_id: string
  va_id: string
  message_sent: string
  status: string
  sent_at: string
  notes?: string
}

export default function AdminQueuePage() {
  const [showLog, setShowLog] = useState(false)

  const { data: vaStatuses, mutate: mutateStatuses } = useSWR<VAQueueStatus[]>(
    "admin_va_queue_status",
    () => dashboardApi("get_all_va_queue_status"),
    { refreshInterval: 15000 }
  )

  const { data: dmLog } = useSWR<DMLogEntry[]>(
    showLog ? "admin_dm_log" : null,
    () => dashboardApi("get_admin_dm_log", { limit: 50 }),
    { refreshInterval: 30000 }
  )

  const { data: accounts } = useSWR(
    "admin_queue_accounts",
    () => dashboardApi("get_outreach_accounts"),
    { refreshInterval: 30000 }
  )

  const statuses = vaStatuses || []
  const totalDMs = statuses.reduce((s, v) => s + v.dms_today, 0)
  const totalContent = statuses.reduce((s, v) => s + v.content_today, 0)

  // Build account username map
  const accountMap: Record<string, string> = {}
  for (const a of (accounts || []) as { account_id: string; username: string }[]) {
    accountMap[a.account_id] = a.username
  }

  const statusColor = (step: string) => {
    if (step === "dm") return "bg-blue-500/10 text-blue-400 border-blue-500/20"
    if (step === "content") return "bg-purple-500/10 text-purple-400 border-purple-500/20"
    return "bg-secondary text-muted-foreground"
  }

  const dmStatusColor = (status: string) => {
    switch (status) {
      case "sent": return "text-green-400"
      case "user_not_found": return "text-red-400"
      case "not_sent": return "text-yellow-400"
      case "account_issue": return "text-orange-400"
      default: return "text-muted-foreground"
    }
  }

  return (
    <div className="space-y-6 animate-slide-up max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ListChecks className="h-6 w-6 text-neon-pink" />
          Queue Overview
        </h1>
        <Button variant="outline" size="sm" onClick={() => mutateStatuses()} className="gap-1">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {/* Setup Banner */}
      {statuses.length === 0 && (
        <SetupBanner
          storageKey="queue"
          title="No tasks in queue"
          persistent
          steps={[
            { id: "campaign", label: "Create a campaign first to generate DM tasks", complete: false, href: "/campaigns", linkLabel: "Go to Campaigns" },
          ]}
        />
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <Users className="h-5 w-5 mx-auto text-purple-400 mb-1" />
            <div className="text-2xl font-bold">{statuses.length}</div>
            <div className="text-xs text-muted-foreground">Active VAs</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Send className="h-5 w-5 mx-auto text-blue-400 mb-1" />
            <div className="text-2xl font-bold">{totalDMs}</div>
            <div className="text-xs text-muted-foreground">DMs Today</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Image className="h-5 w-5 mx-auto text-pink-400 mb-1" />
            <div className="text-2xl font-bold">{totalContent}</div>
            <div className="text-xs text-muted-foreground">Content Posted</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Clock className="h-5 w-5 mx-auto text-green-400 mb-1" />
            <div className="text-2xl font-bold">{(accounts || []).length}</div>
            <div className="text-xs text-muted-foreground">Accounts</div>
          </CardContent>
        </Card>
      </div>

      {/* VA Status Table */}
      <Card>
        <CardContent className="p-4">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Users className="h-5 w-5 text-purple-400" />
            VA Queue Status
          </h2>

          {statuses.length === 0 ? (
            <EmptyState icon={Users} title="No active VAs" description="Create VA sessions in Settings → Team to start processing your outreach queue." />
          ) : (
            <div className="space-y-3">
              {statuses.map((va) => (
                <div key={va.va_id} className="flex items-center justify-between p-4 rounded-lg bg-secondary/30 border border-border/50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center text-lg">
                      👤
                    </div>
                    <div>
                      <div className="font-semibold">{va.va_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {va.current_step === "content" ? (
                          <>Content posting · Account {va.current_account_idx + 1}</>
                        ) : (
                          <>DM sending · Lead {va.current_lead_idx + 1} · Account {va.current_account_idx + 1}</>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className={statusColor(va.current_step)}>
                      {va.current_step === "content" ? "📝 Content" : "💬 DMs"}
                    </Badge>
                    <div className="text-right">
                      <div className="text-sm font-bold">{va.dms_today} DMs</div>
                      <div className="text-xs text-muted-foreground">{va.content_today} posts</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* DM Log */}
      <Card>
        <CardContent className="p-4">
          <button
            onClick={() => setShowLog(!showLog)}
            className="w-full flex items-center justify-between"
          >
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Send className="h-5 w-5 text-blue-400" />
              Recent DM Log
            </h2>
            {showLog ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
          </button>

          {showLog && (
            <div className="mt-4 space-y-2 max-h-96 overflow-y-auto">
              {(dmLog || []).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No DM logs yet.</p>
              ) : (
                (dmLog || []).map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/20 border border-border/30 text-sm">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className={`font-medium ${dmStatusColor(entry.status)}`}>
                        {entry.status === "sent" && "✅"}
                        {entry.status === "user_not_found" && "❌"}
                        {entry.status === "not_sent" && "⚠️"}
                        {entry.status === "account_issue" && "📸"}
                      </span>
                      <span className="truncate">{entry.lead_id}</span>
                      <span className="text-muted-foreground">via</span>
                      <span className="text-pink-400">@{accountMap[entry.account_id] || entry.account_id}</span>
                    </div>
                    <div className="text-xs text-muted-foreground shrink-0 ml-2">
                      {new Date(entry.sent_at).toLocaleTimeString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
