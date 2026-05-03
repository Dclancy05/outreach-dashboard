// End-to-end Sign In Now popup test with PNA disabled and MagicDNS overridden
// so this VPS-based Playwright actually behaves like a real user's browser.
import { chromium } from "playwright";
import fs from "node:fs";

const SHOTS = "/tmp/popup-shots";
fs.mkdirSync(SHOTS, { recursive: true });
const ts = () => new Date().toISOString().replace(/[:.]/g, "-");

const browser = await chromium.launch({
  headless: true,
  args: [
    // Map the Tailscale hostname to its public Funnel IP, so Chrome doesn't
    // hit MagicDNS and its 100.x.x.x address (which PNA would block).
    "--host-resolver-rules=MAP srv1197943.taild42583.ts.net 209.177.145.97",
    // Belt-and-suspenders: explicitly disable PNA enforcement for this run.
    "--disable-features=BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights",
    "--no-sandbox",
    "--disable-dev-shm-usage",
  ],
});
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });

// Stash diagnostic events into window.__diag so we can pull them out later
// via page.evaluate() — production bundles strip console.log so capturing
// console events doesn't always work.
await ctx.addInitScript(() => {
  window.__diag = [];
  const tStart = performance.now();
  const stamp = () => Math.round(performance.now() - tStart);
  const realClose = WebSocket.prototype.close;
  WebSocket.prototype.close = function(...args) {
    try {
      window.__diag.push({ t: stamp(), event: "ws.close", url: this.url, readyState: this.readyState, args, stack: (new Error().stack || "").slice(0, 1500) });
    } catch (e) {}
    return realClose.apply(this, args);
  };
  // Hook close event on each new WebSocket too
  const RealWS = window.WebSocket;
  window.WebSocket = function (...wsArgs) {
    const ws = new RealWS(...wsArgs);
    window.__diag.push({ t: stamp(), event: "ws.new", url: wsArgs[0] });
    ws.addEventListener("open", () => window.__diag.push({ t: stamp(), event: "ws.open", url: ws.url }));
    ws.addEventListener("close", (ev) => window.__diag.push({ t: stamp(), event: "ws.closeEvent", url: ws.url, code: ev.code, reason: ev.reason, wasClean: ev.wasClean }));
    ws.addEventListener("error", () => window.__diag.push({ t: stamp(), event: "ws.error", url: ws.url }));
    return ws;
  };
  // Carry over static props (readyState constants etc)
  Object.setPrototypeOf(window.WebSocket, RealWS);
  Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
  // Track unhandled errors
  window.addEventListener("error", (e) => window.__diag.push({ t: stamp(), event: "window.error", msg: e.message, src: `${e.filename}:${e.lineno}` }));
  window.addEventListener("unhandledrejection", (e) => window.__diag.push({ t: stamp(), event: "unhandledrejection", reason: String(e.reason) }));
});

const page = await ctx.newPage();

// Capture every console message for the report.
const consoleMsgs = [];
page.on("console", (m) => consoleMsgs.push({ t: Date.now() - t0, type: m.type(), text: m.text() }));
page.on("pageerror", (e) => consoleMsgs.push({ t: Date.now() - t0, type: "pageerror", text: e.message }));
const wsEvents = [];
page.on("websocket", (ws) => {
  const url = ws.url();
  const tOpen = Date.now() - t0;
  wsEvents.push({ t: tOpen, event: "open", url });
  let frames = 0, bytes = 0;
  ws.on("framereceived", (f) => { frames++; bytes += (f.payload?.length ?? 0); });
  ws.on("framesent", () => {});
  ws.on("close", () => wsEvents.push({ t: Date.now() - t0, event: "close", url, framesReceived: frames, bytesReceived: bytes }));
  ws.on("socketerror", (e) => wsEvents.push({ t: Date.now() - t0, event: "error", err: String(e) }));
});

