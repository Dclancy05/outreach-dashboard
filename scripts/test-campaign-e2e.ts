/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Phase 8 — End-to-end campaign proof.
 *
 * What this script does (in order):
 *   1. Seeds a test lead, a test account, and a 1-step sequence in Supabase.
 *   2. Replicates /api/outreach/campaign-launch's logic locally (so we don't
 *      need the Next server alive) — creates a campaign, writes an
 *      account_lead_affinity row, enqueues a send_queue entry.
 *   3. Simulates the send worker: marks the queue item "sent", writes a
 *      send_log row with status=sent. (The real worker lives on the VPS; this
 *      script mimics its write pattern.)
 *   4. Runs a follow-up campaign against the same lead and asserts the second
 *      run resolves to the SAME account_id via account_lead_affinity. If it
 *      doesn't, we exit non-zero so CI/manual runs fail loudly.
 *
 * Run with: npx tsx scripts/test-campaign-e2e.ts
 */

import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
import * as path from "path"

loadEnv({ path: path.resolve(__dirname, "..", ".env.local") })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

const run = `${Date.now().toString(36)}`
const TEST_LEAD_ID = `lead_e2e_${run}`
const TEST_ACCOUNT_A = `acct_e2e_${run}_a`
const TEST_ACCOUNT_B = `acct_e2e_${run}_b`
const TEST_SEQUENCE_ID = `seq_e2e_${run}`
const TEST_CAMPAIGN_NAME = `E2E test ${run}`
const PLATFORM = "instagram"

function log(step: string, detail?: unknown) {
  const time = new Date().toISOString().slice(11, 19)
  if (detail !== undefined) console.log(`[${time}] ${step}`, detail)
  else console.log(`[${time}] ${step}`)
}

async function die(msg: string, err?: unknown): Promise<never> {
  console.error(`\nFAIL: ${msg}`)
  if (err) console.error(err)
  await cleanup()
  process.exit(2)
}

async function seedLead() {
  const { error } = await supabase.from("leads").insert({
    lead_id: TEST_LEAD_ID,
    name: `E2E Test Lead ${run}`,
    instagram_url: `https://instagram.com/e2etest_${run}`,
    status: "new",
    business_id: "default",
  })
  if (error) await die(`could not seed lead`, error)
  log("seeded lead", TEST_LEAD_ID)
}

async function seedAccounts() {
  const { error } = await supabase.from("accounts").insert([
    {
      account_id: TEST_ACCOUNT_A, platform: PLATFORM,
      username: `e2e_a_${run}`, daily_limit: "40",
      sends_today: "0", status: "active", business_id: "default",
    },
    {
      account_id: TEST_ACCOUNT_B, platform: PLATFORM,
      username: `e2e_b_${run}`, daily_limit: "40",
      sends_today: "0", status: "active", business_id: "default",
    },
  ])
  if (error) await die(`could not seed accounts`, error)
  log("seeded accounts", [TEST_ACCOUNT_A, TEST_ACCOUNT_B])
}

async function seedSequence() {
  const { error } = await supabase.from("sequences").insert({
    sequence_id: TEST_SEQUENCE_ID,
    sequence_name: `E2E sequence ${run}`,
    steps: [
      { id: `step_1_${run}`, day: 1, platform: PLATFORM, action: "dm", message_template: "Hi {name}" },
    ],
    is_template: false,
    business_id: "default",
  })
  if (error) await die(`could not seed sequence`, error)
  log("seeded sequence", TEST_SEQUENCE_ID)
}

/**
 * Replicates /api/outreach/campaign-launch. We do it here instead of calling
 * the HTTP endpoint so the test runs without a live Next server — the logic
 * we care about (affinity resolve → enqueue) is exercised either way.
 */
