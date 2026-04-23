"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { Save, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Grabs the current cookies + localStorage from an active VNC session and
 * writes them as a snapshot for the account. The VNC Manager exposes
 * /api/sessions/:id/capture which returns cookies + localStorage captured via
 * Chrome CDP. If there's no live session, we still offer to bump
 * cookies_updated_at using whatever is already stored (no-op placeholder).
 */
export function SaveSessionButton({
  accountId,
  sessionId,
  onSaved,
  className,
  size = "sm",
  label = "Save Session Now",
}: {
  accountId: string
  sessionId?: string | null
  onSaved?: () => void
  className?: string
  size?: "sm" | "default" | "lg"
  label?: string
}) {
  const [saving, setSaving] = useState(false)

  async function handle() {
    setSaving(true)
    try {
      let cookies: any[] = []
      let localStorage: any = null

      if (sessionId) {
        // Ask the VNC Manager for fresh cookies + localStorage via the
        // dashboard's server-side proxy. The real API key stays on the server;
        // middleware gates this route behind the admin/va session cookie.
        const res = await fetch(`/api/vnc/session/${sessionId}/capture`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            account_id: accountId,
            snapshot_only: true,
          }),
        })
        if (res.ok) {
          const data = await res.json()
          cookies = data?.data?.cookies || data?.cookies || []
          localStorage = data?.data?.localStorage || data?.localStorage || null
        }
      }

      if (!cookies.length) {
        toast.error("No cookies captured. Make sure the browser is open and you're logged in.")
        setSaving(false)
        return
      }

      const snap = await fetch(
        `/api/accounts/${encodeURIComponent(accountId)}/cookies/snapshot`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cookies,
            local_storage: localStorage,
            session_id: sessionId || null,
            captured_by: sessionId ? "user_login" : "manual",
          }),
        }
      )
      const snapData = await snap.json()
      if (!snap.ok) throw new Error(snapData.error || "Failed to save")

      toast.success(`Session saved (${cookies.length} cookies)`)
      onSaved?.()
    } catch (e: any) {
      toast.error(e?.message || "Failed to save session")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Button
      size={size}
      onClick={handle}
      disabled={saving}
      className={cn("rounded-lg", className)}
    >
      {saving ? (
        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
      ) : (
        <Save className="h-3.5 w-3.5 mr-1.5" />
      )}
      {label}
    </Button>
  )
}
