import { NextRequest, NextResponse } from "next/server"
import { verifyAdminSessionEdge, verifyVaSessionEdge } from "@/lib/session-crypto-edge"
import { rateLimit, ipFromRequest } from "@/lib/rate-limit"

const PUBLIC_ROUTES = [
  "/va-login",
  "/api/auth/verify-pin",
  "/api/auth/va-login",
  "/api/cron/",
  // Vercel cron also schedules /api/retry-queue/process daily — the cron
  // headers don't carry an admin cookie, so we whitelist this path the same
  // way as /api/cron/. Handler does its own work and accepts GET.
  "/api/retry-queue/",
  "/api/ai-agent/",
  "/api/docs/",
  "/security",
  "/.well-known/",
  // External-callback routes — these are auth-gated by their own caller-supplied
  // secret tokens (Telegram's X-Telegram-Bot-Api-Secret-Token, Inngest's signed
  // requests), so the admin cookie middleware here would just block legitimate
  // platform calls.
  "/api/webhooks/",
  "/api/inngest",
]

const VA_ROUTES = ["/va", "/va-queue", "/api/team", "/api/businesses", "/api/leads", "/api/activity", "/api/lead-activity", "/api/proxy-groups", "/api/dashboard", "/api/warmup"]

const ADMIN_MAX_AGE_MS = 1000 * 60 * 60 * 24

// Routes that an MCP client (e.g. outreach-memory MCP server) may hit using
// only the x-mcp-key header. Bypasses cookie auth when the key matches the
// server-side OUTREACH_MEMORY_MCP_KEY env var. Must mirror the keys generated
// by /api/memory-settings (mcp_api_key column).
const MCP_ALLOWED_PATHS = [
  "/api/memories/inject",
  "/api/memories",
  "/api/personas",
]

function isMcpAuthed(req: NextRequest): boolean {
  const expected = process.env.OUTREACH_MEMORY_MCP_KEY
  if (!expected) return false
  const provided = req.headers.get("x-mcp-key")
  if (!provided) return false
  // Constant-time compare not strictly required at the edge here; this header
  // value is high-entropy (24 random bytes) and the route is internal-only.
  return provided === expected
}

function generateNonce(): string {
  const arr = new Uint8Array(16)
  crypto.getRandomValues(arr)
  let s = ""
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i])
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function tooManyRequests(resetAt: number): NextResponse {
  return NextResponse.json(
    { error: "Too many requests" },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))),
      },
    }
  )
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const nonce = generateNonce()

  // Global API rate limit: 60 req/min per IP or admin-session key.
  // Auth endpoints (/api/auth/*) have their own stricter limit inside
  // their route handlers — 5 per 10 min per IP, DB-backed.
  if (
    pathname.startsWith("/api/") &&
    !pathname.startsWith("/api/cron/") &&
    !pathname.startsWith("/api/retry-queue/") &&
    !pathname.startsWith("/api/ai-agent/") &&
    !pathname.startsWith("/api/auth/")
  ) {
    const ip = ipFromRequest(req)
    const adminCookie = req.cookies.get("admin_session")?.value
    const vaCookie = req.cookies.get("va_session")?.value
    const sessionKey = adminCookie || vaCookie || ip
    const rl = rateLimit(`api:${sessionKey}`, 60, 60 * 1000)
    if (!rl.ok) {
      return withSecurityHeaders(tooManyRequests(rl.resetAt), nonce, pathname)
    }
  }

  if (PUBLIC_ROUTES.some(r => pathname.startsWith(r))) {
    return withSecurityHeaders(nextResponseWithNonce(req, nonce), nonce, pathname)
  }

  // MCP key bypass — only for the explicitly allowed memory/persona endpoints.
  if (MCP_ALLOWED_PATHS.some(r => pathname === r || pathname.startsWith(r + "/")) && isMcpAuthed(req)) {
    return withSecurityHeaders(nextResponseWithNonce(req, nonce), nonce, pathname)
  }

  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon") || pathname === "/") {
    return withSecurityHeaders(nextResponseWithNonce(req, nonce), nonce, pathname)
  }

  const secret = process.env.SESSION_SIGNING_SECRET || ""

  const adminCookie = req.cookies.get("admin_session")?.value
  const adminValid = await verifyAdminSessionEdge(adminCookie, secret, ADMIN_MAX_AGE_MS)

  if (VA_ROUTES.some(r => pathname.startsWith(r))) {
    if (adminValid) return withSecurityHeaders(nextResponseWithNonce(req, nonce), nonce, pathname)

    const vaCookie = req.cookies.get("va_session")?.value
    const vaSession = await verifyVaSessionEdge<{ exp?: number }>(vaCookie, secret)
    if (vaSession && typeof vaSession.exp === "number" && vaSession.exp > Date.now()) {
      return withSecurityHeaders(nextResponseWithNonce(req, nonce), nonce, pathname)
    }

    return withSecurityHeaders(NextResponse.redirect(new URL("/va-login", req.url)), nonce, pathname)
  }

  if (adminValid) {
    return withSecurityHeaders(nextResponseWithNonce(req, nonce), nonce, pathname)
  }

  if (pathname.startsWith("/api/")) {
    return withSecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 }), nonce, pathname)
  }

  return withSecurityHeaders(nextResponseWithNonce(req, nonce), nonce, pathname)
}

