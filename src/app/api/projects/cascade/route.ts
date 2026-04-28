/**
 * GET /api/projects/cascade?path=src/app/(dashboard)/content-creator/page.tsx
 *
 * Given a page file slated for deletion, find related backend files that
 * very likely become dead too:
 *  - The whole page directory tree (page.tsx, layout.tsx, components/, etc.)
 *  - API routes under src/app/api/<name>/...
 *  - Components under src/components/<name>/...
 *  - Lib helpers matching src/lib/<name>* or src/lib/<name>/...
 *
 * Returns a list of candidates with a confidence score so the UI can
 * default-check the high-confidence ones and let Dylan opt into the rest.
 *
 * NOT a full import-graph analysis — heuristic + path-based. The user
 * reviews everything in a PR before merging, so safety is preserved.
 *
 * Auth: middleware enforces admin_session.
 */
import { NextRequest, NextResponse } from "next/server"
import { getProjectBySlug } from "@/lib/projects/data"
import {
  fetchTree, resolveBranchSha, isGitHubConfigured, GitHubConfigError, GitHubNotFoundError,
} from "@/lib/projects/github"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface CascadeCandidate {
  path: string
  reason: string
  confidence: "high" | "medium" | "low"
}

/** Extract the URL slug from a page file path.
 *  src/app/(dashboard)/content-creator/page.tsx → "content-creator"
 *  src/app/(dashboard)/agency/memory/page.tsx → "agency/memory" (full subpath)
 */
function pageSlugs(filePath: string): { last: string; full: string } | null {
  const m = filePath.match(/^src\/app\/(?:\([^)]+\)\/)*(.+)\/(?:page|page\.legacy)\.tsx$/)
  if (!m) return null
  const full = m[1].replace(/\/\([^)]+\)/g, "")    // collapse any nested route groups
  const last = full.split("/").pop() || full
  return { last, full }
}

export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path")
  if (!path) return NextResponse.json({ error: "missing path" }, { status: 400 })

  const slugs = pageSlugs(path)
  if (!slugs) return NextResponse.json({ error: "not a page file path" }, { status: 400 })

  const project = await getProjectBySlug("agency-hq")
  if (!project) return NextResponse.json({ error: "agency-hq project not found" }, { status: 500 })

  if (!isGitHubConfigured()) {
    return NextResponse.json({ candidates: [], hint: "GITHUB_PAT not configured" })
  }

  try {
    const sha = await resolveBranchSha(project.github_owner, project.github_repo, project.branch)
    const tree = await fetchTree(project.github_owner, project.github_repo, sha)

    const pageDir = path.replace(/\/(page|page\.legacy)\.tsx$/, "")
    const candidates: CascadeCandidate[] = []

    for (const e of tree.tree) {
      if (e.type !== "blob") continue
      if (e.path === path) continue   // the page itself is added separately by the UI

      // 1. HIGH: anything under the same page directory (siblings of page.tsx, like layout.tsx, route.ts, components/)
      if (e.path.startsWith(pageDir + "/")) {
        candidates.push({
          path: e.path,
          reason: `Lives under the page's own folder (${pageDir})`,
          confidence: "high",
        })
        continue
      }

      // 2. HIGH: API routes that match the URL path exactly (e.g. /content-creator → src/app/api/content-creator/*)
      const apiPathFromUrl = `src/app/api/${slugs.full}/`
      const apiPathFromLast = `src/app/api/${slugs.last}/`
      if (e.path.startsWith(apiPathFromUrl) || (slugs.last !== slugs.full && e.path.startsWith(apiPathFromLast))) {
        candidates.push({
          path: e.path,
          reason: `API route under the same name (probably called only by this page)`,
          confidence: "high",
        })
        continue
      }

      // 3. MEDIUM: components under src/components/<name>/...
      const compDir = `src/components/${slugs.last}/`
      if (e.path.startsWith(compDir)) {
        candidates.push({
          path: e.path,
          reason: `Component folder named after the page — probably used only by it`,
          confidence: "medium",
        })
        continue
      }

      // 4. MEDIUM: lib helpers named after the page (single-file helpers)
      const libFilePrefix = `src/lib/${slugs.last}`
      if (e.path === `${libFilePrefix}.ts` || e.path === `${libFilePrefix}.tsx` || e.path.startsWith(`${libFilePrefix}/`)) {
        candidates.push({
          path: e.path,
          reason: `Lib helper named after the page`,
          confidence: "medium",
        })
        continue
      }
    }

    // De-dup (just in case) and stable sort
    const seen = new Set<string>()
    const deduped = candidates.filter(c => {
      if (seen.has(c.path)) return false
      seen.add(c.path)
      return true
    })
    deduped.sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 } as const
      return order[a.confidence] - order[b.confidence] || a.path.localeCompare(b.path)
    })

    return NextResponse.json({
      page_path: path,
      candidates: deduped,
      sha,
    })
  } catch (err) {
    if (err instanceof GitHubConfigError) return NextResponse.json({ candidates: [], hint: "GITHUB_PAT not configured" })
    if (err instanceof GitHubNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 })
    return NextResponse.json({ error: err instanceof Error ? err.message : "fetch failed" }, { status: 500 })
  }
}
