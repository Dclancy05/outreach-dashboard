/**
 * Server-side data access for the `projects` table + path resolution helpers.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

export interface Project {
  id: string
  slug: string
  display_name: string
  github_owner: string
  github_repo: string
  branch: string
  blocklist_globs: string[]
  sort_order: number
}

const DEFAULT_BLOCKLIST = [
  "node_modules/**", ".next/**", ".git/**", ".vercel/**", ".claude/**",
  "dist/**", "build/**", "out/**", "coverage/**",
  ".env", ".env.local", ".env.production", ".env.development",
  "**/*.pem", "**/*.key", "**/*.crt", "**/*.p12",
  "**/cookies*", "**/credentials*",
]

let _client: SupabaseClient | null = null
function client(): SupabaseClient {
  if (_client) return _client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error("Supabase env vars not set")
  _client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return _client
}

export async function listProjects(): Promise<Project[]> {
  const { data, error } = await client()
    .from("projects")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("slug", { ascending: true })
  if (error) {
    // PostgREST returns PGRST205 for missing tables; raw Postgres uses 42P01.
    // Either way: migration hasn't been applied — fall back to hard-coded
    // "agency-hq" so the UI still functions on day-one without DB writes.
    if (error.code === "42P01" || error.code === "PGRST205") {
      return [hardcodedAgencyHQ()]
    }
    throw error
  }
  return (data ?? []) as Project[]
}

export async function getProjectBySlug(slug: string): Promise<Project | null> {
  const all = await listProjects()
  return all.find(p => p.slug === slug) ?? null
}

export function blocklistFor(p: Project): string[] {
  return p.blocklist_globs && p.blocklist_globs.length > 0 ? p.blocklist_globs : DEFAULT_BLOCKLIST
}

function hardcodedAgencyHQ(): Project {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    slug: "agency-hq",
    display_name: "Agency HQ",
    github_owner: "Dclancy05",
    github_repo: "outreach-dashboard",
    branch: "main",
    blocklist_globs: DEFAULT_BLOCKLIST,
    sort_order: 0,
  }
}

/** Splits "agency-hq/src/app/page.tsx" into {slug:"agency-hq", path:"src/app/page.tsx"}. */
export function splitProjectPath(combined: string): { slug: string; path: string } | null {
  const trimmed = combined.replace(/^\/+/, "")
  const idx = trimmed.indexOf("/")
  if (idx < 0) return { slug: trimmed, path: "" }
  return { slug: trimmed.slice(0, idx), path: trimmed.slice(idx + 1) }
}
