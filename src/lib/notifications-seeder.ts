/**
 * Inbox seeders — Phase 4 backend.
 *
 * Polls three source tables and synthesizes one `notifications` row per
 * actionable event. Idempotent: every insert is upserted on
 * (source_kind, source_id) which has a partial UNIQUE index, so re-running
 * is free and the every-5-minute cron at /api/cron/inbox-tick can drain new
 * events without ever double-writing.
 *
 * Sources (all bounded to last 24h to keep the inbox feeling fresh — older
 * unattended items are a different problem the digest cron handles):
 *
 *   1. agent_proposal — ai_agent_log rows where the self-heal scanner
 *      drafted a proposed_fix awaiting review (status = 'proposed').
 *   2. run_failed     — workflow_runs that finished in 'failed' status.
 *   3. account_health — accounts flagged with captcha_required or any
 *      auto_paused_reason. No 24h window: an account stays inboxed until
 *      Dylan resolves it (and the row is one-shot dedupe'd by source_id).
 *
 * Errors per-source are collected and returned, never thrown — the cron
 * route should always 200 so Vercel doesn't mark the job failed when one
 * upstream table is empty/temporarily unavailable.
 *
 * Schema notes (live prod, not the spec):
 *   - ai_agent_log.error (not error_message)
 *   - ai_agent_log.proposed_fix is jsonb (stringify for the message preview)
 *   - ai_agent_log has automation_id (text), no account_id; we surface the
 *     automation_id in metadata so the UI can resolve the account itself
 *   - accounts PK is account_id (text), not id (uuid); source_id is text
 *   - notifications.id default is text ('n_' || md5 prefix); we let it default
 */

import { createClient } from "@supabase/supabase-js"

// Service-role client — same pattern as src/lib/supabase.ts. Falls back to
// anon for local dev where the service role isn't set, but every prod path
// (cron, admin route) runs with the service role.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

// Window for time-bounded sources. 24h matches the morning-digest cadence.
const WINDOW_HOURS = 24
const MESSAGE_PREVIEW_CHARS = 200
// PostgREST encodes `IN` filters into the URL — uuids at 36 bytes each blow
// past Node's default headers limit (~16 KB) somewhere around 200 ids. We
// chunk dedupe lookups to stay safely below that and avoid undici's
// HeadersOverflowError.
const DEDUPE_CHUNK_SIZE = 100
// Bulk INSERT bodies use POST so headers aren't the limit, but keep batches
// modest so a transient failure doesn't lose the whole tick.
const INSERT_CHUNK_SIZE = 200
// Per-source query cap. workflow_runs can have hundreds of failures/day
// during incidents; we cap so one pathological day doesn't burn the cron
// timeout. Subsequent ticks pick up anything missed (idempotent).
const SOURCE_QUERY_LIMIT = 500

export type SeedResult = {
  inserted: number
  bySource: {
    agent_proposal: number
    run_failed: number
    account_health: number
  }
  errors: Array<{ source: string; error: string }>
}

