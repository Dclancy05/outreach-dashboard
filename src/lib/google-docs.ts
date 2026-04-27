import { google, docs_v1 } from "googleapis"
import { JWT } from "google-auth-library"
import { getSecret } from "@/lib/secrets"

const DOCS_SCOPE = "https://www.googleapis.com/auth/documents"

interface ServiceAccountKey {
  client_email: string
  private_key: string
  [key: string]: unknown
}

async function decodeServiceAccount(): Promise<ServiceAccountKey> {
  const raw = await getSecret("GOOGLE_SERVICE_ACCOUNT_JSON")
  if (!raw) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON not configured")
  }
  let jsonText: string
  try {
    jsonText = Buffer.from(raw, "base64").toString("utf8")
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid base64")
  }
  let parsed: ServiceAccountKey
  try {
    parsed = JSON.parse(jsonText) as ServiceAccountKey
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON did not decode to valid JSON")
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("Service account JSON missing client_email or private_key")
  }
  return parsed
}

export async function getDocsClient(): Promise<docs_v1.Docs> {
  const key = await decodeServiceAccount()
  const auth = new JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: [DOCS_SCOPE],
  })
  return google.docs({ version: "v1", auth })
}

function formatTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  const yyyy = date.getUTCFullYear()
  const mm = pad(date.getUTCMonth() + 1)
  const dd = pad(date.getUTCDate())
  const hh = pad(date.getUTCHours())
  const mi = pad(date.getUTCMinutes())
  return `${yyyy}-${mm}-${dd} ${hh}:${mi} UTC`
}

export interface DocsWriteResult {
  docId: string
  replies: docs_v1.Schema$Response[]
}

export async function appendNote(docId: string, text: string): Promise<DocsWriteResult> {
  if (!docId) throw new Error("docId is required")
  if (typeof text !== "string") throw new Error("text must be a string")
  const docs = await getDocsClient()
  const stamped = `\n\n[${formatTimestamp(new Date())}] ${text}`
  const res = await docs.documents.batchUpdate({
    documentId: docId,
    requestBody: {
      requests: [
        {
          insertText: {
            endOfSegmentLocation: {},
            text: stamped,
          },
        },
      ],
    },
  })
  return { docId, replies: res.data.replies ?? [] }
}

function extractDocText(doc: docs_v1.Schema$Document): string {
  const body = doc.body
  if (!body || !body.content) return ""
  let out = ""
  for (const block of body.content) {
    const para = block.paragraph
    if (!para || !para.elements) continue
    for (const el of para.elements) {
      const tr = el.textRun
      if (tr && typeof tr.content === "string") {
        out += tr.content
      }
    }
  }
  return out
}

export async function markDone(docId: string, taskText: string): Promise<DocsWriteResult> {
  if (!docId) throw new Error("docId is required")
  if (!taskText) throw new Error("taskText is required")
  const docs = await getDocsClient()
  const doc = await docs.documents.get({ documentId: docId })
  const fullText = extractDocText(doc.data)
  if (fullText.indexOf(taskText) === -1) {
    throw new Error(`Task text not found in document: "${taskText}"`)
  }
  const res = await docs.documents.batchUpdate({
    documentId: docId,
    requestBody: {
      requests: [
        {
          replaceAllText: {
            containsText: { text: taskText, matchCase: true },
            replaceText: `✅ ${taskText}`,
          },
        },
      ],
    },
  })
  const replies = res.data.replies ?? []
  const first = replies[0]?.replaceAllText
  const occurrences = first?.occurrencesChanged ?? 0
  if (occurrences === 0) {
    throw new Error(`Task text not found in document: "${taskText}"`)
  }
  return { docId, replies }
}

export async function addSection(docId: string, heading: string, body: string): Promise<DocsWriteResult> {
  if (!docId) throw new Error("docId is required")
  if (!heading) throw new Error("heading is required")
  if (typeof body !== "string") throw new Error("body must be a string")
  const docs = await getDocsClient()

  const headingText = `\n${heading}\n`
  const bodyText = `${body}\n`

  const insertHeading = await docs.documents.batchUpdate({
    documentId: docId,
    requestBody: {
      requests: [
        {
          insertText: {
            endOfSegmentLocation: {},
            text: headingText,
          },
        },
      ],
    },
  })

  const refreshed = await docs.documents.get({ documentId: docId })
  const content = refreshed.data.body?.content ?? []
  let headingStart: number | null = null
  let headingEnd: number | null = null
  for (let i = content.length - 1; i >= 0; i--) {
    const block = content[i]
    const para = block.paragraph
    if (!para || !para.elements) continue
    const blockText = para.elements
      .map((el) => el.textRun?.content ?? "")
      .join("")
    if (blockText.includes(heading)) {
      if (typeof block.startIndex === "number" && typeof block.endIndex === "number") {
        headingStart = block.startIndex
        headingEnd = block.endIndex
        break
      }
    }
  }

  const styleRequests: docs_v1.Schema$Request[] = []
  if (headingStart !== null && headingEnd !== null) {
    styleRequests.push({
      updateParagraphStyle: {
        range: { startIndex: headingStart, endIndex: headingEnd },
        paragraphStyle: { namedStyleType: "HEADING_2" },
        fields: "namedStyleType",
      },
    })
  }

  styleRequests.push({
    insertText: {
      endOfSegmentLocation: {},
      text: bodyText,
    },
  })

  const styled = await docs.documents.batchUpdate({
    documentId: docId,
    requestBody: { requests: styleRequests },
  })

  const headingReplies = insertHeading.data.replies ?? []
  const styledReplies = styled.data.replies ?? []
  return { docId, replies: [...headingReplies, ...styledReplies] }
}
