"use client"

/**
 * One component per node type, sharing a common visual chrome. We wrap them
 * in a NODE_TYPES map that xyflow consumes via <ReactFlow nodeTypes={...}>.
 */

import { Handle, Position, type NodeProps } from "@xyflow/react"
import {
  Play, Bot, Workflow as WorkflowIcon, Repeat, GitBranch, Hand, CheckCircle2,
} from "lucide-react"
import { cn } from "@/lib/utils"

type Tone = "amber" | "blue" | "violet" | "emerald" | "rose" | "zinc"

const TONE: Record<Tone, { bg: string; border: string; text: string; iconBg: string }> = {
  amber:   { bg: "bg-amber-500/5",   border: "border-amber-500/40",   text: "text-amber-300",   iconBg: "bg-amber-500/15" },
  blue:    { bg: "bg-blue-500/5",    border: "border-blue-500/40",    text: "text-blue-300",    iconBg: "bg-blue-500/15"  },
  violet:  { bg: "bg-violet-500/5",  border: "border-violet-500/40",  text: "text-violet-300",  iconBg: "bg-violet-500/15"},
  emerald: { bg: "bg-emerald-500/5", border: "border-emerald-500/40", text: "text-emerald-300", iconBg: "bg-emerald-500/15"},
  rose:    { bg: "bg-rose-500/5",    border: "border-rose-500/40",    text: "text-rose-300",    iconBg: "bg-rose-500/15"   },
  zinc:    { bg: "bg-zinc-800/40",   border: "border-zinc-700",       text: "text-zinc-300",    iconBg: "bg-zinc-700/40"   },
}

