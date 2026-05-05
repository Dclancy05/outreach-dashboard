"use client"

/**
 * /jarvis home page (replaces the bare redirect). Shows:
 *  - welcome strip with current persona + quick "open memory" CTA
 *  - 90-day activity heatmap
 *  - tile grid of every Jarvis surface for fast navigation
 *
 * The previous redirect to /jarvis/memory has been removed; users land here
 * by default. Use `g m` (or click "Open Memory") to reach the vault.
 */

import Link from "next/link"
import { motion, useReducedMotion } from "framer-motion"
import {
  Activity as ActivityIcon,
  ArrowRight,
  Bot,
  Brain,
  DollarSign,
  Eye,
  FileText,
  PanelTop,
  Plug,
  Terminal,
  Workflow,
} from "lucide-react"
import { ActivityHeatmap } from "./activity-heatmap"
import { enterJarvis } from "@/components/jarvis/motion/presets"
import { cn } from "@/lib/utils"

const TILES: { href: string; title: string; hint: string; icon: typeof Brain }[] = [
  { href: "/jarvis/memory", title: "Memory", hint: "Vault — every doc + plan", icon: Brain },
  { href: "/jarvis/agents", title: "Agents", hint: "Define, schedule, run", icon: Bot },
  { href: "/jarvis/terminals", title: "Terminals", hint: "Persistent Claude sessions", icon: Terminal },
  { href: "/jarvis/mcps", title: "MCPs", hint: "Servers + tool playground", icon: Plug },
  { href: "/jarvis/workflows", title: "Workflows", hint: "Visual builder", icon: Workflow },
  { href: "/jarvis/observability", title: "Observability", hint: "Live VNC", icon: Eye },
  { href: "/jarvis/cost", title: "Usage", hint: "Sessions, runs, API spend", icon: DollarSign },
  { href: "/jarvis/status", title: "System Status", hint: "VPS · services · crons", icon: ActivityIcon },
  { href: "/jarvis/audit", title: "Audit log", hint: "Every change", icon: FileText },
  { href: "/jarvis/settings", title: "Settings", hint: "Token budget · personas · MCP", icon: PanelTop },
]

export function JarvisHome() {
  const reduced = useReducedMotion() ?? false

  return (
    <motion.div {...enterJarvis} className="mx-auto w-full max-w-[1280px]">
      {/* Welcome */}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-mem-text-muted">JARVIS</p>
          <h1 className="text-2xl font-medium text-mem-text-primary">Welcome back</h1>
          <p className="mt-1 text-sm text-mem-text-secondary">
            Press <kbd className="rounded border border-mem-border bg-mem-surface-2 px-1 font-mono text-[10px]">?</kbd>{" "}
            for keyboard shortcuts · <kbd className="rounded border border-mem-border bg-mem-surface-2 px-1 font-mono text-[10px]">⌘K</kbd>{" "}
            for the command palette · <kbd className="rounded border border-mem-border bg-mem-surface-2 px-1 font-mono text-[10px]">g m</kbd>{" "}
            opens Memory.
          </p>
        </div>
        <Link
          href="/jarvis/memory"
          className="group inline-flex items-center gap-1.5 rounded-md border border-mem-border bg-mem-accent/10 px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-mem-accent transition hover:bg-mem-accent/20"
        >
          Open Memory
          <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </header>

      {/* Activity heatmap */}
      <ActivityHeatmap />

      {/* Tile grid — every Jarvis surface */}
      <section className="mt-6">
        <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-mem-text-muted">
          Surfaces
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {TILES.map((t, i) => (
            <motion.div
              key={t.href}
              initial={reduced ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, delay: i * 0.02, ease: [0.32, 0.72, 0, 1] }}
            >
              <Link
                href={t.href}
                className={cn(
                  "group flex h-full flex-col gap-2 rounded-xl border border-mem-border bg-mem-surface-1 p-4 transition-all",
                  "hover:border-mem-accent/40 hover:bg-mem-surface-2 hover:shadow-lg hover:shadow-mem-accent/5",
                )}
              >
                <div className="flex items-center justify-between">
                  <t.icon className="h-4 w-4 text-mem-text-secondary group-hover:text-mem-accent" />
                  <ArrowRight className="h-3 w-3 text-mem-text-muted opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
                </div>
                <div>
                  <p className="text-sm font-medium text-mem-text-primary">{t.title}</p>
                  <p className="mt-0.5 text-[11px] text-mem-text-secondary">{t.hint}</p>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>
    </motion.div>
  )
}
