/**
 * /jarvis/agents — Jarvis-shell port of /agency/agents (W3C).
 *
 * The legacy route at /agency/agents continues to work unchanged. This route
 * group sits inside the Jarvis chrome (created by W3A) and reuses the same
 * 5-subtab AgentWorkflowsTabs internals via query-string sync (?tab=).
 *
 * This file is a thin server boundary; the client page lives in
 * components/jarvis/agents/agents-page.tsx so we get the standard server-page
 * shape (faster initial paint, suspense friendly).
 */

import type { Metadata } from "next"
import { AgentsPage } from "@/components/jarvis/agents/agents-page"

export const metadata: Metadata = {
  title: "Agents",
  description: "Visual multi-agent system: agents, workflows, schedules, runs, health.",
}

export default function JarvisAgentsRoute() {
  return <AgentsPage />
}
