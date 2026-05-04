/**
 * /agency/terminals — legacy route, now folded into the unified Command Center.
 *
 * Phase 3 (Command Center unify, 2026-05-04): the standalone Terminals page
 * is gone. The same TerminalsWorkspace component now renders at
 * /agency/memory?mode=terminals inside the unified shell. This redirect
 * preserves any bookmark or sidebar link pointing to /agency/terminals.
 */
import { redirect } from "next/navigation"

export default function TerminalsPage() {
  redirect("/agency/memory?mode=terminals")
}
