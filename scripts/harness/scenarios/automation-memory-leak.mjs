// Phase G-3 — memory leak detection. Opens + closes the recording modal
// N times in a single browser context, snapshotting the V8 heap at the
// start, midway, and end. Asserts that heap growth stays under a
// reasonable budget (<10MB per 50 cycles, scaled linearly).
//
//   node scripts/harness/run.mjs --scenario automation-memory-leak --duration 600 --cycles 50
//
// Pass criteria:
//   - heap.bounded_growth — final heap <= initial heap + budget

import { pinLogin } from "../lib/pin-login.mjs"

export const meta = {
  name: "automation-memory-leak",
  description:
    "Open + close the recording modal N times and verify the V8 heap doesn't balloon (catches React + VncViewer + listener leaks).",
  defaultDuration: 600,
}

export const assertions = [
  {
    name: "heap.bounded_growth",
    check: (events) => {
      const start = events.find((e) => e.kind === "heap.snapshot" && e.payload?.label === "start")
      const end = [...events].reverse().find((e) => e.kind === "heap.snapshot" && e.payload?.label === "end")
      if (!start || !end) {
        return { ok: false, detail: "missing start/end heap snapshots" }
      }
      const growthMb = (end.payload.heap_mb - start.payload.heap_mb)
      const cycles = end.payload.cycles || 1
      // Budget: 10MB / 50 cycles, scaled linearly. Allows for some real
      // growth (caches, etc.) without false-flagging a true leak.
      const budgetMb = (10 * cycles) / 50
      return {
        ok: growthMb <= budgetMb,
        detail: `growth=${growthMb.toFixed(2)}MB over ${cycles} cycles (budget=${budgetMb.toFixed(2)}MB)`,
      }
    },
  },
]

async function snapshotHeap(page) {
  // process.memoryUsage isn't available in Playwright's page context, so
  // we use performance.memory which Chrome-only exposes (sufficient for
  // this harness). Returns MB.
  return await page.evaluate(() => {
    if (typeof performance.memory?.usedJSHeapSize === "number") {
      return performance.memory.usedJSHeapSize / 1024 / 1024
    }
    return 0
  })
}

async function openModal(page) {
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll("button")).find((x) =>
      /^record/i.test((x.textContent || "").trim())
    )
    if (b) b.click()
  }).catch(() => {})
}

async function closeModal(page) {
  await page.keyboard.press("Escape")
  await page.waitForTimeout(150)
  // If the close-confirm dialog appears (because isRecording=true from a
  // prior cycle), Discard it.
  await page.evaluate(() => {
    const discard = Array.from(document.querySelectorAll("button")).find((b) =>
      /^discard$/i.test((b.textContent || "").trim())
    )
    if (discard) discard.click()
  }).catch(() => {})
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
    await page.goto(`${dashboardUrl}/automations`, {
      waitUntil: "domcontentloaded",
    })
  }
  await page.waitForTimeout(1500)

  // Force a GC (Chrome only honors this when launched with --js-flags=--expose-gc;
  // best-effort — if it doesn't work, the snapshots still tell us what we need).
  const initialHeap = await snapshotHeap(page)
  ev("heap.snapshot", { label: "start", heap_mb: initialHeap, cycles: 0 })
  log(`→ heap.start = ${initialHeap.toFixed(2)}MB`)

  for (let i = 1; i <= cycles; i++) {
    await openModal(page)
    await page.waitForTimeout(120)
    await closeModal(page)
    await page.waitForTimeout(120)
    if (i === Math.floor(cycles / 2)) {
      const midHeap = await snapshotHeap(page)
      ev("heap.snapshot", { label: "mid", heap_mb: midHeap, cycles: i })
      log(`→ heap.mid (${i}/${cycles}) = ${midHeap.toFixed(2)}MB (delta ${(midHeap - initialHeap).toFixed(2)})`)
    }
  }

  // Let any pending listeners settle, then snapshot.
  await page.waitForTimeout(2000)
  const finalHeap = await snapshotHeap(page)
  ev("heap.snapshot", { label: "end", heap_mb: finalHeap, cycles })
  log(`→ heap.end = ${finalHeap.toFixed(2)}MB (delta ${(finalHeap - initialHeap).toFixed(2)})`)
  ev("memory.end", { cycles })
}
