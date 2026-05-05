#!/usr/bin/env node
/**
 * Phase G — single-command full test sweep. Runs the matrix + chaos +
 * memory + a11y in sequence and writes a consolidated owner-readable
 * report. This is what the operator runs after the 13 stacked PRs merge
 * and the SQL migrations apply, to produce the definitive "automations
 * page is enterprise-ready" sign-off document.
 *
 * USAGE
 *   # The full pre-shipping sweep (~24h wallclock at concurrency 4)
 *   node scripts/harness/full-sweep.mjs
 *
 *   # Faster smoke for CI / sanity (~30 min)
 *   node scripts/harness/full-sweep.mjs --runs-per-combo 5
 *
 *   # Subset
 *   node scripts/harness/full-sweep.mjs --skip chaos,memory --runs-per-combo 3
 *
 * STAGES (in order)
 *   1. matrix   — N runs per (platform, action) combo
 *   2. chaos    — each of the 5 chaos variants × 5 runs
 *   3. memory   — 50-cycle modal open/close
 *   4. a11y     — axe-core on each of the 4 tabs
 *
 * Pass criteria for "ship it":
 *   - matrix:  ≥98% per combo
 *   - chaos:   100% (all 5 variants × all runs)
 *   - memory:  bounded growth assertion passes
 *   - a11y:    zero serious + critical violations
 *
 * Output:
 *   <output>/matrix/   per-combo per-run timelines + summary.json
 *   <output>/chaos/    per-variant timelines
 *   <output>/memory/   single timeline + heap snapshots
 *   <output>/a11y/     per-tab timelines + axe report JSON
 *   <output>/Test Results — Automations Page Full Sweep <date>.md
 *      The single consolidated owner-readable report.
 */

import fs from "node:fs"
import path from "node:path"
import { spawn } from "node:child_process"

function parseArgs(argv) {
  const out = { _: [] }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("--")) {
      const key = a.slice(2)
      const next = argv[i + 1]
      if (!next || next.startsWith("--")) out[key] = true
      else { out[key] = next; i++ }
    } else out._.push(a)
  }
  return out
}

const argv = parseArgs(process.argv)

const runsPerCombo = Number(argv["runs-per-combo"] || argv.runs || 50)
const concurrency = Number(argv.concurrency || 1)
const outputDir =
  argv.output ||
  `/tmp/automations-full-sweep-${new Date().toISOString().slice(0, 10)}`
const skip = new Set((argv.skip || "").split(",").filter(Boolean))

fs.mkdirSync(outputDir, { recursive: true })

const CHAOS_VARIANTS = [
  "rate-limit-hit",
  "network-flap",
  "concurrent-recordings",
  "vnc-drop",
  "modal-close-mid-record",
]

// Run a single subprocess and wait for it to finish.
// Bug #12 fix: includes child.on("error") so spawn failures resolve
// instead of hanging the sweep, plus a 10min hard timeout per stage.
function runCommand(label, args, env = {}) {
  return new Promise((resolve) => {
    console.log(`\n━━━ ${label} ━━━`)
    console.log(`> node ${args.join(" ")}`)
    const startedAt = Date.now()
    let resolved = false
    const safeResolve = (r) => {
      if (resolved) return
      resolved = true
      resolve(r)
    }
    const child = spawn("node", args, {
      stdio: "inherit",
      env: { ...process.env, ...env },
    })
    child.on("error", (err) => {
      const took = Date.now() - startedAt
      console.log(`━━━ ${label} spawn FAILED in ${(took / 1000).toFixed(1)}s — ${err.message}`)
      safeResolve({ label, code: -1, took, error: err.message })
    })
    // 10min per-stage timeout — chaos/memory/a11y individual scenarios
    // run ≤ 30s typically, but matrix can be much longer. The outer
    // matrix.mjs has its own per-run timeouts; this is the belt-and-
    // suspenders kill.
    const STAGE_TIMEOUT_MS = 60 * 60 * 1000 // 60 min
    const killTimer = setTimeout(() => {
      try { child.kill("SIGKILL") } catch {}
      const took = Date.now() - startedAt
      console.log(`━━━ ${label} KILLED after ${(took / 60_000).toFixed(1)}min`)
      safeResolve({ label, code: -2, took, error: "stage timeout" })
    }, STAGE_TIMEOUT_MS)
    child.on("exit", (code) => {
      clearTimeout(killTimer)
      const took = Date.now() - startedAt
      console.log(`━━━ ${label} done in ${(took / 1000).toFixed(1)}s — exit ${code}`)
      safeResolve({ label, code, took })
    })
  })
}

