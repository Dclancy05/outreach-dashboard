/**
 * In-memory LRU with TTL. Per-process — fine for serverless on Vercel because
 * each function instance handles many requests over its warm lifetime. SHA-keyed
 * entries are immutable, so even brief warm windows pay off.
 */
export interface Lru<K, V> {
  get(key: K): V | undefined
  set(key: K, value: V): void
  delete(key: K): void
  size(): number
}

interface Entry<V> { value: V; expiresAt: number }

export function lru<K, V>({ max, ttlMs }: { max: number; ttlMs: number }): Lru<K, V> {
  const m = new Map<K, Entry<V>>()
  return {
    get(key) {
      const e = m.get(key)
      if (!e) return undefined
      if (e.expiresAt < Date.now()) { m.delete(key); return undefined }
      m.delete(key); m.set(key, e)
      return e.value
    },
    set(key, value) {
      if (m.has(key)) m.delete(key)
      m.set(key, { value, expiresAt: Date.now() + ttlMs })
      while (m.size > max) {
        const first = m.keys().next().value as K | undefined
        if (first === undefined) break
        m.delete(first)
      }
    },
    delete(key) { m.delete(key) },
    size() { return m.size },
  }
}
