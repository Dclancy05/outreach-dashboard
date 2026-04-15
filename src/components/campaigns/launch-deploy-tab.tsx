"use client"

import { useState, useEffect } from "react"
import useSWR from "swr"
import { dashboardApi } from "@/lib/api"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Rocket,
  Play,
  Pause,
  CheckCircle,
  Clock,
  Send,
  RefreshCw,
  Zap,
} from "lucide-react"
import { toast } from "sonner"

interface Campaign {
  id: string
  name: string
  status: string
  leads_targeted: number
  dms_sent: number
  responses: number
  created_at: string
}

interface QueueStatus {
  va_id: string
  va_name: string
  dms_today: number
  current_step: string
}

export function LaunchDeployTab() {
  const [businessId, setBusinessId] = useState("")

  useEffect(() => {
    try {
      const stored = localStorage.getItem("selected_business")
      if (stored) setBusinessId(JSON.parse(stored).id || "")
    } catch {}
  }, [])

  const { data: campaigns, mutate } = useSWR<Campaign[]>(
    businessId ? `launch-campaigns-${businessId}` : "launch-campaigns",
    () => dashboardApi("get_campaigns", { business_id: businessId || undefined })
  )

  const { data: vaStatuses } = useSWR<QueueStatus[]>(
    "launch_va_status",
    async () => {
      try { return await dashboardApi("get_all_va_queue_status") } catch { return [] }
    },
    { refreshInterval: 15000 }
  )

  const activeCampaigns = (campaigns || []).filter(c => c.status === "active")
  const draftCampaigns = (campaigns || []).filter(c => c.status === "draft")
  const totalDMsToday = (vaStatuses || []).reduce((s, v) => s + v.dms_today, 0)

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await dashboardApi("update_campaign", { id, status })
      mutate()
      toast.success(`Campaign ${status === "active" ? "activated" : "paused"}`)
    } catch {
      toast.error("Failed to update campaign")
    }
  }

  return (
    <div className="space-y-6">
      {/* Deployment Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <Rocket className="h-5 w-5 mx-auto text-violet-400 mb-1" />
            <div className="text-2xl font-bold">{activeCampaigns.length}</div>
            <div className="text-xs text-muted-foreground">Active Campaigns</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Clock className="h-5 w-5 mx-auto text-yellow-400 mb-1" />
            <div className="text-2xl font-bold">{draftCampaigns.length}</div>
            <div className="text-xs text-muted-foreground">Ready to Launch</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Send className="h-5 w-5 mx-auto text-blue-400 mb-1" />
            <div className="text-2xl font-bold">{totalDMsToday}</div>
            <div className="text-xs text-muted-foreground">DMs Sent Today</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Zap className="h-5 w-5 mx-auto text-green-400 mb-1" />
            <div className="text-2xl font-bold">{(vaStatuses || []).length}</div>
            <div className="text-xs text-muted-foreground">Active VAs</div>
          </CardContent>
        </Card>
      </div>

      {/* Draft campaigns ready to launch */}
      {draftCampaigns.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Clock className="h-5 w-5 text-yellow-400" /> Ready to Launch
          </h3>
          <div className="grid gap-3">
            {draftCampaigns.map((c) => (
              <Card key={c.id} className="border-yellow-500/20">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold">{c.name}</h4>
                    <p className="text-xs text-muted-foreground">{c.leads_targeted} leads targeted · Created {new Date(c.created_at).toLocaleDateString()}</p>
                  </div>
                  <Button onClick={() => handleStatusChange(c.id, "active")} className="gap-2 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700">
                    <Play className="h-4 w-4" /> Launch
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Active campaigns */}
      <div>
        <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <CheckCircle className="h-5 w-5 text-green-400" /> Active Campaigns
        </h3>
        {activeCampaigns.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-8 text-center text-muted-foreground">
              <Rocket className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>No active campaigns. Create one from the Dashboard tab and launch it here.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {activeCampaigns.map((c) => (
              <Card key={c.id} className="border-green-500/20">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-semibold">{c.name}</h4>
                      <Badge className="bg-green-500 text-white text-[10px]">Active</Badge>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>{c.leads_targeted} leads</span>
                      <span>{c.dms_sent} sent</span>
                      <span>{c.responses} responses</span>
                    </div>
                    {c.leads_targeted > 0 && (
                      <div className="mt-2 h-1.5 w-48 bg-secondary rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-green-500 to-emerald-500 rounded-full" style={{ width: `${Math.min(100, ((c.dms_sent || 0) / c.leads_targeted) * 100)}%` }} />
                      </div>
                    )}
                  </div>
                  <Button variant="outline" size="sm" onClick={() => handleStatusChange(c.id, "paused")} className="gap-2 text-yellow-400 border-yellow-500/30">
                    <Pause className="h-4 w-4" /> Pause
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* VA Status */}
      {(vaStatuses || []).length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-blue-400" /> VA Activity
          </h3>
          <div className="grid gap-2">
            {(vaStatuses || []).map((va) => (
              <div key={va.va_id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border">
                <div className="flex items-center gap-3">
                  <span className="text-lg">👤</span>
                  <div>
                    <div className="font-medium text-sm">{va.va_name}</div>
                    <div className="text-xs text-muted-foreground">{va.current_step === "dm" ? "Sending DMs" : "Posting content"}</div>
                  </div>
                </div>
                <Badge variant="secondary">{va.dms_today} DMs today</Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
