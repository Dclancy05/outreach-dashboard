"use client"
/**
 * Conversations tab — placeholder in P1.
 *
 * P2: lists session summaries written by the AI to /Conversations/ in the vault,
 * grouped by date, click to view full transcript.
 */
import { Construction } from "lucide-react"

export function ConversationsView() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-zinc-500 px-6 text-center">
      <Construction className="w-8 h-8 mb-3 text-zinc-600" />
      <div className="text-sm font-medium text-zinc-300">Conversations coming in Phase 2</div>
      <div className="text-xs mt-2 max-w-md">
        Once Claude Code session-end hooks are wired, every chat session writes
        a summary to <code className="text-zinc-400 bg-zinc-800/50 px-1 rounded">/Conversations/</code> in the vault.
        That tab will list them grouped by date — click to read the transcript.
      </div>
    </div>
  )
}
