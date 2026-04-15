export const ALL_PLATFORMS = [
  { id: "instagram", label: "Instagram", color: "#E4405F", bgClass: "bg-pink-500/10", textClass: "text-pink-400", borderClass: "border-pink-500/20" },
  { id: "facebook", label: "Facebook", color: "#1877F2", bgClass: "bg-blue-500/10", textClass: "text-blue-400", borderClass: "border-blue-500/20" },
  { id: "linkedin", label: "LinkedIn", color: "#0A66C2", bgClass: "bg-sky-500/10", textClass: "text-sky-400", borderClass: "border-sky-500/20" },
  { id: "tiktok", label: "TikTok", color: "#000000", bgClass: "bg-zinc-500/10", textClass: "text-zinc-300", borderClass: "border-zinc-500/20" },
  { id: "twitter", label: "X / Twitter", color: "#1DA1F2", bgClass: "bg-blue-400/10", textClass: "text-blue-300", borderClass: "border-blue-400/20" },
  { id: "youtube", label: "YouTube", color: "#FF0000", bgClass: "bg-red-500/10", textClass: "text-red-400", borderClass: "border-red-500/20" },
  { id: "pinterest", label: "Pinterest", color: "#E60023", bgClass: "bg-rose-500/10", textClass: "text-rose-400", borderClass: "border-rose-500/20" },
  { id: "snapchat", label: "Snapchat", color: "#FFFC00", bgClass: "bg-yellow-500/10", textClass: "text-yellow-400", borderClass: "border-yellow-500/20" },
  { id: "reddit", label: "Reddit", color: "#FF4500", bgClass: "bg-orange-500/10", textClass: "text-orange-400", borderClass: "border-orange-500/20" },
  { id: "threads", label: "Threads", color: "#000000", bgClass: "bg-zinc-500/10", textClass: "text-zinc-300", borderClass: "border-zinc-500/20" },
  { id: "whatsapp", label: "WhatsApp", color: "#25D366", bgClass: "bg-green-500/10", textClass: "text-green-400", borderClass: "border-green-500/20" },
  { id: "telegram", label: "Telegram", color: "#0088CC", bgClass: "bg-cyan-500/10", textClass: "text-cyan-400", borderClass: "border-cyan-500/20" },
  { id: "discord", label: "Discord", color: "#5865F2", bgClass: "bg-indigo-500/10", textClass: "text-indigo-400", borderClass: "border-indigo-500/20" },
  { id: "email", label: "Email", color: "#FFB800", bgClass: "bg-amber-500/10", textClass: "text-amber-400", borderClass: "border-amber-500/20" },
  { id: "sms", label: "SMS", color: "#10B981", bgClass: "bg-emerald-500/10", textClass: "text-emerald-400", borderClass: "border-emerald-500/20" },
] as const

export type PlatformId = (typeof ALL_PLATFORMS)[number]["id"]

export function getPlatform(id: string) {
  return ALL_PLATFORMS.find((p) => p.id === id)
}

export function getPlatformColor(id: string) {
  return getPlatform(id)?.color || "#6B7280"
}

export function getPlatformLabel(id: string) {
  return getPlatform(id)?.label || id
}

export const SOCIAL_PLATFORMS = ALL_PLATFORMS.filter(
  (p) => !["email", "sms"].includes(p.id)
)

export const OUTREACH_PLATFORMS = ALL_PLATFORMS.filter((p) =>
  ["instagram", "facebook", "linkedin", "tiktok", "twitter", "email", "sms"].includes(p.id)
)
