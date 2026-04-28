/**
 * GET /api/projects/all-pages
 *
 * Returns every visitable page from the agency-hq GitHub tree, merged with
 * our curated friendly-name registry. Pages that aren't in the registry get
 * an auto-generated title derived from the URL path.
 *
 * This way the Pages tab in the dashboard is comprehensive — Dylan sees
 * every page that exists, not just the 23 I hand-curated.
 *
 * Auth: middleware enforces admin_session.
 */
import { NextResponse } from "next/server"
import { getProjectBySlug } from "@/lib/projects/data"
import {
  fetchTree, resolveBranchSha, isGitHubConfigured,
  GitHubConfigError, GitHubNotFoundError,
} from "@/lib/projects/github"
import { FRIENDLY_PAGES, type FriendlyPage, type PageSection } from "@/lib/projects/pages-registry"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface PageEntry {
  route: string                    // "/agency/memory"
  title: string                    // friendly title
  description: string
  emoji: string
  section: PageSection
  curated: boolean                 // false = auto-discovered, no friendly description
  source_path: string              // "src/app/(dashboard)/agency/memory/page.tsx"
}

const REGISTRY_BY_ROUTE = new Map(FRIENDLY_PAGES.map((p) => [p.route, p]))

/**
 * Convert a Next.js App Router file path to a URL path.
 *   src/app/(dashboard)/agency/memory/page.tsx → /agency/memory
 *   src/app/(dashboard)/dashboard/page.tsx → /dashboard
 *   src/app/(dashboard)/campaigns/[id]/page.tsx → null (dynamic, skip)
 *   src/app/login/page.tsx → /login
 */
function fileToRoute(filePath: string): string | null {
  // Only `page.tsx`/`page.legacy.tsx` are valid pages
  if (!/\/(page|page\.legacy)\.tsx$/.test(filePath)) return null
  // Skip page.legacy.tsx (legacy backups, not visitable)
  if (filePath.endsWith("page.legacy.tsx")) return null
  // Strip the trailing /page.tsx
  let p = filePath.replace(/\/page\.tsx$/, "")
  // Strip leading src/app
  p = p.replace(/^src\/app/, "")
  // Drop route-group segments like (dashboard) — they don't affect URL
  p = p.replace(/\/\([^)]+\)/g, "")
  // Skip dynamic routes — they need a param to be visitable
  if (/\[\.\.\.|\[[^/]+\]/.test(p)) return null
  // Special case: bare "/page.tsx" → "/"
  return p || "/"
}

/** Fallback friendly title from a URL path. /content-hq/factory → "Content Hq · Factory" */
function autoTitle(route: string): string {
  if (route === "/") return "Home"
  return route
    .split("/")
    .filter(Boolean)
    .map((seg) => seg.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()))
    .join(" · ")
}

/** Auto-section based on URL prefix — used for un-curated pages so the UI can group them. */
function autoSection(route: string): PageSection {
  if (route.startsWith("/agency")) return "Agency"
  if (route.startsWith("/content")) return "Content"
  if (route.startsWith("/account")) return "Outreach"
  if (route.startsWith("/automations") || route.startsWith("/leads") || route.startsWith("/campaigns") || route.startsWith("/outreach")) return "Daily"
  if (route.startsWith("/get-started") || route.startsWith("/setup")) return "Setup"
  return "Other"
}

export async function GET() {
  if (!isGitHubConfigured()) {
    return NextResponse.json({
      pages: FRIENDLY_PAGES.map(p => ({ ...p, curated: true, source_path: "" } as PageEntry)),
      configured: false,
      hint: "Set GITHUB_PAT to also discover un-curated pages from the source tree.",
    })
  }

  const project = await getProjectBySlug("agency-hq")
  if (!project) return NextResponse.json({ error: "agency-hq project not found" }, { status: 500 })

  try {
    const sha = await resolveBranchSha(project.github_owner, project.github_repo, project.branch)
    const tree = await fetchTree(project.github_owner, project.github_repo, sha)

    // Discover all page files
    const discoveredRoutes = new Map<string, string>() // route → source_path
    for (const e of tree.tree) {
      if (e.type !== "blob") continue
      const route = fileToRoute(e.path)
      if (!route) continue
      // Prefer the first one we see (sorted alphabetically — won't matter unless duplicates)
      if (!discoveredRoutes.has(route)) discoveredRoutes.set(route, e.path)
    }

    // Merge: every discovered route gets an entry. If curated, use the friendly metadata.
    const result: PageEntry[] = []
    for (const [route, sourcePath] of discoveredRoutes) {
      const curated = REGISTRY_BY_ROUTE.get(route)
      if (curated) {
        result.push({ ...curated, curated: true, source_path: sourcePath })
      } else {
        result.push({
          route,
          title: autoTitle(route),
          description: "(no description yet — click to peek at the live page or its source code)",
          emoji: "📄",
          section: autoSection(route),
          curated: false,
          source_path: sourcePath,
        })
      }
    }

    // Sort by friendly title for stable order
    result.sort((a, b) => a.title.localeCompare(b.title))

    return NextResponse.json({
      pages: result,
      configured: true,
      total_discovered: discoveredRoutes.size,
      curated_count: result.filter(p => p.curated).length,
    })
  } catch (err) {
    if (err instanceof GitHubConfigError) {
      return NextResponse.json({ pages: [], configured: false, hint: "GITHUB_PAT not configured" })
    }
    if (err instanceof GitHubNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 })
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "fetch failed" },
      { status: 500 },
    )
  }
}
