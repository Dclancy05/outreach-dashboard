// Scenario: Sign-In-Now popup login flow.
//
// Reproduces the 2026-05-02 incident scenario that caught Chrome rotating
// through Instagram → Facebook → LinkedIn → TikTok. The harness wraps
// this with all instruments so we get the full timeline.

import { pinLogin } from "../lib/pin-login.mjs";

export const meta = {
  name: "popup-login",
  description: "Open Sign In Now → wait → click I'm Logged In. Asserts no Chrome rotation.",
  defaultDuration: 80,
};

export const assertions = [
  // 0 = no auto-rotation through platforms after I'm Logged In click
  {
    name: "no_chrome_rotation",
    check: (events) => {
      const created = events.filter((e) => e.kind === "cdp.target_created").length;
      const navigated = events.filter((e) => e.kind === "cdp.target_navigated").length;
      // After modal opens, expect at most 1 target_created (the Chrome page for the chosen platform)
      // and minimal navigations. >3 navigations = platform rotation.
      const ok = navigated <= 3 && created <= 2;
      return { ok, detail: `tabs_created=${created} navigated=${navigated}` };
    },
  },
  {
    name: "no_unbounded_goto",
    check: (events) => {
      const goto = events.filter((e) => e.kind === "net.request" && /\/goto(\?|$)/.test(e.url)).length;
      const ok = goto <= 2; // 1 from explicit click is normal; >2 is rotation
      return { ok, detail: `goto_calls=${goto}` };
    },
  },
  {
    name: "no_5xx",
    check: (events) => {
      const errs = events.filter((e) => e.kind === "net.response" && e.status >= 500).length;
      return { ok: errs === 0, detail: `5xx=${errs}` };
    },
  },
  {
    name: "no_page_errors",
    check: (events) => {
      const errs = events.filter((e) => e.kind === "page.error").length;
      return { ok: errs === 0, detail: `page_errors=${errs}` };
    },
  },
];

export async function run({ page, ev, log, dashboardUrl, pin, opts }) {
  const platform = (opts.platform || "facebook").toLowerCase();
  const duration = opts.duration || meta.defaultDuration;

  log(`→ navigating to ${dashboardUrl}/accounts`);
  ev("flow.navigate_start", { url: `${dashboardUrl}/accounts` });
  await page.goto(`${dashboardUrl}/accounts`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(800);

  await pinLogin(page, { pin, ev });

  if (!/\/accounts/.test(page.url())) {
    log(`→ go /accounts (was ${page.url()})`);
    await page.goto(`${dashboardUrl}/accounts`, { waitUntil: "domcontentloaded" });
  }

  await page.waitForFunction(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    return btns.some((x) => /sign in now/i.test(x.textContent || ""));
  }, { timeout: 15000 }).catch(() => log("⚠ Sign In Now button never appeared"));

  log(`→ click Sign In Now (filter platform=${platform})`);
  ev("flow.click_sign_in", { platform });
  const clickResult = await page.evaluate((wantPlatform) => {
    const btns = Array.from(document.querySelectorAll("button")).filter((x) => /sign in now/i.test(x.textContent || ""));
    let chosen = btns[0];
    for (const b of btns) {
      const row = b.closest("[data-account-id], li, tr, div");
      const text = (row?.textContent || "").toLowerCase();
      if (text.includes(wantPlatform)) { chosen = b; break; }
    }
    if (!chosen) return { ok: false };
    chosen.scrollIntoView({ block: "center" });
    chosen.click();
    return { ok: true, btnText: chosen.textContent?.trim() };
  }, platform);
  ev("flow.click_result", clickResult);

  // First half: passive observation while modal mounts + Chrome navigates.
  log(`→ recording ${Math.round(duration / 2)}s before clicking I'm Logged In`);
  const halfEnd = Date.now() + (duration / 2) * 1000;
  while (Date.now() < halfEnd) await page.waitForTimeout(5000);

  // The user-reported rotation trigger
  ev("flow.click_im_logged_in_start", {});
  log("→ click 'I'm Logged In' — historical rotation trigger");
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll("button")).find((x) => /i.?m logged in/i.test(x.textContent || ""));
    if (b) { b.scrollIntoView({ block: "center" }); b.click(); }
  });
  ev("flow.click_im_logged_in_done", {});

  // Second half: tail observation
  const tailEnd = Date.now() + (duration / 2) * 1000;
  while (Date.now() < tailEnd) await page.waitForTimeout(5000);

  ev("flow.end", {});
}