function nextResponseWithNonce(req: NextRequest, nonce: string): NextResponse {
  const reqHeaders = new Headers(req.headers)
  reqHeaders.set("x-nonce", nonce)
  return NextResponse.next({ request: { headers: reqHeaders } })
}

function buildCsp(_nonce: string, _pathname: string): string {
  const supabase = "https://*.supabase.co"
  // Tailscale Funnel exposes WS on multiple ports depending on which service
  // is being reached: :8443 (openclaw), :10000 (recording-service), :6080
  // (noVNC websockify), and the default :443 (when accounts/Sign-In modal
  // hits port-less wss://). CSP host-source matching is port-strict, so we
  // enumerate. A wildcard `wss://*.taild42583.ts.net` would cover everything
  // but loses port granularity if we ever need to tighten later.
  const tailscale = [
    "https://srv1197943.taild42583.ts.net",
    "https://*.taild42583.ts.net",
    "wss://srv1197943.taild42583.ts.net",
    "wss://*.taild42583.ts.net",
    "wss://srv1197943.taild42583.ts.net:8443",
    "wss://*.taild42583.ts.net:8443",
    "wss://srv1197943.taild42583.ts.net:6080",
    "wss://*.taild42583.ts.net:6080",
    "wss://srv1197943.taild42583.ts.net:10000",
    "wss://*.taild42583.ts.net:10000",
  ].join(" ")
  const isProd = process.env.NODE_ENV === "production"
  // In prod we drop 'unsafe-eval' entirely. Next dev needs eval for HMR.
  const scriptSrc = isProd
    ? `script-src 'self' 'unsafe-inline' https:`
    : `script-src 'self' 'unsafe-inline' 'unsafe-eval' https:`
  const directives: string[] = [
    `default-src 'self'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    `frame-ancestors 'self'`,
    `form-action 'self'`,
    `img-src 'self' data: blob: https: ${supabase}`,
    `font-src 'self' data: https://fonts.gstatic.com`,
    // Inline styles kept: Next.js, framer-motion, tailwindcss-animate and
    // Radix all emit inline style attributes. Nonce doesn't cover inline
    // style="" attrs, so 'unsafe-inline' on style-src is required.
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    // NOTE: nonce-based + 'strict-dynamic' broke the site on 2026-04-23.
    // See memory: project_csp_nonce_pitfall.md. Do NOT re-introduce.
    scriptSrc,
    `connect-src 'self' ${supabase} wss://*.supabase.co ${tailscale} https://api.brave.com https://api.openai.com https://api.apify.com https://api.elevenlabs.io https://*.sentry.io https://*.ingest.sentry.io https://api.github.com https://github.com`,
    `frame-src 'self' ${tailscale}`,
    `worker-src 'self' blob:`,
    `media-src 'self' blob: data: https:`,
    `manifest-src 'self'`,
    `upgrade-insecure-requests`,
  ]
  return directives.join("; ")
}

function withSecurityHeaders(res: NextResponse, nonce: string, pathname: string): NextResponse {
  res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload")
  res.headers.set("X-Content-Type-Options", "nosniff")
  res.headers.set("X-Frame-Options", "SAMEORIGIN")
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
  res.headers.set("Cross-Origin-Opener-Policy", "same-origin")
  res.headers.set("Content-Security-Policy", buildCsp(nonce, pathname))
  res.headers.set("x-nonce", nonce)
  return res
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
}
