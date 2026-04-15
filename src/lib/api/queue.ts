import { dashboardApi } from "@/lib/api"

// ── Types ──────────────────────────────────────────────────────────

export interface QueueState {
  va_id: string
  queue_type: "content" | "dm"
  current_step: "content" | "dm"
  current_account_idx: number
  current_lead_idx: number
}

export interface OutreachAccount {
  account_id: string
  username: string
  password: string
  email: string
  email_password: string
  proxy_host: string
  proxy_port: string
  proxy_username: string
  proxy_password: string
  status: string
  daily_limit: number
  sends_today: number
  warmup_day: number
  notes: string
}

export interface QueueLead {
  lead_id: string
  name: string
  instagram_url: string
  city: string
  state: string
  business_type: string
  status: string
  total_score: number
  ranking_tier: string
  ai_message?: string
  preferred_account_id?: string
}

export interface DMSendLog {
  id: number
  lead_id: string
  account_id: string
  va_id: string
  message_sent: string
  status: string
  sent_at: string
  notes?: string
}

export interface ContentPostLog {
  id: number
  account_id: string
  va_id: string
  content_id: string
  posted_at: string
  status: string
}

// ── Queue State ────────────────────────────────────────────────────

export async function getQueueState(vaId: string): Promise<QueueState | null> {
  return dashboardApi("get_queue_state", { va_id: vaId })
}

export async function saveQueueState(state: QueueState): Promise<void> {
  await dashboardApi("save_queue_state", state as unknown as Record<string, unknown>)
}

// ── Content Posting ────────────────────────────────────────────────

export async function logContentPost(
  accountId: string,
  vaId: string,
  contentId: string,
  status: "posted" | "failed" | "skipped" = "posted"
): Promise<void> {
  await dashboardApi("log_content_post", {
    account_id: accountId,
    va_id: vaId,
    content_id: contentId,
    status,
  })
}

export async function getTodayContentPosts(vaId: string): Promise<ContentPostLog[]> {
  return dashboardApi("get_today_content_posts", { va_id: vaId })
}

// ── DM Sending ─────────────────────────────────────────────────────

export async function logDMSend(
  leadId: string,
  accountId: string,
  vaId: string,
  messageSent: string,
  status: "sent" | "user_not_found" | "not_sent" | "account_issue",
  notes?: string
): Promise<void> {
  await dashboardApi("log_dm_send", {
    lead_id: leadId,
    account_id: accountId,
    va_id: vaId,
    message_sent: messageSent,
    status,
    notes,
  })
}

export async function getTodayDMStats(vaId: string): Promise<{ total: number; sent: number; failed: number }> {
  return dashboardApi("get_today_dm_stats", { va_id: vaId })
}

// ── Account-Lead Mapping ───────────────────────────────────────────

export async function getAccountForLead(leadId: string): Promise<string | null> {
  return dashboardApi("get_account_for_lead", { lead_id: leadId })
}

export async function setAccountForLead(leadId: string, accountId: string): Promise<void> {
  await dashboardApi("set_account_for_lead", { lead_id: leadId, account_id: accountId })
}

// ── DM Queue Leads ─────────────────────────────────────────────────

export async function getDMQueueLeads(vaId: string, limit = 200): Promise<QueueLead[]> {
  return dashboardApi("get_dm_queue_leads", { va_id: vaId, limit })
}

// ── Admin: All VA Queue Status ─────────────────────────────────────

export async function getAllVAQueueStatus(): Promise<{
  va_id: string
  va_name: string
  queue_type: string
  current_step: string
  current_account_idx: number
  current_lead_idx: number
  dms_today: number
  content_today: number
}[]> {
  return dashboardApi("get_all_va_queue_status")
}

export async function getAdminDMLog(limit = 100): Promise<DMSendLog[]> {
  return dashboardApi("get_admin_dm_log", { limit })
}
