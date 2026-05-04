import { NextResponse } from "next/server"
import { promises as fs } from "fs"
import path from "path"
import { getSecret } from "@/lib/secrets"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

type ProofSummary = {
  scenario: string
  status: "pass" | "fail" | "stale" | "missing"
  started_at: string | null
  age_hours: number | null
  output_dir: string | null
  report_html: string | null
  video: string | null
  screenshots_count: number
  summary: {
    errors: number
    responses_5xx: number
    responses_429: number
    goto_calls: number
    login_status_calls: number
    tabs_created: number
  }
  lag: {
    median_frame_interval_ms?: number
    p95_frame_interval_ms?: number
    freeze_windows?: number
  } | null
  error_samples: string[]
  issue: string | null
}

const HARNESS_ROOT = "/tmp/harness"
const REQUIRED_SCENARIOS = [
  {
    scenario: "idle-smoke",
    label: "Idle ban-risk smoke",
    command: "npm run proof:idle",
    staleAfterHours: 24,
  },
  {
    scenario: "popup-login",
    label: "Popup login",
    command: "npm run proof:popup",
    staleAfterHours: 72,
  },
  {
    scenario: "login-flow-e2e",
    label: "Account login flow",
    command: "npm run proof:login",
    staleAfterHours: 72,
  },
  {
    scenario: "automation-record",
    label: "Automation recording",
    command: "npm run proof:recording",
    staleAfterHours: 72,
  },
  {
    scenario: "observability-vnc",
    label: "VNC observability",
    command: "npm run proof:vnc",
    staleAfterHours: 72,
  },
] as const

async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file)
    return true
  } catch {
    return false
  }
}

async function listFiles(dir: string): Promise<string[]> {
  try {
    return await fs.readdir(dir)
  } catch {
    return []
  }
}

async function findLatestScenarioDir(scenario: string): Promise<string | null> {
  const entries = await listFiles(HARNESS_ROOT)
  const candidates: { dir: string; mtime: number }[] = []
  for (const name of entries) {
    if (!name.startsWith(`${scenario}-`)) continue
    const dir = path.join(HARNESS_ROOT, name)
    try {
      const st = await fs.stat(dir)
      if (st.isDirectory()) candidates.push({ dir, mtime: st.mtimeMs })
    } catch {
      // ignore deleted temp dirs
    }
  }
  candidates.sort((a, b) => b.mtime - a.mtime)
  return candidates[0]?.dir ?? null
}

type TreeNode = {
  name: string
  kind: "file" | "folder"
  path?: string
  children?: TreeNode[]
}

function findFolder(nodes: TreeNode[], parts: string[]): TreeNode | null {
  if (parts.length === 0) return null
  const [head, ...rest] = parts
  const found = nodes.find((n) => n.kind === "folder" && n.name === head)
  if (!found) return null
  if (rest.length === 0) return found
  return findFolder(found.children || [], rest)
}

async function readVaultTree(): Promise<TreeNode[]> {
  const apiUrl = ((await getSecret("MEMORY_VAULT_API_URL")) || "").replace(/\/+$/, "")
  const token = await getSecret("MEMORY_VAULT_TOKEN")
  if (!apiUrl || !token) return []
  try {
    const res = await fetch(`${apiUrl}/tree`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    })
    if (!res.ok) return []
    const json = (await res.json()) as { tree?: TreeNode[] }
    return json.tree || []
  } catch {
    return []
  }
}

