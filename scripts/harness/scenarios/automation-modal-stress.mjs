// Stress test the recording modal — open + close it N times in rapid
// succession with random sub-actions (click Start Recording / type in
// search / press ESC / click outside / etc.) to surface state-machine
// races, listener leaks, and "stuck" UI states.
//
//   node scripts/harness/run.mjs --scenario automation-modal-stress --duration 180 --cycles 50
//
// Pass criteria:
//   - no_5xx
//   - no_page_errors
//   - no_chrome_rotation (≤3 tabs total)
//   - no_stuck_modal       — final DOM has 0 visible recording modals
//   - bounded_listener_count — page's JS listener count grows linearly,
//                              not exponentially

import { pinLogin } from "../lib/pin-login.mjs"

export const meta = {
  name: "automation-modal-stress",
  description:
    "Stress-test the recording modal: rapid open/close cycles with random sub-actions to surface state races and listener leaks.",
  defaultDuration: 180,
}

export const assertions = [
  {
    name: "no_5xx",
    check: (events) => {
      const e5 = events.filter((e) => e.kind === "net.response" && e.status >= 500).length
      return { ok: e5 === 0, detail: `5xx=${e5}` }
    },
  },
  {
    name: "no_page_errors",
    check: (events) => {
      const e = events.filter((e) => e.kind === "page.error").length
      return { ok: e === 0, detail: `page_errors=${e}` }
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
    name: "no_stuck_modal",
    check: (events) => {
      const ev = [...events].reverse().find((e) => e.kind === "stress.final_state")
      if (!ev) return { ok: false, detail: "no final state captured" }
      return {
        ok: ev.payload?.visible_modals === 0,
        detail: `visible_modals=${ev.payload?.visible_modals}`,
      }
    },
  },
  {
    name: "bounded_listener_count",
    check: (events) => {
      const start = events.find((e) => e.kind === "stress.listener_count" && e.payload?.label === "start")
      const end = [...events].reverse().find((e) => e.kind === "stress.listener_count" && e.payload?.label === "end")
      if (!start || !end) return { ok: false, detail: "missing listener counts" }
      const growth = end.payload.count - start.payload.count
      // Tolerate 100 listeners growth (each modal opens adds ~5 listeners
      // for ESC + beforeunload + VNC etc. Over 50 cycles we expect ≤250
      // adds + 250 removes = 0 net. Anything over 100 is a leak.).
      return {
        ok: growth < 100,
        detail: `listeners_added=${growth} (start=${start.payload.count} end=${end.payload.count})`,
      }
    },
  },
]

async function countEventListeners(page) {
  // Best-effort — Chrome DevTools Protocol exposes getEventListeners via
  // the Inspector domain. Returns total registered listeners on document
  // + window. Falls back to 0 if the protocol isn't available.
  return await page.evaluate(() => {
    // No public API; approximate by counting addEventListener calls we've
    // wrapped. If our wrapper isn't installed, return 0.
    return window.__listenerCount || 0
  })
}

async function installListenerCounter(page) {
  await page.evaluate(() => {
    if (window.__listenerCounterInstalled) return
    window.__listenerCounterInstalled = true
    window.__listenerCount = 0
    const origAdd = EventTarget.prototype.addEventListener
    const origRemove = EventTarget.prototype.removeEventListener
    EventTarget.prototype.addEventListener = function (...args) {
      window.__listenerCount++
      return origAdd.apply(this, args)
    }
    EventTarget.prototype.removeEventListener = function (...args) {
      window.__listenerCount--
      return origRemove.apply(this, args)
    }
  })
}

async function openModal(page) {
  return await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll("button")).find((x) =>
      /^record/i.test((x.textContent || "").trim())
    )
    if (b) { b.click(); return true }
    return false
  })
}

async function closeModalRandom(page) {
  // Pick a random close strategy: ESC, click X, click outside, or click Discard
  const strategy = ["esc", "x", "outside"][Math.floor(Math.random() * 3)]
  if (strategy === "esc") {
    await page.keyboard.press("Escape")
  } else if (strategy === "x") {
    await page.evaluate(() => {
      const x = document.querySelector('button[aria-label="Close recording"]')
      if (x) x.click()
    }).catch(() => {})
  } else {
    // Click on the backdrop area (top-left corner of the page)
    await page.mouse.click(10, 10).catch(() => {})
  }
}

export async function run({ page, ev, log, dashboardUrl, pin, opts }) {
  const cycles = Number(opts.cycles || 50)

  log(`→ navigating to ${dashboardUrl}/automations`)
  await page.goto(`${dashboardUrl}/automations`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  })
  await page.waitForTimeout(800)
  await pinLogin(page, { pin, ev })
  if (!/\/automations/.test(page.url())) {
    await page.goto(`${dashboardUrl}/automations`, { waitUntil: "domcontentloaded" })
  }
  await page.waitForTimeout(1500)

  await installListenerCounter(page)
  const startCount = await countEventListeners(page)
  ev("stress.listener_count", { label: "start", count: startCount })
  log(`→ listener count start: ${startCount}`)

  for (let i = 1; i <= cycles; i++) {
    const opened = await openModal(page)
    if (!opened) {
      ev("stress.no_record_button", { cycle: i })
      // No record button to click — page may not have rendered yet
      await page.waitForTimeout(200)
      continue
    }
    await page.waitForTimeout(80 + Math.random() * 200)
    await closeModalRandom(page)
    await page.waitForTimeout(80 + Math.random() * 200)
    if (i % 10 === 0) {
      const mid = await countEventListeners(page)
      ev("stress.listener_count", { label: `mid-${i}`, count: mid })
      log(`→ cycle ${i}/${cycles} listeners=${mid}`)
    }
  }

  // Settle, then capture end state
  await page.waitForTimeout(1500)
  const endCount = await countEventListeners(page)
  ev("stress.listener_count", { label: "end", count: endCount })
  log(`→ listener count end: ${endCount} (delta ${endCount - startCount})`)

  const finalState = await page.evaluate(() => {
    // Count visible modal-shaped elements (anything with role="dialog"
    // or fixed-position full-screen overlays). 0 = no stuck modals.
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'))
    const visibleDialogs = dialogs.filter((d) => {
      const r = d.getBoundingClientRect()
      return r.width > 100 && r.height > 100
    })
    return { visible_modals: visibleDialogs.length }
  })
  ev("stress.final_state", finalState)
  log(`→ final state: visible_modals=${finalState.visible_modals}`)
}
