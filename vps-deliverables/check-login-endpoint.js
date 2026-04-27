// vps-deliverables/check-login-endpoint.js
//
// Companion to cookie-injection-endpoint.js. Drop-in Express handler that
// uses CDP to evaluate a logged-in DOM signature on the session's current
// (or freshly navigated) page.
//
//   POST /api/sessions/:sessionId/check-login
//   Body: { platform: "instagram" | "facebook" | ..., home_url?: string }
//
// Behaviour:
//   1. If `home_url` is provided, navigate the session there and wait for
//      `Page.loadEventFired` (with a hard 12s ceiling).
//   2. Run the platform-specific selector check via Runtime.evaluate.
//   3. Return { logged_in: bool, signal: string }.
//
// HOW TO DEPLOY:
//   # 1. Copy this file up to the VPS recording-service directory.
//   scp /root/projects/outreach-dashboard/vps-deliverables/check-login-endpoint.js \
//     root@srv1197943.hstgr.cloud:/opt/recording-service/check-login-endpoint.js
//
//   # 2. In the VPS server.js, register the route once near the top:
//   #      const registerCheckLogin = require('./check-login-endpoint')
//   #      registerCheckLogin(app, getSessionCdp)
//   ssh root@srv1197943.hstgr.cloud "ls /opt/recording-service/server.js"
//
//   # 3. Restart the service.
//   ssh root@srv1197943.hstgr.cloud "systemctl restart recording-service"
//
//   # 4. Smoke-test:
//   ssh root@srv1197943.hstgr.cloud \
//     'curl -s -X POST http://127.0.0.1:10000/api/sessions/SESSION_ID/check-login \
//        -H "Content-Type: application/json" \
//        -d "{\"platform\":\"instagram\",\"home_url\":\"https://www.instagram.com/\"}"'
//
//   Expected: {"logged_in":true,"signal":"a[href=\"/explore/\"]"}
//          or {"logged_in":false,"signal":"no_marker_found"}

"use strict"

// Per-platform "logged-in" DOM signatures. Each entry runs in the page
// context via Runtime.evaluate and must return `true` when the user is
// authenticated. Keep these conservative — false positives are worse than
// false negatives because they get the user "your account is fine"
// when really they need to re-login.
//
// When a platform redesigns, only this map needs updating.
const LOGGED_IN_PROBES = {
  instagram: {
    expr: 'document.querySelector(\'a[href="/explore/"]\') !== null || document.querySelector(\'svg[aria-label="Home"]\') !== null',
    signal: 'instagram_explore_or_home_nav',
  },
  facebook: {
    expr: 'document.querySelector(\'div[aria-label="Account"]\') !== null || document.querySelector(\'div[role="banner"] [aria-label="Your profile"]\') !== null || !!document.cookie.match(/c_user=/)',
    signal: 'facebook_account_avatar_or_c_user',
  },
  linkedin: {
    expr: 'document.querySelector(\'a[data-test-global-nav-link="mynetwork"]\') !== null || document.querySelector(\'.global-nav__me\') !== null',
    signal: 'linkedin_global_nav_me',
  },
  tiktok: {
    expr: 'document.querySelector(\'[data-e2e="profile-icon"]\') !== null || document.querySelector(\'[data-e2e="nav-profile"]\') !== null',
    signal: 'tiktok_profile_nav',
  },
  twitter: {
    expr: 'document.querySelector(\'a[data-testid="AppTabBar_Profile_Link"]\') !== null || document.querySelector(\'[data-testid="SideNav_AccountSwitcher_Button"]\') !== null',
    signal: 'twitter_profile_or_account_switcher',
  },
  x: {
    expr: 'document.querySelector(\'a[data-testid="AppTabBar_Profile_Link"]\') !== null || document.querySelector(\'[data-testid="SideNav_AccountSwitcher_Button"]\') !== null',
    signal: 'twitter_profile_or_account_switcher',
  },
  youtube: {
    expr: 'document.querySelector(\'#avatar-btn\') !== null || document.querySelector(\'ytd-topbar-menu-button-renderer #avatar-btn\') !== null',
    signal: 'youtube_avatar_btn',
  },
  pinterest: {
    expr: 'document.querySelector(\'div[data-test-id="header-profile-image"]\') !== null',
    signal: 'pinterest_header_profile_image',
  },
  snapchat: {
    expr: 'document.querySelector(\'[data-testid="header-profile-button"]\') !== null',
    signal: 'snapchat_header_profile_button',
  },
  reddit: {
    expr: 'document.querySelector(\'#USER_DROPDOWN_ID\') !== null || document.querySelector(\'a[href="/login"]\') === null',
    signal: 'reddit_user_dropdown',
  },
  threads: {
    expr: 'document.querySelector(\'a[href^="/@"][role="link"]\') !== null',
    signal: 'threads_profile_link',
  },
}

