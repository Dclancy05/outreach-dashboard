/**
 * /jarvis/workflows — server boundary for the visual workflow builder.
 *
 * Mounts JarvisWorkflowBuilder inside the Jarvis chrome (W3A's
 * (jarvis)/layout.tsx provides sidebar/header/status bar).
 *
 * The canvas itself is dynamically imported with `ssr: false` because
 * @xyflow/react reaches for `window` during initialization. Any SSR pass would
 * blow up — same pattern terminals/page.tsx uses for xterm.
 *
 * Spec: Wave 2 §C-W4C. Wraps the legacy WorkflowBuilder
 * (src/components/agent-workflows/workflows/workflow-builder.tsx) in Jarvis
 * chrome and fixes BUG-031 (fitView never fires) + BUG-032 (Controls/MiniMap
 * not visible) — both are landed in the legacy file additively so
 * /agency/agents?tab=workflows keeps working.
 */

import type { Metadata } from "next"
import dynamic from "next/dynamic"

export const metadata: Metadata = {
  title: "Workflows",
  description:
    "Visual recipes that chain agents together — loops, approval gates, scheduled overnight runs.",
}

// xyflow needs `window` on import. Skip SSR so the build never tries to render
// the canvas server-side. The fallback is the themed skeleton in loading.tsx
// (Next.js shows it during the dynamic chunk fetch).
const JarvisWorkflowBuilder = dynamic(
  () =>
    import("@/components/jarvis/workflows/jarvis-workflow-builder").then(
      (m) => m.JarvisWorkflowBuilder
    ),
  { ssr: false }
)

interface JarvisWorkflowsPageProps {
  searchParams?: { id?: string }
}

export default function JarvisWorkflowsRoute({
  searchParams,
}: JarvisWorkflowsPageProps) {
  const workflowId = typeof searchParams?.id === "string" ? searchParams.id : null
  return <JarvisWorkflowBuilder initialWorkflowId={workflowId} />
}