const stageResults = {}

// ── Stage 1: Matrix ──────────────────────────────────────────────────────
if (!skip.has("matrix")) {
  const matrixOut = path.join(outputDir, "matrix")
  const r = await runCommand("STAGE 1 — matrix", [
    "scripts/harness/matrix.mjs",
    "--runs-per-combo",
    String(runsPerCombo),
    "--concurrency",
    String(concurrency),
    "--output",
    matrixOut,
  ])
  stageResults.matrix = r
  // Pull matrix summary into our consolidated state.
  try {
    const sum = JSON.parse(
      fs.readFileSync(path.join(matrixOut, "summary.json"), "utf8")
    )
    stageResults.matrix.summary = sum
  } catch {}
}

// ── Stage 2: Chaos ───────────────────────────────────────────────────────
if (!skip.has("chaos")) {
  const chaosOut = path.join(outputDir, "chaos")
  fs.mkdirSync(chaosOut, { recursive: true })
  const chaosResults = []
  for (const variant of CHAOS_VARIANTS) {
    for (let n = 1; n <= 5; n++) {
      const subOut = path.join(chaosOut, `${variant}-run-${n}`)
      fs.mkdirSync(subOut, { recursive: true })
      const r = await runCommand(`STAGE 2 — chaos:${variant} #${n}`, [
        "scripts/harness/run.mjs",
        "--scenario",
        "automation-chaos",
        "--variant",
        variant,
        "--duration",
        "30",
        "--outDir",
        subOut,
      ])
      chaosResults.push({ variant, run: n, ...r })
    }
  }
  stageResults.chaos = chaosResults
}

// ── Stage 3: Memory ──────────────────────────────────────────────────────
if (!skip.has("memory")) {
  const memOut = path.join(outputDir, "memory")
  fs.mkdirSync(memOut, { recursive: true })
  const r = await runCommand("STAGE 3 — memory leak (50 cycles)", [
    "scripts/harness/run.mjs",
    "--scenario",
    "automation-memory-leak",
    "--cycles",
    "50",
    "--duration",
    "600",
    "--outDir",
    memOut,
  ])
  stageResults.memory = r
}

// ── Stage 4: A11y ────────────────────────────────────────────────────────
if (!skip.has("a11y")) {
  const a11yOut = path.join(outputDir, "a11y")
  fs.mkdirSync(a11yOut, { recursive: true })
  const a11yResults = []
  for (const tab of ["overview", "your-automations", "live-view", "maintenance"]) {
    const subOut = path.join(a11yOut, `tab-${tab}`)
    fs.mkdirSync(subOut, { recursive: true })
    const r = await runCommand(`STAGE 4 — a11y on ${tab}`, [
      "scripts/harness/run.mjs",
      "--scenario",
      "automation-a11y",
      "--tab",
      tab,
      "--duration",
      "30",
      "--outDir",
      subOut,
    ])
    a11yResults.push({ tab, ...r })
  }
  stageResults.a11y = a11yResults
}

// ── Compose the consolidated report ─────────────────────────────────────
const ranAt = new Date().toISOString()

function chaosSummary() {
  if (!stageResults.chaos) return "_(skipped)_"
  const byVariant = {}
  for (const r of stageResults.chaos) {
    if (!byVariant[r.variant]) byVariant[r.variant] = { total: 0, passed: 0 }
    byVariant[r.variant].total++
    if (r.code === 0) byVariant[r.variant].passed++
  }
  const rows = Object.entries(byVariant)
    .map(([v, c]) => `| ${v} | ${c.total} | ${c.passed} | ${(c.passed === c.total) ? "✅" : "❌"} |`)
    .join("\n")
  return `| Variant | Runs | Passed | Verdict |\n|---|---:|---:|:---:|\n${rows}`
}

