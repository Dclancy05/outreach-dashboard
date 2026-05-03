import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { processBatch } from "@/lib/campaign-worker"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    global: {
      // Disable Next.js fetch cache so deletes/inserts inside one run see
      // each other. Same fix used in /api/automations/list.
      fetch: (url, init) => fetch(url, { ...init, cache: "no-store" }),
    },
  }
)

function getBaseUrl(req: NextRequest): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "")
  const vercelUrl = process.env.VERCEL_URL
  if (vercelUrl) return `https://${vercelUrl}`
  const proto = req.headers.get("x-forwarded-proto") || "https"
  const host = req.headers.get("host") || "localhost:3000"
  return `${proto}://${host}`
}

async function handle(req: NextRequest) {
  const expected = process.env.CRON_SECRET || ""
  if (!expected) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 })
  }
  const auth = req.headers.get("authorization") || ""
  if (auth !== `Bearer ${expected}`) {
    // Mirror the deadman-check / retry-queue pattern — never throw 500 on a
    // missing bearer; just no-op so unauthorized pings don't page the team.
    return NextResponse.json({ skipped: true, reason: "unauthorized" }, { status: 401 })
  }

  const baseUrl = getBaseUrl(req)
  const batchSizeParam = req.nextUrl.searchParams.get("batch_size")
  const batchSize = batchSizeParam ? Math.min(Math.max(parseInt(batchSizeParam) || 50, 1), 200) : 50

  const result = await processBatch({
    supabase,
    baseUrl,
    cronSecret: expected,
    batchSize,
    now: new Date(),
  })

  return NextResponse.json({
    ok: true,
    ran_at: new Date().toISOString(),
    base_url: baseUrl,
    ...result,
  })
}

import { wrapCron } from "@/lib/cron-handler"
const wrapped = wrapCron("campaign-worker", handle)
export async function GET(req: NextRequest) { return wrapped(req) }
export async function POST(req: NextRequest) { return wrapped(req) }
