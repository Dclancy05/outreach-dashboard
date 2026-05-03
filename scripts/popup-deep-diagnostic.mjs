// Comprehensive Sign-In-Now popup diagnostic.
//
// Captures THREE timelines in parallel and merges them so we can see the
// exact moment any tab opens / Chrome navigates / network call fires:
//
//   1. CDP target events from production Chrome on localhost:18800
//      (Target.targetCreated / Destroyed / InfoChanged)
//      — proves whether the recording-service or anything else is opening
//        new tabs in the user's actual Chrome.
//   2. Playwright network log of every /api/* and srv1197943.*/* request
//      from the dashboard, with timestamps + status codes.
//   3. Screenshots every 500ms for the entire run (default 60s) so we have
//      visual proof of what the user sees frame-by-frame.
//
// Output: /tmp/popup-deep/{timeline.json,screenshots/*,cdp.log,network.log}
// Plus a printable timeline that interleaves the three streams in time order.
//
// Why this exists: the user opened the popup and reported Chrome cycling
// through tabs (Instagram → Facebook → LinkedIn → TikTok). Earlier "fixes"
// claimed the rotation was killed, but the test only watched dashboard
// network traffic — not the production Chrome's actual tab state. This
// harness watches ALL three layers simultaneously so we can never
// misdiagnose this class of bug again.
//
// Usage:
//   node scripts/popup-deep-diagnostic.mjs               # 60s window
//   DURATION=120 node scripts/popup-deep-diagnostic.mjs  # 2 min window
//   PLATFORM=instagram node scripts/popup-deep-diagnostic.mjs  # which Sign-In to click

import { chromium } from "playwright";
import fs from "node:fs";
import http from "node:http";

const DURATION_S = Number(process.env.DURATION || 60);
const PLATFORM = (process.env.PLATFORM || "facebook").toLowerCase();
const SHOT_INTERVAL_MS = 500;
const CDP_POLL_MS = 250;
const DASHBOARD = process.env.DASHBOARD_URL || "https://outreach-github.vercel.app";
const PIN = process.env.ADMIN_PIN || "122436";
const VPS_CDP_URL = process.env.VPS_CDP_URL || "http://localhost:18800";

const OUT = "/tmp/popup-deep";
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(`${OUT}/screenshots`, { recursive: true });

const t0 = Date.now();
const sec = () => ((Date.now() - t0) / 1000).toFixed(2);
const log = (m) => console.log(`+${sec()}s ${m}`);

// Unified timeline of every interesting event from any source.
const timeline = [];
const ev = (kind, data) => {
  timeline.push({ t: Date.now() - t0, kind, ...data });
};

// ────────────── SOURCE 1: CDP target poller ──────────────
// Polls http://localhost:18800/json every 250ms and diffs the target list.
// New target id = a tab/page/iframe/worker was created.
// Missing target id = it was closed.
// URL change on existing id = navigation within the same target.
const cdpFetch = () =>
  new Promise((resolve) => {
    const req = http.get(`${VPS_CDP_URL}/json`, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        try { resolve(JSON.parse(body)); } catch { resolve([]); }
      });
    });
    req.on("error", () => resolve([]));
    req.setTimeout(2000, () => req.destroy());
  });

let prevTargets = new Map();
let cdpInterval = null;
const startCdpPolling = async () => {
  const initial = await cdpFetch();
  for (const t of initial) prevTargets.set(t.id, t);
  ev("cdp.snapshot", {
    count: initial.length,
    targets: initial.map((t) => ({ type: t.type, title: t.title, url: t.url })),
  });
  cdpInterval = setInterval(async () => {
    const cur = await cdpFetch();
    const curMap = new Map();
    for (const t of cur) curMap.set(t.id, t);
    // New
    for (const [id, t] of curMap) {
      const prev = prevTargets.get(id);
      if (!prev) {
        ev("cdp.target_created", { id, type: t.type, title: t.title, url: t.url });
      } else if (prev.url !== t.url) {
        ev("cdp.target_navigated", { id, type: t.type, title: t.title, fromUrl: prev.url, toUrl: t.url });
      }
    }
    // Destroyed
    for (const [id, t] of prevTargets) {
      if (!curMap.has(id)) {
        ev("cdp.target_destroyed", { id, type: t.type, title: t.title, url: t.url });
      }
    }
    prevTargets = curMap;
  }, CDP_POLL_MS);
};

// ────────────── SOURCE 2: Playwright + network log ──────────────
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

