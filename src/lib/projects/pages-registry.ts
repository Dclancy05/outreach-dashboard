/**
 * Friendly registry of user-visible pages, background jobs, agents, and
 * "not yet built" features. Curated for a non-technical user — only the
 * pages Dylan actually uses, with plain-language descriptions.
 *
 * Data is intentionally static to avoid the "billion files" problem he
 * called out — adding a new entry is a one-line PR.
 */

export interface FriendlyPage {
  route: string                    // e.g. "/agency/memory"
  title: string                    // e.g. "Memory"
  description: string              // plain-language one-liner
  emoji: string
  section: PageSection
}

export type PageSection =
  | "Daily"
  | "Agency"
  | "Outreach"
  | "Content"
  | "Setup"
  | "Other"

export const SECTION_ORDER: PageSection[] = ["Daily", "Agency", "Outreach", "Content", "Setup", "Other"]

export const FRIENDLY_PAGES: FriendlyPage[] = [
  // ── Daily ──────────────────────────────────────────────────
  {
    route: "/dashboard",
    title: "Dashboard",
    description: "The main overview page — KPIs, alerts, what to look at first each morning.",
    emoji: "🏠",
    section: "Daily",
  },
  {
    route: "/leads",
    title: "Leads",
    description: "Every business you're tracking, with their stage in the pipeline.",
    emoji: "📋",
    section: "Daily",
  },
  {
    route: "/outreach",
    title: "Outreach",
    description: "Live view of what's being sent right now, who's responded, what's queued.",
    emoji: "📤",
    section: "Daily",
  },
  {
    route: "/automations",
    title: "Automations",
    description: "Your message sequences — what gets sent on day 1, day 3, day 7.",
    emoji: "🤖",
    section: "Daily",
  },
  {
    route: "/campaigns",
    title: "Campaigns",
    description: "Group sends — pick a list and an automation, fire it off.",
    emoji: "🎯",
    section: "Daily",
  },

  // ── Agency ────────────────────────────────────────────────
  {
    route: "/agency",
    title: "Agency Home",
    description: "Top-level agency view — across all businesses you manage.",
    emoji: "🏢",
    section: "Agency",
  },
  {
    route: "/agency/memory",
    title: "Memory",
    description: "Your AI's brain — markdown notes, source code, API keys, agents. The page you're on.",
    emoji: "🧠",
    section: "Agency",
  },
  {
    route: "/agency/businesses",
    title: "Businesses",
    description: "All the local businesses you're working with.",
    emoji: "🏪",
    section: "Agency",
  },
  {
    route: "/agency/analytics",
    title: "Analytics",
    description: "Send rates, response rates, conversion rates per platform.",
    emoji: "📈",
    section: "Agency",
  },
  {
    route: "/agency/costs",
    title: "Costs",
    description: "What you're spending — proxies, AI, SMS — and ROI per business.",
    emoji: "💰",
    section: "Agency",
  },
  {
    route: "/agency/lead-scraper",
    title: "Lead Scraper",
    description: "Find new local businesses to reach out to.",
    emoji: "🔍",
    section: "Agency",
  },
  {
    route: "/agency/security",
    title: "Security",
    description: "Login attempts, sessions, audit log.",
    emoji: "🛡️",
    section: "Agency",
  },
  {
    route: "/agency/team",
    title: "Team",
    description: "Virtual assistants — invite, assign access, manage roles.",
    emoji: "👥",
    section: "Agency",
  },

  // ── Outreach plumbing ─────────────────────────────────────
  {
    route: "/accounts",
    title: "Accounts",
    description: "The Instagram, FB, LinkedIn, email accounts your messages go from.",
    emoji: "👤",
    section: "Outreach",
  },
  {
    route: "/accounts-manage",
    title: "Manage Accounts",
    description: "Add new accounts, swap proxies, run warmup.",
    emoji: "⚙️",
    section: "Outreach",
  },

  // ── Content ───────────────────────────────────────────────
  {
    route: "/content",
    title: "Content",
    description: "Top-level content view — recent posts, pending posts.",
    emoji: "📝",
    section: "Content",
  },
  {
    route: "/content-hq/calendar",
    title: "Content Calendar",
    description: "See what's scheduled to post and when.",
    emoji: "📅",
    section: "Content",
  },
  {
    route: "/content-hq/factory",
    title: "Content Factory",
    description: "Where AI generates posts in bulk.",
    emoji: "🏭",
    section: "Content",
  },
  {
    route: "/content-hq/hooks",
    title: "Hooks Library",
    description: "Saved opening lines that get attention.",
    emoji: "🪝",
    section: "Content",
  },
  {
    route: "/content-hq/trends",
    title: "Trends",
    description: "What's currently popular on each platform.",
    emoji: "📊",
    section: "Content",
  },
  {
    route: "/content-hq/inspiration",
    title: "Inspiration",
    description: "Reference posts and ideas you've saved.",
    emoji: "💡",
    section: "Content",
  },

  // ── Setup ──────────────────────────────────────────────────
  {
    route: "/get-started",
    title: "Get Started",
    description: "Onboarding checklist — what to do on day one.",
    emoji: "🚀",
    section: "Setup",
  },
  {
    route: "/account-setup",
    title: "Account Setup",
    description: "Wizard for adding a new social account end-to-end.",
    emoji: "🪄",
    section: "Setup",
  },
]

