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

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; remaining: number; resetAt: number } {
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
