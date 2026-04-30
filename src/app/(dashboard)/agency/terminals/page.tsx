/**
 * /agency/terminals — full-screen multi-terminal workspace.
 *
 * Persists across MacBook lid close because the actual TTYs live in tmux on
 * the VPS, not in the browser. The browser is just a viewer.
 *
 * Auth inherited from the (dashboard) route group's middleware (PIN cookie).
 */
import { TerminalsWorkspace } from "@/components/terminals/terminals-workspace"

export const dynamic = "force-dynamic"

export default function TerminalsPage() {
  return (
    <div className="h-[calc(100vh-3.5rem)] md:h-screen">
      <TerminalsWorkspace />
    </div>
  )
}
