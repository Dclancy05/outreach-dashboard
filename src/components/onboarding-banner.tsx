"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Rocket, X } from "lucide-react"

const LS_KEY = "onboarding_completed_at"
const LS_DISMISS = "onboarding_banner_dismissed"

export function OnboardingBanner() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const done = localStorage.getItem(LS_KEY)
    const dismissed = localStorage.getItem(LS_DISMISS)
    if (!done && !dismissed) setShow(true)
  }, [])

  if (!show) return null

  return (
    <div className="rounded-xl border border-purple-500/40 bg-gradient-to-r from-purple-600/20 via-fuchsia-600/10 to-blue-600/20 p-4 flex flex-wrap items-center gap-3 shadow-lg mb-4">
      <div className="h-10 w-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
        <Rocket className="h-5 w-5 text-purple-300" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm">New here? Start here.</div>
        <div className="text-xs text-muted-foreground">
          Takes 5 minutes. We&apos;ll walk you through picking a location, logging into one account,
          and what to do next.
        </div>
      </div>
      <Link
        href="/get-started"
        className="rounded-xl px-4 py-2 text-sm font-semibold bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-md hover:shadow-purple-500/30 transition-all"
      >
        Start setup
      </Link>
      <button
        onClick={() => {
          localStorage.setItem(LS_DISMISS, "1")
          setShow(false)
        }}
        title="Dismiss"
        className="p-1 rounded-md text-muted-foreground hover:bg-secondary/50"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
