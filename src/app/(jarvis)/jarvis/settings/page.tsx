"use client"

/**
 * /jarvis/settings — central settings hub.
 *
 * Tabs:
 *  - Personas: pick default persona; manage list
 *  - Memory: token budget for /api/memories/inject; auto-suggest toggle
 *  - Keyboard: list of shortcuts (read-only for now; W8.O3 editor follow-up)
 *  - Theme: light / dark / system (W7.C, follow-up)
 *  - System: links to /status, /cost, /audit, /integrations
 *
 * Scope of THIS file: a clean read-only landing for users who deep-link to
 * /jarvis/settings (sidebar Settings link + Cmd+K). The personas + memory
 * tabs already have full UIs at /agency/memory; we link through to those.
 */

import Link from "next/link"
import { motion, useReducedMotion } from "framer-motion"
import {
  Activity,
  Brain,
  DollarSign,
  ExternalLink,
  FileText,
  Keyboard,
  Moon,
  Palette,
  Plug,
  Settings as SettingsIcon,
  Sun,
  User,
} from "lucide-react"
import { enterJarvis } from "@/components/jarvis/motion/presets"
import { useTheme } from "@/contexts/theme-context"

type SettingTile = {
  href: string
  title: string
  hint: string
  icon: typeof SettingsIcon
  external?: boolean
}

const TILES: SettingTile[] = [
  {
    href: "/agency/memory",
    title: "Personas + Token budget",
    hint: "Default persona, memory injection budget, auto-suggest",
    icon: User,
    external: true,
  },
  {
    href: "/jarvis/mcps",
    title: "MCP Servers",
    hint: "Manage connected MCP integrations",
    icon: Plug,
  },
  {
    href: "/jarvis/cost",
    title: "Cost dashboard",
    hint: "Daily AI spend vs cap, top agents/workflows",
    icon: DollarSign,
  },
  {
    href: "/jarvis/audit",
    title: "Audit log",
    hint: "Every change made by any agent or user",
    icon: FileText,
  },
  {
    href: "/jarvis/status",
    title: "System status",
    hint: "VPS metrics, services, MCP health, crons",
    icon: Activity,
  },
  {
    href: "/jarvis/observability",
    title: "Observability (VNC)",
    hint: "Live Chrome window driving the senders",
    icon: Brain,
  },
]

export default function JarvisSettingsPage() {
  const reduced = useReducedMotion() ?? false
  const { theme, toggleTheme } = useTheme()

  return (
    <motion.div {...enterJarvis} className="mx-auto w-full max-w-[1024px]">
      <header className="mb-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-mem-text-muted">SETTINGS</p>
        <h1 className="text-2xl font-medium text-mem-text-primary">Configure Jarvis</h1>
        <p className="mt-1 text-sm text-mem-text-secondary">
          Most settings live deep in their own pages — this is the index. Press{" "}
          <kbd className="rounded border border-mem-border bg-mem-surface-2 px-1 font-mono text-[10px]">?</kbd>{" "}
          for the keyboard map.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TILES.map((t, i) => (
          <motion.div
            key={t.href}
            initial={reduced ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, delay: i * 0.03, ease: [0.32, 0.72, 0, 1] }}
          >
            <Link
              href={t.href}
              className="group flex h-full flex-col gap-2 rounded-xl border border-mem-border bg-mem-surface-1 p-4 transition-all hover:border-mem-accent/40 hover:bg-mem-surface-2 hover:shadow-lg hover:shadow-mem-accent/5"
            >
              <div className="flex items-center justify-between">
                <t.icon className="h-4 w-4 text-mem-text-secondary group-hover:text-mem-accent" />
                {t.external ? (
                  <ExternalLink className="h-3 w-3 text-mem-text-muted opacity-0 transition group-hover:opacity-100" />
                ) : null}
              </div>
              <div>
                <p className="text-sm font-medium text-mem-text-primary">{t.title}</p>
                <p className="mt-0.5 text-[11px] text-mem-text-secondary">{t.hint}</p>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>

      {/* Keyboard shortcuts read-only list */}
      <section className="mt-6 rounded-xl border border-mem-border bg-mem-surface-1 p-5">
        <header className="mb-3 flex items-center gap-2">
          <Keyboard className="h-4 w-4 text-mem-text-secondary" />
          <h3 className="text-sm font-medium text-mem-text-primary">Keyboard shortcuts</h3>
        </header>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {[
            { keys: ["?"], label: "Open keyboard help" },
            { keys: ["⌘", "K"], label: "Jarvis command palette" },
            { keys: ["⌘", "⇧", "K"], label: "Global command palette" },
            { keys: ["⌘", "⇧", "V"], label: "Voice dictation" },
            { keys: ["g", "m"], label: "Go to Memory" },
            { keys: ["g", "a"], label: "Go to Agents" },
            { keys: ["g", "t"], label: "Go to Terminals" },
            { keys: ["g", "s"], label: "Go to Status" },
          ].map((s, i) => (
            <li key={i} className="flex items-center justify-between gap-3 rounded-md border border-mem-border bg-mem-surface-2 px-3 py-2">
              <span className="text-sm text-mem-text-primary">{s.label}</span>
              <span className="flex items-center gap-1">
                {s.keys.map((k) => (
                  <kbd
                    key={k}
                    className="inline-flex min-w-[1.5rem] items-center justify-center rounded-md border border-mem-border bg-mem-surface-3 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-mem-text-secondary"
                  >
                    {k}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Theme toggle */}
      <section className="mt-4 rounded-xl border border-mem-border bg-mem-surface-1 p-5">
        <header className="mb-3 flex items-center gap-2">
          <Palette className="h-4 w-4 text-mem-text-secondary" />
          <h3 className="text-sm font-medium text-mem-text-primary">Theme</h3>
        </header>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-mem-text-primary">
              {theme === "dark" ? "Dark mode" : "Light mode"}
            </p>
            <p className="mt-0.5 text-[12px] text-mem-text-secondary">
              {theme === "dark"
                ? "Warm-dark palette with violet accent."
                : "Bright palette for daylight work."}
            </p>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-mem-border bg-mem-surface-2 px-3 text-sm text-mem-text-primary transition-colors hover:border-mem-border-strong hover:bg-mem-surface-3"
          >
            {theme === "dark" ? (
              <>
                <Sun className="h-4 w-4 text-amber-400" />
                <span>Switch to light</span>
              </>
            ) : (
              <>
                <Moon className="h-4 w-4 text-violet-400" />
                <span>Switch to dark</span>
              </>
            )}
          </button>
        </div>
      </section>
    </motion.div>
  )
}