function NodeShell({
  tone, icon, label, kind, selected, hasInput = true, hasOutput = true, subtitle, children,
}: {
  tone: Tone
  icon: React.ReactNode
  label: string
  kind: string
  selected?: boolean
  hasInput?: boolean
  hasOutput?: boolean
  subtitle?: string
  children?: React.ReactNode
}) {
  const t = TONE[tone]
  return (
    <div className={cn(
      "rounded-lg border-2 px-3 py-2 min-w-[180px] shadow-sm transition-all",
      t.bg, t.border,
      selected && "ring-2 ring-amber-400/50 ring-offset-0",
    )}>
      {hasInput && <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-zinc-500 !border-zinc-700" />}
      <div className="flex items-center gap-2">
        <div className={cn("w-7 h-7 rounded flex items-center justify-center", t.iconBg)}>
          <span className={t.text}>{icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[9px] uppercase tracking-wider text-zinc-500">{kind}</div>
          <div className="text-xs font-medium text-zinc-100 truncate">{label}</div>
          {subtitle && <div className="text-[10px] text-zinc-500 truncate">{subtitle}</div>}
        </div>
      </div>
      {children && <div className="mt-2">{children}</div>}
      {hasOutput && <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-zinc-500 !border-zinc-700" />}
    </div>
  )
}

interface NodeData {
  label: string
  agent_slug?: string
  prompt?: string
  output_var?: string
  routes?: string[]
  mode?: "for_each" | "while" | "until"
  condition?: string
  collection_var?: string
  max_iterations?: number
  message?: string
  channel?: "in_app" | "sms" | "email"
  timeout_minutes?: number
  input_schema?: Record<string, string>
  output_schema?: Record<string, string>
}

function TriggerNode(props: NodeProps) {
  const data = props.data as unknown as NodeData
  return <NodeShell tone="emerald" icon={<Play className="w-4 h-4" />} label={data.label || "Start"} kind="trigger" selected={props.selected} hasInput={false} subtitle={data.input_schema ? `${Object.keys(data.input_schema).length} input(s)` : undefined} />
}

function AgentNode(props: NodeProps) {
  const data = props.data as unknown as NodeData
  return <NodeShell tone="blue" icon={<Bot className="w-4 h-4" />} label={data.label || "Agent"} kind="agent" selected={props.selected} subtitle={data.agent_slug ? `→ ${data.output_var || "output"}` : "no agent picked"} />
}

function OrchestratorNode(props: NodeProps) {
  const data = props.data as unknown as NodeData
  return <NodeShell tone="violet" icon={<WorkflowIcon className="w-4 h-4" />} label={data.label || "Orchestrator"} kind="orchestrator (routes)" selected={props.selected} subtitle={`${data.routes?.length || 0} routes`} />
}

function LoopNode(props: NodeProps) {
  const data = props.data as unknown as NodeData
  return (
    <div className={cn(
      "rounded-lg border-2 border-dashed transition-all",
      "bg-amber-500/[0.03] border-amber-500/40 px-3 pt-2 pb-3",
      "min-w-[400px] min-h-[200px] w-full h-full relative",
      props.selected && "ring-2 ring-amber-400/50",
    )}>
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-zinc-500 !border-zinc-700 !top-7" />
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-zinc-500 !border-zinc-700 !top-7" />
      <div className="flex items-center gap-2 mb-2">
        <div className="w-6 h-6 rounded bg-amber-500/15 flex items-center justify-center">
          <Repeat className="w-3.5 h-3.5 text-amber-300" />
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-wider text-zinc-500">loop</div>
          <div className="text-xs font-medium text-zinc-100">{data.label || "Loop"}</div>
        </div>
        <div className="ml-auto text-[10px] text-zinc-500">
          {data.mode || "until"} · max {data.max_iterations || "?"}
        </div>
      </div>
    </div>
  )
}

function RouterNode(props: NodeProps) {
  const data = props.data as unknown as NodeData
  return (
    <div className={cn(
      "rounded-lg border-2 px-3 py-2 min-w-[180px] shadow-sm",
      TONE.zinc.bg, TONE.zinc.border,
      props.selected && "ring-2 ring-amber-400/50",
    )}>
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-zinc-500 !border-zinc-700" />
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded bg-zinc-700/40 flex items-center justify-center">
          <GitBranch className="w-4 h-4 text-zinc-300" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[9px] uppercase tracking-wider text-zinc-500">router</div>
          <div className="text-xs font-medium text-zinc-100 truncate">{data.label || "If/Else"}</div>
          <div className="text-[10px] text-zinc-500 truncate font-mono">{data.condition || "(set condition)"}</div>
        </div>
      </div>
      <Handle id="true"  type="source" position={Position.Right} style={{ top: "30%" }} className="!w-2 !h-2 !bg-emerald-500 !border-emerald-700" />
      <Handle id="false" type="source" position={Position.Right} style={{ top: "70%" }} className="!w-2 !h-2 !bg-rose-500 !border-rose-700" />
      <div className="absolute right-2 top-[28%] text-[9px] text-emerald-400">T</div>
      <div className="absolute right-2 top-[68%] text-[9px] text-rose-400">F</div>
    </div>
  )
}

function ApprovalNode(props: NodeProps) {
  const data = props.data as unknown as NodeData
  return <NodeShell tone="rose" icon={<Hand className="w-4 h-4" />} label={data.label || "Approve"} kind="approval gate" selected={props.selected} subtitle={`pauses for ${data.timeout_minutes || 1440}min via ${data.channel || "in_app"}`} />
}

function OutputNode(props: NodeProps) {
  const data = props.data as unknown as NodeData
  return <NodeShell tone="emerald" icon={<CheckCircle2 className="w-4 h-4" />} label={data.label || "Done"} kind="output" selected={props.selected} hasOutput={false} />
}

export const NODE_TYPES = {
  trigger:      TriggerNode,
  agent:        AgentNode,
  orchestrator: OrchestratorNode,
  loop:         LoopNode,
  router:       RouterNode,
  approval:     ApprovalNode,
  output:       OutputNode,
}

export const PALETTE: Array<{ type: keyof typeof NODE_TYPES; label: string; icon: React.ReactNode; tone: Tone; help: string }> = [
  { type: "trigger",      label: "Trigger",      icon: <Play className="w-3.5 h-3.5" />,        tone: "emerald", help: "Workflow entry point" },
  { type: "agent",        label: "Agent",        icon: <Bot className="w-3.5 h-3.5" />,         tone: "blue",    help: "Run one agent" },
  { type: "orchestrator", label: "Orchestrator", icon: <WorkflowIcon className="w-3.5 h-3.5" />, tone: "violet",  help: "An agent that ROUTES — picks the next worker. Doesn't do work itself." },
  { type: "loop",         label: "Loop",         icon: <Repeat className="w-3.5 h-3.5" />,      tone: "amber",   help: "Repeat the inside until done. For test→fix→retest, etc." },
  { type: "router",       label: "If / Else",    icon: <GitBranch className="w-3.5 h-3.5" />,   tone: "zinc",    help: "Deterministic branch on a condition" },
  { type: "approval",     label: "Approval",     icon: <Hand className="w-3.5 h-3.5" />,        tone: "rose",    help: "Pauses for you to click Approve/Reject" },
  { type: "output",       label: "Output",       icon: <CheckCircle2 className="w-3.5 h-3.5" />, tone: "emerald", help: "Workflow exit — returns the final result" },
]
