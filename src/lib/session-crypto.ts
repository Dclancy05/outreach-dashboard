import crypto from "crypto"

function getSecret(): string {
  const s = process.env.SESSION_SIGNING_SECRET
  if (!s || s.length < 32) {
    throw new Error("SESSION_SIGNING_SECRET missing or too short (min 32 chars)")
  }
  return s
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4))
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64")
}

export function signPayload(payload: string): string {
  const p = b64url(Buffer.from(payload, "utf8"))
  const sig = crypto.createHmac("sha256", getSecret()).update(p).digest()
  return `${p}.${b64url(sig)}`
}

export function verifyAndExtract(token: string | undefined | null): string | null {
  if (!token) return null
  const dot = token.lastIndexOf(".")
  if (dot <= 0) return null
  const p = token.slice(0, dot)
  const sigGiven = token.slice(dot + 1)
  let expected: Buffer
  let given: Buffer
  try {
    expected = crypto.createHmac("sha256", getSecret()).update(p).digest()
    given = b64urlDecode(sigGiven)
  } catch {
    return null
  }
  if (expected.length !== given.length) return null
  if (!crypto.timingSafeEqual(expected, given)) return null
  try {
    return b64urlDecode(p).toString("utf8")
  } catch {
    return null
  }
}

export function signAdminSession(): string {
  const payload = JSON.stringify({
    kind: "admin",
    iat: Date.now(),
    nonce: crypto.randomBytes(16).toString("hex"),
  })
  return signPayload(payload)
}

export function verifyAdminSession(token: string | undefined | null, maxAgeMs: number): boolean {
  const raw = verifyAndExtract(token)
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

export function signVaSession(payload: Record<string, unknown>): string {
  return signPayload(JSON.stringify(payload))
}

export function verifyVaSession<T = Record<string, unknown>>(token: string | undefined | null): T | null {
  const raw = verifyAndExtract(token)
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}
