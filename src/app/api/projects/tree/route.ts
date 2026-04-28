/**
 * GET /api/projects/tree — unified file tree across all configured projects.
 *
 * Each project becomes a top-level virtual folder. Inside each folder is the
 * project's GitHub tree, post-blocklist. Returns the same TreeNode[] shape the
 * existing memory-tree consumes so the UI can reuse the same rendering.
 *
 * Auth: middleware enforces admin_session.
 */
import { NextResponse } from "next/server"
import { listProjects, blocklistFor, type Project } from "@/lib/projects/data"
import {
  fetchTree, resolveBranchSha, isGitHubConfigured, getLastRateLimit,
  GitHubConfigError, GitHubNotFoundError, GitHubFatalError, type GitHubTreeEntry,
} from "@/lib/projects/github"
import { isBlocked } from "@/lib/projects/blocklist"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface TreeNode {
  name: string
  path: string                  // "agency-hq/src/app/page.tsx" — first segment is project slug
  kind: "file" | "folder"
  size?: number
  sha?: string
  children?: TreeNode[]
}

function buildProjectSubtree(slug: string, entries: GitHubTreeEntry[], blocklist: string[]): TreeNode[] {
  const root: TreeNode = { name: slug, path: slug, kind: "folder", children: [] }
  // Index folder nodes by their full path for O(1) lookups while building.
  const dirIndex = new Map<string, TreeNode>()
  dirIndex.set("", root)

  for (const e of entries.sort((a, b) => a.path.localeCompare(b.path))) {
    if (isBlocked(e.path, blocklist)) continue
    if (e.type === "commit") continue   // submodule pointer — skip
    const segs = e.path.split("/")
    const name = segs[segs.length - 1]
    const parentPath = segs.slice(0, -1).join("/")
    const parent = dirIndex.get(parentPath) ?? root
    const node: TreeNode = {
      name,
      path: `${slug}/${e.path}`,
      kind: e.type === "tree" ? "folder" : "file",
      size: e.size,
      sha: e.sha,
      ...(e.type === "tree" ? { children: [] } : {}),
    }
    parent.children = parent.children ?? []
    parent.children.push(node)
    if (e.type === "tree") dirIndex.set(e.path, node)
  }
  return root.children ?? []
}

async function projectTree(p: Project): Promise<TreeNode> {
  const blocklist = blocklistFor(p)
  try {
    const sha = await resolveBranchSha(p.github_owner, p.github_repo, p.branch)
    const t = await fetchTree(p.github_owner, p.github_repo, sha)
    return {
      name: p.slug,
      path: p.slug,
      kind: "folder",
      sha,
      children: buildProjectSubtree(p.slug, t.tree, blocklist),
    }
  } catch (err) {
    // Per-project failure shouldn't take down the whole tab. Render a stub
    // folder with a single "_error.md"-style child explaining what went wrong.
    const reason =
      err instanceof GitHubConfigError ? "GITHUB_PAT not configured"
      : err instanceof GitHubNotFoundError ? `Repo or branch not found: ${p.github_owner}/${p.github_repo}@${p.branch}`
      : err instanceof GitHubFatalError ? `GitHub returned ${err.status}`
      : err instanceof Error ? err.message
      : "unknown error"
    return {
      name: p.slug,
      path: p.slug,
      kind: "folder",
      children: [{
        name: "_unreachable.md",
        path: `${p.slug}/_unreachable.md`,
        kind: "file",
      }],
      // Stash the reason in a non-standard field so the file viewer can render it.
      // (We pull it out via the file route too.)
      ...({ unreachable_reason: reason } as Record<string, unknown>),
    } as TreeNode
  }
}

export async function GET() {
  const projects = await listProjects()
  if (!isGitHubConfigured()) {
    return NextResponse.json({
      tree: [],
      configured: false,
      hint: "Set GITHUB_PAT in Vercel env (fine-grained, read-only on the repo) and reload.",
    })
  }
  const trees = await Promise.all(projects.map(projectTree))
  return NextResponse.json({
    tree: trees,
    configured: true,
    rate_limit: getLastRateLimit(),
  })
}
