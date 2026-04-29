/**
 * Schedule seeder.
 *
 * Idempotently inserts default schedules for system workflows. Run once to
 * arm Daily Health Check (and future scheduled workflows). Safe to re-run —
 * skips inserts when a schedule for the same (workflow_id, cron) already exists.
 *
 * Usage: npx tsx scripts/seed-schedules.ts
 */

import path from "path"
import dotenv from "dotenv"
import { createClient } from "@supabase/supabase-js"

dotenv.config({ path: path.join(__dirname, "../.env.local") })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local")
  process.exit(1)
}

const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

type ScheduleSeed = {
  workflow_id: string
  name: string
  cron: string
  timezone: string
  payload: Record<string, unknown>
}

const SCHEDULES: ScheduleSeed[] = [
  {
    workflow_id: "00000000-0000-4000-a000-000000000040",
    name: "Daily Health Check (7am ET)",
    cron: "0 7 * * *",
    timezone: "America/New_York",
    payload: { _meta: { source: "schedule" } },
  },
]

async function main() {
  console.log(`[seed:schedules] Checking ${SCHEDULES.length} schedule(s)…`)
  let inserted = 0
  let skipped = 0
  let errors = 0
  for (const s of SCHEDULES) {
    const { data: existing, error: selErr } = await sb
      .from("schedules")
      .select("id")
      .eq("workflow_id", s.workflow_id)
      .eq("cron", s.cron)
      .maybeSingle()
    if (selErr) {
      console.error(`  ! ${s.name} — select error:`, selErr.message)
      errors++
      continue
    }
    if (existing) {
      console.log(`  ~ skipped  ${s.name} (already exists)`)
      skipped++
      continue
    }
    const { error: insErr } = await sb.from("schedules").insert(s)
    if (insErr) {
      console.error(`  ! ${s.name} — insert error:`, insErr.message)
      errors++
      continue
    }
    console.log(`  + inserted ${s.name}`)
    inserted++
  }
  console.log(`[seed:schedules] Done — ${inserted} inserted, ${skipped} skipped, ${errors} error(s).`)
  process.exit(errors > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