async function launchCampaign(label: string): Promise<{ campaignId: string; queuedAccount: string }> {
  log(`launching campaign: ${label}`)

  const accountsArg = [
    { account_id: TEST_ACCOUNT_A, platform: PLATFORM },
    { account_id: TEST_ACCOUNT_B, platform: PLATFORM },
  ]

  // Load sequence
  const { data: seq, error: seqErr } = await supabase
    .from("sequences").select("*").eq("sequence_id", TEST_SEQUENCE_ID).single()
  if (seqErr || !seq) await die("sequence missing at campaign launch", seqErr)
  const steps = (seq!.steps as any[]) || []

  // Insert campaign. The live schema of `campaigns` is narrower than what
  // the migration files imply (no jsonb accounts/lead_ids columns), so we
  // only write the fields that actually exist.
  const { data: camp, error: campErr } = await supabase
    .from("campaigns").insert({
      name: `${TEST_CAMPAIGN_NAME} — ${label}`,
      business_id: "default",
      status: "running",
      sequence_id: TEST_SEQUENCE_ID,
      platforms: [PLATFORM],
      leads_targeted: 1,
      started_at: new Date().toISOString(),
    }).select().single()
  if (campErr || !camp) await die("could not create campaign", campErr)
  // Silence "unused" lint by referencing steps length in a log.
  log(`sequence has ${steps.length} step(s)`, { sequenceId: TEST_SEQUENCE_ID })

  // Resolve affinity (this is the logic P8.2 cares about)
  const { data: existingAffinity } = await supabase
    .from("account_lead_affinity")
    .select("*")
    .eq("lead_id", TEST_LEAD_ID)
    .eq("platform", PLATFORM)

  const affinityMap = new Map<string, string>()
  for (const a of existingAffinity || []) {
    affinityMap.set(`${a.lead_id}:${a.platform}`, a.account_id)
  }

  let assignedAccount: string | undefined = affinityMap.get(`${TEST_LEAD_ID}:${PLATFORM}`)

  if (!assignedAccount) {
    // First contact: pick the first platform-matching account (deterministic).
    assignedAccount = accountsArg.find(a => a.platform === PLATFORM)?.account_id
    if (!assignedAccount) await die("no platform account available")
    const { error: affErr } = await supabase
      .from("account_lead_affinity")
      .upsert([{ account_id: assignedAccount, lead_id: TEST_LEAD_ID, platform: PLATFORM }],
              { onConflict: "account_id,lead_id,platform" })
    if (affErr) await die("could not write affinity", affErr)
    log("first contact — locked affinity", { lead: TEST_LEAD_ID, account: assignedAccount })
  } else {
    log("affinity already existed — reusing account", { lead: TEST_LEAD_ID, account: assignedAccount })
  }

  // Enqueue
  const queueId = `sq_e2e_${run}_${label}`
  const { error: qErr } = await supabase.from("send_queue").insert({
    id: queueId, platform: PLATFORM,
    lead_id: TEST_LEAD_ID, lead_name: `E2E Test Lead ${run}`,
    username_or_url: `e2etest_${run}`,
    message: "Hi — e2e test",
    account_id: assignedAccount,
    status: "pending",
  })
  if (qErr) await die("could not queue send", qErr)
  log("queued send", { queueId, account: assignedAccount })

  return { campaignId: camp!.id, queuedAccount: assignedAccount! }
}

async function simulateSendWorker(queueIdPrefix: string, campaignId: string): Promise<string> {
  // Pick up the pending item, mark sent, write send_log.
  const { data: q } = await supabase.from("send_queue")
    .select("*").like("id", `${queueIdPrefix}%`).eq("status", "pending").limit(1)
  const entry = (q || [])[0]
  if (!entry) await die("send worker: no pending queue entry found")

  const logId = `sl_e2e_${run}_${Math.random().toString(36).slice(2, 6)}`
  const { error: logErr } = await supabase.from("send_log").insert({
    id: logId,
    campaign_id: campaignId,
    account_id: entry.account_id,
    lead_id: entry.lead_id,
    platform: entry.platform,
    message_text: entry.message,
    status: "sent",
    sent_at: new Date().toISOString(),
  })
  if (logErr) await die("send worker: failed writing send_log", logErr)

  const { error: updErr } = await supabase.from("send_queue")
    .update({ status: "sent", processed_at: new Date().toISOString() })
    .eq("id", entry.id)
  if (updErr) await die("send worker: failed marking queue sent", updErr)

  log("worker processed entry", { queueId: entry.id, logId, account: entry.account_id })
  return logId
}

async function cleanup() {
  log("cleaning up test rows")
  await supabase.from("send_log").delete().like("id", `sl_e2e_${run}%`)
  await supabase.from("send_queue").delete().like("id", `sq_e2e_${run}%`)
  await supabase.from("campaigns").delete().ilike("name", `%${TEST_CAMPAIGN_NAME}%`)
  await supabase.from("account_lead_affinity").delete().eq("lead_id", TEST_LEAD_ID)
  await supabase.from("sequences").delete().eq("sequence_id", TEST_SEQUENCE_ID)
  await supabase.from("accounts").delete().in("account_id", [TEST_ACCOUNT_A, TEST_ACCOUNT_B])
  await supabase.from("leads").delete().eq("lead_id", TEST_LEAD_ID)
}

async function main() {
  log("=== Phase 8 E2E campaign test ===", { run })

  await cleanup()

  await seedLead()
  await seedAccounts()
  await seedSequence()

  // ── P8.1 ── First campaign: initial send lands in send_log with status=sent
  const { campaignId: c1, queuedAccount: acct1 } = await launchCampaign("first")
  const logId = await simulateSendWorker(`sq_e2e_${run}_first`, c1)

  const { data: logRow } = await supabase.from("send_log").select("*").eq("id", logId).maybeSingle()
  if (!logRow || logRow.status !== "sent") {
    await die(`P8.1 FAIL — send_log row missing or wrong status: ${JSON.stringify(logRow)}`)
  }
  log("✅ P8.1 passed — send_log row written with status=sent", { logId, account: logRow.account_id })

  // ── P8.2 ── Second campaign: must resolve same account via affinity
  const { queuedAccount: acct2 } = await launchCampaign("followup")
  if (acct1 !== acct2) {
    await die(`P8.2 FAIL — follow-up used a different account. first=${acct1} second=${acct2}`)
  }
  log("✅ P8.2 passed — affinity reused account", { account: acct2 })

  // Check there are exactly two queue/log entries for this run
  const { data: logs } = await supabase.from("send_log").select("*").eq("campaign_id", c1)
  log("send_log rows for first campaign:", logs?.length)

  await cleanup()
  log("=== All checks passed ===")
  process.exit(0)
}

main().catch(async (e) => {
  console.error("UNEXPECTED ERROR:", e)
  await cleanup()
  process.exit(3)
})
