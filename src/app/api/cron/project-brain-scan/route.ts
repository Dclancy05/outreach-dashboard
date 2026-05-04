import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getSecret } from "@/lib/secrets"

/**
 * /api/cron/project-brain-scan
 *
 * Scans every markdown file under `Project Brain/` in the memory-vault for
 * `@claude` magic phrases and turns each occurrence into a tracked task so
 * the next Claude session can pick it up.
 *
 * The user is non-technical — they write `@claude ship-this` in a file, save,
 * and walk away. This cron is the bridge: it finds those tags, files them as
 * GitHub issues (durable, visible, claimable by any future session), and
 * writes a tiny tag back into the source file noting "filed as #N".
 *
 * Magic phrases scanned:
 *   - @claude triage     — "look at this on the next session"
 *   - @claude ship-this  — "build the wishlist item below this line"
 *   - @claude diagnose   — "investigate the bug above this line"
 *   - @claude run-tests  — "execute the test below this line via Playwright"
 *
 * Each unique tag occurrence creates ONE issue. We dedupe by writing a
 * `<!-- filed: #N -->` HTML comment on the same line; on subsequent scans
 * those lines are skipped.
 */

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const MAGIC_PHRASES = ["@claude triage", "@claude ship-this", "@claude diagnose", "@claude run-tests"] as const
type MagicPhrase = (typeof MAGIC_PHRASES)[number]

interface VaultFile {
  path: string
  content: string
}

interface FoundTag {
  phrase: MagicPhrase
  filePath: string
  lineNumber: number
  contextBefore: string
  contextAfter: string
}

