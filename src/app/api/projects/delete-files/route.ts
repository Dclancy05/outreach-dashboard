/**
 * POST /api/projects/delete-files
 *   { files: string[], reason: string, page_route?: string }
 *
 * Creates a new branch in the agency-hq repo, deletes each requested file,
 * and opens a pull request. Returns the PR URL for the UI to surface.
 *
 * IMPORTANT: never deletes directly to main — always opens a PR for review.
 * Dylan merges via the GitHub UI (one click) so he can scan the diff first.
 *
 * Auth: middleware enforces admin_session.
 */
import { NextRequest, NextResponse } from "next/server"
import { getProjectBySlug, blocklistFor } from "@/lib/projects/data"
import { isBlocked } from "@/lib/projects/blocklist"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const GH = "https://api.github.com"

function pat(): string | null {
  const v = process.env.GITHUB_PAT
  return typeof v === "string" && v ? v : null
}

async function gh(url: string, init?: RequestInit): Promise<Response> {
  const token = pat()
  if (!token) throw new Error("GITHUB_PAT not configured")
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "outreach-dashboard delete-files",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  })
}

export async function POST(req: NextRequest) {
  let body: { files?: unknown; reason?: unknown; page_route?: unknown } = {}
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 })
  }

  const files = Array.isArray(body.files) ? body.files.filter((f): f is string => typeof f === "string" && f.length > 0) : []
  const reason = typeof body.reason === "string" ? body.reason.trim() : ""
  const pageRoute = typeof body.page_route === "string" ? body.page_route : null

  if (files.length === 0) {
    return NextResponse.json({ error: "no files specified" }, { status: 400 })
  }

  const project = await getProjectBySlug("agency-hq")
  if (!project) return NextResponse.json({ error: "agency-hq project not found" }, { status: 500 })

  const blocklist = blocklistFor(project)
  for (const f of files) {
    if (isBlocked(f, blocklist)) {
      return NextResponse.json({ error: `path "${f}" is blocked from edits (secrets / build artifacts)` }, { status: 400 })
    }
  }

  if (!pat()) {
    return NextResponse.json({ error: "GITHUB_PAT not configured" }, { status: 503 })
  }

  const owner = project.github_owner
  const repo = project.github_repo

  try {
    // 1. Get latest main SHA so we can branch from it
    const mainRes = await gh(`${GH}/repos/${owner}/${repo}/branches/${project.branch}`)
    if (!mainRes.ok) throw new Error(`failed to read base branch: ${mainRes.status}`)
    const mainJson = await mainRes.json()
    const baseSha = mainJson?.commit?.sha
    if (!baseSha) throw new Error("base branch has no commit sha")

    // 2. Create a delete branch
    const stamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14)
    const branch = `cleanup/${stamp}-${(pageRoute || "files").replace(/[^a-zA-Z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 40)}`

    const branchRes = await gh(`${GH}/repos/${owner}/${repo}/git/refs`, {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha }),
    })
    if (!branchRes.ok && branchRes.status !== 422 /* already exists */) {
      const t = await branchRes.text()
      throw new Error(`failed to create branch: ${branchRes.status} ${t.slice(0, 200)}`)
    }

    // 3. Delete each file via the contents API. Each call is one commit.
    const deleted: string[] = []
    const failed: Array<{ path: string; error: string }> = []
    for (const filePath of files) {
      // Need the file's blob SHA on the branch first
      const getRes = await gh(`${GH}/repos/${owner}/${repo}/contents/${encodeURI(filePath)}?ref=${branch}`)
      if (!getRes.ok) {
        failed.push({ path: filePath, error: `couldn't read file (${getRes.status})` })
        continue
      }
      const fileJson = await getRes.json()
      const fileSha = fileJson?.sha
      if (!fileSha) {
        failed.push({ path: filePath, error: "no SHA" })
        continue
      }
      const delRes = await gh(`${GH}/repos/${owner}/${repo}/contents/${encodeURI(filePath)}`, {
        method: "DELETE",
        body: JSON.stringify({
          message: `delete ${filePath}`,
          sha: fileSha,
          branch,
        }),
      })
      if (!delRes.ok) {
        const t = await delRes.text()
        failed.push({ path: filePath, error: `${delRes.status} ${t.slice(0, 120)}` })
        continue
      }
      deleted.push(filePath)
    }

    if (deleted.length === 0) {
      return NextResponse.json({ error: "no files were deletable", failed }, { status: 500 })
    }

    // 4. Open a PR
    const title = pageRoute
      ? `cleanup: remove ${pageRoute} (${deleted.length} file${deleted.length === 1 ? "" : "s"})`
      : `cleanup: remove ${deleted.length} file${deleted.length === 1 ? "" : "s"}`

    const bodyMd = [
      reason ? `**Why:** ${reason}` : "",
      "",
      `**Files removed:**`,
      ...deleted.map(f => `- \`${f}\``),
      ...(failed.length ? ["", `**Failed (skipped):**`, ...failed.map(f => `- \`${f.path}\` — ${f.error}`)] : []),
      "",
      `Triggered from /agency/memory#project-tree → Pages → Delete.`,
    ].filter(s => s !== "").join("\n")

    const prRes = await gh(`${GH}/repos/${owner}/${repo}/pulls`, {
      method: "POST",
      body: JSON.stringify({
        title,
        head: branch,
        base: project.branch,
        body: bodyMd,
      }),
    })
    if (!prRes.ok) {
      const t = await prRes.text()
      throw new Error(`failed to open PR: ${prRes.status} ${t.slice(0, 200)}`)
    }
    const pr = await prRes.json()

    return NextResponse.json({
      pr_url: pr.html_url,
      pr_number: pr.number,
      branch,
      deleted,
      failed,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "delete failed" },
      { status: 500 },
    )
  }
}
