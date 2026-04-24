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
  // @novnc/novnc's compiled CJS emits a top-level await for a WebCodecs H264
  // feature check. Webpack refuses that in non-ESM modules, so we (a) opt
  // into the `topLevelAwait` experiment and (b) tell webpack to parse the
  // novnc source as ESM so TLA is legal there. Both are safe — Next.js only
  // ships to modern browsers that support top-level await.
  webpack: (config) => {
    config.experiments = {
      ...(config.experiments || {}),
      topLevelAwait: true,
    }
    config.module = config.module || {}
    config.module.rules = config.module.rules || []
    config.module.rules.push({
      test: /node_modules[\\/]@novnc[\\/]novnc[\\/]lib[\\/].*\.js$/,
      type: 'javascript/esm',
    })
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
