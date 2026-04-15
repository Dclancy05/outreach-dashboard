import { NextResponse } from "next/server"

const CRON_JOBS = [
  { id: "weekly-rank-check", name: "Ranking Check", description: "Checks Google rankings for all tracked keywords via Brave Search", schedule: "Mon & Thu 6:00 AM EST", category: "SEO", estimatedTokens: "~15k tokens", estimatedCost: "$0.08", icon: "search", status: "active", runCount: 47, lastRun: "2026-04-03T10:00:00Z" },
  { id: "ai-visibility-check", name: "AI Visibility Check", description: "Checks if Current gets mentioned by ChatGPT, Perplexity, Google AI", schedule: "Wed 10:00 AM EST", category: "SEO", estimatedTokens: "~10k tokens", estimatedCost: "$0.05", icon: "bot", status: "active", runCount: 22, lastRun: "2026-04-02T14:00:00Z" },
  { id: "weekly-blog-generator", name: "Blog Auto-Generator", description: "Writes 2 SEO-optimized blog posts targeting weak keyword clusters", schedule: "Mon 8:00 AM EST", category: "Content", estimatedTokens: "~30k tokens", estimatedCost: "$0.15", icon: "pen", status: "active", runCount: 18, lastRun: "2026-03-31T12:00:00Z" },
  { id: "session-death-alert", name: "Session Health Monitor", description: "Checks IG/FB/LI login sessions are alive, alerts if any died", schedule: "Every 2 hours", category: "Outreach", estimatedTokens: "~2k tokens", estimatedCost: "$0.01", icon: "heart", status: "active", runCount: 312, lastRun: "2026-04-04T04:00:00Z" },
  { id: "daily-outreach-scorecard", name: "Daily Outreach Scorecard", description: "Sends daily DM stats summary — sends, responses, streak", schedule: "Daily 10:00 PM EST", category: "Outreach", estimatedTokens: "~5k tokens", estimatedCost: "$0.03", icon: "chart", status: "active", runCount: 89, lastRun: "2026-04-04T02:00:00Z" },
  { id: "auto-email-sms-sender", name: "Auto Email/SMS Sender", description: "Sends automated emails and SMS for sequence steps due today via GHL", schedule: "Daily 2:00 PM EST", category: "Outreach", estimatedTokens: "~8k tokens", estimatedCost: "$0.04", icon: "mail", status: "active", runCount: 64, lastRun: "2026-04-03T18:00:00Z" },
  { id: "memory-maintenance", name: "Memory Maintenance", description: "Reviews recent memory files and updates long-term memory", schedule: "Sun 4:00 AM EST", category: "System", estimatedTokens: "~10k tokens", estimatedCost: "$0.05", icon: "brain", status: "active", runCount: 15, lastRun: "2026-03-30T08:00:00Z" },
  { id: "weekly-uiux-polish", name: "UI/UX Quality Pass", description: "Checks all dashboard pages for design consistency and fixes issues", schedule: "Sun 4:00 AM EST", category: "System", estimatedTokens: "~20k tokens", estimatedCost: "$0.10", icon: "palette", status: "active", runCount: 12, lastRun: "2026-03-30T08:00:00Z" },
  { id: "security-rotation-check", name: "Security Rotation Check", description: "Reminds to rotate API keys and credentials older than 30 days", schedule: "1st & 15th of month", category: "System", estimatedTokens: "~3k tokens", estimatedCost: "$0.02", icon: "shield", status: "active", runCount: 8, lastRun: "2026-04-01T08:00:00Z" },
]

export async function GET() {
  return NextResponse.json(CRON_JOBS)
}
