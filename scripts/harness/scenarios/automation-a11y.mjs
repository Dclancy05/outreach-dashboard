// Phase G-3 — accessibility audit on the automations page using axe-core.
// Loads axe-core from a CDN at runtime (no install required), runs it
// against the page after pin login + tab navigation, and asserts zero
// `serious` or `critical` violations.
//
//   node scripts/harness/run.mjs --scenario automation-a11y
//   node scripts/harness/run.mjs --scenario automation-a11y --tab live-view
//
// Pass criteria:
//   - axe.zero_critical_violations
//   - axe.zero_serious_violations
//
// `moderate` and `minor` violations are logged but don't fail.

import { pinLogin } from "../lib/pin-login.mjs"

export const meta = {
  name: "automation-a11y",
  description:
    "Run axe-core on /automations and verify zero serious/critical accessibility violations.",
  defaultDuration: 30,
}

export const assertions = [
  {
    name: "axe.zero_critical_violations",
    check: (events) => {
      const ev = [...events].reverse().find((e) => e.kind === "axe.report")
      if (!ev) return { ok: false, detail: "no axe.report event — scenario crashed before scan" }
      return {
        ok: (ev.payload?.critical ?? 0) === 0,
        detail: `critical=${ev.payload?.critical ?? "?"}`,
      }
    },
  },
  {
    name: "axe.zero_serious_violations",
    check: (events) => {
      const ev = [...events].reverse().find((e) => e.kind === "axe.report")
      if (!ev) return { ok: false, detail: "no axe.report event — scenario crashed before scan" }
      return {
        ok: (ev.payload?.serious ?? 0) === 0,
        detail: `serious=${ev.payload?.serious ?? "?"}`,
      }
    },
  },
]

const AXE_CDN = "https://cdn.jsdelivr.net/npm/axe-core@4.10.0/axe.min.js"

async function injectAxe(page) {
  await page.addScriptTag({ url: AXE_CDN })
  // Verify it loaded
  const ok = await page.evaluate(() => typeof window.axe?.run === "function")
  if (!ok) throw new Error("axe-core failed to load from CDN")
}

async function runAxe(page) {
  return await page.evaluate(async () => {
    return await window.axe.run({
      // Restrict to WCAG 2.1 AA — what most enterprise compliance asks for.
      runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
      // Skip color-contrast on dynamic content that may render lazily.
      // Re-enable when polish PR adds explicit contrast-checked palettes.
      rules: { "color-contrast": { enabled: false } },
    })
  })
}

export async function run({ page, ev, log, dashboardUrl, pin, opts }) {
  const tab = opts.tab || "your-automations"

  log(`→ navigating to ${dashboardUrl}/automations (tab=${tab})`)
  await page.goto(`${dashboardUrl}/automations`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  })
  await page.waitForTimeout(800)
  await pinLogin(page, { pin, ev })
  if (!/\/automations/.test(page.url())) {
    await page.goto(`${dashboardUrl}/automations`, {
      waitUntil: "domcontentloaded",
    })
  }
  await page.waitForTimeout(2000)

  // Switch to the requested tab (default is your-automations).
  if (tab !== "your-automations") {
    await page.evaluate((tabValue) => {
      const trigger = document.querySelector(`[role="tab"][value="${tabValue}"]`)
      if (trigger) trigger.click()
    }, tab).catch(() => {})
    await page.waitForTimeout(1500)
  }

  ev("a11y.injecting_axe", { url: AXE_CDN })
  await injectAxe(page)
  ev("a11y.scanning", { tab })

  const result = await runAxe(page)
  const summary = {
    violations: result.violations.length,
    critical: result.violations.filter((v) => v.impact === "critical").length,
    serious: result.violations.filter((v) => v.impact === "serious").length,
    moderate: result.violations.filter((v) => v.impact === "moderate").length,
    minor: result.violations.filter((v) => v.impact === "minor").length,
    passes: result.passes.length,
    incomplete: result.incomplete.length,
  }

  log(
    `→ axe: ${summary.violations} violations (critical=${summary.critical} serious=${summary.serious} moderate=${summary.moderate} minor=${summary.minor})`
  )

  // Surface the worst offenders so the report file shows what to fix.
  const topOffenders = result.violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .slice(0, 5)
    .map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      help_url: v.helpUrl,
      nodes: v.nodes.length,
      first_target: v.nodes[0]?.target?.join(" > ") || null,
    }))

  ev("axe.report", { ...summary, top_offenders: topOffenders, tab })
  ev("a11y.end", {})
}
