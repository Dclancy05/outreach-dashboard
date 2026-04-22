"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { Loader2, MonitorSmartphone, MapPin, RefreshCw, AlertTriangle, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

interface Fingerprint {
  account_id: string
  user_agent: string
  platform: string
  screen_width: number
  screen_height: number
  device_pixel_ratio: number
  hardware_concurrency: number
  device_memory: number
  webgl_vendor: string
  webgl_renderer: string
  timezone: string | null
  locale: string | null
  accept_language: string | null
  geo_lat: number | null
  geo_lon: number | null
  chrome_profile_dir: string | null
}

export function DeviceIdentity({
  accountId,
  className,
}: {
  accountId: string
  className?: string
}) {
  const [fp, setFp] = useState<Fingerprint | null>(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [confirmRegen, setConfirmRegen] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const r = await fetch(
        `/api/accounts/${encodeURIComponent(accountId)}/fingerprint`,
        { cache: "no-store" }
      )
      const data = await r.json()
      setFp(data.fingerprint || null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open && !fp) load()
  }, [open])

  async function generate() {
    setLoading(true)
    try {
      const r = await fetch(
        `/api/accounts/${encodeURIComponent(accountId)}/fingerprint/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force: false }),
        }
      )
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || "Failed")
      setFp(data.fingerprint)
      toast.success(data.generated ? "Device identity created" : "Identity already set")
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function regenerate() {
    setLoading(true)
    setConfirmRegen(false)
    try {
      const r = await fetch(
        `/api/accounts/${encodeURIComponent(accountId)}/fingerprint/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force: true }),
        }
      )
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || "Failed")
      setFp(data.fingerprint)
      toast.success("New device identity generated")
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function refreshGeo() {
    setLoading(true)
    try {
      const r = await fetch(
        `/api/accounts/${encodeURIComponent(accountId)}/fingerprint/refresh-geo`,
        { method: "POST" }
      )
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || "Failed")
      setFp(data.fingerprint)
      toast.success("Location refreshed from proxy")
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  const truncUA = fp?.user_agent
    ? fp.user_agent.length > 70
      ? fp.user_agent.slice(0, 67) + "..."
      : fp.user_agent
    : ""

  return (
    <div className={cn("rounded-lg border border-border/40 bg-card/30", className)}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-secondary/40 rounded-lg transition-colors"
      >
        <MonitorSmartphone className="h-4 w-4 text-violet-400 shrink-0" />
        <span className="text-xs font-semibold flex-1">Device Identity</span>
        {fp ? (
          <span className="text-[10px] text-muted-foreground truncate">
            {fp.platform} · {fp.screen_width}x{fp.screen_height}
          </span>
        ) : (
          <span className="text-[10px] text-amber-400">Not pinned</span>
        )}
        <ChevronDown className={cn("h-3 w-3 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="px-3 pb-3 pt-1 space-y-3 border-t border-border/30">
          {loading && !fp && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading...
            </div>
          )}

          {!loading && !fp && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                This account has no pinned device yet. Pin one now so it looks
                like the same computer every time.
              </p>
              <Button size="sm" onClick={generate} className="rounded-lg w-full">
                Pin a device identity
              </Button>
            </div>
          )}

          {fp && (
            <div className="space-y-2 text-xs">
              <Row label="Browser">
                <span className="font-mono text-[10px] leading-tight">{truncUA}</span>
              </Row>
              <Row label="Screen">
                {fp.screen_width} x {fp.screen_height} ({fp.device_pixel_ratio}x DPR)
              </Row>
              <Row label="GPU">
                <span className="text-[10px]">{fp.webgl_vendor}</span>
              </Row>
              <Row label="Location">
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {fp.timezone || "unknown"} · {fp.locale || "en-US"}
                </span>
              </Row>
              <Row label="CPU / RAM">
                {fp.hardware_concurrency} cores · {fp.device_memory} GB
              </Row>

              <div className="pt-2 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={refreshGeo}
                  disabled={loading}
                  className="rounded-lg flex-1 text-xs"
                >
                  <RefreshCw className="h-3 w-3 mr-1" /> Refresh Location
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirmRegen(true)}
                  disabled={loading}
                  className="rounded-lg flex-1 text-xs"
                >
                  Regenerate
                </Button>
              </div>

              {confirmRegen && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-2.5 space-y-2">
                  <p className="text-[11px] text-red-300 flex items-start gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    This may log the account out and trigger a security check.
                    Use this only if the account is already dead.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={regenerate}
                      className="rounded-lg flex-1 text-xs"
                    >
                      Yes, regenerate
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirmRegen(false)}
                      className="rounded-lg flex-1 text-xs"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-muted-foreground w-16 shrink-0">{label}</span>
      <span className="flex-1 text-foreground break-all">{children}</span>
    </div>
  )
}
