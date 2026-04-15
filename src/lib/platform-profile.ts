import type { Lead, Sequence } from "@/types"

export interface StepAction {
  platform: string
  action: string
}

export function parseStepPlatformAction(step: string): StepAction {
  if (!step) return { platform: "unknown", action: "message" }
  const lower = step.toLowerCase().trim()
  if (lower === "instagram_follow") return { platform: "instagram", action: "follow" }
  if (lower === "instagram_dm") return { platform: "instagram", action: "dm" }
  if (lower === "linkedin_connect") return { platform: "linkedin", action: "connect" }
  if (lower === "linkedin_dm" || lower === "linkedin") return { platform: "linkedin", action: "dm" }
  if (lower === "facebook_dm") return { platform: "facebook", action: "dm" }
  if (lower === "email") return { platform: "email", action: "message" }
  if (lower === "sms") return { platform: "sms", action: "message" }
  const parts = lower.split("_")
  if (parts.length >= 2) return { platform: parts[0], action: parts.slice(1).join("_") }
  return { platform: lower, action: "dm" }
}

export function isNonMessageAction(action: string): boolean {
  return ["follow", "connect", "like", "endorse"].includes(action.toLowerCase())
}

export function getLeadPlatforms(lead: Lead): string[] {
  const platforms: string[] = []
  if (lead.email) platforms.push("email")
  if (lead.instagram_url) platforms.push("instagram_dm")
  if (lead.facebook_url) platforms.push("facebook_dm")
  if (lead.linkedin_url) platforms.push("linkedin")
  if (lead.phone) platforms.push("sms")
  return platforms.sort()
}

export function getSequencePlatforms(seq: Partial<Sequence> & { steps: Record<string, string> }): string[] {
  const steps = typeof seq.steps === "string" ? JSON.parse(seq.steps) : seq.steps
  const platforms = new Set<string>()
  for (const val of Object.values(steps)) {
    if (val) platforms.add(val as string)
  }
  return [...platforms].sort()
}

export function profileKey(platforms: string[] | string): string {
  if (typeof platforms === "string") return platforms
  return platforms.filter(Boolean).sort().join(",")
}

export function generateVariantSteps(
  templateSteps: Record<string, string>,
  leadPlatforms: Set<string>
): Record<string, string> {
  const variant: Record<string, string> = {}
  for (const [key, platform] of Object.entries(templateSteps)) {
    if (!platform) continue
    const { platform: p } = parseStepPlatformAction(platform)
    const dmKey = `${p}_dm`
    if (leadPlatforms.has(platform) || leadPlatforms.has(dmKey) || leadPlatforms.has(p)) {
      variant[key] = platform
    }
  }
  return variant
}

export function computeRouting(
  leads: Lead[],
  template: Sequence,
  variants: Sequence[]
): { routed: Record<string, string[]>; unroutable: string[]; summary: { profile: string; variant_id: string; lead_ids: string[]; step_count: number }[] } {
  const routed: Record<string, string[]> = {}
  const unroutable: string[] = []
  const summary: { profile: string; variant_id: string; lead_ids: string[]; step_count: number }[] = []

  for (const lead of leads) {
    const profile = lead.platform_profile || profileKey(getLeadPlatforms(lead))
    const templatePlatforms = (template.required_platforms || "").split(",").filter(Boolean)
    const leadPlatforms = new Set(profile.split(",").filter(Boolean))
    const missingPlatforms = templatePlatforms.filter((p) => !leadPlatforms.has(p))

    if (missingPlatforms.length === 0) {
      if (!routed[template.sequence_id]) routed[template.sequence_id] = []
      routed[template.sequence_id].push(lead.lead_id)
    } else {
      const variant = variants.find((v) => {
        const vPlatforms = (v.required_platforms || "").split(",").filter(Boolean)
        return vPlatforms.every((p) => leadPlatforms.has(p))
      })
      if (variant) {
        if (!routed[variant.sequence_id]) routed[variant.sequence_id] = []
        routed[variant.sequence_id].push(lead.lead_id)
      } else {
        unroutable.push(lead.lead_id)
      }
    }
  }

  for (const [seqId, leadIds] of Object.entries(routed)) {
    const seq = seqId === template.sequence_id ? template : variants.find((v) => v.sequence_id === seqId)
    const steps = seq ? (typeof seq.steps === "string" ? JSON.parse(seq.steps) : seq.steps) : {}
    summary.push({ profile: seq?.required_platforms || "", variant_id: seqId, lead_ids: leadIds, step_count: Object.keys(steps).filter((k) => steps[k]).length })
  }

  return { routed, unroutable, summary }
}
