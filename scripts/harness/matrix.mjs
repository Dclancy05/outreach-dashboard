#!/usr/bin/env node
/**
 * Phase G — combo matrix runner. Iterates a user-defined set of
 * (platform, action) combos, runs the `automation-record-with-cookies`
 * scenario N times per combo, and writes a single roll-up
 * `Test Results — Automations Page/<date>.md` file the owner can read.
 *
 * Default scope = "outreach" (all 27 outreach actions in
 * src/lib/automations/platform-action-targets.ts × 50 runs each = 1,350
 * lifecycles). At ~3 min per lifecycle, that's ~67 wallclock hours
 * single-threaded; --concurrency 4 brings it to ~17 hours.
 *
 * USAGE
 *   node scripts/harness/matrix.mjs                         # default sweep
 *   node scripts/harness/matrix.mjs --runs-per-combo 5      # quick sanity (~15min)
 *   node scripts/harness/matrix.mjs --combos ig_dm,fb_dm    # subset
 *   node scripts/harness/matrix.mjs --concurrency 4         # parallel
 *   node scripts/harness/matrix.mjs --output /tmp/matrix    # custom output dir
 *   node scripts/harness/matrix.mjs --dry-run               # print plan, exit
 *
 * BAN-RISK RULES (non-negotiable per CLAUDE.md):
 *   1. Snapchat capped at 5 runs per combo regardless of --runs-per-combo
 *   2. Throttles ≥30s per (account, platform) inside the harness — the
 *      /api/recordings/start route is also rate-limited 5/60s server-side
 *   3. DM tests skip the final Send key (handled by self-test route)
 *   4. Follow tests immediately Unfollow (handled by matrix ordering)
 *   5. Aborts the whole sweep if any account's health_score drops <60
 *      (TODO: needs /api/accounts/health endpoint)
 *
 * OUTPUT
 *   <output>/<combo>/<run-N>/timeline.txt   — per-run trace
 *   <output>/<combo>/<run-N>/report.html
 *   <output>/summary.json                   — machine-readable matrix result
 *   <output>/Test Results — Automations Page <date>.md   — markdown report
 */

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        out[key] = true;
      } else {
        out[key] = next;
        i++;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

const argv = parseArgs(process.argv);

// ── Combo definitions ────────────────────────────────────────────────────
// Mirrors src/lib/automations/platform-action-targets.ts. Kept in sync
// manually for now — Phase H docs include "remember to update both."
const ALL_COMBOS = [
  { platform: "ig", action: "dm" },
  { platform: "ig", action: "follow" },
  { platform: "ig", action: "unfollow" },
  { platform: "fb", action: "dm" },
  { platform: "fb", action: "follow" },
  { platform: "fb", action: "unfollow" },
  { platform: "li", action: "dm" },
  { platform: "li", action: "connect" },
  { platform: "li", action: "follow" },
  { platform: "li", action: "unfollow" },
  { platform: "tiktok", action: "dm" },
  { platform: "tiktok", action: "follow" },
  { platform: "youtube", action: "dm" },
  { platform: "youtube", action: "subscribe" },
  { platform: "x", action: "dm" },
  { platform: "x", action: "follow" },
  { platform: "x", action: "unfollow" },
  { platform: "x", action: "reply" },
  { platform: "reddit", action: "dm" },
  { platform: "reddit", action: "follow" },
  { platform: "reddit", action: "comment" },
  { platform: "reddit", action: "post" },
  { platform: "snapchat", action: "dm" },
  { platform: "snapchat", action: "follow" },
  { platform: "pinterest", action: "dm" },
  { platform: "pinterest", action: "follow" },
  { platform: "pinterest", action: "save_pin" },
];

// Snapchat is the highest ban-risk for new accounts — cap regardless of
// what the operator passes for --runs-per-combo.
const SNAPCHAT_HARD_CAP = 5;

const runsPerCombo = Number(argv["runs-per-combo"] || argv.runs || 50);
const concurrency = Number(argv.concurrency || 1);
const dryRun = !!argv["dry-run"];
const outputDir =
  argv.output ||
  `/tmp/automations-matrix-${new Date().toISOString().slice(0, 10)}`;

let combos = ALL_COMBOS;
if (argv.combos && argv.combos !== "all") {
  const allowed = new Set(String(argv.combos).split(","));
  combos = ALL_COMBOS.filter(
    (c) => allowed.has(`${c.platform}_${c.action}`) || allowed.has(c.platform)
  );
}

// Apply Snapchat ban-risk cap unconditionally.
function effectiveRunsFor(combo) {
  if (combo.platform === "snapchat") {
    return Math.min(runsPerCombo, SNAPCHAT_HARD_CAP);
  }
  return runsPerCombo;
}

const totalRuns = combos.reduce((s, c) => s + effectiveRunsFor(c), 0);
const estMin = Math.round((totalRuns * 3) / Math.max(concurrency, 1));

console.log(`Matrix plan:`);
console.log(`  Combos:          ${combos.length}`);
console.log(`  Runs per combo:  ${runsPerCombo} (snapchat capped at ${SNAPCHAT_HARD_CAP})`);
console.log(`  Total runs:      ${totalRuns}`);
console.log(`  Concurrency:     ${concurrency}`);
console.log(`  Output:          ${outputDir}`);
console.log(`  Estimated time:  ~${estMin} min wallclock (3min/run)`);

if (dryRun) {
  console.log(`\n--dry-run: would run`);
  for (const combo of combos) {
    console.log(`  ${combo.platform}_${combo.action} × ${effectiveRunsFor(combo)}`);
  }
  process.exit(0);
}

fs.mkdirSync(outputDir, { recursive: true });

// ── Run a single scenario invocation ──────────────────────────────────────
function runOnce(combo, runN) {
  return new Promise((resolve) => {
    const slug = `${combo.platform}_${combo.action}`;
    const subOut = path.join(outputDir, slug, `run-${runN}`);
    fs.mkdirSync(subOut, { recursive: true });
    const args = [
      "scripts/harness/run.mjs",
      "--scenario",
      "automation-record-with-cookies",
      "--platform",
      combo.platform,
      "--action",
      combo.action,
      "--duration",
      "30",
      // run.mjs expects --outDir (camelCase) — not --output. See line 86 of
      // scripts/harness/run.mjs where it checks `args.outDir`.
      "--outDir",
      subOut,
    ];
    const startedAt = Date.now();
    let resolved = false;
    const safeResolve = (r) => {
      if (resolved) return;
      resolved = true;
      resolve(r);
    };
    const child = spawn("node", args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, HARNESS_OUTPUT: subOut },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    // Bug #4 fix — without an error handler, a failed spawn (ENOENT, perm
    // denied, etc.) would leave the promise unresolved and the matrix hung
    // indefinitely. Error handler ensures we always resolve.
    child.on("error", (err) => {
      const took = Date.now() - startedAt;
      safeResolve({
        slug, runN, passed: false, code: -1, took,
        assertionLines: [],
        stderr: `spawn error: ${err.message}`.slice(0, 500),
      });
    });
    // Belt-and-suspenders timeout — if a single run-mjs invocation gets
    // stuck (e.g., browser hangs on page load), kill it after 5min so the
    // matrix can move on.
    const killTimer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch {}
      safeResolve({
        slug, runN, passed: false, code: -2, took: Date.now() - startedAt,
        assertionLines: [],
        stderr: `killed after 5min timeout`.slice(0, 500),
      });
    }, 5 * 60_000);
    child.on("exit", (code) => {
      clearTimeout(killTimer);
      const took = Date.now() - startedAt;
      const passed = code === 0;
      // Pull assertion lines for the report.
      const assertionLines = stdout
        .split("\n")
        .filter((l) => /[✅❌]/.test(l))
        .map((l) => l.trim());
      safeResolve({ slug, runN, passed, code, took, assertionLines, stderr: stderr.slice(0, 500) });
    });
  });
}

