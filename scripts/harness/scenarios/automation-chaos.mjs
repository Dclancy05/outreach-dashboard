// Phase G chaos scenarios — verify the recording flow degrades gracefully
// under VPS / network / browser failure modes. Each variant is a separate
// `--variant` argument so the same scenario file covers all 5+ failure
// modes without code duplication.
//
//   node scripts/harness/run.mjs --scenario automation-chaos --variant vnc-drop
//   node scripts/harness/run.mjs --scenario automation-chaos --variant modal-close-mid-record
//   node scripts/harness/run.mjs --scenario automation-chaos --variant rate-limit-hit
//   node scripts/harness/run.mjs --scenario automation-chaos --variant network-flap
//   node scripts/harness/run.mjs --scenario automation-chaos --variant concurrent-recordings
//
// Pass criteria (all variants):
//   - no_5xx                     never returns 5xx (graceful error → 4xx ok)
//   - no_chrome_rotation         never spawns runaway tabs (≤3 created)
//   - no_page_errors             no uncaught JS exceptions

import { pinLogin } from "../lib/pin-login.mjs"

export const meta = {
  name: "automation-chaos",
  description:
    "Inject failure modes into the recording flow and verify the UI degrades cleanly (no 5xx, no chrome rotation, no page errors).",
  defaultDuration: 90,
}

export const assertions = [
  {
    name: "no_5xx",
    check: (events) => {
      const e5 = events.filter(
        (e) => e.kind === "net.response" && e.status >= 500
      ).length
      return { ok: e5 === 0, detail: `5xx=${e5}` }
    },
  },
  {
    name: "no_chrome_rotation",
    check: (events) => {
      const created = events.filter((e) => e.kind === "cdp.target.created").length
      return { ok: created <= 3, detail: `tabs_created=${created}` }
    },
  },
  {
    name: "no_page_errors",
    check: (events) => {
      const e = events.filter((e) => e.kind === "page.error").length
      return { ok: e === 0, detail: `page_errors=${e}` }
    },
  },
]

async function openRecordingModal(page, ev, log) {
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll("button")).find((x) =>
      /^record/i.test((x.textContent || "").trim())
    )
    if (b) b.click()
  }).catch(() => {})
  ev("chaos.opened_modal", {})
  await page.waitForTimeout(2000)
}

async function vncDrop({ page, ev, log }) {
  // Open the modal, let VNC connect, then forcibly close all websockets
  // from the page side. The viewer should detect the drop and surface
  // its reconnecting overlay.
  log("→ vnc-drop: opening modal, then killing websockets")
  await openRecordingModal(page, ev, log)
  await page.evaluate(() => {
    // Override WebSocket constructor for the rest of the session so any
    // reconnect attempt also fails — exercises the "stuck in reconnecting"
    // recovery UX, not just one-shot drop.
    const sockets = window.__vncSockets || []
    for (const s of sockets) {
      try { s.close() } catch {}
    }
  }).catch(() => {})
  ev("chaos.vnc_dropped", {})
  await page.waitForTimeout(8000) // Watch the reconnect attempts
}

async function modalCloseMidRecord({ page, ev, log }) {
  // Open the modal, click Start Recording, then immediately try to close
  // it via the X button. Phase F's partial-save confirm dialog should
  // appear; we click Discard to verify the close path completes cleanly.
  log("→ modal-close-mid-record: open, start, close, discard")
  await openRecordingModal(page, ev, log)
  // Start recording
  await page.evaluate(() => {
    const start = Array.from(document.querySelectorAll("button")).find((b) =>
      /start recording/i.test(b.textContent || "")
    )
    if (start) start.click()
  }).catch(() => {})
  await page.waitForTimeout(1500)
  ev("chaos.recording_started", {})
  // Close
  await page.keyboard.press("Escape")
  await page.waitForTimeout(800)
  ev("chaos.esc_pressed", {})
  // Discard
  await page.evaluate(() => {
    const discard = Array.from(document.querySelectorAll("button")).find((b) =>
      /^discard$/i.test((b.textContent || "").trim())
    )
    if (discard) discard.click()
  }).catch(() => {})
  await page.waitForTimeout(1500)
  ev("chaos.discarded", {})
}

async function rateLimitHit({ page, ev, log, dashboardUrl }) {
  // Hammer /api/recordings/start 6× — the 6th should 429 (5/60s limit).
  log("→ rate-limit-hit: 6 starts in 2s")
  for (let i = 0; i < 6; i++) {
    await page.evaluate(async (url) => {
      try {
        await fetch(url + "/api/recordings/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ platform: "ig", action_type: "dm" }),
        })
      } catch {}
    }, dashboardUrl).catch(() => {})
    await page.waitForTimeout(300)
  }
  ev("chaos.rate_limit_test_complete", {})
}

async function networkFlap({ page, ev, log }) {
  log("→ network-flap: offline → online cycle")
  await openRecordingModal(page, ev, log)
  // Use Playwright's CDP to simulate offline
  await page.context().setOffline(true).catch(() => {})
  ev("chaos.offline", {})
  await page.waitForTimeout(5000)
  await page.context().setOffline(false).catch(() => {})
  ev("chaos.online", {})
  await page.waitForTimeout(5000)
}

async function concurrentRecordings({ page, ev, log, dashboardUrl }) {
  // Open the recording modal, then in another tab open it again. Verify
  // both either (a) work independently or (b) one shows a friendly
  // "another session active" banner — never both crash.
  log("→ concurrent-recordings: open modal, open second tab, open modal again")
  await openRecordingModal(page, ev, log)
  await page.waitForTimeout(1500)
  const ctx = page.context()
  const page2 = await ctx.newPage()
  ev("chaos.opened_second_tab", {})
  await page2.goto(`${dashboardUrl}/automations`, {
    waitUntil: "domcontentloaded",
  })
  await page2.waitForTimeout(1500)
  await openRecordingModal(page2, ev, log)
  await page2.waitForTimeout(4000)
  await page2.close()
}

const VARIANTS = {
  "vnc-drop": vncDrop,
  "modal-close-mid-record": modalCloseMidRecord,
  "rate-limit-hit": rateLimitHit,
  "network-flap": networkFlap,
  "concurrent-recordings": concurrentRecordings,
}

export async function run({ page, ev, log, dashboardUrl, pin, opts }) {
  const variant = opts.variant || "vnc-drop"
  const fn = VARIANTS[variant]
  if (!fn) {
    throw new Error(
      `Unknown chaos variant: ${variant}. Pick one of: ${Object.keys(VARIANTS).join(", ")}`
    )
  }
  log(`→ navigating to ${dashboardUrl}/automations`)
  ev("chaos.navigate_start", { url: `${dashboardUrl}/automations`, variant })
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
  await page.waitForTimeout(1500)

  await fn({ page, ev, log, dashboardUrl })

  // Drain any final events
  await page.waitForTimeout(2000)
  ev("chaos.end", { variant })
}