type NotificationInsert = {
  type: string
  title: string
  message: string | null
  read: boolean
  source_kind: string
  source_id: string
  metadata: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function preview(value: unknown, max = MESSAGE_PREVIEW_CHARS): string | null {
  if (value === null || value === undefined) return null
  const s = typeof value === "string" ? value : JSON.stringify(value)
  if (!s) return null
  return s.length > max ? s.slice(0, max - 1) + "…" : s
}

/**
 * Bulk insert with dedupe.
 *
 * 1. SELECT existing source_ids for this source_kind (chunked → headers safe)
 * 2. Filter out anything already present
 * 3. INSERT the remainder in chunks
 *
 * Returns the count of newly inserted rows. The partial UNIQUE index on
 * (source_kind, source_id) is a belt-and-suspenders backstop — if a
 * concurrent tick races and inserts the same row between our SELECT and
 * INSERT, the duplicate hits the index and we surface the error.
 */
async function upsertNew(
  rows: NotificationInsert[],
): Promise<{ inserted: number; error?: string }> {
  if (rows.length === 0) return { inserted: 0 }

  const sourceKind = rows[0].source_kind
  const sourceIds = rows.map((r) => r.source_id)

  const existing = new Set<string>()
  for (let i = 0; i < sourceIds.length; i += DEDUPE_CHUNK_SIZE) {
    const chunk = sourceIds.slice(i, i + DEDUPE_CHUNK_SIZE)
    const { data, error } = await supabase
      .from("notifications")
      .select("source_id")
      .eq("source_kind", sourceKind)
      .in("source_id", chunk)
    if (error) return { inserted: 0, error: `dedupe-select: ${error.message}` }
    for (const row of data ?? []) {
      const sid = (row as { source_id: string | null }).source_id
      if (sid) existing.add(sid)
    }
  }

  const newRows = rows.filter((r) => !existing.has(r.source_id))
  if (newRows.length === 0) return { inserted: 0 }

  let inserted = 0
  for (let i = 0; i < newRows.length; i += INSERT_CHUNK_SIZE) {
    const chunk = newRows.slice(i, i + INSERT_CHUNK_SIZE)
    const { error } = await supabase.from("notifications").insert(chunk)
    if (error) return { inserted, error: `insert: ${error.message}` }
    inserted += chunk.length
  }
  return { inserted }
}

// ---------------------------------------------------------------------------
// Source: agent_proposal
// ---------------------------------------------------------------------------

type AgentLogRow = {
  id: string
  error: string | null
  proposed_fix: unknown
  automation_id: string | null
  created_at: string
}

async function seedAgentProposals(): Promise<{ inserted: number; error?: string }> {
  const since = new Date(Date.now() - WINDOW_HOURS * 3600 * 1000).toISOString()
  const { data, error } = await supabase
    .from("ai_agent_log")
    .select("id, error, proposed_fix, automation_id, created_at")
    .eq("status", "proposed")
    .gte("created_at", since)
    .limit(SOURCE_QUERY_LIMIT)
  if (error) return { inserted: 0, error: error.message }
  const rows: NotificationInsert[] = ((data as AgentLogRow[]) ?? []).map((r) => ({
    type: "agent_proposal",
    source_kind: "agent_proposal",
    source_id: r.id,
    title: "Tester proposed a fix — review?",
    message: preview(r.proposed_fix) ?? preview(r.error) ?? "Proposed fix awaiting review",
    read: false,
    metadata: {
      ai_agent_log_id: r.id,
      automation_id: r.automation_id,
    },
  }))
  return upsertNew(rows)
}

// ---------------------------------------------------------------------------
// Source: run_failed
// ---------------------------------------------------------------------------

type RunRow = {
  id: string
  workflow_id: string | null
  error: string | null
  created_at: string
}

type WorkflowRow = { id: string; name: string }

async function seedRunFailures(): Promise<{ inserted: number; error?: string }> {
  const since = new Date(Date.now() - WINDOW_HOURS * 3600 * 1000).toISOString()
  const { data, error } = await supabase
    .from("workflow_runs")
    .select("id, workflow_id, error, created_at")
    .eq("status", "failed")
    .gte("created_at", since)
    .limit(SOURCE_QUERY_LIMIT)
  if (error) return { inserted: 0, error: error.message }
  const runs = (data as RunRow[]) ?? []
  if (runs.length === 0) return { inserted: 0 }

  // One-shot lookup of workflow names so titles are richer than "Workflow run failed".
  // Distinct workflow_id count is small even when run count is huge, so a single
  // IN() is fine here — chunked anyway in case a given day touches many workflows.
  const wfIds = Array.from(new Set(runs.map((r) => r.workflow_id).filter((x): x is string => !!x)))
  const wfNameById = new Map<string, string>()
  for (let i = 0; i < wfIds.length; i += DEDUPE_CHUNK_SIZE) {
    const chunk = wfIds.slice(i, i + DEDUPE_CHUNK_SIZE)
    const { data: wfs, error: wfErr } = await supabase
      .from("workflows")
      .select("id, name")
      .in("id", chunk)
    if (wfErr) break // non-fatal — fall through with whatever we have
    for (const wf of (wfs as WorkflowRow[]) ?? []) wfNameById.set(wf.id, wf.name)
  }

  const rows: NotificationInsert[] = runs.map((r) => {
    const wfName = r.workflow_id ? wfNameById.get(r.workflow_id) : undefined
    return {
      type: "run_failed",
      source_kind: "run_failed",
      source_id: r.id,
      title: wfName ? `Workflow “${wfName}” failed` : "Workflow run failed",
      message: preview(r.error) ?? "Run finished in failed state",
      read: false,
      metadata: {
        workflow_run_id: r.id,
        workflow_id: r.workflow_id,
      },
    }
  })
  return upsertNew(rows)
}

// ---------------------------------------------------------------------------
// Source: account_health
// ---------------------------------------------------------------------------

type AccountRow = {
  account_id: string
  username: string | null
  platform: string | null
  captcha_required: boolean | null
  auto_paused_reason: string | null
}

async function seedAccountHealth(): Promise<{ inserted: number; error?: string }> {
  // Either flag set → needs attention. PostgREST `or` filter syntax.
  const { data, error } = await supabase
    .from("accounts")
    .select("account_id, username, platform, captcha_required, auto_paused_reason")
    .or("captcha_required.eq.true,auto_paused_reason.not.is.null")
    .limit(SOURCE_QUERY_LIMIT)
  if (error) return { inserted: 0, error: error.message }
  const rows: NotificationInsert[] = ((data as AccountRow[]) ?? []).map((a) => ({
    type: "account_health",
    source_kind: "account_health",
    source_id: a.account_id,
    title: `@${a.username ?? a.account_id} needs attention`,
    message: a.captcha_required
      ? "Captcha challenge — pause for 6h?"
      : (a.auto_paused_reason ?? "Account paused"),
    read: false,
    metadata: {
      account_id: a.account_id,
      platform: a.platform,
    },
  }))
  return upsertNew(rows)
}

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

export async function seedNotifications(): Promise<SeedResult> {
  const result: SeedResult = {
    inserted: 0,
    bySource: { agent_proposal: 0, run_failed: 0, account_health: 0 },
    errors: [],
  }

  const sources: Array<{
    name: keyof SeedResult["bySource"]
    fn: () => Promise<{ inserted: number; error?: string }>
  }> = [
    { name: "agent_proposal", fn: seedAgentProposals },
    { name: "run_failed", fn: seedRunFailures },
    { name: "account_health", fn: seedAccountHealth },
  ]

  for (const src of sources) {
    try {
      const r = await src.fn()
      result.bySource[src.name] = r.inserted
      result.inserted += r.inserted
      if (r.error) result.errors.push({ source: src.name, error: r.error })
    } catch (e) {
      result.errors.push({ source: src.name, error: (e as Error).message })
    }
  }

  return result
}
