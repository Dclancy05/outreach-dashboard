import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * POST /api/ai-agent/vision-fallback
 *
 * Body: { screenshot_url: string, instruction: string }
 * Returns: 501 stub.
 *
 * This is the LAST-RESORT branch of the self-heal tree. When every stored
 * selector, text match, and aria match fails, we call a vision-capable LLM
 * with the page screenshot + "click the Send button" style instruction and
 * get back {x, y} pixel coords to feed directly into CDP Input.dispatchMouseEvent.
 *
 * NOT implementing it behind a fake — the failure mode (wrong click on a real
 * account) is too expensive to ship before the model + confidence gating are
 * tested rigorously. See docs/vision-fallback.md for the full impl plan.
 *
 * Auth: shared CRON_SECRET bearer (same as the rest of /ai-agent/*).
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") || ""
  const expected = process.env.CRON_SECRET || ""
  if (!expected) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 })
  }
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => ({} as any))
  const { screenshot_url, instruction } = body || {}

  return NextResponse.json(
    {
      kind: "vision-fallback",
      impl: "stub",
      hint: "replace with claude-3-5-sonnet vision call when replay engine is live",
      proposed_xy: null,
      received: {
        screenshot_url: screenshot_url || null,
        instruction: instruction || null,
      },
    },
    { status: 501 }
  )
}

// GET is a cheap healthcheck so the future UI can tell Dylan "vision fallback
// endpoint is reachable, not yet implemented."
export async function GET() {
  return NextResponse.json({
    ok: true,
    ready: false,
    note: "vision-fallback endpoint exists as a stub. See docs/vision-fallback.md.",
  })
}