async function handle(req: NextRequest) {
  // Cron auth — same Bearer-secret pattern as every other cron in this repo.
  const auth = req.headers.get("authorization") || ""
  const expected = process.env.CRON_SECRET || ""
  if (!expected) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 })
  if (auth !== `Bearer ${expected}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const startedAt = Date.now()

  const VAULT_API = (await getSecret("MEMORY_VAULT_API_URL")) || ""
  const VAULT_TOKEN = (await getSecret("MEMORY_VAULT_TOKEN")) || ""
  const GH_TOKEN = (await getSecret("GH_TOKEN")) || (await getSecret("GITHUB_TOKEN")) || ""
  const GH_REPO = (await getSecret("GITHUB_REPO")) || "Dclancy05/outreach-dashboard"

  if (!VAULT_API || !VAULT_TOKEN) {
    return NextResponse.json({
      error: "memory-vault not configured",
      hint: "Set MEMORY_VAULT_API_URL and MEMORY_VAULT_TOKEN",
    }, { status: 503 })
  }

  // 1. Walk the tree, collect every .md file under Project Brain/
  const treeRes = await fetch(`${VAULT_API.replace(/\/+$/, "")}/tree`, {
    headers: { Authorization: `Bearer ${VAULT_TOKEN}` },
    signal: AbortSignal.timeout(15_000),
  })
  if (!treeRes.ok) {
    return NextResponse.json({ error: "vault tree unreachable", status: treeRes.status }, { status: 502 })
  }
  const tree = await treeRes.json()

  const targets: string[] = []
  walk(tree.tree || [], "Project Brain", targets)

  // 2. Read each file, scan for magic phrases (skipping lines already filed).
  const files: VaultFile[] = []
  for (const path of targets) {
    try {
      const fr = await fetch(
        `${VAULT_API.replace(/\/+$/, "")}/file?path=${encodeURIComponent(path)}`,
        { headers: { Authorization: `Bearer ${VAULT_TOKEN}` }, signal: AbortSignal.timeout(8_000) }
      )
      if (!fr.ok) continue
      const body = await fr.json()
      if (typeof body?.content === "string") files.push({ path, content: body.content })
    } catch {
      // Best-effort: skip unreadable files
    }
  }

  const found: FoundTag[] = []
  for (const f of files) {
    const lines = f.content.split("\n")
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      // Skip lines already filed (we mark them with an HTML comment)
      if (/<!--\s*filed:\s*#\d+\s*-->/.test(line)) continue
      for (const phrase of MAGIC_PHRASES) {
        if (line.includes(phrase)) {
          found.push({
            phrase,
            filePath: f.path,
            lineNumber: i + 1,
            contextBefore: lines.slice(Math.max(0, i - 5), i).join("\n"),
            contextAfter: lines.slice(i + 1, Math.min(lines.length, i + 6)).join("\n"),
          })
          break // one tag per line is enough — don't double-count
        }
      }
    }
  }

  // 3. For each found tag, file a GitHub issue (if we have a token).
  let issuesFiled = 0
  let issuesSkipped = 0
  const filed: Array<{ tag: FoundTag; number: number; url: string }> = []
  if (found.length > 0 && GH_TOKEN) {
    for (const tag of found) {
      const title = `[${labelFromPath(tag.filePath)}] ${tag.phrase} — line ${tag.lineNumber}`
      const body =
        `**File:** \`${tag.filePath}\`\n` +
        `**Line:** ${tag.lineNumber}\n` +
        `**Tag:** \`${tag.phrase}\`\n\n` +
        `### Context (5 lines before)\n\`\`\`\n${tag.contextBefore || "(start of file)"}\n\`\`\`\n\n` +
        `### Context (5 lines after)\n\`\`\`\n${tag.contextAfter || "(end of file)"}\n\`\`\`\n\n` +
        `---\n` +
        `_Filed automatically by \`/api/cron/project-brain-scan\`._\n` +
        `_Source: \`${tag.filePath}\` (memory-vault)_`
      const labels = [
        `magic-phrase:${tag.phrase.replace("@claude ", "")}`,
        labelFromPath(tag.filePath),
        "from-project-brain",
      ]
      try {
        const ghRes = await fetch(
          `https://api.github.com/repos/${GH_REPO}/issues`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${GH_TOKEN}`,
              "Accept": "application/vnd.github+json",
              "User-Agent": "outreach-dashboard-cron",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ title, body, labels }),
            signal: AbortSignal.timeout(10_000),
          }
        )
        if (ghRes.ok) {
          const issue = await ghRes.json()
          filed.push({ tag, number: issue.number, url: issue.html_url })
          issuesFiled += 1
        } else {
          issuesSkipped += 1
        }
      } catch {
        issuesSkipped += 1
      }
    }
  } else if (found.length > 0) {
    // No GH token — still useful to log what we'd file
    issuesSkipped = found.length
  }

  // 4. Write back the `<!-- filed: #N -->` markers so the same line isn't
  //    re-filed next run. Group by file to minimize PUTs.
  const byFile = new Map<string, Array<{ lineNumber: number; issueNumber: number }>>()
  for (const f of filed) {
    const arr = byFile.get(f.tag.filePath) || []
    arr.push({ lineNumber: f.tag.lineNumber, issueNumber: f.number })
    byFile.set(f.tag.filePath, arr)
  }
  let filesUpdated = 0
  for (const [path, edits] of byFile.entries()) {
    const original = files.find(x => x.path === path)
    if (!original) continue
    const lines = original.content.split("\n")
    for (const edit of edits) {
      const i = edit.lineNumber - 1
      if (i >= 0 && i < lines.length && !/<!--\s*filed:\s*#\d+\s*-->/.test(lines[i])) {
        lines[i] = lines[i].trimEnd() + ` <!-- filed: #${edit.issueNumber} -->`
      }
    }
    try {
      const putRes = await fetch(`${VAULT_API.replace(/\/+$/, "")}/file`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${VAULT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ path, content: lines.join("\n") }),
        signal: AbortSignal.timeout(8_000),
      })
      if (putRes.ok) filesUpdated += 1
    } catch {
      // best-effort
    }
  }

  // 5. Audit-log this run so the dashboard can show "last ran at X, found N tags".
  try {
    await supabase.from("cron_runs").insert({
      cron: "project-brain-scan",
      started_at: new Date(startedAt).toISOString(),
      ended_at: new Date().toISOString(),
      payload: {
        files_scanned: files.length,
        tags_found: found.length,
        issues_filed: issuesFiled,
        issues_skipped: issuesSkipped,
        files_updated: filesUpdated,
      },
    })
  } catch {
    // table may not exist — non-fatal
  }

  return NextResponse.json({
    ok: true,
    files_scanned: files.length,
    tags_found: found.length,
    issues_filed: issuesFiled,
    issues_skipped: issuesSkipped,
    files_updated: filesUpdated,
    duration_ms: Date.now() - startedAt,
    sample: found.slice(0, 5).map(t => ({
      file: t.filePath,
      line: t.lineNumber,
      phrase: t.phrase,
    })),
  })
}

function walk(nodes: any[], prefix: string, out: string[]) {
  for (const n of nodes || []) {
    if (!n) continue
    const path = n.path?.startsWith("/") ? n.path.slice(1) : n.path || ""
    const isUnderBrain = path.startsWith("Project Brain/") || path === "Project Brain"
    if (n.kind === "folder" || n.type === "dir") {
      if (path === "Project Brain" || isUnderBrain) {
        walk(n.children || [], prefix, out)
      }
    } else if (n.kind === "file" || n.type === "file") {
      if (isUnderBrain && path.endsWith(".md")) {
        out.push(path)
      }
    }
  }
}

// Best-effort tag derived from "1️⃣ Accounts & Proxies/🔐 Login Modal/2-What I want next.md"
// → "login-modal" so issues are easy to filter.
function labelFromPath(p: string): string {
  // Pick the section folder (second-to-last segment)
  const parts = p.split("/")
  const sectionFolder = parts.length >= 2 ? parts[parts.length - 2] : parts[0]
  // Strip emojis + leading number tags + lowercase + dasherize
  return sectionFolder
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, "")
    .replace(/^[\d️⃣\s]+/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "project-brain"
}

export const GET = handle
export const POST = handle
