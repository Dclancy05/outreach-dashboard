/**
 * Thin GitHub REST client for the Project Tree tab.
 *
 * Read-only, server-side only. Reads GITHUB_PAT from process.env. If the PAT
 * is missing the helpers return `null` so the API layer can render a friendly
 * "configure me" empty state instead of crashing.
 *
 * Caches:
 *  - branch → SHA (10 min — branches move)
 *  - tree by SHA  (24 h — SHA-keyed, effectively immutable)
 *  - blob by SHA  (24 h — SHA-keyed, effectively immutable)
 */

import { lru } from "./cache"

const GH = "https://api.github.com"
const UA = "outreach-dashboard project-tree"

const branchCache = lru<string, { sha: string; fetchedAt: number }>({ max: 64, ttlMs: 10 * 60 * 1000 })
const treeCache = lru<string, GitHubTree>({ max: 32, ttlMs: 24 * 60 * 60 * 1000 })
const blobCache = lru<string, GitHubBlob>({ max: 256, ttlMs: 24 * 60 * 60 * 1000 })

export interface GitHubTreeEntry {
  path: string
  mode: string
  type: "blob" | "tree" | "commit"
  sha: string
  size?: number
  url: string
}

export interface GitHubTree {
  sha: string
  url: string
  truncated: boolean
  tree: GitHubTreeEntry[]
}

export interface GitHubBlob {
  sha: string
  size: number
  encoding: "base64" | "utf-8"
  content: string
}

export interface RateLimit {
  limit: number
  remaining: number
  resetAt: number
}

let lastRateLimit: RateLimit | null = null

export function getLastRateLimit(): RateLimit | null {
  return lastRateLimit
}

function pat(): string | null {
  const v = process.env.GITHUB_PAT
  return typeof v === "string" && v ? v : null
}

async function ghFetch(url: string, init?: RequestInit): Promise<Response> {
  const token = pat()
  if (!token) throw new GitHubConfigError()
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": UA,
      ...(init?.headers ?? {}),
    },
  })
  const limit = Number(res.headers.get("X-RateLimit-Limit") ?? 0)
  const remaining = Number(res.headers.get("X-RateLimit-Remaining") ?? 0)
  const reset = Number(res.headers.get("X-RateLimit-Reset") ?? 0)
  if (limit) lastRateLimit = { limit, remaining, resetAt: reset * 1000 }
  return res
}

export class GitHubConfigError extends Error {
  constructor() {
    super("GITHUB_PAT not configured")
    this.name = "GitHubConfigError"
  }
}
export class GitHubNotFoundError extends Error {
  constructor(msg: string) { super(msg); this.name = "GitHubNotFoundError" }
}
export class GitHubFatalError extends Error {
  status: number
  constructor(status: number, msg: string) { super(msg); this.status = status; this.name = "GitHubFatalError" }
}

export function isGitHubConfigured(): boolean {
  return pat() !== null
}

export async function resolveBranchSha(owner: string, repo: string, branch: string): Promise<string> {
  const key = `${owner}/${repo}#${branch}`
  const hit = branchCache.get(key)
  if (hit) return hit.sha
  const res = await ghFetch(`${GH}/repos/${owner}/${repo}/branches/${branch}`)
  if (res.status === 404) throw new GitHubNotFoundError(`branch ${branch} not found in ${owner}/${repo}`)
  if (!res.ok) throw new GitHubFatalError(res.status, `branch lookup failed: ${res.statusText}`)
  const j = await res.json()
  const sha = j.commit?.sha as string
  if (!sha) throw new GitHubFatalError(500, "branch payload missing commit.sha")
  branchCache.set(key, { sha, fetchedAt: Date.now() })
  return sha
}

export async function fetchTree(owner: string, repo: string, sha: string): Promise<GitHubTree> {
  const key = `${owner}/${repo}@${sha}`
  const hit = treeCache.get(key)
  if (hit) return hit
  const res = await ghFetch(`${GH}/repos/${owner}/${repo}/git/trees/${sha}?recursive=1`)
  if (res.status === 404) throw new GitHubNotFoundError(`tree ${sha} not found`)
  if (!res.ok) throw new GitHubFatalError(res.status, `tree fetch failed: ${res.statusText}`)
  const j = (await res.json()) as GitHubTree
  treeCache.set(key, j)
  return j
}

export async function fetchBlob(owner: string, repo: string, sha: string): Promise<GitHubBlob> {
  const key = `${owner}/${repo}::${sha}`
  const hit = blobCache.get(key)
  if (hit) return hit
  const res = await ghFetch(`${GH}/repos/${owner}/${repo}/git/blobs/${sha}`)
  if (res.status === 404) throw new GitHubNotFoundError(`blob ${sha} not found`)
  if (!res.ok) throw new GitHubFatalError(res.status, `blob fetch failed: ${res.statusText}`)
  const j = (await res.json()) as GitHubBlob
  blobCache.set(key, j)
  return j
}

export function decodeBlob(blob: GitHubBlob): { text: string | null; isBinary: boolean; bytes: Uint8Array } {
  if (blob.encoding === "utf-8") {
    return { text: blob.content, isBinary: false, bytes: new TextEncoder().encode(blob.content) }
  }
  // base64
  const bin = atob(blob.content.replace(/\n/g, ""))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  // Sniff for null bytes in the first 8 KB — strong signal for binary.
  const sniff = bytes.subarray(0, Math.min(8192, bytes.length))
  for (let i = 0; i < sniff.length; i++) if (sniff[i] === 0) return { text: null, isBinary: true, bytes }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
    return { text, isBinary: false, bytes }
  } catch {
    return { text: null, isBinary: true, bytes }
  }
}

export function buildBlobUrl(owner: string, repo: string, branch: string, path: string): string {
  return `https://github.com/${owner}/${repo}/blob/${branch}/${path}`
}
