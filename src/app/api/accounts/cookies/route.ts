import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type CookieRow = {
  name: string
  value: string
  domain?: string
  path?: string
  expires?: number | null
  httpOnly?: boolean
  secure?: boolean
  sameSite?: string
}

// Normalizes any of the 3 common cookie paste formats into a plain array that
// Chrome's Network.setCookies CDP method can consume directly.
function parseCookies(raw: string): CookieRow[] {
  const trimmed = raw.trim()
  if (!trimmed) return []

  // Format 1 — JSON array (EditThisCookie / Cookie-Editor extensions)
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed)
      const arr = Array.isArray(parsed) ? parsed : [parsed]
      return arr
        .filter((c: any) => c && c.name && c.value != null)
        .map((c: any) => ({
          name: String(c.name),
          value: String(c.value),
          domain: c.domain || undefined,
          path: c.path || "/",
          expires: typeof c.expirationDate === "number" ? c.expirationDate
                 : typeof c.expires === "number" ? c.expires
                 : null,
          httpOnly: !!c.httpOnly,
          secure: !!c.secure,
          sameSite: c.sameSite || undefined,
        }))
    } catch {
      // fall through to other formats
    }
  }

  // Format 2 — Netscape cookies.txt (tab-separated)
  //   # domain flag path secure expires name value
  const lines = trimmed.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith("#"))
  const tabFormat = lines.every(l => l.split("\t").length >= 6)
  if (tabFormat && lines.length > 0) {
    const rows: CookieRow[] = []
    for (const l of lines) {
      const parts = l.split("\t")
      if (parts.length < 7) continue
      rows.push({
        domain: parts[0],
        path: parts[2] || "/",
        secure: parts[3] === "TRUE",
        expires: parts[4] ? Number(parts[4]) : null,
        name: parts[5],
        value: parts[6],
      })
    }
    if (rows.length > 0) return rows
  }

  // Format 3 — Cookie header: "name1=val1; name2=val2"
  const stripped = trimmed.replace(/^Cookie:\s*/i, "")
  const pairs = stripped.split(";").map(p => p.trim()).filter(Boolean)
  if (pairs.length > 0 && pairs.every(p => p.includes("="))) {
    return pairs.map(p => {
      const eq = p.indexOf("=")
      return { name: p.slice(0, eq).trim(), value: p.slice(eq + 1).trim(), path: "/" }
    })
  }

  return []
}

// Caps to prevent a malicious / accidental megabyte-paste from crashing the
// Supabase row size limit or filling logs. 100 KB JSON is enough for
// hundreds of legit cookies; 500 individual cookies is well above any real
// session jar. Anything past either limit returns 413.
const MAX_COOKIES_JSON_BYTES = 100 * 1024
const MAX_COOKIE_COUNT = 500

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { account_id, cookies } = body
    if (!account_id) return NextResponse.json({ error: "account_id required" }, { status: 400 })
    if (!cookies || typeof cookies !== "string") {
      return NextResponse.json({ error: "cookies (string) required" }, { status: 400 })
    }

    if (cookies.length > MAX_COOKIES_JSON_BYTES) {
      return NextResponse.json(
        { error: `Cookie payload exceeds ${MAX_COOKIES_JSON_BYTES} bytes — split or trim.` },
        { status: 413 }
      )
    }

    const parsed = parseCookies(cookies)
    if (parsed.length === 0) {
      return NextResponse.json({ error: "Could not parse cookies. Expected JSON array, Cookie header, or cookies.txt" }, { status: 400 })
    }
    if (parsed.length > MAX_COOKIE_COUNT) {
      return NextResponse.json(
        { error: `Too many cookies (${parsed.length}). Max ${MAX_COOKIE_COUNT} per account.` },
        { status: 413 }
      )
    }
    const serialized = JSON.stringify(parsed)
    if (serialized.length > MAX_COOKIES_JSON_BYTES) {
      return NextResponse.json(
        { error: `Parsed cookie jar exceeds ${MAX_COOKIES_JSON_BYTES} bytes serialized.` },
        { status: 413 }
      )
    }

    const { error } = await supabase
      .from("accounts")
      .update({
        session_cookie: serialized,
        session_cookie_imported_at: new Date().toISOString(),
      })
      .eq("account_id", account_id)

    if (error) {
      // If the timestamp column doesn't exist yet, retry without it
      const { error: retry } = await supabase
        .from("accounts")
        .update({ session_cookie: serialized })
        .eq("account_id", account_id)
      if (retry) return NextResponse.json({ error: retry.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, count: parsed.length })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "failed" }, { status: 500 })
  }
}
