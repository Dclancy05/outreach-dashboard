function b64urlDecodeToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4))
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function bytesToString(b: Uint8Array): string {
  return new TextDecoder().decode(b)
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i++) out |= a[i] ^ b[i]
  return out === 0
}

async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data))
  return new Uint8Array(sig)
}

export async function verifyAndExtractEdge(token: string | undefined | null, secret: string): Promise<string | null> {
  if (!token) return null
  if (!secret || secret.length < 32) return null
  const dot = token.lastIndexOf(".")
  if (dot <= 0) return null
  const p = token.slice(0, dot)
  const sigGiven = token.slice(dot + 1)
  try {
    const expected = await hmac(secret, p)
    const given = b64urlDecodeToBytes(sigGiven)
    if (!timingSafeEqual(expected, given)) return null
    return bytesToString(b64urlDecodeToBytes(p))
  } catch {
    return null
  }
}

export async function verifyAdminSessionEdge(token: string | undefined | null, secret: string, maxAgeMs: number): Promise<boolean> {
  const raw = await verifyAndExtractEdge(token, secret)
  if (!raw) return false
  try {
    const obj = JSON.parse(raw)
    if (obj.kind !== "admin") return false
    if (typeof obj.iat !== "number") return false
    if (Date.now() - obj.iat > maxAgeMs) return false
    return true
  } catch {
    return false
  }
}

export async function verifyVaSessionEdge<T = Record<string, unknown>>(token: string | undefined | null, secret: string): Promise<T | null> {
  const raw = await verifyAndExtractEdge(token, secret)
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}
