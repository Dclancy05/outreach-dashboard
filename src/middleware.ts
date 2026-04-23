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

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (PUBLIC_ROUTES.some(r => pathname.startsWith(r))) {
    return withSecurityHeaders(NextResponse.next())
  }

  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon") || pathname === "/") {
    return withSecurityHeaders(NextResponse.next())
  }

  const secret = process.env.SESSION_SIGNING_SECRET || ""

  const adminCookie = req.cookies.get("admin_session")?.value
  const adminValid = await verifyAdminSessionEdge(adminCookie, secret, ADMIN_MAX_AGE_MS)

  if (VA_ROUTES.some(r => pathname.startsWith(r))) {
    if (adminValid) return withSecurityHeaders(NextResponse.next())

    const vaCookie = req.cookies.get("va_session")?.value
    const vaSession = await verifyVaSessionEdge<{ exp?: number }>(vaCookie, secret)
    if (vaSession && typeof vaSession.exp === "number" && vaSession.exp > Date.now()) {
      return withSecurityHeaders(NextResponse.next())
    }

    return withSecurityHeaders(NextResponse.redirect(new URL("/va-login", req.url)))
  }

  if (adminValid) {
    return withSecurityHeaders(NextResponse.next())
  }

  if (pathname.startsWith("/api/")) {
    return withSecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
  }

  return withSecurityHeaders(NextResponse.next())
}

function withSecurityHeaders(res: NextResponse): NextResponse {
  res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload")
  res.headers.set("X-Content-Type-Options", "nosniff")
  res.headers.set("X-Frame-Options", "DENY")
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
  return res
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
}
