"use client"

/**
 * AgentFrontmatterStrip — parses the YAML frontmatter at the top of an agent
 * .md file and renders model/tools/parent/color as compact metadata pills.
 *
 * BUG-015 fix: previously the YAML block was rendered as flowing prose by the
 * Markdown preview ("--- name: outreach-tester description: …"). This strip
 * extracts and renders it as structured metadata so the body can render clean.
 *
 * Intentionally NO new package: a 30-line regex YAML parser handles the simple
 * key/value subset agent skill files use. No nested objects, no anchors —
 * just `key: value`, `key: [a, b]`, and the `---` fences.
 *
 * Exports:
 *   - parseAgentMd(text)              → { frontmatter, body, raw }
 *   - <AgentFrontmatterStrip fm={…} /> → renders the pills row
 */

import * as React from "react"
import { Cpu, Wrench, GitFork, Palette, Layers } from "lucide-react"
import { cn } from "@/lib/utils"

export interface AgentFrontmatter {
  /** Slug-ish identifier from the file. */
  name?: string
  /** One-line description. */
  description?: string
  /** "opus" | "sonnet" | "haiku" | other. */
  model?: string
  /** Capability tools, parsed from a `[a, b]` array OR a comma-separated line. */
  tools?: string[]
  /** Parent agent slug, for inheritance chains. */
  parent?: string
  /** Persona id, if linked. */
  persona?: string
  /** Display color hint (e.g. "cyan", "purple"). */
  color?: string
  /** Numeric token cap. */
  max_tokens?: number
  /** Whether this agent orchestrates other agents. */
  is_orchestrator?: boolean
  /** Anything else we didn't recognize, kept as raw strings. */
  [key: string]: string | string[] | number | boolean | undefined
}

export interface ParsedAgentMd {
  frontmatter: AgentFrontmatter
  /** The post-frontmatter body, ready to feed into a markdown editor / preview. */
  body: string
  /** True iff a frontmatter block was found and parsed. */
  hasFrontmatter: boolean
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/

/**
 * Parse a single YAML scalar value into a JS primitive (or string).
 * Handles strings, numbers, booleans, null, and inline arrays.
 */
function parseScalar(raw: string): string | number | boolean | string[] | null {
  const v = raw.trim()
  if (v === "" || v === "null" || v === "~") return null
  if (v === "true") return true
  if (v === "false") return false
  if (/^-?\d+$/.test(v)) return parseInt(v, 10)
  if (/^-?\d+\.\d+$/.test(v)) return parseFloat(v)
  if (v.startsWith("[") && v.endsWith("]")) {
    const inner = v.slice(1, -1).trim()
    if (!inner) return []
    return inner
      .split(",")
      .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      .filter((s) => s.length > 0)
  }
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1)
  }
  return v
}

/**
 * 30-line regex YAML parser. Returns frontmatter + body. If no `---` fence is
 * found, the entire input is treated as body and frontmatter is empty.
 */
export function parseAgentMd(text: string): ParsedAgentMd {
  const m = FRONTMATTER_RE.exec(text)
  if (!m) {
    return { frontmatter: {}, body: text, hasFrontmatter: false }
  }
  const fmText = m[1]
  const body = m[2] ?? ""
  const fm: AgentFrontmatter = {}
  for (const rawLine of fmText.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue
    const kv = /^([\w_]+)\s*:\s*(.*)$/.exec(line)
    if (!kv) continue
    const key = kv[1]
    const val = parseScalar(kv[2])
    // The `tools:` field in agent skills is sometimes a CSV string instead
    // of a YAML array — coerce it to string[] for consistency.
    if (key === "tools") {
      if (Array.isArray(val)) fm.tools = val
      else if (typeof val === "string")
        fm.tools = val.split(",").map((s) => s.trim()).filter(Boolean)
      continue
    }
    if (typeof val === "boolean" || typeof val === "number" || typeof val === "string" || val === null || Array.isArray(val)) {
      // null becomes undefined so consumers can rely on optional-prop semantics.
      if (val !== null) (fm as Record<string, unknown>)[key] = val
    }
  }
  return { frontmatter: fm, body, hasFrontmatter: true }
}

/* -------------------------------------------------------------------------- */
/*                                Pill renderer                                */
/* -------------------------------------------------------------------------- */

interface PillProps {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
}

function Pill({ icon, label, value }: PillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full",
        "bg-mem-surface-2 border border-mem-border text-[11px]"
      )}
      title={label}
    >
      <span className="text-mem-text-muted">{icon}</span>
      <span className="text-mem-text-muted">{label}</span>
      <span className="text-mem-text-primary font-mono">{value}</span>
    </span>
  )
}

interface AgentFrontmatterStripProps {
  fm: AgentFrontmatter
  className?: string
}

export function AgentFrontmatterStrip({ fm, className }: AgentFrontmatterStripProps) {
  const tools = fm.tools && fm.tools.length > 0 ? fm.tools : null
  const hasAny = !!(fm.model || tools || fm.parent || fm.color || fm.max_tokens)

  if (!hasAny) {
    return (
      <div className={cn("flex items-center gap-2 px-4 py-3 border-b border-mem-border bg-mem-surface-1", className)}>
        <span className="text-[11px] text-mem-text-muted italic">
          No frontmatter detected on this agent file.
        </span>
      </div>
    )
  }

  const toolsLabel = tools
    ? tools.length <= 3
      ? tools.join(", ")
      : `${tools.slice(0, 3).join(", ")} +${tools.length - 3}`
    : null

  return (
    <div
      className={cn(
        "flex items-center flex-wrap gap-2 px-4 py-3 border-b border-mem-border bg-mem-surface-1",
        className
      )}
      data-testid="agent-frontmatter-strip"
    >
      {fm.model && <Pill icon={<Cpu className="w-3 h-3" />} label="model" value={fm.model} />}
      {toolsLabel && <Pill icon={<Wrench className="w-3 h-3" />} label="tools" value={toolsLabel} />}
      {fm.parent && <Pill icon={<GitFork className="w-3 h-3" />} label="parent" value={fm.parent} />}
      {fm.color && <Pill icon={<Palette className="w-3 h-3" />} label="color" value={fm.color} />}
      {typeof fm.max_tokens === "number" && (
        <Pill icon={<Layers className="w-3 h-3" />} label="max_tokens" value={fm.max_tokens.toLocaleString()} />
      )}
      {fm.is_orchestrator && (
        <span className="inline-flex items-center h-7 px-2.5 rounded-full bg-mem-accent/15 border border-mem-accent/30 text-mem-accent text-[11px] font-mono">
          orchestrator
        </span>
      )}
    </div>
  )
}
