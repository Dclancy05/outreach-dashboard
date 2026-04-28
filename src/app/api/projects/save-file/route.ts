/**
 * POST /api/projects/save-file
 *   {
 *     path: string,        // "<slug>/<repo-relative-path>", e.g. "agency-hq/src/app/page.tsx"
 *     content: string,     // full new file content (UTF-8), up to 1 MB
 *     reason?: string,     // shown in PR body
 *     base_sha?: string    // SHA the user was editing — surfaces a heads-up if it drifted
 *   }
 *
 * Creates a new branch in the agency-hq repo, writes the supplied content to the
 * given file (creating it if it doesn't already exist), and opens a pull request.
 * Returns the PR URL for the UI to surface.
 *
 * IMPORTANT: never commits directly to main — always opens a PR for review.
 * Dylan merges via the GitHub UI (one click) so he can scan the diff first.
 *
 * Auth: middleware enforces admin_session.
 */
import { NextRequest, NextResponse } from "next/server"
import { getProjectBySlug, blocklistFor, splitProjectPath } from "@/lib/projects/data"
import { isBlocked } from "@/lib/projects/blocklist"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const GH = "https://api.github.com"
const MAX_BYTES = 1_000_000   // 1 MB hard cap, matches GET /file

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
      "User-Agent": "outreach-dashboard save-file",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  })
}

function sanitizeSuffix(filePath: string): string {
  const last = filePath.split("/").pop() ?? "file"
  const noExt = last.includes(".") ? last.slice(0, last.lastIndexOf(".")) : last
  const cleaned = noExt
    .slice(0, 40)
    .replace(/[^a-zA-Z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
  return cleaned || "file"
}

export async function POST(req: NextRequest) {
  let body: { path?: unknown; content?: unknown; reason?: unknown; base_sha?: unknown } = {}
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 })
  }

  const combined = typeof body.path === "string" ? body.path : ""
  const content = typeof body.content === "string" ? body.content : null
  const reason = typeof body.reason === "string" ? body.reason.trim() : ""
  const baseSha = typeof body.base_sha === "string" && body.base_sha ? body.base_sha : null

  if (!combined) {
    return NextResponse.json({ error: "missing path" }, { status: 400 })
  }
  if (content === null) {
    return NextResponse.json({ error: "missing content" }, { status: 400 })
  }

  const byteLength = Buffer.byteLength(content, "utf8")
  if (byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "file too large (max 1 MB)" }, { status: 413 })
  }

  const parts = splitProjectPath(combined)
  if (!parts || !parts.path) {
    return NextResponse.json({ error: "path must include a file" }, { status: 400 })
  }

  if (parts.slug !== "agency-hq") {
    return NextResponse.json({ error: "only agency-hq is editable" }, { status: 400 })
  }

  const project = await getProjectBySlug(parts.slug)
  if (!project) return NextResponse.json({ error: "agency-hq project not found" }, { status: 500 })

  const blocklist = blocklistFor(project)
  if (isBlocked(parts.path, blocklist)) {
    return NextResponse.json(
      { error: `path "${parts.path}" is blocked from edits (secrets / build artifacts)` },
      { status: 400 },
    )
  }

  if (!pat()) {
    return NextResponse.json({ error: "GITHUB_PAT not configured" }, { status: 503 })
  }

  const owner = project.github_owner
  const repo = project.github_repo

  try {
    // 1. Get latest base-branch SHA so we can branch from it
    const mainRes = await gh(`${GH}/repos/${owner}/${repo}/branches/${project.branch}`)
    if (!mainRes.ok) throw new Error(`failed to read base branch: ${mainRes.status}`)
    const mainJson = await mainRes.json()
    const branchBaseSha: string | undefined = mainJson?.commit?.sha
    if (!branchBaseSha) throw new Error("base branch has no commit sha")

    // 2. Create an edit branch (retry up to 5 times if name collides)
    const stamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14)
    const suffix = sanitizeSuffix(parts.path)
    let branch = ""
    let created = false
    let lastErr = ""
    for (let attempt = 0; attempt < 6; attempt++) {
      const candidate = attempt === 0
        ? `edit/${stamp}-${suffix}`
        : `edit/${stamp}-${suffix}-${attempt}`
      const branchRes = await gh(`${GH}/repos/${owner}/${repo}/git/refs`, {
        method: "POST",
        body: JSON.stringify({ ref: `refs/heads/${candidate}`, sha: branchBaseSha }),
      })
      if (branchRes.ok) {
        branch = candidate
        created = true
        break
      }
      if (branchRes.status === 422) {
        lastErr = `branch ${candidate} already exists`
        continue
      }
      const t = await branchRes.text()
      throw new Error(`failed to create branch: ${branchRes.status} ${t.slice(0, 200)}`)
    }
    if (!created) {
      throw new Error(`failed to create branch after retries: ${lastErr}`)
    }

    // 3. Look up the file's current SHA on the new branch (needed for update PUT).
    //    404 means "new file" — leave sha unset.
    let currentFileSha: string | null = null
    const getRes = await gh(`${GH}/repos/${owner}/${repo}/contents/${encodeURI(parts.path)}?ref=${branch}`)
    if (getRes.ok) {
      const fileJson = await getRes.json()
      const sha: unknown = fileJson?.sha
      if (typeof sha === "string" && sha) currentFileSha = sha
    } else if (getRes.status !== 404) {
      const t = await getRes.text()
      throw new Error(`failed to read existing file: ${getRes.status} ${t.slice(0, 200)}`)
    }

    // 4. PUT the new content
    const putBody: { message: string; content: string; branch: string; sha?: string } = {
      message: `edit ${parts.path}`,
      content: Buffer.from(content, "utf8").toString("base64"),
      branch,
    }
    if (currentFileSha) putBody.sha = currentFileSha

    const putRes = await gh(`${GH}/repos/${owner}/${repo}/contents/${encodeURI(parts.path)}`, {
      method: "PUT",
      body: JSON.stringify(putBody),
    })
    if (!putRes.ok) {
      const t = await putRes.text()
      throw new Error(`failed to write file: ${putRes.status} ${t.slice(0, 200)}`)
    }
    const putJson = await putRes.json()
    const commitSha: string = putJson?.commit?.sha ?? ""

    // 5. Build the PR body. If base_sha drifted from current, surface a warning.
    const drifted = baseSha && currentFileSha && baseSha !== currentFileSha
    const charCount = content.length
    const isNewFile = currentFileSha === null

    const bodyMd = [
      reason ? `**Why:** ${reason}` : "",
      drifted
        ? `**Heads up:** the file changed on \`${project.branch}\` since you started editing — your base SHA \`${baseSha}\` no longer matches the current SHA \`${currentFileSha}\`. Review the diff carefully before merging.`
        : "",
      "",
      `**File:** \`${parts.path}\``,
      isNewFile ? `**New file** (${charCount} chars).` : `**Updated** to ${charCount} chars.`,
      "",
      `Triggered from /agency/memory#project-tree → Files → Edit.`,
    ].filter(s => s !== "").join("\n")

    // 6. Open the PR
    const title = `edit: ${parts.path} (${charCount} chars)`
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
      commit_sha: commitSha,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "save failed" },
      { status: 500 },
    )
  }
}