const NAV_TIMEOUT_MS = 12_000

/**
 * Register the check-login route on an existing Express app.
 *
 * @param {import('express').Express} app
 * @param {(sessionId: string) => Promise<any> | any} getSessionCdp
 *   Same signature as cookie-injection-endpoint.js. Must return a CDP client
 *   exposing .Page and .Runtime.
 */
function registerCheckLogin(app, getSessionCdp) {
  if (!app || typeof app.post !== "function") {
    throw new Error("registerCheckLogin: first arg must be an Express app")
  }
  if (typeof getSessionCdp !== "function") {
    throw new Error("registerCheckLogin: second arg must be a session→CDP fn")
  }

  app.post("/api/sessions/:sessionId/check-login", async (req, res) => {
    const sessionId = req.params.sessionId
    if (!sessionId) {
      return res.status(400).json({ ok: false, error: "sessionId required" })
    }

    const body = req.body || {}
    const platform = String(body.platform || "").toLowerCase()
    const homeUrl = typeof body.home_url === "string" ? body.home_url : null

    const probe = LOGGED_IN_PROBES[platform]
    if (!probe) {
      return res
        .status(400)
        .json({ ok: false, error: `unsupported platform: ${platform}` })
    }

    let cdp
    try {
      cdp = await getSessionCdp(sessionId)
    } catch (e) {
      return res
        .status(404)
        .json({ ok: false, error: `session not found: ${e.message || e}` })
    }
    if (!cdp || !cdp.Page || !cdp.Runtime) {
      return res
        .status(404)
        .json({ ok: false, error: "session has no active CDP client" })
    }

    // ── 1. Optionally navigate ───────────────────────────────────────
    if (homeUrl) {
      try {
        await cdp.Page.enable()
      } catch (_) {}
      const loaded = waitForLoad(cdp, NAV_TIMEOUT_MS)
      try {
        await cdp.Page.navigate({ url: homeUrl })
      } catch (e) {
        return res
          .status(502)
          .json({ ok: false, error: `navigate failed: ${e.message || e}` })
      }
      try {
        await loaded
      } catch (_) {
        // Navigation may have hung past NAV_TIMEOUT_MS — proceed anyway,
        // the DOM probe will likely still work if the page partially loaded.
      }
      // Give heavyweight SPAs a moment to hydrate the auth UI.
      await sleep(800)
    }

    // ── 2. Run the probe ─────────────────────────────────────────────
    let loggedIn = false
    try {
      const result = await cdp.Runtime.evaluate({
        expression: `(() => { try { return Boolean(${probe.expr}); } catch (e) { return false; } })()`,
        returnByValue: true,
      })
      loggedIn = Boolean(result && result.result && result.result.value === true)
    } catch (e) {
      return res
        .status(502)
        .json({ ok: false, error: `evaluate failed: ${e.message || e}` })
    }

    return res.json({
      logged_in: loggedIn,
      signal: loggedIn ? probe.signal : "no_marker_found",
    })
  })
}

function waitForLoad(cdp, timeoutMs) {
  return new Promise((resolve, reject) => {
    let done = false
    const timer = setTimeout(() => {
      if (done) return
      done = true
      reject(new Error("load timeout"))
    }, timeoutMs)

    const off = cdp.Page.loadEventFired(() => {
      if (done) return
      done = true
      clearTimeout(timer)
      // Detach this listener if the wrapper supports it.
      if (typeof off === "function") {
        try {
          off()
        } catch (_) {}
      }
      resolve()
    })
  })
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

module.exports = registerCheckLogin
module.exports.registerCheckLogin = registerCheckLogin
module.exports.LOGGED_IN_PROBES = LOGGED_IN_PROBES
