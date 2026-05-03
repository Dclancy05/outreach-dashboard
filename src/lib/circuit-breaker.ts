/**
 * Wave 2.5 — Simple per-key circuit breaker.
 *
 * Use case: VPS automation/send calls. When the VPS is overloaded, every
 * caller hits the 25s abort + immediately retries. With a circuit breaker:
 *   - After N consecutive timeouts, open the circuit.
 *   - While open, every call short-circuits with `circuit_open` (no fetch).
 *   - After cooldown, allow ONE probe (half-open). If it succeeds, close.
 *     If it fails, re-open for another cooldown.
 *
 * Stateless across cold starts (in-memory only) — that's intentional. Vercel
 * functions are short-lived; carrying state to Redis would add ~50ms per
 * call. The breaker exists to dampen retry storms WITHIN a single function
 * invocation, not coordinate across the whole fleet. For cross-fleet
 * coordination we have rateLimitDb + a real /api/cron/proxy-health check.
 */

interface BreakerState {
  failures: number
  openedAt: number | null
  lastResult: "ok" | "fail" | null
}

const buckets = new Map<string, BreakerState>()

const FAIL_THRESHOLD = 5
const COOLDOWN_MS = 60_000

export interface CircuitBreakerResult<T> {
  /** True if the call ran and either returned or threw. */
  ran: boolean
  /** True only if ran && fn() returned. */
  ok: boolean
  /** Set when circuit was open and we short-circuited. */
  shortCircuited: boolean
  /** The resolved value (only when ok). */
  value: T | null
  /** The error from fn() (only when ran && !ok). */
  error: unknown | null
}

export function getBreakerState(key: string): BreakerState {
  let s = buckets.get(key)
  if (!s) {
    s = { failures: 0, openedAt: null, lastResult: null }
    buckets.set(key, s)
  }
  return s
}

export function isOpen(key: string): boolean {
  const s = getBreakerState(key)
  if (s.openedAt === null) return false
  if (Date.now() - s.openedAt >= COOLDOWN_MS) return false // half-open
  return true
}

export async function withCircuit<T>(
  key: string,
  fn: () => Promise<T>,
  opts: { onOpen?: () => void; isFailure?: (err: unknown) => boolean } = {}
): Promise<CircuitBreakerResult<T>> {
  const state = getBreakerState(key)

  if (isOpen(key)) {
    return { ran: false, ok: false, shortCircuited: true, value: null, error: null }
  }

  try {
    const value = await fn()
    state.failures = 0
    state.openedAt = null
    state.lastResult = "ok"
    return { ran: true, ok: true, shortCircuited: false, value, error: null }
  } catch (err) {
    const isFail = opts.isFailure ? opts.isFailure(err) : true
    if (isFail) {
      state.failures += 1
      state.lastResult = "fail"
      if (state.failures >= FAIL_THRESHOLD && state.openedAt === null) {
        state.openedAt = Date.now()
        opts.onOpen?.()
      }
    }
    return { ran: true, ok: false, shortCircuited: false, value: null, error: err }
  }
}

export function resetCircuit(key: string): void {
  buckets.delete(key)
}
