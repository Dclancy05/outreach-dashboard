import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Security",
  description: "Security practices, responsible disclosure, and compliance roadmap.",
}

type Status = "live" | "in-progress" | "planned"
type Row = { title: string; status: Status; detail: string }

const ROWS: Row[] = [
  {
    title: "Signed session cookies",
    status: "live",
    detail: "Admin and VA session cookies are HMAC-SHA-256 signed with a 32-byte server secret. Tampered or unsigned cookies are rejected by the edge middleware.",
  },
  {
    title: "Row-level security (RLS)",
    status: "live",
    detail: "Tenant isolation enforced at the database layer. Business-scoped queries cannot cross tenants via client-side key.",
  },
  {
    title: "Authenticated rate-limiting",
    status: "live",
    detail: "Admin PIN and VA login endpoints are rate-limited to 5 attempts per 10 minutes per IP with constant-time PIN comparison.",
  },
  {
    title: "Security response headers",
    status: "live",
    detail: "HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy and nonce-based Content-Security-Policy on every response.",
  },
  {
    title: "Secret management",
    status: "live",
    detail: "Runtime secrets live only in environment variables (Vercel encrypted). No hardcoded fallbacks remain for VNC, proxy, or session keys.",
  },
  {
    title: "Encryption at rest",
    status: "in-progress",
    detail: "Supabase-managed encryption for Postgres and storage buckets. Application-level envelope encryption for high-sensitivity columns on the roadmap.",
  },
  {
    title: "Multi-factor authentication (MFA)",
    status: "planned",
    detail: "TOTP for admin console. Tracked for the next hardening sprint.",
  },
  {
    title: "SOC 2 Type II",
    status: "in-progress",
    detail: "Control implementation underway. Auditor engagement planned post-beta.",
  },
  {
    title: "Dependency scanning",
    status: "live",
    detail: "Dependabot and CodeQL run weekly on the main branch. High-severity advisories are triaged on business days.",
  },
  {
    title: "Responsible disclosure",
    status: "live",
    detail: "Report vulnerabilities to the address below. We aim to acknowledge within one business day.",
  },
]

const STATUS_STYLES: Record<Status, string> = {
  live: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
  "in-progress": "bg-amber-500/15 text-amber-400 border border-amber-500/30",
  planned: "bg-slate-500/15 text-slate-400 border border-slate-500/30",
}

const STATUS_LABEL: Record<Status, string> = {
  live: "Live",
  "in-progress": "In progress",
  planned: "Planned",
}

export default function SecurityPage() {
  return (
    <main className="min-h-screen bg-black text-white px-6 py-16">
      <div className="max-w-3xl mx-auto">
        <a href="/" className="text-sm text-slate-400 hover:text-white">&larr; Back</a>
        <h1 className="text-4xl font-semibold mt-4 mb-2">Security</h1>
        <p className="text-slate-400 mb-10 leading-relaxed">
          How we protect customer accounts, outreach data, and connected social
          platforms. This page is updated as controls ship.
        </p>

        <section className="space-y-3">
          {ROWS.map((r) => (
            <div
              key={r.title}
              className="rounded-xl border border-white/10 bg-white/5 p-5 flex gap-4 items-start"
            >
              <span
                className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_STYLES[r.status]}`}
              >
                {STATUS_LABEL[r.status]}
              </span>
              <div>
                <h3 className="font-medium text-white">{r.title}</h3>
                <p className="text-sm text-slate-400 mt-1 leading-relaxed">{r.detail}</p>
              </div>
            </div>
          ))}
        </section>

        <section className="mt-12 rounded-xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-xl font-semibold mb-3">Report a vulnerability</h2>
          <p className="text-slate-400 text-sm leading-relaxed">
            Email <a className="text-white underline" href="mailto:assistanceteam101@gmail.com">assistanceteam101@gmail.com</a>
            {" "}with a clear reproduction. A machine-readable copy of these
            details lives at <a className="text-white underline" href="/.well-known/security.txt">/.well-known/security.txt</a>.
          </p>
          <p className="text-slate-500 text-xs mt-4">
            PGP key: not yet available.
          </p>
        </section>

        <footer className="mt-10 text-xs text-slate-500">
          Last reviewed: 2026-04-23
        </footer>
      </div>
    </main>
  )
}
