// Scenario: load /jarvis/observability, leave VNC viewer mounted for N seconds.
// Used in Phase 1.2 + 1.3 to verify reconnect v2, lag telemetry, and freeze
// detection all work end-to-end.

import { pinLogin } from "../lib/pin-login.mjs";

export const meta = {
  name: "observability-vnc",
  description: "Mount VNC viewer and idle; measure FPS, latency, freeze windows.",
  defaultDuration: 120,
};

export const assertions = [
  {
    name: "vnc_connected",
    check: (events) => {
      const opens = events.filter((e) => e.kind === "ws.open" && /websockify/.test(e.url)).length;
      return { ok: opens >= 1, detail: `ws_opens=${opens}` };
    },
  },
  {
    name: "no_exports_error",
    check: (events) => {
      const hits = events.filter((e) =>
        (e.kind === "page.error" && /exports is not defined/.test(e.message || "")) ||
        (e.kind === "console" && /exports is not defined/.test(e.text || ""))
      ).length;
      return { ok: hits === 0, detail: `exports_errors=${hits}` };
    },
  },
  {
    name: "lag_within_budget",
    check: (events) => {
      const lag = events.find((e) => e.kind === "lag.report");
      if (!lag) return { ok: false, detail: "no_lag_report" };
      // Budget: p50 ≤ 50ms (20 FPS), p95 ≤ 100ms.
      // Tighter targets in Phase 1.2+; this is the gate, not the goal.
      const ok = lag.median_frame_interval_ms <= 50 && lag.p95_frame_interval_ms <= 100;
      return { ok, detail: `p50=${lag.median_frame_interval_ms} p95=${lag.p95_frame_interval_ms}` };
    },
  },
];

export async function run({ page, ev, log, dashboardUrl, pin, opts }) {
  const duration = opts.duration || meta.defaultDuration;

  log(`→ navigating to ${dashboardUrl}/jarvis/observability`);
  ev("flow.navigate_start", { url: `${dashboardUrl}/jarvis/observability` });
  await page.goto(`${dashboardUrl}/jarvis/observability`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(800);
  await pinLogin(page, { pin, ev });

  if (!/observability/.test(page.url())) {
    await page.goto(`${dashboardUrl}/jarvis/observability`, { waitUntil: "domcontentloaded" });
  }

  // Wait for VNC viewer to mount + connect.
  await page.waitForTimeout(3000);
  ev("flow.vnc_mounted", {});

  // Try clicking a "Connect" button if one exists (page may auto-connect).
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll("button")).find((x) => /^\s*connect\s*$/i.test(x.textContent || ""));
    if (b) b.click();
  }).catch(() => {});

  const targetEnd = Date.now() + duration * 1000;
  while (Date.now() < targetEnd) {
    await page.waitForTimeout(15000);
  }

  ev("flow.end", {});
}
