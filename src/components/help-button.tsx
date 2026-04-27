"use client"

import { useState } from "react"
import { HelpCircle, X, ArrowRight } from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"

/**
 * Floating help drawer — small "? How do I do this?" button that opens a
 * drawer with the six onboarding steps as quick-reference cards. Drop this
 * onto any page that might confuse a first-time user.
 */
export function HelpButton({
  className,
  pageHint,
}: {
  className?: string
  pageHint?: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-24 md:bottom-6 right-4 z-40 rounded-full px-3 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg hover:shadow-purple-500/40 flex items-center gap-2 text-sm font-medium",
          className
        )}
        title="Open help drawer"
      >
        <HelpCircle className="h-4 w-4" />
        How do I do this?
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-md bg-card border-l border-border/50 shadow-2xl p-5 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Quick help</h3>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-md hover:bg-secondary"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {pageHint && (
              <div className="rounded-xl bg-purple-500/10 border border-purple-500/30 p-3 text-sm mb-4">
                {pageHint}
              </div>
            )}

            <div className="space-y-3">
              {STEPS.map((s, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-border/40 bg-card/40 p-3 space-y-1"
                >
                  <div className="text-[11px] text-muted-foreground font-mono">
                    Step {i + 1}
                  </div>
                  <div className="text-sm font-semibold">{s.title}</div>
                  <div className="text-xs text-muted-foreground">{s.body}</div>
                </div>
              ))}
            </div>

            <Link
              href="/get-started"
              className="mt-5 rounded-xl px-4 py-2 text-sm font-semibold bg-gradient-to-r from-purple-600 to-blue-600 text-white flex items-center justify-center gap-2 hover:shadow-lg"
              onClick={() => setOpen(false)}
            >
              Walk me through it <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </>
      )}
    </>
  )
}

const STEPS: Array<{ title: string; body: string }> = [
  {
    title: "Pick a location",
    body: "Use the Accounts page to choose a proxy close to where the account was made. This makes the browser look legit.",
  },
  {
    title: "Pick an account",
    body: "Click an account card to open its detail. You can see health, cookies, and device identity at a glance.",
  },
  {
    title: "Open the browser",
    body: "Click the big Sign In Now button. A window appears where you log in like a normal person.",
  },
  {
    title: "Log in",
    body: "Type your username and password. If asked for a code, check your email or SMS.",
  },
  {
    title: "Save the session",
    body: "Once the home feed loads, click Save & Confirm. This pins your login so you won't get kicked out later.",
  },
  {
    title: "What next?",
    body: "Build a sequence, add leads, then hit Start Sending. The app handles throttling and warm-up for you.",
  },
]
