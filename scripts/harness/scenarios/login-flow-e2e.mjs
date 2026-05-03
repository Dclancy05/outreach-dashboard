// Scenario: full Sign In Now → I'm Logged In flow with badge-flip assertion.
//
// Born from 2026-05-03 incident: clicking "I'm Logged In" returned 200 from
// every API call, the recording-service probe reported loggedIn:true, BUT the
// dashboard badge stayed "Expired" because the snapshot route never wrote a
// fresh account_sessions row. A passing harness scenario at the network layer
// missed the actual user-visible regression.
//
// This scenario closes that gap: snapshot the badge text BEFORE the click and
// AFTER the dashboard refetches, fail if the badge didn't flip.

import { pinLogin } from "../lib/pin-login.mjs";

export const meta = {
  name: "login-flow-e2e",
  description: "Full click flow + badge-flip assertion for the chosen platform's account row.",
  defaultDuration: 75,
};

export const assertions = [
  {
    name: "badge_flipped_to_active",
    check: (events) => {
      const before = events.find((e) => e.kind === "flow.badge_before");
      const after = events.find((e) => e.kind === "flow.badge_after");
      if (!before || !after) {
        return { ok: false, detail: `missing badge snapshot (before=${!!before} after=${!!after})` };
      }
      const beforeBadge = (before.text || "").toLowerCase();
      const afterBadge = (after.text || "").toLowerCase();
      // Pass if "expired" or "needs sign-in" cleared. Real passing state is
      // anything that ISN'T those two — could be "active", "warming",
      // "Saved Xm ago", or empty (badge removed entirely).
      const wasBlocking = /expired|needs sign/.test(beforeBadge);
      const stillBlocking = /expired|needs sign/.test(afterBadge);
      const ok = wasBlocking && !stillBlocking;
      return { ok, detail: `before=${JSON.stringify(beforeBadge)} after=${JSON.stringify(afterBadge)}` };
    },
  },
  {
    name: "snapshot_api_returned_200",
    check: (events) => {
      const snap = events.find(
        (e) => e.kind === "net.response" && /\/api\/accounts\/[^/]+\/cookies\/snapshot/.test(e.url)
      );
      const ok = !!snap && snap.status === 200;
      return { ok, detail: snap ? `status=${snap.status}` : "snapshot route never called" };
    },
  },
  {
    name: "no_chrome_rotation",
    check: (events) => {
      const created = events.filter((e) => e.kind === "cdp.target_created").length;
      const navigated = events.filter((e) => e.kind === "cdp.target_navigated").length;
      const ok = navigated <= 3 && created <= 2;
      return { ok, detail: `tabs_created=${created} navigated=${navigated}` };
    },
  },
  {
    name: "no_5xx",
    check: (events) => {
      const errs = events.filter((e) => e.kind === "net.response" && e.status >= 500).length;
      return { ok: errs === 0, detail: `5xx=${errs}` };
    },
  },
];

async function readBadgeForPlatform(page, platform) {
  return page.evaluate((wanted) => {
    // Find the account card whose text contains the platform indicator (svg
    // alt, brand text, or platform-prefixed account_id) AND has a Sign-In-Now
    // button or status badge near it.
    const rows = Array.from(document.querySelectorAll("[class*='border'], [class*='rounded']")).filter((el) => {
      const t = (el.textContent || "").toLowerCase();
      return t.includes(wanted) || t.includes(`@${wanted}`) || t.includes(`${wanted}.com`);
    });
    for (const r of rows) {
      const badge = Array.from(r.querySelectorAll("*")).find((c) => {
        const own = Array.from(c.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(" ");
        return /expired|needs sign|active|warming|saved/i.test(own || "");
      });
      if (badge) {
        const own = Array.from(badge.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(" ");
        return { text: own, html: r.outerHTML.slice(0, 600) };
      }
    }
    return { text: "", html: "" };
  }, platform);
}

export async function run({ page, ev, log, dashboardUrl, pin, opts }) {
  const platform = (opts.platform || "facebook").toLowerCase();

  log(`→ navigating to ${dashboardUrl}/accounts`);
  await page.goto(`${dashboardUrl}/accounts`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(800);

  await pinLogin(page, { pin, ev });

  if (!/\/accounts/.test(page.url())) {
    await page.goto(`${dashboardUrl}/accounts`, { waitUntil: "domcontentloaded" });
  }

  await page.waitForFunction(
    () => Array.from(document.querySelectorAll("button")).some((x) => /sign in now/i.test(x.textContent || "")),
    { timeout: 15000 }
  ).catch(() => log("⚠ Sign In Now button never appeared"));

  // Badge BEFORE
  const before = await readBadgeForPlatform(page, platform);
  log(`→ badge BEFORE: ${JSON.stringify(before.text)}`);
  ev("flow.badge_before", { platform, text: before.text });

  // Click Sign In Now for the chosen platform
  log(`→ click Sign In Now (platform=${platform})`);
  await page.evaluate((wanted) => {
    const btns = Array.from(document.querySelectorAll("button")).filter((x) => /sign in now/i.test(x.textContent || ""));
    let chosen = btns[0];
    for (const b of btns) {
      const row = b.closest("[class*='border'], [class*='rounded']");
      const text = (row?.textContent || "").toLowerCase();
      if (text.includes(wanted)) { chosen = b; break; }
    }
    if (chosen) { chosen.scrollIntoView({ block: "center" }); chosen.click(); }
  }, platform);

  // Wait for modal + give Chrome time to land on the platform
  await page.waitForTimeout(15000);

  // Click I'm Logged In
  log(`→ click I'm Logged In`);
  ev("flow.click_im_logged_in", {});
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll("button")).find((x) => /i.?m logged in/i.test(x.textContent || ""));
    if (b) { b.scrollIntoView({ block: "center" }); b.click(); }
  });

  // Wait for modal to close + dashboard refetch + state to settle
  await page.waitForTimeout(8000);

  // Badge AFTER — try a few times with re-fetch in case SWR is mid-flight
  let after = { text: "", html: "" };
  for (let i = 0; i < 6; i++) {
    after = await readBadgeForPlatform(page, platform);
    if (after.text && !/expired|needs sign/i.test(after.text)) break;
    // Click Refresh button between checks
    await page.evaluate(() => {
      const r = Array.from(document.querySelectorAll("button")).find((x) => /^\s*refresh\s*$/i.test(x.textContent || ""));
      if (r) r.click();
    }).catch(() => {});
    await page.waitForTimeout(2500);
  }
  log(`→ badge AFTER: ${JSON.stringify(after.text)}`);
  ev("flow.badge_after", { platform, text: after.text });

  ev("flow.end", { before: before.text, after: after.text });
}
