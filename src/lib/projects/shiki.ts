/**
 * Shiki singleton — server-side syntax highlighting.
 *
 * Highlights once per (sha+path), serializes to HTML. Output ships as plain
 * HTML to the client — zero highlighter JS in the client bundle, looks identical
 * to VS Code (TextMate grammars, github-dark-default theme).
 */
import { createHighlighter, type Highlighter } from "shiki"
import { lru } from "./cache"

const LANGUAGES = [
  "typescript", "tsx", "javascript", "jsx",
  "json", "json5", "yaml", "toml", "ini",
  "html", "css", "scss",
  "markdown", "mdx",
  "sql", "bash", "shell",
  "python", "dockerfile",
] as const

const THEME = "github-dark-default"

let highlighterPromise: Promise<Highlighter> | null = null

function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: [THEME],
      langs: LANGUAGES as unknown as string[],
    })
  }
  return highlighterPromise
}

const EXT_LANG: Record<string, string> = {
  ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx", mjs: "javascript", cjs: "javascript",
  json: "json", json5: "json5",
  yml: "yaml", yaml: "yaml", toml: "toml", ini: "ini",
  html: "html", htm: "html",
  css: "css", scss: "scss",
  md: "markdown", mdx: "mdx",
  sql: "sql",
  sh: "bash", bash: "bash", zsh: "bash",
  py: "python",
  dockerfile: "dockerfile",
}

export function detectLanguage(path: string): string {
  const base = path.split("/").pop() ?? ""
  if (base.toLowerCase() === "dockerfile") return "dockerfile"
  const ext = base.includes(".") ? base.split(".").pop()!.toLowerCase() : ""
  return EXT_LANG[ext] ?? "text"
}

const htmlCache = lru<string, string>({ max: 256, ttlMs: 24 * 60 * 60 * 1000 })

export async function highlightToHtml(opts: {
  cacheKey: string
  code: string
  lang: string
}): Promise<string> {
  const hit = htmlCache.get(opts.cacheKey)
  if (hit) return hit
  const supported = (LANGUAGES as readonly string[]).includes(opts.lang) ? opts.lang : "text"
  const hl = await getHighlighter()
  const html = hl.codeToHtml(opts.code, {
    lang: supported,
    theme: THEME,
  })
  htmlCache.set(opts.cacheKey, html)
  return html
}
