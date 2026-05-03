/**
 * Wave 3.3 — central error classifier.
 *
 * Every layer (campaign-worker, run-workflow, retry-queue, send route) used
 * to lump errors into one bucket. Transient (network blip, 5xx, abort) and
 * terminal (FK violation, 4xx, missing field) deserve different handling:
 *
 *   - transient   → retry
 *   - terminal    → fail permanently, don't retry
 *   - rate_limit  → wait Retry-After then retry
 *   - auth        → halt the caller, surface error
 *   - unknown     → conservatively retry
 *
 * Use `classify(err)` everywhere instead of inline string-matching regexes.
 */

export type ErrorClass =
  | "transient"
  | "terminal"
  | "rate_limit"
  | "auth"
  | "unknown"

export interface ClassifiedError {
  class: ErrorClass
  status?: number
  retryable: boolean
  /** ms to wait before retrying. 0 if not applicable. */
  retryAfterMs?: number
  /** Original error message preserved for logging. */
  message: string
}

interface MaybeStatusObj {
  status?: number
  statusCode?: number
  code?: string | number
}

function tryStatus(err: unknown): number | undefined {
  if (typeof err === "object" && err !== null) {
    const o = err as MaybeStatusObj
    if (typeof o.status === "number") return o.status
    if (typeof o.statusCode === "number") return o.statusCode
  }
  return undefined
}

export function classify(err: unknown): ClassifiedError {
  if (err === null || err === undefined) {
    return { class: "unknown", retryable: true, message: "null error" }
  }

  const status = tryStatus(err)
  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err).slice(0, 500)
  const lower = message.toLowerCase()

  // HTTP status mapping
  if (status === 429) {
    return { class: "rate_limit", status, retryable: true, retryAfterMs: 30_000, message }
  }
  if (status === 401 || status === 403) {
    return { class: "auth", status, retryable: false, message }
  }
  if (status && status >= 400 && status < 500) {
    // Other 4xx (404, 422, etc.) — terminal
    return { class: "terminal", status, retryable: false, message }
  }
  if (status && status >= 500 && status < 600) {
    return { class: "transient", status, retryable: true, message }
  }

  // Postgres / Supabase patterns (no HTTP status, often plain Error.message)
  if (/foreign key|not null violation|invalid input syntax|check constraint/.test(lower)) {
    return { class: "terminal", retryable: false, message }
  }
  if (/connection terminated|econnreset|etimedout|fetch failed|aborterror|signal is aborted|timeout/.test(lower)) {
    return { class: "transient", retryable: true, message }
  }
  if (/circuit_open/.test(lower)) {
    return { class: "transient", retryable: true, retryAfterMs: 5 * 60_000, message }
  }
  if (/unauthorized|forbidden|missing.*token|invalid.*token|credentials/.test(lower)) {
    return { class: "auth", retryable: false, message }
  }
  if (/rate limit|too many requests/.test(lower)) {
    return { class: "rate_limit", retryable: true, retryAfterMs: 30_000, message }
  }

  return { class: "unknown", retryable: true, message }
}

export function isRetryable(err: unknown): boolean {
  return classify(err).retryable
}
