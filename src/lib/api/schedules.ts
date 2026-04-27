// Typed client for /api/schedules/*. The Vercel cron at /api/cron/workflow-tick
// (every minute) is the actual scheduler — schedules just sit here until their
// next_fire_at <= now(), at which point the cron queues an Inngest run.

export interface Schedule {
  id: string
  workflow_id: string
  name: string | null
  cron: string
  timezone: string
  payload: Record<string, unknown>
  enabled: boolean
  last_fired_at: string | null
  next_fire_at: string | null
  fire_count: number
  created_at: string
  updated_at: string
}

export async function listSchedules(params: { workflow_id?: string; enabled?: boolean } = {}): Promise<Schedule[]> {
  const sp = new URLSearchParams()
  if (params.workflow_id) sp.set("workflow_id", params.workflow_id)
  if (params.enabled != null) sp.set("enabled", String(params.enabled))
  const r = await fetch(`/api/schedules?${sp.toString()}`, { cache: "no-store" })
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Failed to list schedules")
  return (await r.json()).data
}

export async function getSchedule(id: string): Promise<Schedule> {
  const r = await fetch(`/api/schedules/${id}`, { cache: "no-store" })
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Failed to load schedule")
  return (await r.json()).data
}

export async function createSchedule(input: Partial<Schedule> & { workflow_id: string; cron: string }): Promise<Schedule> {
  const r = await fetch("/api/schedules", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  const data = await r.json()
  if (!r.ok) throw new Error(data.error || "Failed to create schedule")
  return data.data
}

export async function updateSchedule(id: string, patch: Partial<Schedule>): Promise<Schedule> {
  const r = await fetch(`/api/schedules/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  })
  const data = await r.json()
  if (!r.ok) throw new Error(data.error || "Failed to update schedule")
  return data.data
}

export async function deleteSchedule(id: string): Promise<void> {
  const r = await fetch(`/api/schedules/${id}`, { method: "DELETE" })
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Failed to delete schedule")
}

// Friendly preset cron expressions for the picker UI.
export const CRON_PRESETS: Array<{ label: string; cron: string; help: string }> = [
  { label: "Every hour",            cron: "0 * * * *",  help: "On the hour" },
  { label: "Daily at 2:00 AM",      cron: "0 2 * * *",  help: "Overnight — laptop can be off" },
  { label: "Daily at 9:00 AM",      cron: "0 9 * * *",  help: "Morning briefing" },
  { label: "Weekdays at 8:00 AM",   cron: "0 8 * * 1-5", help: "Mon–Fri only" },
  { label: "Mondays at 9:00 AM",    cron: "0 9 * * 1",  help: "Weekly kickoff" },
  { label: "1st of the month, 6 AM", cron: "0 6 1 * *", help: "Monthly run" },
]

/** Render a cron expression in plain English. Best-effort; falls back to the raw cron. */
export function humanizeCron(cron: string, timezone = "America/New_York"): string {
  const preset = CRON_PRESETS.find(p => p.cron === cron)
  if (preset) return `${preset.label} (${timezone.split("/")[1]?.replace("_", " ") || timezone})`
  return `${cron} (${timezone})`
}
