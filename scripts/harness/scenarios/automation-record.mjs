// Scenario: open the automations recording flow, start a recording session,
// confirm Chrome handshake without rotation. Placeholder — Phase 2 wave will
// fill in the full record-and-replay drive.

import { pinLogin } from "../lib/pin-login.mjs";

export const meta = {
  name: "automation-record",
  description: "Open /automations, click Record, observe one clean Chrome handshake.",
  defaultDuration: 60,
};

export const assertions = [
  {
    name: "no_5xx",
    check: (events) => {
      const e5 = events.filter((e) => e.kind === "net.response" && e.status >= 500).length;
      return { ok: e5 === 0, detail: `5xx=${e5}` };
    },
  },
];

export async function run({ page, ev, log, dashboardUrl, pin, opts }) {
  const duration = opts.duration || meta.defaultDuration;

  log(`→ navigating to ${dashboardUrl}/automations`);
  ev("flow.navigate_start", { url: `${dashboardUrl}/automations` });
  await page.goto(`${dashboardUrl}/automations`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(800);
  await pinLogin(page, { pin, ev });

  if (!/\/automations/.test(page.url())) {
    await page.goto(`${dashboardUrl}/automations`, { waitUntil: "domcontentloaded" });
  }

  await page.waitForTimeout(2000);
  // Look for any "Record" or "New Automation" button — best-effort.
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll("button")).find((x) =>
      /record|new automation/i.test(x.textContent || "")
    );
    if (b) b.click();
  }).catch(() => {});
  ev("flow.maybe_clicked_record", {});

  const targetEnd = Date.now() + duration * 1000;
  while (Date.now() < targetEnd) await page.waitForTimeout(10000);
  ev("flow.end", {});
}
