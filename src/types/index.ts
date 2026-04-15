export interface Lead {
  lead_id: string
  name: string
  city: string
  state: string
  business_type: string
  phone: string
  email: string
  all_emails?: string
  all_contacts?: string
  website: string
  instagram_url: string
  facebook_url: string
  linkedin_url: string
  total_score: number | string
  ranking_tier: string
  status: string
  sequence_id: string
  current_step: number | string
  next_action_date: string
  last_platform_sent: string
  scraped_at: string
  messages_generated: string
  notes: string
  _raw_scrape_data: string
  message_count: string
  is_chain?: string
  location_count?: string
  dedup_method?: string
  tags: string
  smart_list: string
  business_id?: string
  platform_profile: string
  pipeline_stage?: string
  last_contacted_at?: string
  follow_up_count?: number
  response_category?: string
  responded_at?: string
  response_platform?: string
  response_sentiment?: string
  response_notes?: string
}

export interface SmartList {
  list_id: string
  name: string
  emoji: string
  description: string
  notes: string
  filters: Record<string, string | number> | string
  color: string
  created_at: string
}

export interface Sequence {
  sequence_id: string
  sequence_name: string
  steps: Record<string, string> | string | any
  required_platforms: string
  template_id: string
  is_template: boolean
  business_id?: string
}

export interface Message {
  message_id: string
  lead_id: string
  business_name: string
  sequence_id: string
  step_number: number | string
  platform: string
  action: string
  subject: string
  body: string
  generated_at: string
  status: string
  char_count?: number
  warnings?: string
  approach_id: string
  business_id?: string
  scheduled_for?: string
  sent_at?: string
}

export interface LogEntry {
  log_id: string
  lead_id: string
  business_name: string
  sequence_step: string
  platform: string
  action: string
  status: string
  sent_at: string
  error_note: string
  account_id: string
}

export interface Account {
  account_id: string
  platform: string
  display_name: string
  username: string
  session_cookie?: string
  proxy?: string
  daily_limit: number | string
  sends_today: number | string
  status: string
  last_used_at?: string
  cooldown_until?: string
  notes: string
  chrome_profile_name?: string
  chrome_profile_path?: string
  profile_url?: string
  business_id?: string
}

export interface ABTest {
  test_id: string
  test_name: string
  test_type: string
  status: string
  variant_a_name: string
  variant_a_config: string
  variant_b_name: string
  variant_b_config: string
  variant_a_leads: number
  variant_b_leads: number
  variant_a_responses: number
  variant_b_responses: number
  variant_a_rate: number
  variant_b_rate: number
  winner: string
  created_at: string
  ended_at: string
}

export interface Approach {
  approach_id: string
  name: string
  description: string
  prompt_file: string
  version: number
  status: string
  created_at: string
  updated_at: string
}

export interface Activity {
  activity_id: string
  type: string
  status: string
  summary: string
  details: string
  lead_count: string
  created_at: string
  completed_at: string
  business_id?: string
}

export interface Settings {
  [key: string]: string
}

export interface DashboardStats {
  total_leads: number
  active_leads: number
  today_sends: number
  today_limit: number
  response_rate: number
  messages_pending: number
  platform_stats: {
    platform: string
    sends_today: number
    daily_limit: number
    accounts: number
  }[]
}

export interface PaginatedResponse<T> {
  data: T[]
  count: number
  page: number
  pageSize: number
  totalPages: number
}

// ─── Content System Types ──────────────────────────────────────────

export interface ContentPersona {
  persona_id: string
  name: string
  description: string
  niche: string
  tone: string
  content_types: string
  hashtag_groups: string
  posting_frequency: number
  created_at: string
}

export interface ContentCalendarItem {
  content_id: string
  account_id: string
  persona_id: string
  title: string
  caption: string
  hashtags: string
  content_type: string
  media_url: string
  media_status: string
  post_status: string
  scheduled_for: string
  posted_at: string
  ai_prompt: string
  created_at: string
  // joined fields
  persona?: ContentPersona
  account?: { username: string; display_name: string }
}

export interface ContentTemplate {
  template_id: string
  persona_id: string
  name: string
  content_type: string
  prompt_template: string
  caption_template: string
  created_at: string
}

export interface VideoGeneration {
  id: string
  prompt: string
  style: string
  duration: number
  aspect_ratio: string
  status: string
  provider: string
  provider_task_id: string
  video_url: string
  thumbnail_url: string
  error_message: string
  content_id: string
  business_id: string
  created_at: string
  updated_at: string
  completed_at: string
}

export interface Business {
  id: string
  name: string
  description: string
  color: string
  icon: string
  created_at: string
  updated_at: string
}

export interface BusinessOverview {
  id: string
  name: string
  description: string
  color: string
  leads_count: number
  accounts_count: number
  sequences_count: number
  sends_today: number
}
