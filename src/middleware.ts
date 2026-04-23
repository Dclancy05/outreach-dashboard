import { NextRequest, NextResponse } from "next/server"
import { verifyAdminSessionEdge, verifyVaSessionEdge } from "@/lib/session-crypto-edge"

const PUBLIC_ROUTES = [
  "/va-login",
  "/api/auth/verify-pin",
  "/api/auth/va-login",
  "/api/cron/",
  "/api/ai-agent/",
  "/security",
  "/.well-known/",
]

const VA_ROUTES = ["/va", "/va-queue", "/api/team", "/api/businesses", "/api/leads", "/api/activity", "/api/lead-activity", "/api/proxy-groups", "/api/dashboard", "/api/warmup"]

const ADMIN_MAX_AGE_MS = 1000 * 60 * 60 * 24

function generateNonce(): string {
  const arr = new Uint8Array(16)
  crypto.getRandomValues(arr)
  let s = ""
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i])
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const nonce = generateNonce()

  if (PUBLIC_ROUTES.some(r => pathname.startsWith(r))) {
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

function buildCsp(nonce: string, pathname: string): string {
  const supabase = "https://*.supabase.co"
  const tailscale = "https://srv1197943.taild42583.ts.net https://*.taild42583.ts.net"
  const directives: string[] = [
    `default-src 'self'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    `frame-ancestors 'none'`,
    `form-action 'self'`,
    `img-src 'self' data: blob: https: ${supabase}`,
    `font-src 'self' data: https://fonts.gstatic.com`,
    // Inline styles kept: Next.js, framer-motion, tailwindcss-animate and
    // Radix all emit inline style attributes for runtime values. Nonce on
    // <style> tags is supported, but inline style="" attributes are not
    // covered by nonces in any browser — so 'unsafe-inline' on style-src
    // is required for the app to render.
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    // NOTE: nonce-based + 'strict-dynamic' was blocking every script because
    // Next.js pre-renders the root layout to static HTML (no nonce attrs on
    // script tags), so the CSP rejected them. We drop the nonce and allow
    // 'self' + same-origin inline scripts Next.js emits. Still blocks
    // cross-origin scripts and unsafe-eval.
    `script-src 'self' 'unsafe-inline' https:`,
    `connect-src 'self' ${supabase} wss://*.supabase.co ${tailscale} https://api.brave.com https://api.openai.com https://api.apify.com https://api.elevenlabs.io`,
    `frame-src 'self' ${tailscale}`,
    `worker-src 'self' blob:`,
    `media-src 'self' blob: data: https:`,
    `manifest-src 'self'`,
  ]
  return directives.join("; ")
}

function withSecurityHeaders(res: NextResponse, nonce: string, pathname: string): NextResponse {
  res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload")
  res.headers.set("X-Content-Type-Options", "nosniff")
  res.headers.set("X-Frame-Options", "DENY")
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
  res.headers.set("Content-Security-Policy", buildCsp(nonce, pathname))
  res.headers.set("x-nonce", nonce)
  return res
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
}
