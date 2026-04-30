/**
 * One-shot seeder for Jarvis runtime secrets.
 *
 * Inserts rows into the `api_keys` table for the 5 values the remote-Claude
 * loop needs. getSecret() reads newest-by-env_var, so re-running just adds
 * a fresh row (older rows can be cleaned up via /agency/keys whenever).
 *
 * Usage: npx tsx scripts/seed-jarvis-secrets.ts
 *
 * Env required (read from .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   JARVIS_TELEGRAM_BOT_TOKEN
 *   JARVIS_TELEGRAM_CHAT_ID
 *   JARVIS_TELEGRAM_WEBHOOK_SECRET
 *   JARVIS_AGENT_RUNNER_URL
 *   JARVIS_AGENT_RUNNER_TOKEN
 */

import path from "path"
import dotenv from "dotenv"
import { createClient } from "@supabase/supabase-js"

dotenv.config({ path: path.join(__dirname, "../.env.local") })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

type SecretSeed = {
  env_var: string
  source_env: string  // process.env key to read the value from
  name: string
  provider: string
  notes: string
}

const SECRETS: SecretSeed[] = [
  {
    env_var: "TELEGRAM_BOT_TOKEN",
    source_env: "JARVIS_TELEGRAM_BOT_TOKEN",
    name: "Jarvis Bot — @Dylan_Jarvis_Bot",
    provider: "telegram",
    notes: "Bot token from BotFather. Used by sendTelegram() + setWebhook().",
  },
  {
    env_var: "TELEGRAM_CHAT_ID",
    source_env: "JARVIS_TELEGRAM_CHAT_ID",
    name: "Dylan's Telegram chat ID",
    provider: "telegram",
    notes: "Authorized chat for inbound webhook + default sendTelegram target.",
  },
  {
    env_var: "TELEGRAM_WEBHOOK_SECRET",
    source_env: "JARVIS_TELEGRAM_WEBHOOK_SECRET",
    name: "Jarvis webhook secret",
    provider: "telegram",
    notes: "Telegram echoes this back as X-Telegram-Bot-Api-Secret-Token; we constant-time compare.",
  },
  {
    env_var: "AGENT_RUNNER_URL",
    source_env: "JARVIS_AGENT_RUNNER_URL",
    name: "Agent runner public URL",
    provider: "tailscale-funnel",
    notes: "Public Tailscale Funnel URL of the agent-runner systemd service on srv1197943.",
  },
  {
    env_var: "AGENT_RUNNER_TOKEN",
    source_env: "JARVIS_AGENT_RUNNER_TOKEN",
    name: "Agent runner bearer token",
    provider: "self-hosted",
    notes: "Bearer token enforced by /root/agent-runner — set in /etc/agent-runner.env on the VPS.",
  },
]

async function main() {
  console.log(`[seed:jarvis-secrets] Inserting ${SECRETS.length} secret(s)…`)
  let inserted = 0
  let errors = 0
  for (const s of SECRETS) {
    const value = process.env[s.source_env]
    if (!value) {
      console.error(`  ! ${s.env_var} — missing ${s.source_env} in .env.local — SKIPPED`)
      errors++
      continue
    }
    const { error } = await supabase.from("api_keys").insert({
      name: s.name,
      provider: s.provider,
      env_var: s.env_var,
      value,
      notes: s.notes,
    })
    if (error) {
      console.error(`  ! ${s.env_var} — insert error: ${error.message}`)
      errors++
      continue
    }
    console.log(`  + inserted ${s.env_var}  (${s.name})`)
    inserted++
  }
  console.log(`[seed:jarvis-secrets] Done — ${inserted} inserted, ${errors} error(s).`)
  process.exit(errors > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
