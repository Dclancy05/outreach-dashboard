import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { rateLimitDb, retryAfterHeaders, ipFromRequest } from "@/lib/rate-limit"
import { extractAdminId, withAudit } from "@/lib/audit"

export const dynamic = "force-dynamic"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Cap at 500 rows per import to keep Supabase insert latency sane and to
// stop a malicious paste of "everyone in the world" from hammering the DB.
const MAX_IMPORT_ROWS = 500
// 2 imports per hour per admin — generous for legit batch onboarding,
// blocks any runaway script that loops through usernames.
const IMPORT_LIMIT = 2
const IMPORT_WINDOW_MS = 60 * 60 * 1000

interface ParsedAccount {
  platform?: string
  username: string
  password?: string
  email?: string
  email_password?: string
  twofa_secret?: string
  phone?: string
  profile_url?: string
  proxy_group_id?: string
}

function parsePastedText(text: string, defaultPlatform: string): ParsedAccount[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (!lines.length) return []

  const first = lines[0].toLowerCase()
  const hasHeader = /user|email|pass|2fa|platform|phone/.test(first) && first.includes(",")
  const dataLines = hasHeader ? lines.slice(1) : lines
  const headers = hasHeader
    ? first.split(",").map((h) => h.trim().toLowerCase().replace(/[^a-z_]/g, ""))
    : null

  const results: ParsedAccount[] = []

  for (const line of dataLines) {
    const isTab = line.includes("\t")
    const isColon = line.includes(":") && !line.includes(",") && !isTab
    const parts = isTab
      ? line.split("\t").map((p) => p.trim())
      : isColon
      ? line.split(":").map((p) => p.trim())
      : line.split(",").map((p) => p.trim())

    if (parts.length < 2) continue

    const row: ParsedAccount = { username: "", platform: defaultPlatform }

    if (headers) {
      headers.forEach((h, i) => {
        const val = parts[i] || ""
        if (h.startsWith("user")) row.username = val
        else if (h === "password" || h === "pass") row.password = val
        else if (h.startsWith("email") && !h.includes("pass")) row.email = val
        else if (h.includes("email") && h.includes("pass")) row.email_password = val
        else if (h.includes("2fa") || h.includes("twofa") || h.includes("totp")) row.twofa_secret = val
        else if (h === "phone") row.phone = val
        else if (h === "platform") row.platform = val.toLowerCase()
        else if (h.includes("url") || h === "profile") row.profile_url = val
      })
    } else {
      row.username = parts[0] || ""
      row.password = parts[1] || ""
      row.email = parts[2] || ""
      row.email_password = parts[3] || ""
      row.twofa_secret = parts[4] || ""
    }

    if (row.username) {
      row.username = row.username.replace(/^@/, "")
      results.push(row)
    }
  }

  return results
}

async function postHandler(request: Request) {
  const adminId = extractAdminId(request.headers.get("cookie")) || `ip:${ipFromRequest(request)}`
  try {
    const body = await request.json()
    const mode = body.mode as "preview" | "commit"
    const text = body.text as string
    const platform = body.platform || "instagram"
    const proxyGroupId = body.proxy_group_id || ""

    if (!text) return NextResponse.json({ error: "Missing text" }, { status: 400 })

    // Rate-limit only the commit branch — preview is read-only and gets
    // re-run as the user iterates on their paste, so 429ing it would be
    // hostile UX.
    if (mode === "commit") {
      const limit = await rateLimitDb(`bulk-import:${adminId}`, IMPORT_LIMIT, IMPORT_WINDOW_MS)
      if (!limit.ok) {
        return NextResponse.json(
          { error: "Bulk import is rate-limited to 2 per hour. Try again later.", retryAt: new Date(limit.resetAt).toISOString() },
          { status: 429, headers: retryAfterHeaders(limit.resetAt) }
        )
      }
    }

    const parsed = parsePastedText(text, platform)
    if (!parsed.length) return NextResponse.json({ error: "No accounts parsed" }, { status: 400 })
    if (parsed.length > MAX_IMPORT_ROWS) {
      return NextResponse.json(
        { error: `Too many rows (${parsed.length}). Max ${MAX_IMPORT_ROWS} per import — split into multiple batches.` },
        { status: 413 }
      )
    }

    const { data: existing } = await supabase.from("accounts").select("account_id, username, platform")
    const existingMap = new Map<string, string>()
    ;(existing || []).forEach((a: any) => {
      existingMap.set(`${a.platform}:${(a.username || "").toLowerCase()}`, a.account_id)
    })

    const annotated = parsed.map((p) => {
      const key = `${p.platform}:${p.username.toLowerCase()}`
      return { ...p, duplicate: existingMap.has(key), existing_id: existingMap.get(key) || null }
    })

    const newOnes = annotated.filter((a) => !a.duplicate)
    const dupes = annotated.filter((a) => a.duplicate)

    if (mode === "preview") {
      return NextResponse.json({
        total: annotated.length,
        new: newOnes.length,
        duplicates: dupes.length,
        accounts: annotated,
      })
    }

    const rows = newOnes.map((a) => {
      const id = `${a.platform}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
      return {
        account_id: id,
        platform: a.platform || platform,
        username: a.username,
        display_name: a.username,
        password: a.password || "",
        email: a.email || "",
        email_password: a.email_password || "",
        twofa_secret: a.twofa_secret || "",
        phone: a.phone || "",
        profile_url: a.profile_url || "",
        status: "pending_setup",
        daily_limit: "40",
        sends_today: "0",
        connection_type: "novnc",
        proxy_group_id: proxyGroupId || "",
        business_id: "default",
      }
    })

    if (rows.length) {
      const { error } = await supabase.from("accounts").insert(rows)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      imported: rows.length,
      skipped: dupes.length,
      accounts: rows.map((r) => ({ account_id: r.account_id, username: r.username })),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 })
  }
}

export const POST = withAudit("POST /api/accounts/bulk-import", postHandler)
