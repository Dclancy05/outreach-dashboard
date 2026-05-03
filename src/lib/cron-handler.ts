/**
 * Wave 3.1 — shared cron handler wrappers.
 *
 * Two flavors:
 *
 * 1. `withCronHandler(name, fn)` — for new handlers. Does auth + try/catch
 *    + Sentry. Use this when writing fresh cron routes.
 *
 * 2. `wrapCron(name, fn)` — for retrofitting existing handlers that already
 *    have their own auth check. Just adds the try/catch + Sentry safety net.
 *    Use this when minimizing diff size matters.
 *
 * Replaces ad-hoc try/catch + console.log patterns scattered across 16 cron
 * handlers. Failures are now visible in Sentry with proper tagging.
 */

import { NextRequest, NextResponse } from "next/server"
import * as Sentry from "@sentry/nextjs"

export type CronHandler = (req: NextRequest) => Promise<Response | NextResponse>

export function withCronHandler(name: string, handler: CronHandler) {
  return async (req: NextRequest): Promise<Response> => {
    const expected = process.env.CRON_SECRET || ""
    if (!expected) {
      return NextResponse.json(
        { ok: false, error: "CRON_SECRET not configured", cron: name },
        { status: 500 }
      )
    }
    const auth = req.headers.get("authorization") || ""
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json(
        { ok: false, error: "unauthorized", cron: name },
        { status: 401 }
      )
    }
    try {
      const res = await handler(req)
      return res as Response
    } catch (err) {
      Sentry.captureException(err, {
        tags: { context: "cron", cron: name },
        extra: { url: req.url },
      })
      console.error(`[cron:${name}] ERROR`, err)
      return NextResponse.json(
        { ok: false, error: String(err), cron: name },
        { status: 500 }
      )
    }
  }
}

/** Retrofit wrapper — assumes inner handler still does its own auth. */
export function wrapCron(name: string, handler: CronHandler) {
  return async (req: NextRequest): Promise<Response> => {
    try {
      const res = await handler(req)
      return res as Response
    } catch (err) {
      Sentry.captureException(err, {
        tags: { context: "cron", cron: name },
        extra: { url: req.url },
      })
      console.error(`[cron:${name}] ERROR`, err)
      return NextResponse.json(
        { ok: false, error: String(err), cron: name },
        { status: 500 }
      )
    }
  }
}
