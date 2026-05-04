#!/usr/bin/env node
// Harness entrypoint — orchestrates a scenario with all instruments.
//
// Usage:
//   node scripts/harness/run.mjs --scenario popup-login [--duration 80] [--platform facebook]
//   node scripts/harness/run.mjs --scenario idle-smoke --duration 90 --path /automations
//   node scripts/harness/run.mjs --scenario observability-vnc --duration 120
//
// Output (default /tmp/harness/<scenario>-<timestamp>/):
//   timeline.txt           - merged human-readable
//   claude-readable.json   - structured for AI ingestion
//   report.html            - clickable timeline w/ filters
//   screenshots/*.png      - one per 500ms
//   lag-report.json        - frame stats (if scenario had a lag.report event)
//
// Exit code:
//   0  - all assertions passed
//   1  - one or more assertions failed
//   2  - scenario crashed

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createTimeline } from "./lib/timeline.mjs";
import { launchChromium } from "./lib/chromium-launch.mjs";
import { cdpTargetEvents } from "./instruments/cdp-target-events.mjs";
import { networkMonitor } from "./instruments/network-monitor.mjs";
import { consoleCapture } from "./instruments/console-capture.mjs";
import { screenshotStream } from "./instruments/screenshot-stream.mjs";
import { frameRateAnalyzer } from "./instruments/frame-rate-analyzer.mjs";
import { visualDiff } from "./instruments/visual-diff.mjs";
import { auditLogScraper } from "./instruments/audit-log-scraper.mjs";
import { writeMergedTimeline } from "./reporters/merged-timeline.mjs";
import { writeClaudeReadable } from "./reporters/claude-readable-json.mjs";
import { writeHtmlReport } from "./reporters/html-report.mjs";
import { writeVisualDiffReport } from "./reporters/visual-diff-report.mjs";
import { maybeShare } from "./lib/share-report.mjs";
import * as db from "./lib/db.mjs";

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) { out[key] = true; }
      else { out[key] = next; i++; }
    } else {
      out._.push(a);
    }
  }
  return out;
}

const args = parseArgs(process.argv);
const scenarioName = args.scenario || args._[0];
if (!scenarioName) {
  console.error("Usage: node scripts/harness/run.mjs --scenario <name> [--duration N] [--platform X]");
  console.error("Scenarios: popup-login, idle-smoke, observability-vnc, automation-record, login-flow-e2e");
  console.error("Pass --no-video to skip the .webm recording (saves ~30 MB per run).");
  process.exit(2);
}

const dashboardUrl = process.env.DASHBOARD_URL || "https://outreach-github.vercel.app";
const pin = process.env.ADMIN_PIN || "122436";
const cdpUrl = process.env.VPS_CDP_URL || "http://localhost:18800";

// Load scenario module
let scenarioMod;
try {
  const p = path.join(import.meta.dirname || path.dirname(new URL(import.meta.url).pathname), `scenarios/${scenarioName}.mjs`);
  scenarioMod = await import(pathToFileURL(p).href);
} catch (e) {
  console.error(`Failed to load scenario "${scenarioName}":`, e.message);
  process.exit(2);
}

const duration = Number(args.duration || scenarioMod.meta?.defaultDuration || 60);
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = args.outDir || `/tmp/harness/${scenarioName}-${stamp}`;
fs.mkdirSync(outDir, { recursive: true });

console.log(`Harness — scenario=${scenarioName} duration=${duration}s out=${outDir}`);

const timeline = createTimeline();
const { ev, log, sec, t0 } = timeline;

const videoDir = path.join(outDir, "video");
fs.mkdirSync(videoDir, { recursive: true });
const { browser, ctx, page } = await launchChromium({
  recordVideo: args["no-video"] ? null : { dir: videoDir },
});

// Wire instruments
const instruments = [
  cdpTargetEvents({ ev, cdpUrl }),
  networkMonitor({ ev, page }),
  consoleCapture({ ev, page }),
  screenshotStream({ ev, page, outDir, intervalMs: 500, timeline }),
  frameRateAnalyzer({ ev, page, ctx }),
];
const audit = auditLogScraper({ ev, dashboardUrl });
const visual = visualDiff({ ev, outDir });

for (const inst of instruments) {
  if (inst.start) await inst.start();
}

