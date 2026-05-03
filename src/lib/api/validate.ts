/**
 * Wave 3.5 — shared API request validator middleware.
 *
 * Wrap a route handler:
 *
 *   export const POST = withValidation(MySchema, async (req, body) => {
 *     // body is fully typed and validated
 *   })
 *
 * On invalid body, returns 400 with structured error:
 *   {
 *     ok: false,
 *     error: "validation_failed",
 *     issues: [{ path, message }]
 *   }
 *
 * Use Zod's `.parse` (throws) — we catch and transform to a clean response.
 *
 * Without this, malformed bodies returned generic 500 with "Unexpected end
 * of JSON input" — useless for client-side error UX.
 */

import { NextRequest, NextResponse } from "next/server"
import type { ZodSchema, ZodError } from "zod"

export interface ValidationIssue {
  path: string
  message: string
}

export interface ValidationFailure {
  ok: false
  error: "validation_failed"
  issues: ValidationIssue[]
}

export type ValidatedHandler<T> = (
  req: NextRequest,
  body: T
) => Promise<Response | NextResponse>

export function withValidation<T>(schema: ZodSchema<T>, handler: ValidatedHandler<T>) {
  return async (req: NextRequest): Promise<Response> => {
    let raw: unknown
    try {
      raw = await req.json()
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error: "validation_failed",
          issues: [{ path: "body", message: "Body is not valid JSON" }],
        } satisfies ValidationFailure,
        { status: 400 }
      )
    }
    const parsed = schema.safeParse(raw)
    if (!parsed.success) {
      const zodErr = parsed.error as ZodError
      const issues: ValidationIssue[] = zodErr.errors.map((e) => ({
        path: e.path.join(".") || "body",
        message: e.message,
      }))
      return NextResponse.json(
        { ok: false, error: "validation_failed", issues } satisfies ValidationFailure,
        { status: 400 }
      )
    }
    return (await handler(req, parsed.data)) as Response
  }
}