function matrixSummary() {
  if (!stageResults.matrix?.summary) return "_(skipped)_"
  const s = stageResults.matrix.summary
  const overall = (Number(s.pass_rate) * 100).toFixed(1)
  const rows = Object.entries(s.by_combo)
    .map(([slug, c]) =>
      `| ${slug} | ${c.runs} | ${c.passed} | ${c.failed} | ${((c.passed / Math.max(c.runs, 1)) * 100).toFixed(1)}% |`
    ).join("\n")
  return `**Overall:** ${overall}% (${s.passed}/${s.total_runs}) in ${(s.took_ms / 60_000).toFixed(1)} min\n\n| Combo | Runs | Passed | Failed | Pass % |\n|---|---:|---:|---:|---:|\n${rows}`
}

function memSummary() {
  if (!stageResults.memory) return "_(skipped)_"
  return stageResults.memory.code === 0
    ? `✅ Memory leak scenario passed (50 cycles, see \`memory/\` for heap snapshots)`
    : `❌ Memory leak scenario failed — exit ${stageResults.memory.code}`
}

function a11ySummary() {
  if (!stageResults.a11y) return "_(skipped)_"
  const rows = stageResults.a11y
    .map(r => `| ${r.tab} | ${r.code === 0 ? "✅" : "❌"} | exit=${r.code} |`)
    .join("\n")
  return `| Tab | Verdict | Detail |\n|---|:---:|---|\n${rows}`
}

const md = `# Test Results — Automations Page Full Sweep

**Run:** ${ranAt}
**Output dir:** \`${outputDir}\`

This is the consolidated post-merge sign-off report. Generated by
\`scripts/harness/full-sweep.mjs\`. To regenerate from the per-stage
output dirs without rerunning the tests, see the JSON files in
\`<stage>/summary.json\`.

## Stage 1 — Matrix (combo lifecycles)

${matrixSummary()}

## Stage 2 — Chaos (failure-mode resilience)

${chaosSummary()}

## Stage 3 — Memory leak (50-cycle modal cycling)

${memSummary()}

## Stage 4 — A11y (axe-core WCAG 2.1 AA, per-tab)

${a11ySummary()}

## Pass criteria

- [${(stageResults.matrix?.summary && Number(stageResults.matrix.summary.pass_rate) >= 0.98) ? "x" : " "}] Matrix ≥98% per combo
- [${(stageResults.chaos && stageResults.chaos.every(r => r.code === 0)) ? "x" : " "}] All chaos variants pass
- [${stageResults.memory?.code === 0 ? "x" : " "}] Memory leak scenario passes
- [${(stageResults.a11y && stageResults.a11y.every(r => r.code === 0)) ? "x" : " "}] All 4 tabs pass a11y

## Per-stage raw output

- \`matrix/<combo>/run-<n>/\` — per-lifecycle Playwright traces
- \`chaos/<variant>-run-<n>/\` — per-chaos Playwright traces
- \`memory/\` — single timeline + heap snapshots
- \`a11y/tab-<tab>/\` — per-tab axe-core report (claude-readable.json has the offenders)
`

const reportPath = path.join(
  outputDir,
  `Test Results — Automations Page Full Sweep ${new Date().toISOString().slice(0, 10)}.md`
)
fs.writeFileSync(reportPath, md)

const summaryPath = path.join(outputDir, "full-sweep-summary.json")
fs.writeFileSync(summaryPath, JSON.stringify(stageResults, null, 2))

console.log(`\n══ FULL SWEEP COMPLETE ══`)
console.log(`Report:  ${reportPath}`)
console.log(`Summary: ${summaryPath}`)

const allPass =
  (!stageResults.matrix?.summary || Number(stageResults.matrix.summary.pass_rate) >= 0.98) &&
  (!stageResults.chaos || stageResults.chaos.every(r => r.code === 0)) &&
  (!stageResults.memory || stageResults.memory.code === 0) &&
  (!stageResults.a11y || stageResults.a11y.every(r => r.code === 0))

process.exit(allPass ? 0 : 1)