// Hook every request/response that touches /api/* or srv1197943
page.on("request", (req) => {
  const url = req.url();
  if (/\/api\/(platforms|recordings|accounts|auth|observability)/.test(url) || /srv1197943\./.test(url)) {
    ev("net.request", { method: req.method(), url, body: (() => { try { return req.postDataJSON(); } catch { return null; } })() });
  }
});
page.on("response", (res) => {
  const url = res.url();
  if (/\/api\/(platforms|recordings|accounts|auth|observability)/.test(url) || /srv1197943\./.test(url)) {
    ev("net.response", { url, status: res.status() });
  }
});
page.on("websocket", (ws) => {
  ev("ws.open", { url: ws.url() });
  let frames = 0, bytes = 0;
  ws.on("framereceived", (f) => { frames++; bytes += (f.payload?.length ?? 0); });
  ws.on("close", () => ev("ws.close", { url: ws.url(), frames, bytes }));
});
page.on("pageerror", (e) => ev("page.error", { message: e.message }));
page.on("console", (m) => {
  const text = m.text();
  if (/error|warn|failed|exception/i.test(m.type()) || /error|fail|429|disconnect/i.test(text)) {
    ev("console", { type: m.type(), text: text.slice(0, 200) });
  }
});

// ────────────── Run the user flow ──────────────
log(`→ navigating to ${DASHBOARD}/accounts (will auth + open popup)`);
ev("flow.navigate_start", { url: `${DASHBOARD}/accounts` });
await page.goto(`${DASHBOARD}/accounts`, { waitUntil: "domcontentloaded", timeout: 30000 });

// PIN
await page.waitForTimeout(800);
const onPin = await page.evaluate(() => /Enter Passcode/i.test(document.body.textContent || ""));
if (onPin) {
  log("→ PIN");
  ev("flow.pin_start", {});
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
  await page.waitForURL(/\/accounts|\/agency/, { timeout: 8000 }).catch(() => {});
  ev("flow.pin_done", { url: page.url() });
}

if (!/\/accounts/.test(page.url())) {
  log(`→ go /accounts (was ${page.url()})`);
  await page.goto(`${DASHBOARD}/accounts`, { waitUntil: "domcontentloaded" });
}

// Wait for buttons to render
await page.waitForFunction(() => {
  const btns = Array.from(document.querySelectorAll("button"));
  return btns.some((x) => /sign in now/i.test(x.textContent || ""));
}, { timeout: 15000 }).catch(() => log("⚠ Sign In Now button never appeared"));

// Start CDP polling RIGHT BEFORE clicking — we want to see new tabs that the
// click triggers, not stale tabs from earlier.
log("→ starting CDP target poller");
await startCdpPolling();

// Start screenshot timer
let shotIdx = 0;
const shotInterval = setInterval(async () => {
  shotIdx++;
  const path = `${OUT}/screenshots/${String(shotIdx).padStart(4, "0")}-${sec().padStart(7, "0")}s.png`;
  await page.screenshot({ path }).catch(() => {});
  ev("shot", { path, idx: shotIdx });
}, SHOT_INTERVAL_MS);

// Click Sign In Now — try to click a SPECIFIC platform to make this reproducible
log(`→ clicking Sign In Now (will land on first available account; PLATFORM filter=${PLATFORM})`);
ev("flow.click_sign_in", { platform: PLATFORM });
const clickResult = await page.evaluate((wantPlatform) => {
  // Find any "Sign In Now" button. The accounts page shows multiple — the
  // one that opens for our wanted platform is whichever is first OR the one
  // closest to the platform's row. Best effort: prefer rows whose nearby
  // text mentions the platform.
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
}, PLATFORM);
ev("flow.click_result", clickResult);

// Sit halfway, THEN click "I'm Logged In" — this is the user-reported
// rotation trigger. We want CDP to see if probeLoginForPlatform tours every
// platform after the click.
log(`→ recording for ${Math.round(DURATION_S / 2)}s before clicking I'm Logged In`);
const halfEnd = Date.now() + (DURATION_S / 2) * 1000;
while (Date.now() < halfEnd) {
  await page.waitForTimeout(5000);
  const elapsed = Math.round((Date.now() - t0) / 1000);
  log(`  pre-click …${elapsed}s | events: ${timeline.length} | shots: ${shotIdx}`);
}

ev("flow.click_im_logged_in_start", {});
log("→ clicking 'I'm Logged In' — this is the user-reported rotation trigger");
await page.evaluate(() => {
  const b = Array.from(document.querySelectorAll("button")).find((x) => /i.?m logged in/i.test(x.textContent || ""));
  if (b) { b.scrollIntoView({ block: "center" }); b.click(); }
});
ev("flow.click_im_logged_in_done", {});

const tailEnd = Date.now() + (DURATION_S / 2) * 1000;
while (Date.now() < tailEnd) {
  await page.waitForTimeout(5000);
  const elapsed = Math.round((Date.now() - t0) / 1000);
  log(`  post-click …${elapsed}s | events: ${timeline.length} | shots: ${shotIdx}`);
}

clearInterval(shotInterval);
clearInterval(cdpInterval);
ev("flow.end", {});

