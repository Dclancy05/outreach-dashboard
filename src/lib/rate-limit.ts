import { createClient } from "@supabase/supabase-js"

// ── Legacy in-memory limiter (kept for Edge + fallback) ─────────────
type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()
const MAX_ENTRIES = 10000

function prune(now: number) {
  if (buckets.size < MAX_ENTRIES) return
  for (const [k, v] of buckets) {
    if (v.resetAt <= now) buckets.delete(k)
  }
  if (buckets.size < MAX_ENTRIES) return
  const excess = buckets.size - Math.floor(MAX_ENTRIES * 0.8)
  let i = 0
  for (const k of buckets.keys()) {
    if (i++ >= excess) break
    buckets.delete(k)
  }
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { ok: boolean; remaining: number; resetAt: number } {
  const now = Date.now()
  prune(now)
  const b = buckets.get(key)
  if (!b || b.resetAt <= now) {
    const resetAt = now + windowMs
    buckets.set(key, { count: 1, resetAt })
    return { ok: true, remaining: limit - 1, resetAt }
  }
  if (b.count >= limit) {
    return { ok: false, remaining: 0, resetAt: b.resetAt }
  }
  b.count += 1
  return { ok: true, remaining: limit - b.count, resetAt: b.resetAt }
}

export function ipFromRequest(req: Request): string {
  const h = req.headers
  const fwd = h.get("x-forwarded-for")
  if (fwd) return fwd.split(",")[0].trim()
  const real = h.get("x-real-ip")
  if (real) return real
  return "unknown"
}

// ── Supabase-backed limiter (Node runtime) ──────────────────────────
// Uses the rate_limit_hit() RPC in migrations/20260423_audit_log.sql.
// Survives serverless instance churn + is shared across Vercel regions.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _dbClient: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dbClient(): any {
  if (!_dbClient && SUPABASE_URL && SERVICE_ROLE) {
    _dbClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return _dbClient
}

export interface RateLimitResult {
  ok: boolean
  remaining: number
  resetAt: number
}

/**
 * Durable rate limit backed by the rate_limit_buckets table.
 * Falls back to the in-memory limiter if Supabase is unreachable
 * so a DB outage never 500s every request.
 */
export async function rateLimitDb(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const c = dbClient()
  if (!c) return rateLimit(key, limit, windowMs)
  try {
    const { data, error } = await c.rpc("rate_limit_hit", {
      p_key: key,
      p_window_ms: windowMs,
      p_limit: limit,
    })
    if (error || !data || !Array.isArray(data) || data.length === 0) {
      return rateLimit(key, limit, windowMs)
    }
    const row = data[0] as { new_count: number; reset_at: string; allowed: boolean }
    const resetAt = new Date(row.reset_at).getTime()
    return {
      ok: row.allowed,
      remaining: Math.max(0, limit - row.new_count),
      resetAt,
    }
  } catch {
    return rateLimit(key, limit, windowMs)
  }
}

/** Convenience: auth endpoints — 5 req / 10 min per IP. */
export function rateLimitAuthDb(ip: string, scope: string): Promise<RateLimitResult> {
  return rateLimitDb(`auth:${scope}:${ip}`, 5, 10 * 60 * 1000)
}

/** Convenience: general API — 60 req / min per admin session or IP. */
export function rateLimitApiDb(idOrIp: string): Promise<RateLimitResult> {
  return rateLimitDb(`api:${idOrIp}`, 60, 60 * 1000)
}

export function retryAfterHeaders(resetAt: number): Record<string, string> {
  return {
    "Retry-After": String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))),
  }
}