// Ban-risk monitor: every Chrome-driving request the page fires gets logged
// with timestamp + body + response status. Used by the assertions at the
// bottom of this script to guarantee we never silently rotate Chrome.
//
// What we watch:
//   POST /api/platforms/goto             — direct Chrome navigation
//   GET  /api/platforms/login-status?refresh=1 — cache-buster that re-navs
//   GET  /api/recordings/health          — must NOT rotate Chrome anymore
//   GET  /api/platforms/cookies-dump?... — cookie reads (no nav, but counts toward platform-touch budget)
const banRiskCalls = [];
const BAN_RISK_PATTERNS = [
  { kind: "goto", regex: /\/api\/platforms\/goto(\?|$)/ },
  { kind: "login-status-refresh", regex: /\/api\/platforms\/login-status\?.*\brefresh=1\b/ },
  { kind: "recordings-health", regex: /\/api\/recordings\/health(\?|$)/ },
  { kind: "cookies-dump", regex: /\/api\/platforms\/cookies-dump\?/ },
];
page.on("request", async (req) => {
  const url = req.url();
  for (const p of BAN_RISK_PATTERNS) {
    if (p.regex.test(url)) {
      let body = null;
      try { body = req.postDataJSON ? req.postDataJSON() : null; } catch {}
      banRiskCalls.push({ t: Date.now() - t0, kind: p.kind, method: req.method(), url, body, status: null });
      break;
    }
  }
});
page.on("response", async (res) => {
  const url = res.url();
  for (const p of BAN_RISK_PATTERNS) {
    if (p.regex.test(url)) {
      // Match the most recent open call without a status
      for (let i = banRiskCalls.length - 1; i >= 0; i--) {
        if (banRiskCalls[i].url === url && banRiskCalls[i].status == null) {
          banRiskCalls[i].status = res.status();
          break;
        }
      }
      break;
    }
  }
});

const log = (m) => console.log(`+${Date.now() - t0}ms ${m}`);
const t0 = Date.now();

log("→ navigating to /accounts");
await page.goto("https://outreach-github.vercel.app/accounts", { waitUntil: "domcontentloaded", timeout: 30000 });

// PIN auth — dashboard renders a custom button-based keypad with "Enter Passcode".
await page.waitForTimeout(500);
const onPin = await page.evaluate(() => /Enter Passcode/i.test(document.body.textContent || ""));
log(`current URL: ${page.url()} — onPin=${onPin}`);
if (onPin) {
  log("→ tapping PIN digits 1-2-2-4-3-6 on the keypad");
  for (const d of "122436") {
    await page.evaluate((digit) => {
      const btns = Array.from(document.querySelectorAll("button"));
      const target = btns.find((b) => {
        const stripped = (b.textContent || "").replace(/\s+/g, "");
        // PIN buttons render as just the digit, possibly with letter labels (e.g. "2ABC")
        return stripped === digit || (stripped.length <= 5 && stripped.startsWith(digit));
      });
      if (target) target.click();
    }, d);
    await page.waitForTimeout(120);
  }
  await page.waitForURL(/outreach-github\.vercel\.app\/(accounts|agency|$)/, { timeout: 8000 }).catch(() => {});
}

// Force-navigate to /accounts after auth completes
if (!/\/accounts/.test(page.url())) {
  log(`→ navigate /accounts (was ${page.url()})`);
  await page.goto("https://outreach-github.vercel.app/accounts", { waitUntil: "domcontentloaded" });
}

await page.waitForTimeout(1500);
// Wait until at least one Sign In Now button is rendered (accounts list loaded)
await page.waitForFunction(() => {
  return Array.from(document.querySelectorAll("button")).some((x) => /sign in now/i.test(x.textContent || ""));
}, { timeout: 15000 }).catch(() => log("⚠ Sign In Now button never appeared within 15s"));
await page.screenshot({ path: `${SHOTS}/01-accounts-page.png`, fullPage: false });
log(`📸 01-accounts-page.png`);

