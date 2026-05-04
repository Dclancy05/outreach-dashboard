/**
 * Shared color / icon / lifecycle palette for terminal sessions.
 *
 * Centralised so the SessionList row dot, the TerminalPane header strip, the
 * activity-feed line, the spawn dialog preview, and the command-palette item
 * all use the same vocabulary. Changing a color name means editing exactly
 * one file.
 *
 * Phase 4 #7 (color/icon/nickname) and #11 (6-state lifecycle).
 */
import {
  AlertCircle,
  Bot,
  Bug,
  Check,
  CircleDot,
  Cog,
  Database,
  FlaskConical,
  Hammer,
  Layers,
  Loader2,
  Pause,
  Rocket,
  Search,
  Server,
  Sparkles,
  Terminal as TerminalIcon,
  Zap,
  type LucideIcon,
} from "lucide-react"

/* -------------------------------------------------------------------------- */
/*                                   Colors                                   */
/* -------------------------------------------------------------------------- */

export const TERMINAL_COLORS = [
  "cyan",
  "emerald",
  "amber",
  "violet",
  "rose",
  "sky",
  "lime",
  "fuchsia",
] as const
export type TerminalColor = (typeof TERMINAL_COLORS)[number]

/** Map a stored color to the matching Tailwind class atoms.
 *  Returns a default cyan palette for unknown / null values. */
export function colorClasses(color?: string | null): {
  dot: string
  border: string
  ring: string
  text: string
  bgSoft: string
} {
  switch (color as TerminalColor | null | undefined) {
    case "emerald":
      return { dot: "bg-emerald-400", border: "border-emerald-500/30", ring: "ring-emerald-500/40", text: "text-emerald-200", bgSoft: "bg-emerald-500/10" }
    case "amber":
      return { dot: "bg-amber-400", border: "border-amber-500/30", ring: "ring-amber-500/40", text: "text-amber-200", bgSoft: "bg-amber-500/10" }
    case "violet":
      return { dot: "bg-violet-400", border: "border-violet-500/30", ring: "ring-violet-500/40", text: "text-violet-200", bgSoft: "bg-violet-500/10" }
    case "rose":
      return { dot: "bg-rose-400", border: "border-rose-500/30", ring: "ring-rose-500/40", text: "text-rose-200", bgSoft: "bg-rose-500/10" }
    case "sky":
      return { dot: "bg-sky-400", border: "border-sky-500/30", ring: "ring-sky-500/40", text: "text-sky-200", bgSoft: "bg-sky-500/10" }
    case "lime":
      return { dot: "bg-lime-400", border: "border-lime-500/30", ring: "ring-lime-500/40", text: "text-lime-200", bgSoft: "bg-lime-500/10" }
    case "fuchsia":
      return { dot: "bg-fuchsia-400", border: "border-fuchsia-500/30", ring: "ring-fuchsia-500/40", text: "text-fuchsia-200", bgSoft: "bg-fuchsia-500/10" }
    case "cyan":
    default:
      return { dot: "bg-cyan-400", border: "border-cyan-500/30", ring: "ring-cyan-500/40", text: "text-cyan-200", bgSoft: "bg-cyan-500/10" }
  }
}

/* -------------------------------------------------------------------------- */
/*                                   Icons                                    */
/* -------------------------------------------------------------------------- */

/** 12 picks. Stored as lowercase string keys; the resolver maps to lucide. */
export const TERMINAL_ICONS = [
  "terminal",
  "rocket",
  "bug",
  "search",
  "bot",
  "cog",
  "hammer",
  "flask",
  "layers",
  "database",
  "server",
  "sparkles",
] as const
export type TerminalIconName = (typeof TERMINAL_ICONS)[number]

const ICON_MAP: Record<TerminalIconName, LucideIcon> = {
  terminal: TerminalIcon,
  rocket: Rocket,
  bug: Bug,
  search: Search,
  bot: Bot,
  cog: Cog,
  hammer: Hammer,
  flask: FlaskConical,
  layers: Layers,
  database: Database,
  server: Server,
  sparkles: Sparkles,
}

export function iconFor(name?: string | null): LucideIcon {
  const k = (name as TerminalIconName | null | undefined) || "terminal"
  return ICON_MAP[k] || TerminalIcon
}

/* -------------------------------------------------------------------------- */
/*                                 Lifecycle                                  */
/* -------------------------------------------------------------------------- */

export type LifecycleState =
  | "starting"
  | "running"
  | "awaiting-input"
  | "paused"
  | "errored"
  | "done"

interface LifecycleMeta {
  /** Tailwind class for the small dot. */
  dot: string
  /** Tailwind class for the badge text. */
  text: string
  /** Tailwind class for badge background (soft). */
  bg: string
  /** A friendly label — appears in tooltips and the activity feed. */
  label: string
  /** Companion icon — used in the activity feed. */
  icon: LucideIcon
  /** Whether the dot should pulse. */
  pulse?: boolean
}

export const LIFECYCLE_META: Record<LifecycleState, LifecycleMeta> = {
  starting:        { dot: "bg-amber-400", text: "text-amber-200", bg: "bg-amber-500/15", label: "Starting", icon: Loader2, pulse: true },
  running:         { dot: "bg-emerald-400", text: "text-emerald-200", bg: "bg-emerald-500/15", label: "Running", icon: Zap },
  "awaiting-input":{ dot: "bg-cyan-400", text: "text-cyan-200", bg: "bg-cyan-500/15", label: "Waiting on you", icon: CircleDot, pulse: true },
  paused:          { dot: "bg-orange-400", text: "text-orange-200", bg: "bg-orange-500/15", label: "Paused", icon: Pause },
  errored:         { dot: "bg-red-500", text: "text-red-200", bg: "bg-red-500/15", label: "Errored", icon: AlertCircle },
  done:            { dot: "bg-zinc-500", text: "text-zinc-300", bg: "bg-zinc-700/30", label: "Done", icon: Check },
}

/** Derive a lifecycle state from a row, preferring the new column over the
 *  legacy `status` enum. Returns `running` as the safest default. */
export function deriveLifecycle(row: {
  lifecycle_state?: string | null
  status?: string | null
  cost_usd?: number | null
  cost_cap_usd?: number | null
}): LifecycleState {
  const ls = row.lifecycle_state as LifecycleState | undefined
  if (ls && (LIFECYCLE_META as Record<string, unknown>)[ls]) return ls
  // Cost-cap trip implies errored even if `status` lags behind.
  if (row.cost_usd != null && row.cost_cap_usd != null && row.cost_cap_usd > 0 &&
      row.cost_usd >= row.cost_cap_usd) {
    return "errored"
  }
  switch (row.status) {
    case "starting": return "starting"
    case "idle":     return "awaiting-input"
    case "paused":   return "paused"
    case "crashed":  return "errored"
    case "stopped":  return "done"
    case "running":  return "running"
    default:         return "running"
  }
}