// ─────────────────────────────────────────────────────────────
// Background jobs (cron) — friendly descriptions for the 8 crons in vercel.json
// ─────────────────────────────────────────────────────────────

export interface FriendlyCron {
  path: string
  schedule: string
  scheduleHuman: string
  title: string
  description: string
  emoji: string
}

export const FRIENDLY_CRONS: FriendlyCron[] = [
  {
    path: "/api/cron/cookie-backup",
    schedule: "0 7 * * *",
    scheduleHuman: "Every day at 7:00 AM UTC",
    title: "Cookie backup",
    description: "Saves login cookies for every social account so they don't get logged out.",
    emoji: "🍪",
  },
  {
    path: "/api/cron/warmup-tick",
    schedule: "0 8 * * *",
    scheduleHuman: "Every day at 8:00 AM UTC",
    title: "Warmup tick",
    description: "Bumps each new social account up the warmup schedule (day 1 → 2 → 3...).",
    emoji: "🔥",
  },
  {
    path: "/api/retry-queue/process",
    schedule: "0 9 * * *",
    scheduleHuman: "Every day at 9:00 AM UTC",
    title: "Retry queue",
    description: "Re-tries any sends that failed earlier (network blips, captchas, etc.).",
    emoji: "🔁",
  },
  {
    path: "/api/cron/automations-maintenance",
    schedule: "0 10 * * *",
    scheduleHuman: "Every day at 10:00 AM UTC",
    title: "Automation health check",
    description: "Replays every automation against test targets. Self-heals broken selectors.",
    emoji: "🩺",
  },
  {
    path: "/api/ai-agent/scan",
    schedule: "30 10 * * *",
    scheduleHuman: "Every day at 10:30 AM UTC",
    title: "AI daily scan",
    description: "AI looks at the day's data and surfaces anomalies / opportunities.",
    emoji: "🧐",
  },
  {
    path: "/api/cron/deadman-check",
    schedule: "0 11 * * *",
    scheduleHuman: "Every day at 11:00 AM UTC",
    title: "Dead man's switch",
    description: "If the system hasn't been alive for 24 h you get a Telegram alert.",
    emoji: "⚰️",
  },
  {
    path: "/api/cron/cookies-health-check",
    schedule: "0 12 * * *",
    scheduleHuman: "Every day at 12:00 PM UTC",
    title: "Cookie freshness check",
    description: "Verifies each platform's saved cookies still log in.",
    emoji: "🍯",
  },
  {
    path: "/api/cron/campaign-worker",
    schedule: "0 13 * * *",
    scheduleHuman: "Every day at 1:00 PM UTC",
    title: "Campaign worker",
    description: "Drains the send queue — actually sends today's queued messages.",
    emoji: "🚚",
  },
]

// ─────────────────────────────────────────────────────────────
// "Not built yet" — from SYSTEM.md §24 + cron-jobs-todo.md
// ─────────────────────────────────────────────────────────────

export interface NotBuiltItem {
  title: string
  description: string
  why: string
  priority: "P1" | "P2" | "P3"
}

export const NOT_BUILT: NotBuiltItem[] = [
  {
    title: "Response detection",
    description: "Poll IG, FB, LinkedIn, and email inboxes to see when someone replies.",
    why: "Without this, deals don't close — there's no signal to switch a lead from \"messaged\" to \"in conversation.\"",
    priority: "P1",
  },
  {
    title: "Reply auto-pause",
    description: "When a lead responds, automatically pause the rest of their automation sequence.",
    why: "Otherwise they get the day-3 message after they already replied — looks like spam.",
    priority: "P1",
  },
  {
    title: "Account health auto-pause",
    description: "Pause sending from any account that's hitting too many errors.",
    why: "Catches an account starting to get banned before all sends fail.",
    priority: "P1",
  },
  {
    title: "Conditional branches in sequence builder",
    description: "Wait-as-first-class step + if/then logic in automations.",
    why: "Lets you build smarter flows like \"if no reply by day 5, send X.\"",
    priority: "P2",
  },
  {
    title: "Day-advance cron",
    description: "Nightly job that bumps every active lead's day counter.",
    why: "So day-3 messages actually fire on day 3.",
    priority: "P2",
  },
  {
    title: "Midnight reset cron",
    description: "Resets per-account daily send counters at midnight.",
    why: "So caps work — \"max 30 sends per day\" only matters if 'today' resets.",
    priority: "P2",
  },
  {
    title: "Self-healing selectors",
    description: "When a Meta DOM change breaks a click selector: text → vision AI → auto-repair.",
    why: "Reduces \"Meta updated their UI again\" outages from days to minutes.",
    priority: "P2",
  },
  {
    title: "Pipeline auto-movement",
    description: "When a lead replies, auto-bump them to the next pipeline stage.",
    why: "Saves a manual click per response — adds up at scale.",
    priority: "P2",
  },
  {
    title: "Setup wizard",
    description: "Full guided onboarding (proxies → accounts → first automation → first campaign).",
    why: "Cuts time-to-first-send from days to an hour for a new client.",
    priority: "P3",
  },
]