// Save everything
fs.writeFileSync(`${OUT}/timeline.json`, JSON.stringify(timeline, null, 2));
fs.writeFileSync(
  `${OUT}/timeline.txt`,
  timeline.map((e) => {
    const ts = `+${(e.t / 1000).toFixed(2).padStart(7)}s`;
    let summary = "";
    switch (e.kind) {
      case "cdp.snapshot":
        summary = `CDP initial: ${e.count} targets`;
        break;
      case "cdp.target_created":
        summary = `🆕 NEW TAB ${e.type} ${e.url}`;
        break;
      case "cdp.target_destroyed":
        summary = `❌ TAB CLOSED ${e.type} ${e.url || e.title}`;
        break;
      case "cdp.target_navigated":
        summary = `🧭 NAVIGATED ${e.type} ${e.fromUrl} → ${e.toUrl}`;
        break;
      case "net.request":
        summary = `→ ${e.method} ${e.url}${e.body ? ` ${JSON.stringify(e.body).slice(0, 80)}` : ""}`;
        break;
      case "net.response":
        summary = `← ${e.status} ${e.url}`;
        break;
      case "ws.open":
        summary = `🔌 WS OPEN ${e.url}`;
        break;
      case "ws.close":
        summary = `🔌 WS CLOSE ${e.url} frames=${e.frames} bytes=${e.bytes}`;
        break;
      case "console":
        summary = `📝 [${e.type}] ${e.text}`;
        break;
      case "page.error":
        summary = `💥 PAGE ERROR ${e.message}`;
        break;
      case "shot":
        return null; // skip from text timeline (too noisy)
      default:
        summary = `${e.kind} ${JSON.stringify(e).slice(0, 200)}`;
    }
    return `${ts} ${e.kind.padEnd(22)} ${summary}`;
  }).filter(Boolean).join("\n")
);

// Summary stats
const cdpCreated = timeline.filter((e) => e.kind === "cdp.target_created");
const cdpNavigated = timeline.filter((e) => e.kind === "cdp.target_navigated");
const cdpDestroyed = timeline.filter((e) => e.kind === "cdp.target_destroyed");
const netGoto = timeline.filter((e) => e.kind === "net.request" && /\/goto(\?|$)/.test(e.url));
const netLogin = timeline.filter((e) => e.kind === "net.request" && /\/login-status/.test(e.url));
const netHealth = timeline.filter((e) => e.kind === "net.request" && /\/recordings\/health/.test(e.url));
const responses429 = timeline.filter((e) => e.kind === "net.response" && e.status === 429);

console.log("\n═══ SUMMARY ═══");
console.log(`Duration: ${DURATION_S}s`);
console.log(`Screenshots: ${shotIdx}`);
console.log(`Total events: ${timeline.length}`);
console.log(`Production Chrome tab events:`);
console.log(`  🆕 created    : ${cdpCreated.length}`);
console.log(`  🧭 navigated  : ${cdpNavigated.length}`);
console.log(`  ❌ destroyed  : ${cdpDestroyed.length}`);
console.log(`Dashboard network calls:`);
console.log(`  /goto         : ${netGoto.length}`);
console.log(`  /login-status : ${netLogin.length}`);
console.log(`  /recordings/health : ${netHealth.length}`);
console.log(`  429 responses : ${responses429.length}`);
console.log(`\nFull timeline: ${OUT}/timeline.txt`);
console.log(`Screenshots:    ${OUT}/screenshots/`);
console.log(`Raw events:     ${OUT}/timeline.json`);

// Print first 40 timeline entries inline so the user/dev sees the shape
console.log("\n═══ TIMELINE (first 50 entries, excluding screenshots) ═══");
const printable = timeline.filter((e) => e.kind !== "shot").slice(0, 50);
for (const e of printable) {
  const ts = `+${(e.t / 1000).toFixed(2).padStart(7)}s`;
  let summary;
  switch (e.kind) {
    case "cdp.snapshot": summary = `count=${e.count}`; break;
    case "cdp.target_created": summary = `🆕 ${e.type} ${e.url}`; break;
    case "cdp.target_destroyed": summary = `❌ ${e.type} ${e.url || e.title}`; break;
    case "cdp.target_navigated": summary = `🧭 ${e.fromUrl} → ${e.toUrl}`; break;
    case "net.request": summary = `→ ${e.method} ${e.url}`; break;
    case "net.response": summary = `← ${e.status} ${e.url}`; break;
    case "ws.open": summary = `🔌 OPEN ${e.url}`; break;
    case "ws.close": summary = `🔌 CLOSE frames=${e.frames}`; break;
    default: summary = JSON.stringify(e).slice(0, 120);
  }
  console.log(`  ${ts} ${e.kind.padEnd(22)} ${summary.slice(0, 200)}`);
}

await browser.close();
process.exit(0);
