import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { ImapFlow } from "imapflow"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 30

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

function imapHostFromEmail(email: string): { host: string; port: number; secure: boolean } | null {
  const domain = (email.split("@")[1] || "").toLowerCase()
  if (!domain) return null
  if (domain.includes("gmail") || domain.includes("googlemail"))
    return { host: "imap.gmail.com", port: 993, secure: true }
  if (domain.includes("outlook") || domain.includes("hotmail") || domain.includes("live") || domain.includes("msn"))
    return { host: "outlook.office365.com", port: 993, secure: true }
  if (domain.includes("yahoo") || domain.includes("rocketmail") || domain.includes("ymail"))
    return { host: "imap.mail.yahoo.com", port: 993, secure: true }
  if (domain.includes("aol"))
    return { host: "imap.aol.com", port: 993, secure: true }
  if (domain.includes("icloud") || domain.includes("me.com") || domain.includes("mac.com"))
    return { host: "imap.mail.me.com", port: 993, secure: true }
  if (domain.includes("mail.ru"))
    return { host: "imap.mail.ru", port: 993, secure: true }
  if (domain.includes("rambler"))
    return { host: "imap.rambler.ru", port: 993, secure: true }
  if (domain.includes("gmx"))
    return { host: "imap.gmx.com", port: 993, secure: true }
  if (domain.includes("zoho"))
    return { host: "imap.zoho.com", port: 993, secure: true }
  return null
}

function extractCode(text: string, platform: string): string | null {
  if (!text) return null
  const body = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")

  const labeledPatterns = [
    /(?:verification|security|confirmation|login|auth|access)\s*code[:\s]*([0-9]{4,8})/i,
    /code\s+is[:\s]*([0-9]{4,8})/i,
    /(?:your|use)\s+(?:code|pin)[:\s]*([0-9]{4,8})/i,
    /\b([0-9]{6})\b(?=[^0-9]*(?:verification|security|code))/i,
  ]
  for (const p of labeledPatterns) {
    const m = body.match(p)
    if (m && m[1]) return m[1]
  }

  const sixDigit = body.match(/\b(\d{6})\b/)
  if (sixDigit) return sixDigit[1]
  const fiveDigit = body.match(/\b(\d{5})\b/)
  if (fiveDigit) return fiveDigit[1]
  const fourDigit = body.match(/\b(\d{4})\b/)
  if (fourDigit) return fourDigit[1]
  return null
}

export async function POST(request: Request) {
  try {
    const { account_id } = await request.json()
    if (!account_id) return NextResponse.json({ error: "Missing account_id" }, { status: 400 })

    const { data: account, error } = await supabase
      .from("accounts")
      .select("*")
      .eq("account_id", String(account_id))
      .maybeSingle()
    if (error || !account) return NextResponse.json({ error: "Account not found" }, { status: 404 })

    if (!account.email || !account.email_password)
      return NextResponse.json(
        { error: "No email + email_password configured for this account" },
        { status: 400 },
      )

    const imap = imapHostFromEmail(account.email)
    if (!imap)
      return NextResponse.json(
        {
          error: `Unsupported email provider for ${account.email}. Only major providers (gmail/outlook/yahoo/aol/icloud/mail.ru) auto-detect IMAP.`,
        },
        { status: 400 },
      )

    const platform = String(account.platform || "").toLowerCase()
    const senderDomains: Record<string, string[]> = {
      instagram: ["instagram.com", "mail.instagram.com"],
      facebook: ["facebookmail.com", "facebook.com"],
      linkedin: ["linkedin.com", "e.linkedin.com"],
      tiktok: ["tiktok.com", "registermail.tiktok.com"],
      twitter: ["twitter.com", "x.com"],
      youtube: ["youtube.com", "google.com"],
    }
    const fromHints = senderDomains[platform] || []

    const client = new ImapFlow({
      host: imap.host,
      port: imap.port,
      secure: imap.secure,
      auth: { user: account.email, pass: account.email_password },
      logger: false,
      // Hard cap so a slow/unreachable IMAP server can't keep the Vercel
      // function alive past its budget. 10 s is generous — most providers
      // respond within 1-2 s. After this, ImapFlow throws "Connection timed
      // out" which the catch below surfaces to the user.
      socketTimeout: 10_000,
    } as any)

    try {
      await client.connect()
    } catch (e: any) {
      return NextResponse.json(
        { error: `IMAP login failed (${e.message}). Check email password — most providers need an app password.` },
        { status: 401 },
      )
    }

    let foundCode: string | null = null
    let foundFrom = ""
    let foundSubject = ""
    let foundDate: string | null = null

    try {
      const lock = await client.getMailboxLock("INBOX")
      try {
        const since = new Date(Date.now() - 1000 * 60 * 30)
        const searchResult = await client.search({ since })
        const uids = Array.isArray(searchResult) ? searchResult : []
        const recent = uids.slice(-20).reverse()

        for (const uid of recent) {
          const msg = await client.fetchOne(uid as any, { envelope: true, source: true })
          if (!msg) continue
          const fromAddr = (msg.envelope?.from?.[0]?.address || "").toLowerCase()
          const fromMatches = fromHints.length === 0 || fromHints.some((d) => fromAddr.includes(d))
          if (!fromMatches) continue
          const source = msg.source?.toString("utf-8") || ""
          const code = extractCode(source, platform)
          if (code) {
            foundCode = code
            foundFrom = fromAddr
            foundSubject = msg.envelope?.subject || ""
            foundDate = msg.envelope?.date ? new Date(msg.envelope.date).toISOString() : null
            break
          }
        }
      } finally {
        lock.release()
      }
    } finally {
      await client.logout().catch(() => {})
    }

    if (!foundCode)
      return NextResponse.json(
        { error: `No verification code found from ${platform} in the last 30 minutes. Try again after requesting a code.` },
        { status: 404 },
      )

    return NextResponse.json({ code: foundCode, from: foundFrom, subject: foundSubject, date: foundDate })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 })
  }
}