async function readVaultFile(filePath: string): Promise<string | null> {
  const apiUrl = ((await getSecret("MEMORY_VAULT_API_URL")) || "").replace(/\/+$/, "")
  const token = await getSecret("MEMORY_VAULT_TOKEN")
  if (!apiUrl || !token) return null
  try {
    const res = await fetch(`${apiUrl}/file?path=${encodeURIComponent(filePath)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    })
    if (!res.ok) return null
    const json = (await res.json()) as { content?: string }
    return json.content ?? null
  } catch {
    return null
  }
}

async function findLatestVaultRun(
  scenario: string,
): Promise<{ dirName: string; node: TreeNode } | null> {
  const tree = await readVaultTree()
  const testRuns = findFolder(tree, ["test-runs"])
  const candidates = (testRuns?.children || [])
    .filter((n) => n.kind === "folder" && n.name.startsWith(`${scenario}-`))
    .sort((a, b) => b.name.localeCompare(a.name))
  const node = candidates[0]
  return node ? { dirName: node.name, node } : null
}

async function findFirstFile(dir: string, names: string[]): Promise<string | null> {
  for (const name of names) {
    const file = path.join(dir, name)
    if (await exists(file)) return file
  }
  return null
}

async function findVideo(dir: string): Promise<string | null> {
  const videoDir = path.join(dir, "video")
  const files = await listFiles(videoDir)
  const found = files.find((f) => f.endsWith(".webm"))
  return found ? path.join(videoDir, found) : null
}

async function summarizeScenario(
  scenario: string,
  staleAfterHours: number,
): Promise<ProofSummary> {
  const dir = await findLatestScenarioDir(scenario)
  const vaultRun = dir ? null : await findLatestVaultRun(scenario)
  if (!dir && !vaultRun) {
    return {
      scenario,
      status: "missing",
      started_at: null,
      age_hours: null,
      output_dir: null,
      report_html: null,
      video: null,
      screenshots_count: 0,
      summary: {
        errors: 0,
        responses_5xx: 0,
        responses_429: 0,
        goto_calls: 0,
        login_status_calls: 0,
        tabs_created: 0,
      },
      lag: null,
      error_samples: [],
      issue: "No proof run found.",
    }
  }

  const raw = dir
    ? await fs.readFile(path.join(dir, "claude-readable.json"), "utf8").catch(() => null)
    : vaultRun
    ? await readVaultFile(`test-runs/${vaultRun.dirName}/claude-readable.json`)
    : null
  const outputDir = dir || (vaultRun ? `memory-vault/test-runs/${vaultRun.dirName}` : null)
  const screenshotsCount = dir
    ? (await listFiles(path.join(dir, "screenshots"))).filter((f) => f.endsWith(".png")).length
    : (vaultRun?.node.children || [])
        .find((n) => n.kind === "folder" && n.name === "screenshots")
        ?.children?.filter((n) => n.kind === "file" && n.name.endsWith(".png")).length || 0
  const hasReport = dir
    ? await findFirstFile(dir, ["report.html"])
    : vaultRun?.node.children?.some((n) => n.kind === "file" && n.name === "report.html")
    ? `memory-vault/test-runs/${vaultRun.dirName}/report.html`
    : null
  const video = dir
    ? await findVideo(dir)
    : vaultRun?.node.children
        ?.find((n) => n.kind === "folder" && n.name === "video")
        ?.children?.find((n) => n.kind === "file" && n.name.endsWith(".webm"))
    ? `memory-vault/test-runs/${vaultRun.dirName}/video`
    : null
  if (!raw) {
    return {
      scenario,
      status: "fail",
      started_at: null,
      age_hours: null,
      output_dir: outputDir,
      report_html: hasReport,
      video,
      screenshots_count: screenshotsCount,
      summary: {
        errors: 1,
        responses_5xx: 0,
        responses_429: 0,
        goto_calls: 0,
        login_status_calls: 0,
        tabs_created: 0,
      },
      lag: null,
      error_samples: [],
      issue: "claude-readable.json is missing or unreadable.",
    }
  }

  const parsed = JSON.parse(raw) as {
    started_at?: string
    summary?: Partial<ProofSummary["summary"]>
    lag?: ProofSummary["lag"]
    errors?: { text?: string; kind?: string; type?: string }[]
  }
  const startedAt = parsed.started_at || null
  const ageHours = startedAt
    ? Number(((Date.now() - new Date(startedAt).getTime()) / 36e5).toFixed(1))
    : null
  const summary = {
    errors: Number(parsed.summary?.errors || 0),
    responses_5xx: Number(parsed.summary?.responses_5xx || 0),
    responses_429: Number(parsed.summary?.responses_429 || 0),
    goto_calls: Number(parsed.summary?.goto_calls || 0),
    login_status_calls: Number(parsed.summary?.login_status_calls || 0),
    tabs_created: Number(parsed.summary?.tabs_created || 0),
  }

  let status: ProofSummary["status"] = "pass"
  let issue: string | null = null
  if (summary.errors > 0) {
    status = "fail"
    issue = `${summary.errors} browser or console error(s).`
  } else if (summary.responses_5xx > 0) {
    status = "fail"
    issue = `${summary.responses_5xx} server error response(s).`
  } else if (summary.responses_429 > 0) {
    status = "fail"
    issue = `${summary.responses_429} rate-limit response(s).`
  } else if (ageHours !== null && ageHours > staleAfterHours) {
    status = "stale"
    issue = `Last proof is ${ageHours} hours old.`
  }
  const errorSamples = (parsed.errors || [])
    .map((err) => err.text || `${err.kind || "error"} ${err.type || ""}`.trim())
    .filter(Boolean)
    .slice(0, 3)

  return {
    scenario,
    status,
    started_at: startedAt,
    age_hours: ageHours,
    output_dir: outputDir,
    report_html: hasReport,
    video,
    screenshots_count: screenshotsCount,
    summary,
    lag: parsed.lag || null,
    error_samples: errorSamples,
    issue,
  }
}

export async function GET() {
  const checks = await Promise.all(
    REQUIRED_SCENARIOS.map(async (item) => ({
      ...item,
      proof: await summarizeScenario(item.scenario, item.staleAfterHours),
    })),
  )
  const failed = checks.filter((c) => c.proof.status === "fail").length
  const missing = checks.filter((c) => c.proof.status === "missing").length
  const stale = checks.filter((c) => c.proof.status === "stale").length
  const pass = checks.filter((c) => c.proof.status === "pass").length

  return NextResponse.json({
    checked_at: new Date().toISOString(),
    summary: {
      pass,
      failed,
      missing,
      stale,
      total: checks.length,
      trusted: failed === 0 && missing === 0 && stale === 0,
    },
    checks,
  })
}
