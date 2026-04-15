// Re-export all types from the canonical source
export type {
  Lead,
  Sequence,
  Account,
  Message,
  Activity,
  ContentPersona,
  Business,
  Settings,
  DashboardStats,
  PaginatedResponse,
  SmartList,
  LogEntry,
  ABTest,
  Approach,
  ContentCalendarItem,
  ContentTemplate,
  VideoGeneration,
  BusinessOverview,
} from "@/types/index"

// ─── Additional types not in src/types/index.ts ─────────────────────

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
  warmup_start_date: string
  warmup_day: number
  notes: string
  platform?: string
  identity_group?: number
  persona_id?: string
  last_used_at?: string
}

export interface VASession {
  session_id: string
  va_name: string
  pin: string
  is_active: boolean
}

export interface ContentItem {
  content_id: string
  account_id: string
  persona_id: string | null
  title: string
  caption: string
  hashtags: string
  content_type: string
  media_url: string
  media_status: string
  post_status: string
  scheduled_for: string | null
  ai_prompt: string
}

export interface ProxyIdentity {
  id: number
  group_number: number
  proxy_host: string
  proxy_port: string
  proxy_username: string
  proxy_password: string
  status: string
  notes: string
}

export interface SequenceStep {
  day: string
  platform: string
  action: string
}

export interface VAQueueState {
  va_id: string
  queue_type: "content" | "dm"
  current_step: "content" | "dm"
  current_account_idx: number
  current_lead_idx: number
  updated_at?: string
}

export interface ContentPost {
  content_id: string
  account_id: string
  persona_id: string | null
  title: string
  caption: string
  hashtags: string
  content_type: string
  media_url: string
  media_status: string
  post_status: string
  scheduled_for: string | null
  ai_prompt: string
  created_at?: string
}

export interface ContentAssignment {
  account_id: string
  persona_id: string | null
  content_ids: string[]
}

export interface TeamMember {
  id: string
  name: string
  email: string
  role: string
  business_id: string
  created_at: string
}

export interface DmSendLog {
  id?: string
  lead_id: string
  account_id: string
  va_id: string
  message_sent: string
  status: string
  notes: string | null
  sent_at?: string
}

export type ActionHandler = (action: string, body: Record<string, unknown>) => Promise<Record<string, unknown>>
