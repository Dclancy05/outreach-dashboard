/**
 * /jarvis/terminals — Jarvis-shelled view of the persistent terminals workspace.
 *
 * This page mounts INSIDE the (jarvis) route group's layout (W3A) so the
 * Jarvis sidebar/header chrome wraps the canvas. The actual workspace is
 * the same `<TerminalsWorkspace>` rendered at /agency/terminals — we just
 * frame it with a Jarvis-styled header (Inter Display 28/600, active session
 * count, "+ New session" CTA) inside `<JarvisTerminalsShell>`.
 *
 * Auth flows through the root <PinLock> like every other route group.
 *
 * Why `force-dynamic`: the workspace fetches /api/terminals on mount and
 * relies on per-request session state; SSG would serve stale empty markup.
 */
import { JarvisTerminalsShell } from "@/components/jarvis/terminals/jarvis-terminals-shell"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Terminals — Jarvis",
}

export default function JarvisTerminalsPage() {
  return (
    <div className="h-[calc(100vh-3.5rem)] md:h-screen">
      <JarvisTerminalsShell />
    </div>
  )
}
