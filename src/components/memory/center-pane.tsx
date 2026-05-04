"use client"
/**
 * CenterPane — the mode-driven middle pane of the Command Center.
 *
 * Phase 3 (Command Center unify) extracted this from
 * /agency/memory/page.tsx so the centre area can swap implementations based
 * on the active filter chip without the page file ballooning. Every leaf
 * component already exists — this file is purely glue.
 *
 *   mode = "knowledge" → FileEditor (or empty hint)
 *   mode = "code"      → CodeFileViewer (or empty hint)
 *   mode = "convos"    → existing ConversationsView (lives inside the tree pane,
 *                        so the centre stays as the file editor)
 *   mode = "agents"    → AgentWorkflowsTabs (the 5-subtab control)
 *   mode = "terminals" → TerminalsWorkspace (the parallel-claude grid)
 *   mode = "all"       → ContinueCard + recent activity feed (a quick "what
 *                        was I doing?" landing surface)
 *
 * Note: the existing TimeMachine scrubber lives at the bottom of the centre
 * column for "knowledge" / "code" modes; we don't render it for agents or
 * terminals since neither has snapshot semantics.
 */
import * as React from "react"
import dynamic from "next/dynamic"
import { Code2, FileText, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

import { FileEditor } from "@/components/memory-tree/file-editor"
import { CodeFileViewer } from "@/components/projects/code-file-viewer"
import { AgentWorkflowsTabs } from "@/components/agent-workflows/agent-workflows-tabs"
import { TimeMachine } from "@/components/memory/time-machine"
import { AllModeLanding } from "@/components/memory/all-mode-landing"

// TerminalsWorkspace pulls in xterm.js, which references `self` at module
// load time and breaks SSG. Load it client-side only — matches what the
// (deleted) /agency/terminals page did via `dynamic = "force-dynamic"`.
const TerminalsWorkspace = dynamic(
  () => import("@/components/terminals/terminals-workspace").then((m) => m.TerminalsWorkspace),
  {
    ssr: false,
    loading: () => (
      <div className="h-full grid place-items-center text-mem-text-muted text-[12px]">
        <div className="inline-flex items-center gap-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Booting workspace…
        </div>
      </div>
    ),
  }
)

export type CenterMode =
  | "all"
  | "knowledge"
  | "code"
  | "convos"
  | "agents"
  | "terminals"

interface Props {
  mode: CenterMode
  /** Selected vault file path (knowledge/convos modes). */
  selectedPath: string | null
  setSelectedPath: (path: string | null) => void

  /** Selected source-code path (code mode). */
  projectPath: string | null
  setProjectPath: (path: string | null) => void

  /** Callbacks shared with the tree pane / page header. */
  syncProjectUrl: (mode: "files" | "pages", filePath: string | null, pageRoute: string | null) => void
  openInPages: (route: string) => void

  /** Last-file picker for the "all" landing card. */
  onSelect: (path: string) => void

  /** True when the Time Machine has rewound to a non-now snapshot — dim editor. */
  dimmed?: boolean
}

export function CenterPane({
  mode,
  selectedPath,
  setSelectedPath,
  projectPath,
  setProjectPath,
  syncProjectUrl,
  openInPages,
  onSelect,
  dimmed,
}: Props) {
  // Agents + Terminals are full-bleed full-height — no Time Machine, no padding
  // chrome. They render their own headers and grids.
  if (mode === "agents") {
    return (
      <div className="h-full flex flex-col bg-mem-bg">
        <AgentWorkflowsTabs />
      </div>
    )
  }
  if (mode === "terminals") {
    return (
      <div className="h-full flex flex-col">
        <TerminalsWorkspace />
      </div>
    )
  }

  // Knowledge / Convos / Code / All all share the editor + Time Machine column.
  return (
    <div className={cn("h-full flex flex-col bg-mem-bg", dimmed && "opacity-70 pointer-events-auto")}>
      <div className={cn("flex-1 min-h-0 overflow-hidden", dimmed && "pointer-events-none")}>
        {mode === "code" ? (
          projectPath ? (
            <CodeFileViewer
              key={projectPath}
              path={projectPath}
              onSegmentClick={(segPath) => {
                const next = `${segPath}/README.md`
                setProjectPath(next)
                syncProjectUrl("files", next, null)
              }}
              onOpenInPages={openInPages}
              onDeleted={() => {
                setProjectPath(null)
                syncProjectUrl("files", null, null)
              }}
            />
          ) : (
            <EmptyPane
              icon={Code2}
              title="Pick a code file"
              body="Browse the source tree on the left or switch to Pages mode for the friendly view."
            />
          )
        ) : mode === "all" ? (
          selectedPath ? (
            <FileEditor key={selectedPath} path={selectedPath} onPathChange={setSelectedPath} />
          ) : (
            <AllModeLanding onSelect={onSelect} />
          )
        ) : selectedPath ? (
          <FileEditor key={selectedPath} path={selectedPath} onPathChange={setSelectedPath} />
        ) : (
          <EmptyPane
            icon={FileText}
            title="Pick a file from the tree"
            body="Folders mirror real directories on the AI VPS — your edits here are the same files your AI reads on the terminal."
          />
        )}
      </div>
      <TimeMachine />
    </div>
  )
}

function EmptyPane({
  icon: Icon, title, body,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  body: string
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-mem-text-secondary text-sm px-6">
      <Icon className="w-8 h-8 mb-3 text-mem-text-muted" />
      <div className="text-mem-text-primary text-[14px]">{title}</div>
      <div className="text-[12px] text-mem-text-muted mt-2 max-w-md text-center">
        {body}
      </div>
    </div>
  )
}
