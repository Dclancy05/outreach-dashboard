import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// Sentry → GitHub Issues automation.
//
// Every 15 min, pull new Sentry issues, dedupe against open GH issues
// labeled `sentry-auto`, and file a new issue per fingerprint.
//
// Required env:
//   SENTRY_AUTH_TOKEN      — Sentry user/internal-integration token (issues:read)
//   SENTRY_ORG_SLUG        — e.g. "dc-marketing-co"
//   SENTRY_PROJECT_SLUG    — e.g. "outreach-dashboard"
//   GITHUB_TOKEN           — GH token with repo issues:write
//   GITHUB_REPO            — "Dclancy05/outreach-dashboard"
//   CRON_SECRET            — gates this handler
//
// Filed issue title:    "[sentry] {error.title}"
// Filed issue label:    "sentry-auto"
// Filed issue body:     fingerprint, count, first/last seen, top frame, link.

interface SentryIssue {
  id: string
  shortId: string
  title: string
  permalink: string
  count: string
  firstSeen: string
  lastSeen: string
  level: string
  status: string
  metadata?: { value?: string; filename?: string; function?: string }
}

async function fetchSentryIssues(opts: {
  token: string
  orgSlug: string
  projectSlug: string
  sinceMs: number
}): Promise<SentryIssue[]> {
  const since = Math.floor(opts.sinceMs / 1000)
  const url = `https://sentry.io/api/0/projects/${opts.orgSlug}/${opts.projectSlug}/issues/?statsPeriod=24h&query=is:unresolved+age:-15m&limit=20&sort=created`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${opts.token}` },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) {
    throw new Error(`sentry ${res.status}: ${(await res.text()).slice(0, 200)}`)
  }
  const list = (await res.json()) as SentryIssue[]
  // Filter to issues first-seen since `since`
  return list.filter((i) => new Date(i.firstSeen).getTime() >= opts.sinceMs)
}

async function listOpenSentryAutoIssues(opts: {
  token: string
  repo: string
}): Promise<{ shortId: string | null; number: number; title: string }[]> {
  const url = `https://api.github.com/repos/${opts.repo}/issues?state=open&labels=sentry-auto&per_page=100`
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${opts.token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "outreach-dashboard-sentry-cron",
    },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`gh issues ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const list = (await res.json()) as { number: number; title: string; body?: string }[]
  return list.map((i) => {
    const m = (i.body || "").match(/sentry-shortid:\s*(\S+)/i)
    return { shortId: m ? m[1] : null, number: i.number, title: i.title }
  })
}

async function fileGithubIssue(opts: {
  token: string
  repo: string
  title: string
  body: string
  labels: string[]
}): Promise<number | null> {
  const url = `https://api.github.com/repos/${opts.repo}/issues`
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "outreach-dashboard-sentry-cron",
    },
    body: JSON.stringify({ title: opts.title, body: opts.body, labels: opts.labels }),
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) {
    console.error(`[sentry-to-github] gh file failed ${res.status}: ${(await res.text()).slice(0, 200)}`)
    return null
  }
  const out = (await res.json()) as { number: number }
  return out.number
}

async function handle(req: NextRequest) {
  const auth = req.headers.get("authorization") || ""
  const expected = process.env.CRON_SECRET || ""
  if (!expected) return NextResponse.json({ ok: false, error: "CRON_SECRET not configured" }, { status: 500 })
  if (auth !== `Bearer ${expected}`) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })

  const sentryToken = process.env.SENTRY_AUTH_TOKEN
  const orgSlug = process.env.SENTRY_ORG_SLUG
  const projectSlug = process.env.SENTRY_PROJECT_SLUG
  const ghToken = process.env.GH_AUTOMATION_TOKEN || process.env.GITHUB_TOKEN
  const repo = process.env.GITHUB_REPO || "Dclancy05/outreach-dashboard"

  if (!sentryToken || !orgSlug || !projectSlug) {
    return NextResponse.json({
      ok: false,
      error: "missing sentry env: SENTRY_AUTH_TOKEN / SENTRY_ORG_SLUG / SENTRY_PROJECT_SLUG",
    }, { status: 500 })
  }
  if (!ghToken) {
    return NextResponse.json({ ok: false, error: "missing GH_AUTOMATION_TOKEN" }, { status: 500 })
  }

  const sinceMs = Date.now() - 15 * 60_000
  let filed = 0
  let skipped = 0
  let errors: string[] = []

  try {
    const [sentryIssues, openIssues] = await Promise.all([
      fetchSentryIssues({ token: sentryToken, orgSlug, projectSlug, sinceMs }),
      listOpenSentryAutoIssues({ token: ghToken, repo }),
    ])

    const seen = new Set(openIssues.map((i) => i.shortId).filter(Boolean) as string[])

    for (const issue of sentryIssues) {
      if (seen.has(issue.shortId)) { skipped++; continue }

      const top = issue.metadata?.function && issue.metadata?.filename
        ? `\`${issue.metadata.function}\` at \`${issue.metadata.filename}\``
        : (issue.metadata?.value || "")

      const body = [
        `**Sentry:** [${issue.shortId}](${issue.permalink})`,
        `sentry-shortid: ${issue.shortId}`,
        ``,
        `**Level:** ${issue.level} · **Count (24h):** ${issue.count}`,
        `**First seen:** ${issue.firstSeen}`,
        `**Last seen:** ${issue.lastSeen}`,
        ``,
        `**Top frame:** ${top || "(unavailable)"}`,
        ``,
        `_Auto-filed by /api/cron/sentry-to-github._`,
      ].join("\n")

      const num = await fileGithubIssue({
        token: ghToken,
        repo,
        title: `[sentry] ${issue.title}`.slice(0, 256),
        body,
        labels: ["sentry-auto", `sentry:${issue.level}`],
      })
      if (num != null) {
        filed++
        console.log(`[sentry-to-github] filed #${num} for ${issue.shortId}`)
      } else {
        errors.push(`failed to file ${issue.shortId}`)
      }
    }
  } catch (e) {
    errors.push((e as Error).message)
    console.error("[sentry-to-github] error:", e)
    return NextResponse.json({ ok: false, filed, skipped, errors }, { status: 500 })
  }

  return NextResponse.json({ ok: true, filed, skipped, errors })
}

export async function GET(req: NextRequest) { return handle(req) }
export async function POST(req: NextRequest) { return handle(req) }
