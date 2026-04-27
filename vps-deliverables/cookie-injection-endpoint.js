// vps-deliverables/cookie-injection-endpoint.js
//
// Drop-in Express handler for the existing VNC manager service on the
// production VPS. Exposes:
//
//   POST /api/sessions/:sessionId/inject-cookies
//   Body: { cookies: [{name, value, domain, path, secure, httpOnly, sameSite, expires}],
//           local_storage?: { [key: string]: string } }
//
// Uses Chrome DevTools Protocol to set cookies via Network.setCookies on the
// running browser for that session, and (optionally) primes localStorage by
// registering a Page.addScriptToEvaluateOnNewDocument hook before the next
// navigation. Returns { ok: true, cookies_set: N, local_storage_set: M }.
//
// HOW TO DEPLOY:
//   # 1. Copy this file up to the VPS recording-service directory.
//   scp /root/projects/outreach-dashboard/vps-deliverables/cookie-injection-endpoint.js \
//     root@srv1197943.hstgr.cloud:/opt/recording-service/cookie-injection-endpoint.js
//
//   # 2. In the VPS server.js, register the route once near the top:
//   #      const registerCookieInjection = require('./cookie-injection-endpoint')
//   #      registerCookieInjection(app, getSessionCdp)   // getSessionCdp returns a CDP client per sessionId
//   #
//   #    If the existing service exposes a different per-session CDP helper
//   #    (e.g. `sessionManager.getCdp(id)`), pass that instead.
//   ssh root@srv1197943.hstgr.cloud "ls /opt/recording-service/server.js"
//
//   # 3. Restart the service.
//   ssh root@srv1197943.hstgr.cloud "systemctl restart recording-service"
//
//   # 4. Smoke-test (replace SESSION_ID with a live one):
//   ssh root@srv1197943.hstgr.cloud \
//     'curl -s -X POST http://127.0.0.1:10000/api/sessions/SESSION_ID/inject-cookies \
//        -H "Content-Type: application/json" \
//        -d "{\"cookies\":[{\"name\":\"sessionid\",\"value\":\"x\",\"domain\":\".instagram.com\"}]}"'
//
//   Expected: {"ok":true,"cookies_set":1,"local_storage_set":0}

"use strict"

/**
 * Register the inject-cookies route on an existing Express app.
 *
 * @param {import('express').Express} app  the Express app from server.js
 * @param {(sessionId: string) => Promise<any> | any} getSessionCdp
 *   Function that returns a CDP client for a given session id. The client
 *   should expose .Network, .Page, .Runtime modules — i.e. the shape
 *   `chrome-remote-interface` returns. If your VPS uses a different
 *   wrapper (e.g. `puppeteer.Page#client()._connection`), adapt this in
 *   your registration call.
 */
function registerCookieInjection(app, getSessionCdp) {
  if (!app || typeof app.post !== "function") {
    throw new Error("registerCookieInjection: first arg must be an Express app")
  }
  if (typeof getSessionCdp !== "function") {
    throw new Error("registerCookieInjection: second arg must be a session→CDP fn")
  }

  app.post("/api/sessions/:sessionId/inject-cookies", async (req, res) => {
    const sessionId = req.params.sessionId
    if (!sessionId) {
      return res.status(400).json({ ok: false, error: "sessionId required" })
    }

    const body = req.body || {}
    const cookies = Array.isArray(body.cookies) ? body.cookies : null
    const localStorageObj =
      body.local_storage && typeof body.local_storage === "object"
        ? body.local_storage
        : null

    if (!cookies) {
      return res.status(400).json({ ok: false, error: "cookies array required" })
    }

    let cdp
    try {
      cdp = await getSessionCdp(sessionId)
    } catch (e) {
      return res
        .status(404)
        .json({ ok: false, error: `session not found: ${e.message || e}` })
    }
    if (!cdp || !cdp.Network || !cdp.Page) {
      return res
        .status(404)
        .json({ ok: false, error: "session has no active CDP client" })
    }

    // ── 1. Set cookies via Network.setCookies ────────────────────────
    // CDP wants cookies in a slightly different shape than the standard
    // browser cookie object: `expires` is a unix timestamp in seconds (or
    // omitted for session cookies), `sameSite` is one of Strict/Lax/None
    // with that exact capitalisation. Normalise here.
    const normalised = cookies
      .filter((c) => c && typeof c.name === "string" && typeof c.value === "string")
      .map((c) => {
        const out = {
          name: c.name,
          value: c.value,
        }
        if (c.domain) out.domain = c.domain
        if (c.path) out.path = c.path
        else out.path = "/"
        if (typeof c.secure === "boolean") out.secure = c.secure
        if (typeof c.httpOnly === "boolean") out.httpOnly = c.httpOnly
        if (c.sameSite) {
          const ss = String(c.sameSite).toLowerCase()
          out.sameSite =
            ss === "strict" ? "Strict" : ss === "none" ? "None" : "Lax"
        }
        // Accept either `expires` (seconds since epoch — what CDP wants) or
        // `expirationDate` (also seconds, what browser export tools emit).
        const exp = typeof c.expires === "number" ? c.expires : c.expirationDate
        if (typeof exp === "number" && Number.isFinite(exp)) out.expires = exp
        // For URL-form callers without domain, derive a URL so CDP accepts.
        if (!out.domain && c.url) out.url = c.url
        return out
      })

    let cookiesSet = 0
    try {
      await cdp.Network.setCookies({ cookies: normalised })
      cookiesSet = normalised.length
    } catch (e) {
      // Some CDP builds reject the bulk call when one cookie is malformed.
      // Fall back to per-cookie setCookie so a single bad row doesn't sink
      // the whole batch.
      for (const c of normalised) {
        try {
          await cdp.Network.setCookie(c)
          cookiesSet += 1
        } catch (_) {
          // skip
        }
      }
    }

    // ── 2. Prime localStorage via addScriptToEvaluateOnNewDocument ──
    //   This sets the keys on every future navigation in this session,
    //   which is what we want — the user is about to navigate to the
    //   platform's home page and we want the data live before any of the
    //   page's own scripts read it.
    let localStorageSet = 0
    if (localStorageObj && typeof cdp.Page.addScriptToEvaluateOnNewDocument === "function") {
      const entries = Object.entries(localStorageObj).filter(
        ([k, v]) => typeof k === "string" && typeof v === "string"
      )
      if (entries.length > 0) {
        const literal = JSON.stringify(Object.fromEntries(entries))
        const source = `
          (function () {
            try {
              var data = ${literal};
              Object.entries(data).forEach(function (kv) {
                try { localStorage.setItem(kv[0], kv[1]); } catch (e) {}
              });
            } catch (e) {}
          })();
        `
        try {
          await cdp.Page.addScriptToEvaluateOnNewDocument({ source })
          localStorageSet = entries.length
        } catch (_) {
          // Older CDP builds may not have this — ignore.
        }
      }
    }

    return res.json({
      ok: true,
      cookies_set: cookiesSet,
      local_storage_set: localStorageSet,
    })
  })
}

module.exports = registerCookieInjection
module.exports.registerCookieInjection = registerCookieInjection
