import { createClient } from "@supabase/supabase-js"

// Server-side only. Uses service role so the insert bypasses RLS.
// Silently swallows all errors — auditing must NEVER break the request path.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _client: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function client(): any {
  if (!_client && SUPABASE_URL && SERVICE_ROLE) {
    _client = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return _client
}

function summarize(payload: unknown): unknown {
  if (payload == null) return null
  try {
    const str = typeof payload === "string" ? payload : JSON.stringify(payload)
    if (str.length <= 2000) return typeof payload === "string" ? payload : payload
    return { truncated: true, preview: str.slice(0, 2000) }
  } catch {
    return { unserializable: true }
  }
}

export interface AuditEntry {
  user_id?: string | null
  action: string
  resource?: string | null
  payload?: unknown
  ip?: string | null
  ua?: string | null
}

export async function auditLog(entry: AuditEntry): Promise<void> {
  const c = client()
  if (!c) return
  try {
    await c.from("audit_log").insert({
      user_id: entry.user_id ?? null,
      action: entry.action,
      resource: entry.resource ?? null,
      payload: summarize(entry.payload) ?? null,
      ip: entry.ip ?? null,
      ua: entry.ua ?? null,
    })
  } catch {
    // never throw from audit
  }
}

// Fire-and-forget: schedule without awaiting so it doesn't add latency
// to the API response. Safe on Node + Edge (both support queueMicrotask).
export function auditLogAsync(entry: AuditEntry): void {
  queueMicrotask(() => {
    auditLog(entry).catch(() => {})
  })
}

export function extractAdminId(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null
  const parts = cookieHeader.split(/;\s*/)
  const admin = parts.find(p => p.startsWith("admin_session="))
  if (admin) return "admin"
  const va = parts.find(p => p.startsWith("va_session="))
  if (va) {
    const raw = va.slice("va_session=".length)
    // Best-effort: payload before last "." is b64url-encoded JSON
    const dot = raw.lastIndexOf(".")
    if (dot > 0) {
      try {
        const b64 = raw.slice(0, dot).replace(/-/g, "+").replace(/_/g, "/")
        const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4))
        const json = Buffer.from(b64 + pad, "base64").toString("utf8")
        const obj = JSON.parse(json)
        if (obj && typeof obj.id === "string") return `va:${obj.id}`
      } catch {}
    }
    return "va"
  }
  return null
}

function ipFromHeaders(headers: Headers): string | null {
  const fwd = headers.get("x-forwarded-for")
  if (fwd) return fwd.split(",")[0].trim()
  const real = headers.get("x-real-ip")
  if (real) return real
  return null
}

// Audit every non-GET API call. Wrap a route handler.
export function withAudit<TArgs extends unknown[], TRet extends Response | Promise<Response>>(
  routeName: string,
  handler: (req: Request, ...args: TArgs) => TRet
) {
  return async (req: Request, ...args: TArgs): Promise<Response> => {
    const method = req.method.toUpperCase()
    let bodyPreview: unknown = null
    if (method !== "GET" && method !== "HEAD") {
      try {
        const clone = req.clone()
        const text = await clone.text()
        if (text) {
          try {
            const parsed = JSON.parse(text)
            // Strip common sensitive fields from payload preview
            if (parsed && typeof parsed === "object") {
              const redacted: Record<string, unknown> = {}
              for (const k of Object.keys(parsed)) {
                if (/password|pin|token|secret|cookie|authorization|api[_-]?key/i.test(k)) {
                  redacted[k] = "[redacted]"
                } else {
                  redacted[k] = (parsed as Record<string, unknown>)[k]
                }
              }
              bodyPreview = redacted
            } else {
              bodyPreview = parsed
            }
          } catch {
            bodyPreview = text.length > 500 ? text.slice(0, 500) : text
          }
        }
      } catch {
        // ignore
      }
    }

    const res = await handler(req, ...args)

    if (method !== "GET" && method !== "HEAD") {
      const cookieHeader = req.headers.get("cookie")
      auditLogAsync({
        user_id: extractAdminId(cookieHeader),
        action: `${method} ${routeName}`,
        resource: new URL(req.url).pathname,
        payload: {
          status: res.status,
          body: bodyPreview,
        },
        ip: ipFromHeaders(req.headers),
        ua: req.headers.get("user-agent"),
      })
    }

    return res
  }
}
