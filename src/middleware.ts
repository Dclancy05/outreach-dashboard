import { NextRequest, NextResponse } from "next/server"

// Public routes that don't require auth
const PUBLIC_ROUTES = ["/va-login", "/api/auth/verify-pin", "/api/auth/va-login"]

// VA-accessible routes (after VA login)
const VA_ROUTES = ["/va", "/va-queue", "/api/team", "/api/businesses", "/api/leads", "/api/activity", "/api/lead-activity", "/api/proxy-groups", "/api/dashboard", "/api/warmup"]

// Everything else requires admin auth

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Allow public routes
  if (PUBLIC_ROUTES.some(r => pathname.startsWith(r))) {
    return NextResponse.next()
  }

  // Allow static assets and Next.js internals
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon") || pathname === "/") {
    return NextResponse.next()
  }

  // Check VA routes
  if (VA_ROUTES.some(r => pathname.startsWith(r))) {
    const vaSession = req.cookies.get("va_session")?.value
    const adminSession = req.cookies.get("admin_session")?.value

    if (adminSession === "authenticated") return NextResponse.next()

    if (vaSession) {
      try {
        const session = JSON.parse(vaSession)
        if (session.exp && session.exp > Date.now()) {
          return NextResponse.next()
        }
      } catch { /* invalid session */ }
    }

    // Redirect to VA login
    return NextResponse.redirect(new URL("/va-login", req.url))
  }

  // Admin routes - check admin session
  const adminSession = req.cookies.get("admin_session")?.value
  if (adminSession === "authenticated") {
    return NextResponse.next()
  }

  // For API routes, return 401
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // For pages, allow through (pin-lock component handles client-side)
  // This allows the pin-lock UI to render and authenticate
  return NextResponse.next()
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
}
