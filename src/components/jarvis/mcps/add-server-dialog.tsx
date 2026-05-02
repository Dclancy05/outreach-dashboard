"use client"

// Add MCP server dialog — two-step flow.
//   Step 1: pick from the catalog.
//   Step 2: connect (OAuth for GitHub; "Coming soon" for the rest).
//
// We use the existing shadcn Dialog (Radix). On mobile (<md) the dialog is
// full-bleed via responsive max-width / inset overrides. The dialog body is
// scrollable; the footer sticks to the bottom.

import * as React from "react"
import { ArrowLeft, Github, Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { McpCatalog, MCP_CATALOG } from "./mcp-catalog"
import type { McpServer } from "@/lib/mcp/types"

type Step = "catalog" | "connect"

interface AddServerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Already-installed servers — used to disable catalog rows. */
  installedServers: McpServer[]
}

export function AddServerDialog({
  open,
  onOpenChange,
  installedServers,
}: AddServerDialogProps) {
  const [step, setStep] = React.useState<Step>("catalog")
  const [selectedSlug, setSelectedSlug] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  // Reset state when the dialog closes (give the close animation a beat).
  React.useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setStep("catalog")
        setSelectedSlug(null)
        setSubmitting(false)
      }, 250)
      return () => clearTimeout(t)
    }
  }, [open])

  const installedSlugs = React.useMemo(
    () => installedServers.map((s) => s.slug),
    [installedServers]
  )

  const selected = React.useMemo(
    () => MCP_CATALOG.find((c) => c.slug === selectedSlug) ?? null,
    [selectedSlug]
  )

  const canContinue = !!selected && selected.available

  const handleContinue = () => {
    if (!canContinue) return
    setStep("connect")
  }

  const handleConnectGithub = () => {
    setSubmitting(true)
    // Hard-redirect — the API route will set state cookie + bounce to GitHub.
    window.location.href = "/api/mcp/oauth/github/start"
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[85vh] w-[calc(100%-2rem)] max-w-lg overflow-hidden border-mem-border bg-mem-surface-1 p-0 sm:w-full"
        data-testid="mcps-add-dialog"
      >
        <DialogHeader className="space-y-1.5 border-b border-mem-border px-5 py-4 text-left">
          <div className="flex items-center gap-2">
            {step === "connect" && (
              <button
                type="button"
                onClick={() => setStep("catalog")}
                aria-label="Back to catalog"
                className="-ml-1 flex h-7 w-7 items-center justify-center rounded-md text-mem-text-secondary transition-colors hover:bg-white/[0.04] hover:text-mem-text-primary"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <DialogTitle className="text-[15px] text-mem-text-primary">
              {step === "catalog" ? "Add MCP server" : `Connect ${selected?.name}`}
            </DialogTitle>
          </div>
          <DialogDescription className="text-[12px] text-mem-text-secondary">
            {step === "catalog"
              ? "Pick a service to plug into Jarvis."
              : "We'll bounce you to authenticate, then come right back."}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
          {step === "catalog" ? (
            <McpCatalog
              installedSlugs={installedSlugs}
              selectedSlug={selectedSlug}
              onSelect={setSelectedSlug}
            />
          ) : (
            <ConnectPane
              slug={selected?.slug ?? ""}
              name={selected?.name ?? ""}
              onConnectGithub={handleConnectGithub}
              submitting={submitting}
            />
          )}
        </div>

        <DialogFooter className="border-t border-mem-border bg-mem-surface-1 px-5 py-3">
          {step === "catalog" ? (
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                className="h-9 text-mem-text-secondary hover:text-mem-text-primary"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleContinue}
                disabled={!canContinue}
                className="h-9 bg-mem-accent text-white hover:brightness-110 disabled:opacity-50"
                data-testid="mcps-add-continue"
              >
                Continue
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="h-9 text-mem-text-secondary hover:text-mem-text-primary"
            >
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* -------------------------------------------------------------------------- */
/*                                 ConnectPane                                 */
/* -------------------------------------------------------------------------- */

interface ConnectPaneProps {
  slug: string
  name: string
  onConnectGithub: () => void
  submitting: boolean
}

function ConnectPane({ slug, name, onConnectGithub, submitting }: ConnectPaneProps) {
  if (slug === "github") {
    return (
      <div className="space-y-4">
        <ol className="space-y-2 text-[13px] text-mem-text-secondary">
          <li className="flex gap-2">
            <span className="font-mono text-mem-text-muted">1.</span>
            Click the button below — we&apos;ll bounce you to GitHub.
          </li>
          <li className="flex gap-2">
            <span className="font-mono text-mem-text-muted">2.</span>
            Approve the read/write scopes Jarvis needs.
          </li>
          <li className="flex gap-2">
            <span className="font-mono text-mem-text-muted">3.</span>
            You&apos;ll land back here with GitHub already plugged in.
          </li>
        </ol>

        <Button
          type="button"
          onClick={onConnectGithub}
          disabled={submitting}
          className="h-10 w-full gap-2 bg-[#24292f] text-white hover:bg-[#1f2328] disabled:opacity-60"
          data-testid="mcps-connect-github"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Github className="h-4 w-4" />
          )}
          {submitting ? "Redirecting…" : "Connect with GitHub"}
        </Button>

        <p className="font-mono text-[10px] text-mem-text-muted">
          You can revoke access any time from GitHub → Settings → Applications.
        </p>
      </div>
    )
  }

  // Fallback for catalog items that the user somehow reached without OAuth.
  return (
    <div className="rounded-md border border-mem-border bg-mem-surface-2 p-4 text-[12px] text-mem-text-secondary">
      {name} isn&apos;t wired up yet. Check back soon.
    </div>
  )
}
