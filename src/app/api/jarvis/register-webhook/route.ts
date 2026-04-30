/**
 * One-click Telegram webhook registration.
 *
 * Posts setWebhook to the Telegram Bot API with:
 *   url          = `${origin}/api/webhooks/telegram` (origin inferred from the
 *                  incoming request, so preview/prod just work)
 *   secret_token = TELEGRAM_WEBHOOK_SECRET
 *
 * The Jarvis health panel calls this when its check shows the webhook isn't
 * registered, or when Dylan rotates the webhook secret.
 *
 * Auth: PIN-gated by middleware. Returns the post-registration getWebhookInfo
 * payload so the UI can immediately show the new state.
 */
import { NextRequest, NextResponse } from "next/server"
import { setWebhook, getWebhookInfo } from "@/lib/telegram"
import { getSecret } from "@/lib/secrets"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

interface RegisterBody {
  /** Override the auto-detected origin if the dashboard is reached via a
   *  different URL than the one Telegram should POST to. */
  url_override?: string
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json().catch(() => ({}))) as RegisterBody
  const secretToken = await getSecret("TELEGRAM_WEBHOOK_SECRET")
  if (!secretToken) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "TELEGRAM_WEBHOOK_SECRET not set. Add it in the Keys tab — any random 32+ char string works.",
      },
      { status: 400 },
    )
  }

  // Resolve the dashboard's public origin. Prefer Vercel's runtime header so
  // preview deploys register against their own URL. Fall back to req.url's
  // host (good for prod). Caller can override.
  const url_override = body.url_override?.trim() || ""
  const headerOrigin =
    req.headers.get("x-forwarded-proto") && req.headers.get("x-forwarded-host")
      ? `${req.headers.get("x-forwarded-proto")}://${req.headers.get("x-forwarded-host")}`
      : null
  const origin =
    url_override ||
    headerOrigin ||
    new URL(req.url).origin

  const webhookUrl = `${origin.replace(/\/+$/, "")}/api/webhooks/telegram`

  const result = await setWebhook(webhookUrl, secretToken)
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.description || "setWebhook failed", attempted_url: webhookUrl },
      { status: 502 },
    )
  }

  // Read back the new state so the UI doesn't have to call /status separately
  // to confirm.
  const info = await getWebhookInfo()
  return NextResponse.json({
    ok: true,
    registered_url: webhookUrl,
    info,
  })
}
