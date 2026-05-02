/** @type {import('next').NextConfig} */

const { withSentryConfig } = require('@sentry/nextjs')

// Security headers applied at the framework level.
// src/middleware.ts also sets these so a middleware bypass still has them.
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
]

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
  // @novnc/novnc 1.6 ships compiled CJS in lib/. The WebCodecs feature check
  // is wrapped in a regenerator state machine — there is no real top-level
  // await. Forcing parse-as-ESM (a previous workaround) breaks the bundle at
  // runtime with "exports is not defined" because ESM has no free `exports`
  // binding for the CJS source's `Object.defineProperty(exports, ...)` calls.
  // Default CJS parsing works correctly. We keep the `topLevelAwait`
  // experiment enabled in case any future chunk needs it (harmless).
  webpack: (config) => {
    config.experiments = {
      ...(config.experiments || {}),
      topLevelAwait: true,
    }
    return config
  },
}

module.exports = withSentryConfig(nextConfig, {
  org: 'outreach-dashboard',
  project: 'javascript-nextjs',
  silent: true,
  widenClientFileUpload: true,
  tunnelRoute: '/monitoring',
  disableLogger: true,
  automaticVercelMonitors: true,
})
