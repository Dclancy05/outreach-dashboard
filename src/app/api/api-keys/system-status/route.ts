/**
 * GET /api/api-keys/system-status
 *
 * Reports which bootstrap / system-level secrets are set in the running
 * environment (Vercel env vars). These are intentionally not in the api_keys
 * table because they need to be present BEFORE the dashboard can talk to the
 * DB at all. This endpoint surfaces them as read-only rows in the Keys tab so
 * Dylan can see at-a-glance which platform plumbing is wired up.
 *
 * Never returns the secret values themselves — only `set: bool` and a 4-char
 * suffix preview for the ones that are present.
 *
 * Auth: middleware enforces admin_session.
 */
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface SystemKey {
  env: string
  label: string
  emoji: string
  category: "System" | "AI / MCP" | "Storage"
  help: string
  href?: string
}

const SYSTEM_KEYS: SystemKey[] = [
  // ── Storage / DB plumbing ───────────────────────────────────
  {
    env: "NEXT_PUBLIC_SUPABASE_URL",
    label: "Supabase Project URL",
    emoji: "🗄️",
    category: "Storage",
    help: "The base URL of your Postgres database — needed to talk to it at all.",
  },
  {
    env: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    label: "Supabase Anon Key",
    emoji: "🔓",
    category: "Storage",
    help: "Public-side database key — readable by browsers, RLS-restricted.",
  },
  {
    env: "SUPABASE_SERVICE_ROLE_KEY",
    label: "Supabase Admin Key",
    emoji: "🔐",
    category: "Storage",
    help: "Server-only admin key. Bypasses RLS — never sent to the browser.",
  },

  // ── Auth / runtime gates ────────────────────────────────────
  {
    env: "ADMIN_PIN",
    label: "Admin PIN",
    emoji: "🔢",
    category: "System",
    help: "The 6-digit code that gates this whole dashboard.",
  },
  {
    env: "SESSION_SIGNING_SECRET",
    label: "Session Signing Secret",
    emoji: "✍️",
    category: "System",
    help: "Signs the cookie that proves you're logged in. Rotating it logs everyone out.",
  },
  {
    env: "CRON_SECRET",
    label: "Cron Secret",
    emoji: "⏰",
    category: "System",
    help: "Bearer token cron jobs use to call /api/cron/* on Vercel's schedule.",
  },

  // ── AI / MCP bridges ────────────────────────────────────────
  {
    env: "OUTREACH_MEMORY_MCP_KEY",
    label: "Memory MCP Key",
    emoji: "🧠",
    category: "AI / MCP",
    help: "Lets Claude Code on the terminal call /api/memories. Bridges the dashboard's memory store into AI sessions.",
  },
]

interface RowResponse {
  env: string
  label: string
  emoji: string
  category: SystemKey["category"]
  help: string
  href?: string
  set: boolean
  preview: string | null
}

function preview(value: string): string {
  if (value.length <= 4) return "•••••"
  return `${"•".repeat(8)}${value.slice(-4)}`
}

export async function GET() {
  const rows: RowResponse[] = SYSTEM_KEYS.map((k) => {
    const v = process.env[k.env]
    const has = typeof v === "string" && v.length > 0
    return {
      env: k.env,
      label: k.label,
      emoji: k.emoji,
      category: k.category,
      help: k.help,
      href: k.href,
      set: has,
      preview: has ? preview(v as string) : null,
    }
  })
  return NextResponse.json({ rows })
}