// Click Sign In Now
log("→ clicking Sign In Now");
const clicked = await page.evaluate(() => {
  const b = Array.from(document.querySelectorAll("button")).find((x) => /sign in now/i.test(x.textContent || ""));
  if (!b) return false;
  b.scrollIntoView({ block: "center" });
  b.click();
  return true;
});
log(`click result: ${clicked}`);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${SHOTS}/02-modal-just-opened.png` });
log(`📸 02-modal-just-opened.png`);

// Wait for the viewer to (hopefully) connect and render frames
log("→ waiting 8s for VNC connect + frames to render");
await page.waitForTimeout(8000);
await page.screenshot({ path: `${SHOTS}/03-after-8s.png` });
log(`📸 03-after-8s.png`);

// Take a tight crop of the top of the modal so the trust bar is legible
try {
  const dialog = await page.$('[role="dialog"]');
  if (dialog) {
    const box = await dialog.boundingBox();
    if (box) {
      await page.screenshot({
        path: `${SHOTS}/05-trust-bar.png`,
        clip: { x: box.x + 340, y: box.y, width: Math.min(box.width - 340, 1100), height: 80 },
      });
      log(`📸 05-trust-bar.png (cropped)`);
    }
  }
} catch (e) { log(`crop screenshot skipped: ${e.message}`); }

// Probe state via JS
const state = await page.evaluate(() => {
  const dialog = document.querySelector('[role="dialog"]');
  if (!dialog) return { error: "no dialog" };
  const canvases = Array.from(dialog.querySelectorAll("canvas"));
  const overlayMatch = dialog.textContent?.match(/Opening the secure browser|Loading .{1,30} login page|Reconnecting…|Browser disconnected|Couldn.t connect|VNC connection lost|VNC server requires/);
  const errorAlert = dialog.querySelector('[role="alert"]')?.textContent?.trim();
  const headerText = dialog.querySelector("h2")?.textContent?.trim();
  return {
    headerText,
    canvasCount: canvases.length,
    canvasSizes: canvases.map((c) => ({ w: c.width, h: c.height })).filter((s) => s.w > 0),
    overlayText: overlayMatch?.[0] || null,
    errorAlert: errorAlert || null,
  };
});
log(`STATE: ${JSON.stringify(state)}`);

await page.waitForTimeout(2000);
await page.screenshot({ path: `${SHOTS}/04-final.png` });
log(`📸 04-final.png`);

// Pull diagnostics out of window.__diag
const diag = await page.evaluate(() => window.__diag || []);

// Save logs
fs.writeFileSync(`${SHOTS}/console.json`, JSON.stringify(consoleMsgs, null, 2));
fs.writeFileSync(`${SHOTS}/ws.json`, JSON.stringify(wsEvents, null, 2));
fs.writeFileSync(`${SHOTS}/state.json`, JSON.stringify(state, null, 2));
fs.writeFileSync(`${SHOTS}/diag.json`, JSON.stringify(diag, null, 2));
fs.writeFileSync(`${SHOTS}/ban-risk.json`, JSON.stringify(banRiskCalls, null, 2));

console.log("\n=== WINDOW.__DIAG ===");
for (const e of diag) {
  let summary = JSON.stringify({ ...e, stack: e.stack ? e.stack.slice(0, 200) : undefined });
  console.log(`  +${e.t}ms ${e.event} ${summary.slice(0, 400)}`);
}

console.log("\n=== CONSOLE MESSAGES (all) ===");
for (const m of consoleMsgs) {
  console.log(`  +${m.t}ms [${m.type}] ${m.text.slice(0, 300)}`);
}
console.log("\n=== WEBSOCKET EVENTS ===");
for (const w of wsEvents) console.log(`  ${w.event} ${w.url}`);

console.log("\n=== BAN-RISK MONITOR ===");
const goto = banRiskCalls.filter((c) => c.kind === "goto");
const lsRefresh = banRiskCalls.filter((c) => c.kind === "login-status-refresh");
const health = banRiskCalls.filter((c) => c.kind === "recordings-health");
console.log(`  /api/platforms/goto             : ${goto.length} calls`);
console.log(`  /api/platforms/login-status?refresh=1: ${lsRefresh.length} calls`);
console.log(`  /api/recordings/health          : ${health.length} calls`);
const uniqueGotoUrls = new Set(goto.map((c) => c.body?.url || "(no body)"));
console.log(`  unique /goto target URLs: ${uniqueGotoUrls.size} (${Array.from(uniqueGotoUrls).join(", ")})`);
const rateLimited = banRiskCalls.filter((c) => c.status === 429);
console.log(`  429 rate-limited responses     : ${rateLimited.length}`);

console.log(`\n=== Saved: ${SHOTS}/{01..04}.png + console.json + ws.json + state.json + ban-risk.json ===`);
await browser.close();

// ── HARD ASSERTIONS — exit non-zero if a ban-risk pattern is detected ──
// One modal-open + one auto-navigate-to-platform + zero rotation. Anything
// else means the popup or some background poller is silently driving Chrome.
const failures = [];
if (goto.length > 2) {
  failures.push(`Too many /goto calls (${goto.length}). Expected ≤ 2 (one auto-nav on open + one optional user click).`);
}
if (uniqueGotoUrls.size > 1) {
  failures.push(`Chrome rotation detected: navigated to ${uniqueGotoUrls.size} different URLs. Expected ≤ 1. URLs: ${Array.from(uniqueGotoUrls).join(", ")}`);
}
if (lsRefresh.length > 1) {
  failures.push(`Too many login-status?refresh=1 calls (${lsRefresh.length}). Expected ≤ 1 — refresh clears the VPS cache and re-rotates Chrome.`);
}
const fastInterval = (() => {
  if (health.length < 2) return null;
  const gaps = [];
  for (let i = 1; i < health.length; i++) gaps.push(health[i].t - health[i - 1].t);
  return Math.min(...gaps);
})();
if (fastInterval !== null && fastInterval < 30_000) {
  failures.push(`/api/recordings/health is being polled every ${fastInterval}ms. Min allowed: 30000ms. (Phase 1 set system-pulse to 5min, automations to 60s.)`);
}

if (failures.length) {
  console.log("\n❌ BAN-RISK ASSERTIONS FAILED:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
} else {
  console.log("\n✅ BAN-RISK ASSERTIONS PASSED — no rotation, no excess Chrome navigation, polling within safe cadence.");
}
