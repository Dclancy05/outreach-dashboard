"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { X, AlertTriangle, CheckCircle, ArrowRight } from "lucide-react"
import Link from "next/link"

export interface SetupStep {
  id: string
  label: string
  complete: boolean
  href?: string
  linkLabel?: string
}

interface SetupBannerProps {
  storageKey: string
  title: string
  steps: SetupStep[]
  /** If true, banner cannot be dismissed */
  persistent?: boolean
}

export function SetupBanner({ storageKey, title, steps, persistent }: SetupBannerProps) {
  const [dismissed, setDismissed] = useState(true) // start hidden to avoid flash

  useEffect(() => {
    const stored = localStorage.getItem(`setup-banner-${storageKey}`)
    setDismissed(stored === "dismissed")
  }, [storageKey])

  const incomplete = steps.filter((s) => !s.complete)
  if (incomplete.length === 0 || dismissed) return null

  const handleDismiss = () => {
    if (persistent) return
    localStorage.setItem(`setup-banner-${storageKey}`, "dismissed")
    setDismissed(true)
  }

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1">
          <AlertTriangle className="h-5 w-5 text-amber-400 mt-0.5 shrink-0" />
          <div className="space-y-2 flex-1">
            <p className="text-sm font-medium text-amber-300">{title}</p>
            <div className="space-y-1.5">
              {steps.map((step) => (
                <div key={step.id} className="flex items-center gap-2 text-sm">
                  {step.complete ? (
                    <CheckCircle className="h-4 w-4 text-green-400 shrink-0" />
                  ) : (
                    <div className="h-4 w-4 rounded-full border-2 border-amber-400/50 shrink-0" />
                  )}
                  <span className={step.complete ? "text-muted-foreground line-through" : "text-foreground"}>
                    {step.label}
                  </span>
                  {!step.complete && step.href && (
                    <Link href={step.href}>
                      <Button variant="link" size="sm" className="h-auto p-0 text-amber-400 text-xs gap-1">
                        {step.linkLabel || "Fix"} <ArrowRight className="h-3 w-3" />
                      </Button>
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
        {!persistent && (
          <button onClick={handleDismiss} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}
