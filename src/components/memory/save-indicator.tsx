"use client"

import { Check, Loader2, AlertTriangle } from "lucide-react"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

export type SaveState = "idle" | "saving" | "saved" | "error"

export function SaveIndicator({
  state,
  lastSavedAt,
  errorMessage,
}: {
  state: SaveState
  lastSavedAt: Date | null
  errorMessage?: string | null
}) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 15000)
    return () => clearInterval(t)
  }, [])

  if (state === "saving") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Saving…
      </span>
    )
  }
  if (state === "error") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-red-400">
        <AlertTriangle className="h-3 w-3" />
        {errorMessage || "Save failed"}
      </span>
    )
  }
  if (state === "saved" && lastSavedAt) {
    const seconds = Math.max(0, Math.floor((Date.now() - lastSavedAt.getTime()) / 1000))
    const label =
      seconds < 5 ? "Saved just now" :
      seconds < 60 ? `Saved ${seconds}s ago` :
      seconds < 3600 ? `Saved ${Math.floor(seconds / 60)}m ago` :
      `Saved ${Math.floor(seconds / 3600)}h ago`
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-xs text-emerald-400 transition-opacity", tick > -1 && "opacity-90")}>
        <Check className="h-3 w-3" />
        {label}
      </span>
    )
  }
  return null
}
