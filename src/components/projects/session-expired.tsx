"use client"
/**
 * Friendly 401-handling card. Shown in any view that hit an Unauthorized
 * response from the dashboard's own API. The most common cause is the
 * 24-hour admin_session cookie expiring while the page was open.
 */
import { LogIn, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

export function SessionExpiredCard({ what = "this content" }: { what?: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-zinc-300 text-sm gap-3 p-6 text-center">
      <div className="w-10 h-10 rounded-full bg-amber-500/15 flex items-center justify-center">
        <LogIn className="h-5 w-5 text-amber-300" />
      </div>
      <div className="font-medium text-zinc-100">Your session expired</div>
      <div className="text-xs text-zinc-400 max-w-md">
        Couldn&apos;t load {what} because your admin sign-in expired (sessions last 24 hours).
        Refresh the page and re-enter your PIN to fix it.
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={() => window.location.reload()}
        className="gap-1.5 mt-1"
      >
        <RefreshCw className="h-3.5 w-3.5" /> Refresh now
      </Button>
    </div>
  )
}

/** Returns true if a fetch response (or error) suggests an expired session. */
export function isSessionExpired(error: unknown, status?: number): boolean {
  if (status === 401) return true
  if (typeof error === "string") return /401|unauthorized/i.test(error)
  if (error instanceof Error) return /401|unauthorized/i.test(error.message)
  return false
}
