/**
 * /jarvis/memory — server boundary for the Jarvis Memory workspace.
 *
 * Mounts the MemoryPage client component inside the Jarvis shell (W3A's
 * (jarvis)/layout.tsx provides sidebar/header/status bar). Page is the marquee
 * surface in /jarvis — most daily work happens here.
 *
 * Spec: Wave 2 §B-W3B. Bugs fixed in this lane: BUG-003, BUG-004 (Move +
 * Delete + Settings dialogs), BUG-010, BUG-011, BUG-012, BUG-016, BUG-017,
 * BUG-018, BUG-019. The legacy /agency/memory page continues to work
 * unchanged — see the README in components/jarvis/memory/.
 */

import type { Metadata } from "next"
import { MemoryPage } from "@/components/jarvis/memory/memory-page"

export const metadata: Metadata = {
  title: "Memory",
  description:
    "Your AI's knowledge brain — every doc, conversation, and code reference your agents read.",
}

export default function JarvisMemoryRoute() {
  return <MemoryPage />
}
