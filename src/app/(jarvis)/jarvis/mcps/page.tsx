/**
 * /jarvis/mcps — MCP Servers page (W4.A.B2).
 *
 * Server boundary only. The client orchestrator (mcps-page-shell.tsx) owns
 * SWR + drawer + tab state. Keeping this thin lets the route stream fast and
 * gives the loading.tsx skeleton (Next.js convention) a clean handoff.
 */

import type { Metadata } from "next"
import { McpsPageShell } from "@/components/jarvis/mcps/mcps-page-shell"

export const metadata: Metadata = {
  title: "MCP Servers",
  description:
    "Connect AI tools to give Jarvis superpowers. Manage MCP server connections, daily caps, and tool calls.",
}

export default function JarvisMcpsRoute() {
  return <McpsPageShell />
}
