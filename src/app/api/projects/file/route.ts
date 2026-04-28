/**
 * GET /api/projects/file?path=<slug>/<repo-relative-path>
 *
 * Returns the file content (with secret redaction applied) plus pre-rendered
 * Shiki HTML for syntax highlighting. Refuses files larger than 1 MB and files
 * matching the project's blocklist.
 *
 * Auth: middleware enforces admin_session.
 */
import { NextRequest, NextResponse } from "next/server"
import { blocklistFor, getProjectBySlug, splitProjectPath } from "@/lib/projects/data"
import {
  buildBlobUrl, decodeBlob, fetchBlob, fetchTree, resolveBranchSha,
  isGitHubConfigured, GitHubConfigError, GitHubNotFoundError, GitHubFatalError,
} from "@/lib/projects/github"
import { isBlocked, redactSecrets } from "@/lib/projects/blocklist"
import { detectLanguage, highlightToHtml } from "@/lib/projects/shiki"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_BYTES = 1_000_000   // 1 MB hard cap

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const combined = url.searchParams.get("path")
  if (!combined) return NextResponse.json({ error: "missing path" }, { status: 400 })

  const parts = splitProjectPath(combined)
  if (!parts || !parts.path) return NextResponse.json({ error: "path must include a file" }, { status: 400 })

  const project = await getProjectBySlug(parts.slug)
  if (!project) return NextResponse.json({ error: "project not found" }, { status: 404 })

  const blocklist = blocklistFor(project)
  if (isBlocked(parts.path, blocklist)) {
    return NextResponse.json({ error: "blocked path" }, { status: 404 })
  }

  if (!isGitHubConfigured()) {
    return NextResponse.json({ error: "GITHUB_PAT not configured" }, { status: 503 })
  }

  try {
    const sha = await resolveBranchSha(project.github_owner, project.github_repo, project.branch)
    const tree = await fetchTree(project.github_owner, project.github_repo, sha)
    const entry = tree.tree.find(e => e.path === parts.path && e.type === "blob")
    if (!entry) return NextResponse.json({ error: "file not found" }, { status: 404 })

    if ((entry.size ?? 0) > MAX_BYTES) {
      return NextResponse.json({
        path: combined,
        size: entry.size ?? 0,
        too_large: true,
        github_url: buildBlobUrl(project.github_owner, project.github_repo, project.branch, parts.path),
      })
    }

    const blob = await fetchBlob(project.github_owner, project.github_repo, entry.sha)
    const decoded = decodeBlob(blob)
    if (decoded.isBinary) {
      return NextResponse.json({
        path: combined,
        size: blob.size,
        is_binary: true,
        github_url: buildBlobUrl(project.github_owner, project.github_repo, project.branch, parts.path),
      })
    }

    const lang = detectLanguage(parts.path)
    const { text: redacted, redacted: didRedact } = redactSecrets(decoded.text!)
    const html = lang !== "text"
      ? await highlightToHtml({
          cacheKey: `${project.github_owner}/${project.github_repo}::${entry.sha}::${lang}::${didRedact ? "r" : "p"}`,
          code: redacted,
          lang,
        })
      : null

    return NextResponse.json({
      path: combined,
      size: blob.size,
      sha: entry.sha,
      language: lang,
      content: redacted,
      html,
      redacted: didRedact,
      github_url: buildBlobUrl(project.github_owner, project.github_repo, project.branch, parts.path),
    })
  } catch (err) {
    const status = err instanceof GitHubConfigError ? 503
                 : err instanceof GitHubNotFoundError ? 404
                 : err instanceof GitHubFatalError ? err.status
                 : 500
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "fetch failed" },
      { status }
    )
  }
}
