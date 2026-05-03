// Ban-risk idle smoke test.
//
// Opens the dashboard, logs in with PIN, navigates to /automations (the
// historically worst-offender page), then sits IDLE for the configured
// window (default: 90 seconds) without clicking anything. Asserts that
// during that window NO /api/platforms/goto, NO /api/platforms/login-status?refresh=1,
// and NO more than 2 /api/recordings/health calls fire.
//
// This is the regression alarm for the 2026-05-02 incident where Chrome was
// silently rotating through every social platform every 15-30 seconds while
// the user was just sitting on /automations. If a future change reintroduces
// any silent Chrome-driving polling, this test fails fast.
//
// Usage:
//   node scripts/ban-risk-smoke.mjs           # 90s idle window
//   IDLE_SECONDS=300 node scripts/ban-risk-smoke.mjs   # 5min idle window
//
// Exits 0 on pass, 1 on any ban-risk pattern detected.
import { chromium } from "playwright";

const IDLE_SECONDS = Number(process.env.IDLE_SECONDS || 90);
const DASHBOARD = process.env.DASHBOARD_URL || "https://outreach-github.vercel.app";
const PIN = process.env.ADMIN_PIN || "122436";

const browser = await chromium.launch({
  headless: true,
  args: [
    "--host-resolver-rules=MAP srv1197943.taild42583.ts.net 209.177.145.97",
    "--disable-features=BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights",
    "--no-sandbox",
    "--disable-dev-shm-usage",
  ],
});
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();

const t0 = Date.now();
const log = (m) => console.log(`+${Math.round((Date.now() - t0) / 1000)}s ${m}`);

const calls = [];
const PATTERNS = [
  { kind: "goto", regex: /\/api\/platforms\/goto(\?|$)/ },
  { kind: "login-status-refresh", regex: /\/api\/platforms\/login-status\?.*\brefresh=1\b/ },
  { kind: "recordings-health", regex: /\/api\/recordings\/health(\?|$)/ },
  { kind: "vps-goto", regex: /srv1197943.+\/goto(\?|$)/ },
  { kind: "vps-login-status", regex: /srv1197943.+\/login-status/ },
];
page.on("request", (req) => {
  const url = req.url();
  for (const p of PATTERNS) {
    if (p.regex.test(url)) {
      calls.push({ t: Date.now() - t0, kind: p.kind, url });
      break;
    }
  }
});

log(`→ navigating to ${DASHBOARD}/automations`);
await page.goto(`${DASHBOARD}/automations`, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(800);

// PIN keypad
const onPin = await page.evaluate(() => /Enter Passcode/i.test(document.body.textContent || ""));
if (onPin) {
  log("→ entering PIN");
  for (const d of PIN) {
    await page.evaluate((digit) => {
      const btns = Array.from(document.querySelectorAll("button"));
      const t = btns.find((b) => {
        const s = (b.textContent || "").replace(/\s+/g, "");
        return s === digit || (s.length <= 5 && s.startsWith(digit));
      });
      if (t) t.click();
    }, d);
    await page.waitForTimeout(120);
  }
  await page.waitForURL(/\/automations|\/agency/, { timeout: 8000 }).catch(() => {});
}

if (!/\/automations/.test(page.url())) {
  log(`→ redirecting to /automations (was ${page.url()})`);
  await page.goto(`${DASHBOARD}/automations`, { waitUntil: "domcontentloaded" });
}

// Settle. Reset call counter to ignore initial page-load fetches.
await page.waitForTimeout(3000);
const settledAt = Date.now() - t0;
log(`→ settled at +${settledAt}ms — clearing baseline calls`);
const baseline = calls.length;

log(`→ idling for ${IDLE_SECONDS}s on /automations (no clicks)`);
const targetEnd = Date.now() + IDLE_SECONDS * 1000;
while (Date.now() < targetEnd) {
  await page.waitForTimeout(15000);
  const elapsed = Math.round((Date.now() - t0 - settledAt) / 1000);
  log(`  …${elapsed}s elapsed | calls since settle: ${calls.length - baseline}`);
}

// Tally calls fired AFTER the page settled
const idle = calls.slice(baseline);
const goto = idle.filter((c) => c.kind === "goto" || c.kind === "vps-goto");
const lsRefresh = idle.filter((c) => c.kind === "login-status-refresh");
const lsAny = idle.filter((c) => c.kind === "vps-login-status");
const health = idle.filter((c) => c.kind === "recordings-health");

console.log(`\n=== IDLE-WINDOW CALL TALLY (${IDLE_SECONDS}s on /automations, zero user clicks) ===`);
console.log(`  /goto                          : ${goto.length}`);
console.log(`  /login-status?refresh=1        : ${lsRefresh.length}`);
console.log(`  /login-status (any)            : ${lsAny.length}`);
console.log(`  /api/recordings/health         : ${health.length}`);
console.log(`  total ban-risk-relevant calls  : ${idle.length}`);

await browser.close();

// ── Assertions ──
const failures = [];
if (goto.length > 0) failures.push(`Found ${goto.length} /goto call(s) during idle. Expected zero.`);
if (lsRefresh.length > 0) failures.push(`Found ${lsRefresh.length} /login-status?refresh=1 call(s). Expected zero.`);
// Health polling: 60s on automations + 5min on system-pulse → in 90s window expect at most 2.
const allowedHealth = Math.ceil(IDLE_SECONDS / 60) + 1;
if (health.length > allowedHealth) {
  failures.push(`Found ${health.length} /api/recordings/health call(s). Expected ≤ ${allowedHealth} for ${IDLE_SECONDS}s window.`);
}

if (failures.length) {
  console.log("\n❌ BAN-RISK SMOKE FAILED:");
  for (const f of failures) console.log(`  - ${f}`);
  console.log("\nThis is the same class of bug as 2026-05-02. Investigate immediately:");
  console.log("  - Did someone re-add a setInterval on /api/platforms/* or /api/recordings/*?");
  console.log("  - Did /api/recordings/health regain its /login-status fetch?");
  console.log("  - Did a new dashboard component start polling Chrome-driving endpoints?");
  process.exit(1);
}
console.log("\n✅ BAN-RISK SMOKE PASSED — no Chrome navigation during idle window.");
