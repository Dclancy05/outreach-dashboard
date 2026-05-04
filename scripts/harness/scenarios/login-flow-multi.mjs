// Flagship scenario: walks every Sign-In-Now badge in DOM order and verifies
// THREE things per click:
//   1. UI: badge text moves from "Expired"/"Needs Sign-In" to a passing state
//   2. DB: account_sessions has a fresh row (last_verified_at within 120s, cookies != [])
//   3. CDP: no Chrome rotation (tabs_created stays bounded across the whole run)
//
// This is the scenario that catches the 2026-05-03 regression where every API
// call returned 200 but the badge never flipped. If any one of those three
// layers fails, the assertion fails — even when the others are green.

import { pinLogin } from "../lib/pin-login.mjs";
import {
  listAccountRows,
  readBadge,
  clickSignInNow,
  clickImLoggedIn,
  waitForBadge,
  countBlockingRows,
} from "../lib/ui.mjs";

export const meta = {
  name: "login-flow-multi",
  description: "Click Sign In Now → I'm Logged In for every blocking row, assert UI + DB + CDP.",
  defaultDuration: 240, // 4 platforms × ~50s each
};

export const assertions = [
  {
    name: "every_badge_flipped",
    check: (events, ctx) => {
      const finalCount = ctx.finalBlockingCount ?? null;
      const initialCount = ctx.initialBlockingCount ?? null;
      if (finalCount === null) return { ok: false, detail: "scenario didn't record final count" };
      const ok = finalCount === 0;
      return { ok, detail: `initial=${initialCount} final=${finalCount}` };
    },
  },
  {
    name: "every_account_has_fresh_session",
    check: (events, ctx) => {
      const dbList = ctx.dbAssertions || [];
      const total = dbList.length;
      const passed = dbList.filter((a) => a.ok).length;
      const ok = total > 0 && passed === total;
      const failed = dbList.filter((a) => !a.ok).map((a) => `${a.account_id}:${a.detail}`);
      return { ok, detail: `${passed}/${total} fresh${failed.length ? " · failed=" + failed.join("; ") : ""}` };
    },
  },
  {
    // Note: this scenario opens a fresh noVNC iframe per platform click, which
    // shows up as multiple CDP targets in the harness Chromium. We only fail
    // here on truly egregious rotation; popup-login is the strict bound.
    name: "rotation_within_envelope",
    check: (events, ctx) => {
      const created = events.filter((e) => e.kind === "cdp.target_created").length;
      const navigated = events.filter((e) => e.kind === "cdp.target_navigated").length;
      const N = Math.max(1, ctx.initialBlockingCount || 1);
      // Allow up to 12 targets per platform clicked. Above that = uncontrolled.
      const ok = created <= N * 12 && navigated <= N * 6;
      return { ok, detail: `tabs_created=${created} navigated=${navigated} platforms_clicked=${N}` };
    },
  },
  {
    name: "snapshot_api_returned_200",
    check: (events, ctx) => {
      const snaps = events.filter(
        (e) => e.kind === "net.response" && /\/api\/accounts\/[^/]+\/cookies\/snapshot/.test(e.url)
      );
      const total = snaps.length;
      const okSnaps = snaps.filter((s) => s.status === 200).length;
      const ok = total > 0 && okSnaps === total;
      return { ok, detail: `${okSnaps}/${total} returned 200` };
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

export async function run({ page, ev, log, dashboardUrl, pin, scenarioCtx }) {
  log(`→ navigating to ${dashboardUrl}/accounts`);
  await page.goto(`${dashboardUrl}/accounts`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(800);
  await pinLogin(page, { pin, ev });
  if (!/\/accounts/.test(page.url())) {
    await page.goto(`${dashboardUrl}/accounts`, { waitUntil: "domcontentloaded" });
  }
  await page.waitForTimeout(2000);

  // Initial state
  const initialRows = await listAccountRows(page);
  const blockingInitial = initialRows.filter((r) => r.status === "blocking" && r.hasSignInButton);
  scenarioCtx.initialBlockingCount = blockingInitial.length;
  log(`→ ${blockingInitial.length} blocking rows: ${blockingInitial.map((r) => `${r.platform}@${r.username}`).join(", ")}`);

  ev("snapshot.label", { id: "00-overview", label: "before" });
  await page.waitForTimeout(800); // let the labeled snapshot land

  // Walk each blocking row
  let i = 0;
  for (const row of blockingInitial) {
    i++;
    const platform = row.platform;
    const username = row.username;
    const labelId = `p${String(i).padStart(2, "0")}-${platform}-${username || "anon"}`;
    log(`\n=== [${i}/${blockingInitial.length}] ${platform}@${username || "?"} ===`);

    ev("snapshot.label", { id: labelId, label: "before" });
    await page.waitForTimeout(800);

    log(`→ click Sign In Now`);
    const clicked = await clickSignInNow(page, { platform, username });
    if (!clicked) {
      log(`⚠ no Sign-In-Now button found, skipping`);
      continue;
    }
    // Wait for modal mount + Chrome to finish navigating
    await page.waitForTimeout(15000);

    log(`→ click I'm Logged In`);
    const loggedClicked = await clickImLoggedIn(page);
    if (!loggedClicked) {
      log(`⚠ no I'm Logged In button found in modal, skipping`);
      continue;
    }

    // Wait for the badge to flip to a passing state
    log(`→ waiting for badge to flip (timeout 30s)`);
    const result = await waitForBadge(
      page,
      { platform, username },
      (b) => b.status === "passing" || (b.statusText && !/expired|needs sign/i.test(b.statusText)),
      { timeout: 30000, interval: 3000 }
    );
    log(`→ badge flip: ok=${result.ok} text=${JSON.stringify(result.badge?.statusText || "")}`);

    ev("snapshot.label", { id: labelId, label: "after" });
    await page.waitForTimeout(800);

    // DB assertion — does account_sessions have a fresh row?
    if (scenarioCtx.db?.assertFreshSession) {
      // We don't have account_id directly from the row text; query by username + platform
      const acct = await scenarioCtx.db.supabase
        ? (await scenarioCtx.db.supabase
            .from("accounts")
            .select("account_id")
            .eq("platform", platform)
            .ilike("username", username || "")
            .maybeSingle()).data
        : null;
      if (acct?.account_id) {
        const dbResult = await scenarioCtx.db.assertFreshSession(acct.account_id, 180);
        log(`→ DB assert: ${dbResult.ok ? "✅" : "❌"} ${dbResult.detail}`);
        scenarioCtx.dbAssertions.push({
          platform,
          username,
          account_id: acct.account_id,
          ok: dbResult.ok,
          detail: dbResult.detail,
        });
      } else {
        log(`⚠ couldn't resolve account_id for ${platform}@${username}`);
        scenarioCtx.dbAssertions.push({
          platform, username, account_id: null,
          ok: false, detail: "account_id not found",
        });
      }
    }

    // Pause between platforms so Chrome cookies can flush
    await page.waitForTimeout(2000);
  }

  // Final overview
  await page.waitForTimeout(2000);
  scenarioCtx.finalBlockingCount = await countBlockingRows(page);
  log(`\n=== FINAL: ${scenarioCtx.finalBlockingCount} blocking rows remain ===`);
  ev("snapshot.label", { id: "zz-overview", label: "after" });
  await page.waitForTimeout(1500);

  ev("flow.end", {});
}