const scenarioCtx = { t0, settledAtMs: 0, db, dbAssertions: [] };
let crashed = null;
try {
  await scenarioMod.run({
    page, ev, log, dashboardUrl, pin,
    opts: args,
    scenarioCtx,
  });
} catch (e) {
  crashed = e;
  ev("scenario.crash", { message: e.message, stack: (e.stack || "").slice(0, 1000) });
  console.error("Scenario crashed:", e.message);
}

// Stop instruments. Frame-rate-analyzer.stop returns the lag report.
for (const inst of instruments) {
  if (inst.stop) {
    try { await inst.stop(); } catch (e) { console.error("instrument stop error:", e.message); }
  }
}

// Run async post-processors
await visual.analyze().catch(() => {});
await audit.scrape({ minutes: Math.max(2, Math.ceil(duration / 60) + 1) }).catch(() => {});

// Resolve video file path BEFORE closing context — Playwright finalizes the
// .webm only after the page that owns it closes. We close the page first,
// grab the path, then close the browser.
let videoPath = null;
try {
  videoPath = await page.video()?.path();
} catch {}
await page.close().catch(() => {});
await ctx.close().catch(() => {});
await browser.close().catch(() => {});

// Write reports
const events = timeline.snapshot();
let gitSha = null;
try {
  gitSha = (await import("node:child_process")).execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
} catch {}
const meta = { scenario: scenarioName, duration_s: duration, t0, gitSha };

// Run assertions (so the HTML report can include pass/fail badges)
const assertions = scenarioMod.assertions || [];
const results = assertions.map((a) => ({ name: a.name, ...a.check(events, scenarioCtx) }));
const allOk = !crashed && results.every((r) => r.ok);

const txtFile = writeMergedTimeline(events, outDir);
const { file: jsonFile, summary } = writeClaudeReadable(events, outDir, meta);
// Read labeled snapshots from screenshot-stream instrument (4th instrument)
const labeledSnapshots = (instruments[3]?.labels?.()) || [];
const visualDiffReport = writeVisualDiffReport(labeledSnapshots, outDir, meta);
const htmlFile = writeHtmlReport(events, outDir, {
  ...meta,
  summary: summary.summary,
  visualDiff: visualDiffReport,
  dbAssertions: scenarioCtx.dbAssertions,
  assertions: results,
});

// Write lag-report.json separately (Phase 5.1 needs to compare across runs)
const lag = events.find((e) => e.kind === "lag.report");
if (lag) {
  fs.writeFileSync(path.join(outDir, "lag-report.json"), JSON.stringify(lag, null, 2));
}

console.log(`\n═══ HARNESS SUMMARY ═══`);
console.log(`Scenario: ${scenarioName}`);
console.log(`Duration: ${duration}s`);
console.log(`Events:   ${events.length}`);
console.log(`Tabs:     created=${summary.summary.tabs_created} destroyed=${summary.summary.tabs_destroyed}`);
console.log(`Network:  goto=${summary.summary.goto_calls} login-status=${summary.summary.login_status_calls} 5xx=${summary.summary.responses_5xx} 429=${summary.summary.responses_429}`);
console.log(`Errors:   page=${summary.summary.errors}`);
if (lag) console.log(`Lag:      p50=${lag.median_frame_interval_ms}ms p95=${lag.p95_frame_interval_ms}ms jank=${lag.jank_count} freezes=${lag.freeze_windows}`);
console.log(`\n═══ ASSERTIONS ═══`);
for (const r of results) {
  console.log(`  ${r.ok ? "✅" : "❌"} ${r.name.padEnd(32)} ${r.detail}`);
}
if (crashed) {
  console.log(`\n💥 SCENARIO CRASHED: ${crashed.message}`);
}
console.log(`\nOutput:`);
console.log(`  ${txtFile}`);
console.log(`  ${jsonFile}`);
console.log(`  ${htmlFile}`);
if (videoPath && fs.existsSync(videoPath)) {
  console.log(`  ${videoPath}  (video — open in any browser)`);
}
console.log(`  ${visualDiffReport.file}  (visual diff: ${visualDiffReport.completePairs}/${visualDiffReport.totalPairs} pairs)`);
if (scenarioCtx.dbAssertions.length) {
  const okCount = scenarioCtx.dbAssertions.filter((a) => a.ok).length;
  console.log(`  DB asserts: ${okCount}/${scenarioCtx.dbAssertions.length} ok`);
}
await maybeShare(outDir, scenarioName);

process.exit(crashed ? 2 : (allOk ? 0 : 1));
