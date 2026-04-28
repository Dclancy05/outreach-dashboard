/**
 * GET /api/projects — list projects configured for the Project Tree tab.
 *
 * Returns the rows from the `projects` table plus a small status object per
 * project so the UI can show a friendly empty state when GitHub isn't wired up.
 *
 * Auth: middleware enforces admin_session.
 */
import { NextResponse } from "next/server"
import { listProjects } from "@/lib/projects/data"
import { isGitHubConfigured, getLastRateLimit } from "@/lib/projects/github"

export async function GET() {
  try {
    const projects = await listProjects()
    return NextResponse.json({
      projects: projects.map(p => ({
        slug: p.slug,
        display_name: p.display_name,
        github_owner: p.github_owner,
        github_repo: p.github_repo,
        branch: p.branch,
      })),
      github_configured: isGitHubConfigured(),
      rate_limit: getLastRateLimit(),
    })
  } catch (err) {
    return NextResponse.json(
      { error: "failed to list projects", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
