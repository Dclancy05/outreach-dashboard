/**
 * Provider catalog — single source of truth for the API Keys tab dropdown
 * and the env-var → provider mapping that powers seed-import + masking.
 *
 * Bootstrap secrets (Supabase, ADMIN_PIN, SESSION_SIGNING_SECRET, CRON_SECRET,
 * OUTREACH_MEMORY_MCP_KEY) are intentionally absent — they must stay in
 * process.env or the secret-reader can't bootstrap itself.
 */

export type ProviderEntry = {
  slug: string
  label: string
  emoji?: string
  envVars: string[] // canonical first
  help: string
  href?: string
  placeholder?: string
  testable?: boolean
}

export const PROVIDERS: ProviderEntry[] = [
  {
    slug: "openai",
    label: "OpenAI",
    emoji: "🤖",
    envVars: ["OPENAI_API_KEY"],
    help: "Powers AI message generation and captions.",
    href: "https://platform.openai.com/api-keys",
    placeholder: "sk-...",
    testable: true,
  },
  {
    slug: "anthropic",
    label: "Anthropic Claude",
    emoji: "🧠",
    envVars: ["ANTHROPIC_API_KEY"],
    help: "Claude-powered writers and the in-app agent.",
    href: "https://console.anthropic.com/settings/keys",
    placeholder: "sk-ant-...",
    testable: true,
  },
  {
    slug: "apify",
    label: "Apify",
    emoji: "🕸️",
    envVars: ["APIFY_TOKEN", "APIFY_API_TOKEN"],
    help: "Powers Social Scout scraping.",
    href: "https://console.apify.com/account/integrations",
    placeholder: "apify_api_...",
    testable: true,
  },
  {
    slug: "instantly",
    label: "Instantly",
    emoji: "📧",
    envVars: ["INSTANTLY_API_KEY"],
    help: "Email outreach sender.",
    href: "https://app.instantly.ai/app/settings/integrations",
    placeholder: "Paste your Instantly API key",
    testable: true,
  },
  {
    slug: "ghl_key",
    label: "GoHighLevel API Key",
    emoji: "📱",
    envVars: ["GHL_API_KEY"],
    help: "Send SMS via your GHL subaccount.",
    href: "https://help.gohighlevel.com/support/solutions/articles/48000982605",
    placeholder: "Bearer token from GHL → Settings → API Key",
    testable: true,
  },
  {
    slug: "ghl_sub",
    label: "GHL Subaccount (Location) ID",
    emoji: "📍",
    envVars: ["GHL_SUBACCOUNT_ID", "GHL_LOCATION_ID"],
    help: "Location id under your agency that owns the SMS number.",
    placeholder: "abc123XYZsubaccountId",
  },
  {
    slug: "telegram_bot",
    label: "Telegram Bot Token",
    emoji: "🤖",
    envVars: ["TELEGRAM_BOT_TOKEN"],
    help: "Bot token for Dead Man's Switch alerts. Create one with @BotFather.",
    placeholder: "123456:ABC-DEF...",
    testable: true,
  },
  {
    slug: "telegram_chat",
    label: "Telegram Chat ID",
    emoji: "💬",
    envVars: ["TELEGRAM_CHAT_ID"],
    help: "Numeric chat id where alerts get sent. Get it from @userinfobot.",
    placeholder: "123456789",
    testable: true,
  },
  {
    slug: "brave",
    label: "Brave Search",
    emoji: "🔍",
    envVars: ["BRAVE_SEARCH_API_KEY", "BRAVE_API_KEY"],
    help: "Used by event scraping.",
    href: "https://brave.com/search/api/",
  },
  {
    slug: "elevenlabs",
    label: "ElevenLabs",
    emoji: "🎙️",
    envVars: ["ELEVENLABS_API_KEY"],
    help: "Text-to-speech / voice generation.",
    href: "https://elevenlabs.io/app/settings/api-keys",
  },
  {
    slug: "suno",
    label: "Suno",
    emoji: "🎵",
    envVars: ["SUNO_API_KEY"],
    help: "Music generation for video.",
  },
  {
    slug: "kling_access",
    label: "Kling Access Key",
    emoji: "🎬",
    envVars: ["KLING_ACCESS_KEY"],
    help: "Kling AI video generation (access key half).",
  },
  {
    slug: "kling_secret",
    label: "Kling Secret Key",
    emoji: "🎬",
    envVars: ["KLING_SECRET_KEY"],
    help: "Kling AI video generation (secret half).",
  },
  {
    slug: "kling_api",
    label: "Kling API Key",
    emoji: "🎬",
    envVars: ["KLING_API_KEY"],
    help: "Kling endpoint key (alternate flow).",
  },
  {
    slug: "google_oauth_id",
    label: "Google OAuth Client ID",
    emoji: "🔑",
    envVars: ["GOOGLE_CLIENT_ID"],
    help: "OAuth client id for Gmail / Docs.",
    href: "https://console.cloud.google.com/apis/credentials",
  },
  {
    slug: "google_oauth_secret",
    label: "Google OAuth Client Secret",
    emoji: "🔐",
    envVars: ["GOOGLE_CLIENT_SECRET"],
    help: "OAuth client secret for Gmail / Docs.",
  },
  {
    slug: "google_service_account",
    label: "Google Service Account JSON",
    emoji: "📄",
    envVars: ["GOOGLE_SERVICE_ACCOUNT_JSON"],
    help: "Base64-encoded service-account JSON for Google Docs.",
  },
  {
    slug: "ms_oauth_id",
    label: "Microsoft OAuth Client ID",
    emoji: "🔑",
    envVars: ["MICROSOFT_CLIENT_ID"],
    help: "Azure app client id for Outlook OAuth.",
  },
  {
    slug: "ms_oauth_secret",
    label: "Microsoft OAuth Client Secret",
    emoji: "🔐",
    envVars: ["MICROSOFT_CLIENT_SECRET"],
    help: "Azure app client secret for Outlook OAuth.",
  },
  {
    slug: "meta_app_id",
    label: "Meta App ID",
    emoji: "📘",
    envVars: ["META_APP_ID"],
    help: "Meta developer app id for Instagram Graph API.",
  },
  {
    slug: "meta_app_secret",
    label: "Meta App Secret",
    emoji: "📘",
    envVars: ["META_APP_SECRET"],
    help: "Meta developer app secret for Instagram Graph API.",
  },
  {
    slug: "gologin",
    label: "GoLogin API Token",
    emoji: "🌐",
    envVars: ["GOLOGIN_API_TOKEN"],
    help: "Browser profile manager for stealth browsing.",
    href: "https://app.gologin.com/personalArea/Settings/api",
  },
  {
    slug: "late",
    label: "LATE Cross-Post API",
    emoji: "📤",
    envVars: ["LATE_API_KEY"],
    help: "Cross-posting service.",
  },
  {
    slug: "vps_url",
    label: "Production VPS URL",
    emoji: "🖥️",
    envVars: ["VPS_URL", "RECORDING_SERVER_URL"],
    help: "Where the dashboard talks to VNC + Chrome service.",
    placeholder: "https://srv1197943.taild42583.ts.net:10000",
  },
  {
    slug: "vnc_key",
    label: "VNC Manager API Key",
    emoji: "🔒",
    envVars: ["VNC_API_KEY"],
    help: "Auth secret for the VNC manager service.",
  },
  {
    slug: "vnc_url",
    label: "VNC Manager URL",
    emoji: "🌐",
    envVars: ["VNC_MANAGER_URL"],
    help: "VNC manager endpoint.",
  },
  {
    slug: "memory_vault_url",
    label: "Memory Vault URL",
    emoji: "🗂️",
    envVars: ["MEMORY_VAULT_API_URL"],
    help: "File-tree memory API endpoint.",
  },
  {
    slug: "memory_vault_token",
    label: "Memory Vault Token",
    emoji: "🔐",
    envVars: ["MEMORY_VAULT_TOKEN"],
    help: "Auth token for the file-tree memory API.",
  },
  {
    slug: "claude_bridge_url",
    label: "Claude Bridge URL",
    emoji: "🌉",
    envVars: ["CLAUDE_BRIDGE_URL"],
    help: "Local Claude Bridge endpoint.",
  },
  {
    slug: "claude_bridge_key",
    label: "Claude Bridge Key",
    emoji: "🔑",
    envVars: ["CLAUDE_BRIDGE_KEY"],
    help: "Auth key for the local Claude Bridge.",
  },
  {
    slug: "project_doc_id",
    label: "Project Google Doc ID",
    emoji: "📝",
    envVars: ["PROJECT_DOC_ID"],
    help: "Doc id where project decisions get appended.",
  },
  {
    slug: "custom",
    label: "Custom (type your own env var name)",
    emoji: "🛠️",
    envVars: [],
    help: "Free-form. Type the env-var name and paste the value.",
  },
]

/** Bootstrap-only secrets — never UI-managed; getSecret returns env-only. */
export const BOOTSTRAP_ENV_VARS = new Set<string>([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ADMIN_PIN",
  "SESSION_SIGNING_SECRET",
  "CRON_SECRET",
  "OUTREACH_MEMORY_MCP_KEY",
])

export function findProviderBySlug(slug: string): ProviderEntry | null {
  return PROVIDERS.find((p) => p.slug === slug) ?? null
}

export function findProviderByEnvVar(envVar: string): ProviderEntry | null {
  return (
    PROVIDERS.find((p) => p.envVars.includes(envVar)) ?? null
  )
}

/** Mask all but the last 4 chars. Empty / very short values get a flat dot. */
export function maskSecret(raw: string | null | undefined): string {
  if (!raw) return ""
  const s = String(raw)
  if (s.length <= 4) return "•••••"
  return `${s.slice(0, 3)}…${s.slice(-4)}`
}
