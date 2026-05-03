// Scenario: idle smoke. Sit on a page that historically polled Chrome-driving
// endpoints, assert zero /goto + zero /login-status?refresh=1 in the window.
//
// Extends ban-risk-smoke.mjs into the harness format. Single source of truth
// for the 2026-05-02 regression check.

import { pinLogin } from "../lib/pin-login.mjs";

export const meta = {
  name: "idle-smoke",
  description: "Idle on /automations for N seconds; assert no Chrome navigation.",
  defaultDuration: 90,
};

export const assertions = [
  {
    name: "zero_goto_during_idle",
    check: (events, ctx) => {
      const goto = events.filter((e) =>
        e.t > ctx.settledAtMs &&
        e.kind === "net.request" &&
        /\/goto(\?|$)/.test(e.url)
      ).length;
      return { ok: goto === 0, detail: `idle_goto=${goto}` };
    },
  },
  {
    name: "zero_login_status_refresh_during_idle",
    check: (events, ctx) => {
      const ls = events.filter((e) =>
        e.t > ctx.settledAtMs &&
        e.kind === "net.request" &&
        /\/login-status\?.*\brefresh=1\b/.test(e.url)
      ).length;
      return { ok: ls === 0, detail: `idle_login_status_refresh=${ls}` };
    },
  },
];

export async function run({ page, ev, log, dashboardUrl, pin, opts, scenarioCtx }) {
  const duration = opts.duration || meta.defaultDuration;
  const startPath = opts.path || "/automations";

  log(`→ navigating to ${dashboardUrl}${startPath}`);
  ev("flow.navigate_start", { url: `${dashboardUrl}${startPath}` });
  await page.goto(`${dashboardUrl}${startPath}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(800);
  await pinLogin(page, { pin, ev });

  if (!new RegExp(startPath).test(page.url())) {
    await page.goto(`${dashboardUrl}${startPath}`, { waitUntil: "domcontentloaded" });
  }

  // Settle (3s) so initial-load fetches don't pollute the assertion window.
  await page.waitForTimeout(3000);
  scenarioCtx.settledAtMs = Date.now() - scenarioCtx.t0;
  ev("flow.idle_start", { settledAtMs: scenarioCtx.settledAtMs, durationS: duration });

  const targetEnd = Date.now() + duration * 1000;
  while (Date.now() < targetEnd) {
    await page.waitForTimeout(15000);
  }
  ev("flow.idle_end", {});
  ev("flow.end", {});
}
