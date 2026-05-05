#!/usr/bin/env node
/**
 * Verifies every catalog automation with `needsRecording: true` has a
 * matching entry in `RECORDING_GUIDES`. Run as a pre-commit / CI gate.
 *
 *   node scripts/check-guide-coverage.mjs
 *
 * Exits 0 when all `needsRecording` slugs have guides, exits 1 otherwise.
 *
 * Phase C v1 scope is OUTREACH-ONLY — enrichment slugs (lead_enrichment
 * tag) are allowed to lack guides for now and will land in a follow-on
 * PR. Pass --strict to also require enrichment coverage.
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, "..")
const pageFile = path.join(
  repoRoot,
  "src/app/(dashboard)/automations/page.tsx"
)

const strict = process.argv.includes("--strict")

if (!fs.existsSync(pageFile)) {
  console.error(`✗ Could not find ${pageFile}`)
  process.exit(2)
}

const src = fs.readFileSync(pageFile, "utf8")

// ── Parse RECORDING_GUIDES keys (top-level keys of the const object) ─────
const guidesMatch = src.match(
  /const\s+RECORDING_GUIDES[^=]*=\s*\{([\s\S]*?)\n\}/m
)
if (!guidesMatch) {
  console.error("✗ Could not locate RECORDING_GUIDES const")
  process.exit(2)
}
// Match the top-level keys (they're at the start of an indented line and
// followed by a colon + brace). Keys we care about look like `ig_dm:` or
// `pinterest_save_pin:`.
const guideKeys = new Set(
  Array.from(guidesMatch[1].matchAll(/^\s{2}([a-z][a-z0-9_]*):\s*\{/gm)).map(
    (m) => m[1]
  )
)

// ── Parse ALL_AUTOMATIONS rows ───────────────────────────────────────────
const autoBlock = src.match(
  /const\s+ALL_AUTOMATIONS:[^=]*=\s*\[([\s\S]*?)^\]/m
)
if (!autoBlock) {
  console.error("✗ Could not locate ALL_AUTOMATIONS const")
  process.exit(2)
}

const rows = []
const rowRe =
  /\{\s*platform:\s*"([^"]+)",\s*action:\s*"([^"]+)",\s*actionKey:\s*"([^"]+)",\s*slug:\s*"([^"]+)"[^}]*needsRecording:\s*(true|false)[^}]*tag:\s*"([^"]+)"/g
let m
while ((m = rowRe.exec(autoBlock[1])) !== null) {
  rows.push({
    platform: m[1],
    action: m[2],
    actionKey: m[3],
    slug: m[4],
    needsRecording: m[5] === "true",
    tag: m[6],
  })
}

if (rows.length === 0) {
  console.error("✗ Failed to parse any rows from ALL_AUTOMATIONS")
  process.exit(2)
}

const required = rows.filter((r) => {
  if (!r.needsRecording) return false
  // v1 scope: outreach actions only. Pass --strict to also gate enrichment.
  if (!strict && r.tag === "lead_enrichment") return false
  return true
})

const missing = required.filter((r) => !guideKeys.has(r.slug))

console.log(
  `Checked ${required.length} ${strict ? "needsRecording" : "outreach"} slugs against ${guideKeys.size} guides`
)

if (missing.length === 0) {
  console.log("✓ All required slugs have a recording guide")
  process.exit(0)
}

console.error(`\n✗ Missing recording guides for ${missing.length} slug(s):`)
for (const r of missing) {
  console.error(`   - ${r.slug}  (${r.platform} ${r.action}, tag=${r.tag})`)
}
console.error(
  "\nAdd entries to RECORDING_GUIDES in src/app/(dashboard)/automations/page.tsx"
)
process.exit(1)
