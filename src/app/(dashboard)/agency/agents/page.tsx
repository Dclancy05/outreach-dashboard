/**
 * /agency/agents — legacy route, now folded into the unified Command Center.
 *
 * Phase 3 (Command Center unify, 2026-05-04): the standalone Agents page is
 * gone. The same UI now lives at /agency/memory?mode=agents inside the
 * 4-pane vault shell. This file preserves any deep-link / bookmark to
 * /agency/agents by redirecting on the server with the mode query param
 * already set, plus a `tab=` if the legacy hash carried one.
 *
 * The detail route /agency/agents/[slug] still lives (sibling file) and is
 * unaffected by this redirect — Next.js routes the segment match first.
 */
import { redirect } from "next/navigation"

interface SearchParams {
  // Pass-through tab so that /agency/agents?tab=runs lands on the runs subtab.
  tab?: string
}

export default function AgencyAgentsPage({
  searchParams,
}: {
  searchParams?: SearchParams
}) {
  const params = new URLSearchParams()
  params.set("mode", "agents")
  if (searchParams?.tab) params.set("tab", searchParams.tab)
  redirect(`/agency/memory?${params.toString()}`)
}
