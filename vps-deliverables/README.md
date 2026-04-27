# VPS Deliverables

These files belong on the **production VPS** (`srv1197943.hstgr.cloud`,
Tailscale `100.70.3.3`), not in the Next.js dashboard. They close the gap
between dashboard-side API routes (which already exist in
`src/app/api/...`) and the live Chrome + VNC machinery on the VPS.

The dashboard ships endpoints that call:

| Dashboard endpoint                                | VPS endpoint it calls                                  |
| ------------------------------------------------- | ------------------------------------------------------ |
| `POST /api/vnc/inject-cookies`                    | `POST /api/sessions/:sessionId/inject-cookies`         |
| `POST /api/accounts/[id]/cookies/test`            | `POST /api/sessions/:sessionId/check-login`            |
| `<NoVncViewer>` (WebSocket)                       | `wss://.../websockify/:sessionId`                      |

If the VPS doesn't yet expose those endpoints, the dashboard returns a
`vps_*_not_deployed` flag and falls back gracefully — but the feature is
gated until you deploy the files in this folder.

---

## File-by-file

### `cookie-injection-endpoint.js`

Express handler that adds **`POST /api/sessions/:sessionId/inject-cookies`**
to the existing VNC manager service. Uses Chrome DevTools Protocol to:

1. Set cookies on the running Chrome session via `Network.setCookies`.
2. Prime localStorage via `Page.addScriptToEvaluateOnNewDocument` so keys
   are present before the next navigation.

Returns `{ ok: true, cookies_set: N, local_storage_set: M }`.

### `check-login-endpoint.js`

Companion endpoint **`POST /api/sessions/:sessionId/check-login`**. Given a
platform name (and optionally a `home_url` to navigate to first), runs a
platform-specific DOM signature check and returns
`{ logged_in: bool, signal: "instagram_explore_or_home_nav" }` or similar.

The platform signature map lives at the top of the file as
`LOGGED_IN_PROBES`. When a platform redesigns, that's the only place to
edit.

### `Caddyfile-snippet.conf`

The route block that exposes
`wss://srv1197943.taild42583.ts.net/websockify/<sessionId>` to the local
websockify process. The dashboard's `<NoVncViewer>` connects directly to
that URL — see `src/components/novnc-viewer.tsx:38–40`.

Paste it into the existing site stanza in `/etc/caddy/Caddyfile` **before**
the OpenClaw-control catch-all. Comments at the top of the file explain
exactly where.

---

## Deploy commands

These mirror the pattern in `DEPLOY_VPS_PART_B.md` at the repo root.

### Cookie-injection + check-login endpoints

```bash
# 1. Copy both files up.
scp /root/projects/outreach-dashboard/vps-deliverables/cookie-injection-endpoint.js \
  root@srv1197943.hstgr.cloud:/opt/recording-service/cookie-injection-endpoint.js

scp /root/projects/outreach-dashboard/vps-deliverables/check-login-endpoint.js \
  root@srv1197943.hstgr.cloud:/opt/recording-service/check-login-endpoint.js

# 2. Wire them into server.js (one-time edit). Add near the top:
#
#      const registerCookieInjection = require('./cookie-injection-endpoint')
#      const registerCheckLogin = require('./check-login-endpoint')
#      registerCookieInjection(app, getSessionCdp)
#      registerCheckLogin(app, getSessionCdp)
#
#    `getSessionCdp(sessionId)` is whatever helper the existing service
#    uses to return a CDP client (chrome-remote-interface shape) for a
#    given session id. If it's named differently in your codebase, pass
#    that. The handlers only require `.Network`, `.Page`, `.Runtime`.

# 3. Restart the recording-service systemd unit.
ssh root@srv1197943.hstgr.cloud "systemctl restart recording-service"

# 4. Smoke-test both endpoints (replace SESSION_ID).
ssh root@srv1197943.hstgr.cloud \
  'curl -s -X POST http://127.0.0.1:10000/api/sessions/SESSION_ID/inject-cookies \
     -H "Content-Type: application/json" \
     -d "{\"cookies\":[{\"name\":\"sessionid\",\"value\":\"x\",\"domain\":\".instagram.com\"}]}"'

ssh root@srv1197943.hstgr.cloud \
  'curl -s -X POST http://127.0.0.1:10000/api/sessions/SESSION_ID/check-login \
     -H "Content-Type: application/json" \
     -d "{\"platform\":\"instagram\",\"home_url\":\"https://www.instagram.com/\"}"'
```

Expected outputs:

```json
{"ok":true,"cookies_set":1,"local_storage_set":0}
{"logged_in":false,"signal":"no_marker_found"}
```

(`logged_in: true` only happens when real cookies are loaded — see the
inject-cookies endpoint flow.)

### Caddyfile snippet

```bash
# 1. Open the existing Caddyfile and paste the handle_path block from
#    Caddyfile-snippet.conf into the srv1197943.taild42583.ts.net stanza,
#    BEFORE any catch-all reverse_proxy or file_server directive.
ssh root@srv1197943.hstgr.cloud "vi /etc/caddy/Caddyfile"

# 2. Validate the config.
ssh root@srv1197943.hstgr.cloud "caddy validate --config /etc/caddy/Caddyfile"

# 3. Reload (zero-downtime).
ssh root@srv1197943.hstgr.cloud "systemctl reload caddy"

# 4. Confirm the WebSocket upgrade path works.
curl -i https://srv1197943.taild42583.ts.net/websockify/main \
  -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ=="
```

Expected: `HTTP/1.1 101 Switching Protocols`. If you get `426 Upgrade
Required`, websockify isn't running — start it before debugging Caddy. If
you get a 200 with HTML, the handle_path block is below the catch-all
instead of above it.

---

## After deploy — verify from the dashboard side

```bash
# inject-cookies (no body required, uses latest snapshot for the account):
curl -s -X POST "https://outreach-github.vercel.app/api/vnc/inject-cookies" \
  -H "Content-Type: application/json" \
  -d '{"session_id":"<live session>","account_id":"<account uuid>"}'

# on-demand cookie test:
curl -s -X POST "https://outreach-github.vercel.app/api/accounts/<account uuid>/cookies/test" \
  -H "Content-Type: application/json" -d "{}"
```

Before deploy: `{"ok":false,"error":"vps_endpoint_not_deployed",...}`.
After deploy: `{"ok":true,"cookies_set":N,...}` and
`{"ok":true,"healthy":true|false,"signal":"..."}`.