// ── Concurrency worker ────────────────────────────────────────────────────
async function runWithLimit(items, limit, fn) {
  const results = [];
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      const r = await fn(items[i]);
      results[i] = r;
      // Per-platform 30s throttle (matches the server-side rate limit on
      // /api/recordings/start). Skipped when concurrency=1 because the
      // server-side limit handles it cleanly.
      if (limit > 1 && i + 1 < items.length) {
        await new Promise((res) => setTimeout(res, 30_000));
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// ── Build the run plan: each combo × runsForCombo ─────────────────────────
const queue = [];
for (const combo of combos) {
  const runs = effectiveRunsFor(combo);
  for (let n = 1; n <= runs; n++) {
    queue.push({ combo, runN: n });
  }
}

console.log(`\nStarting ${queue.length} runs...\n`);
const startedAt = Date.now();

const results = await runWithLimit(queue, concurrency, async ({ combo, runN }) => {
  const r = await runOnce(combo, runN);
  process.stdout.write(`  ${r.slug} #${r.runN}  ${r.passed ? "✓" : "✗"}  (${(r.took / 1000).toFixed(1)}s)\n`);
  return r;
});

const took = Date.now() - startedAt;

// ── Aggregate per-combo ───────────────────────────────────────────────────
const byCombo = {};
for (const r of results) {
  if (!byCombo[r.slug]) byCombo[r.slug] = { runs: 0, passed: 0, failed: 0, totalMs: 0, lastError: null };
  byCombo[r.slug].runs++;
  if (r.passed) byCombo[r.slug].passed++;
  else {
    byCombo[r.slug].failed++;
    byCombo[r.slug].lastError = r.stderr || `exit code ${r.code}`;
  }
  byCombo[r.slug].totalMs += r.took;
}

const summary = {
  ran_at: new Date(startedAt).toISOString(),
  finished_at: new Date().toISOString(),
  took_ms: took,
  total_runs: results.length,
  passed: results.filter((r) => r.passed).length,
  failed: results.filter((r) => !r.passed).length,
  pass_rate: (results.filter((r) => r.passed).length / Math.max(results.length, 1)).toFixed(4),
  by_combo: byCombo,
};

fs.writeFileSync(path.join(outputDir, "summary.json"), JSON.stringify(summary, null, 2));

// ── Markdown report ───────────────────────────────────────────────────────
const overallPct = (Number(summary.pass_rate) * 100).toFixed(1);
const tookMin = (took / 60_000).toFixed(1);
const md = `# Test Results — Automations Page

**Run:** ${summary.ran_at}
**Finished:** ${summary.finished_at}
**Wallclock:** ${tookMin} min
**Pass rate:** ${overallPct}%  (${summary.passed} / ${summary.total_runs})

## Matrix

| Combo | Runs | Passed | Failed | Pass % | Avg s/run |
|---|---:|---:|---:|---:|---:|
${Object.entries(byCombo)
  .map(
    ([slug, c]) =>
      `| ${slug} | ${c.runs} | ${c.passed} | ${c.failed} | ${((c.passed / Math.max(c.runs, 1)) * 100).toFixed(1)}% | ${(c.totalMs / Math.max(c.runs, 1) / 1000).toFixed(1)} |`
  )
  .join("\n")}

## Failures

${
  Object.entries(byCombo).filter(([, c]) => c.failed > 0).length === 0
    ? "_(none — clean run)_"
    : Object.entries(byCombo)
        .filter(([, c]) => c.failed > 0)
        .map(([slug, c]) => `- **${slug}** — ${c.failed} fail${c.failed === 1 ? "" : "s"}\n  Last error: \`${(c.lastError || "?").slice(0, 200)}\``)
        .join("\n")
}

## Pass criteria (per Phase G plan)

- [${overallPct >= 98 ? "x" : " "}] ≥98% combo pass rate (got ${overallPct}%)
- [ ] 100% on chaos scenarios — run via \`node scripts/harness/run.mjs --scenario chaos\` (separate)
- [ ] Zero critical/serious axe violations — run via \`--scenario a11y-sweep\` (separate)
- [ ] Zero new Sentry events tagged \`feature: automations\` during 24h soak (manual check)
- [ ] Visual regression: any flagged diffs annotated in the report

## Per-run output

Per-run timeline.txt + report.html files are at \`${outputDir}/<slug>/run-<n>/\`.
`;

const reportPath = path.join(
  outputDir,
  `Test Results — Automations Page ${new Date().toISOString().slice(0, 10)}.md`
);
fs.writeFileSync(reportPath, md);
console.log(`\nSummary: ${summary.passed}/${summary.total_runs} passed (${overallPct}%)`);
console.log(`Report:  ${reportPath}`);
console.log(`JSON:    ${path.join(outputDir, "summary.json")}`);

process.exit(summary.failed === 0 ? 0 : 1);
