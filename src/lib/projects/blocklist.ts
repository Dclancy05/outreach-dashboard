/**
 * Path blocklist + secret redactor for the Project Tree tab.
 *
 * - Glob matcher: supports `*` (no /), `**` (any depth), and exact segments.
 * - Tree filter: drops blocked paths server-side BEFORE returning JSON.
 * - Single-path check: rejects file fetches under blocked paths (so the API
 *   returns 404 even if a user crafts the URL by hand).
 * - Secret redactor: pattern-matches `KEY=value` shapes and replaces the value
 *   with `[REDACTED]` before sending file content to the client.
 */

function globToRegex(glob: string): RegExp {
  // Anchor at start. Convert glob → regex.
  let re = "^"
  let i = 0
  while (i < glob.length) {
    const ch = glob[i]
    if (ch === "*" && glob[i + 1] === "*") {
      // ** matches any sequence including slashes
      re += ".*"
      i += 2
      // consume an optional trailing slash so "node_modules/**" matches "node_modules" too
      if (glob[i] === "/") i++
    } else if (ch === "*") {
      // * matches any non-slash run
      re += "[^/]*"
      i++
    } else if (ch === "?") {
      re += "[^/]"
      i++
    } else if (".+()[]{}|^$\\".includes(ch)) {
      re += "\\" + ch
      i++
    } else {
      re += ch
      i++
    }
  }
  re += "$"
  return new RegExp(re)
}

function compile(globs: string[]): RegExp[] {
  return globs.map(globToRegex)
}

export function isBlocked(path: string, globs: string[]): boolean {
  const norm = path.replace(/^\/+/, "")
  const compiled = compile(globs)
  for (const re of compiled) {
    if (re.test(norm)) return true
    // also match exact segment matches like ".env" against ".env" (no path prefix)
    if (re.test("/" + norm)) return true
  }
  // Walk parent dirs — if any parent dir matches, the file under it is blocked.
  const segs = norm.split("/")
  for (let i = 1; i < segs.length; i++) {
    const dir = segs.slice(0, i).join("/")
    for (const re of compiled) {
      if (re.test(dir) || re.test(dir + "/")) return true
    }
  }
  return false
}

const SECRET_PATTERNS: Array<RegExp> = [
  // KEY=value, KEY: value, KEY = "value" — any token-shaped value 16+ chars
  /([A-Z][A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD|PASS|PWD|BEARER|PAT|API_KEY|ACCESS_TOKEN)[A-Z0-9_]*)\s*[:=]\s*["']?([A-Za-z0-9_\-./+=]{16,})["']?/g,
  // sk-... / ghp_... / xox[baprs]- / AKIA... style prefixes
  /\b(sk-[A-Za-z0-9_-]{20,})\b/g,
  /\b(ghp_[A-Za-z0-9]{20,})\b/g,
  /\b(github_pat_[A-Za-z0-9_]{20,})\b/g,
  /\b(xox[baprs]-[A-Za-z0-9-]{10,})\b/g,
  /\b(AKIA[A-Z0-9]{16})\b/g,
]

export function redactSecrets(text: string): { text: string; redacted: boolean } {
  let out = text
  let redacted = false
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, (m, p1, p2) => {
      redacted = true
      // Two-capture form (KEY=value)
      if (p2 !== undefined) return `${p1}=[REDACTED]`
      // Single-capture form (token-prefix match)
      return "[REDACTED]"
    })
  }
  return { text: out, redacted }
}
